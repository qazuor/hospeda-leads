// Spec 89 F1 integration: sales material storage, admin mutations, permissions, upload verification, sweep and search.
// R2 is simulated by a local HTTP server (PUT, HEAD, ranged GET, DELETE) that R2_ENDPOINT points to; nothing reaches Cloudflare.
import assert from 'node:assert/strict';
import {createServer,type IncomingMessage} from 'node:http';
import type {AddressInfo} from 'node:net';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import superjson from 'superjson';
import postgres from 'postgres';
import {sql} from 'kysely';
assert.equal(process.env.CRM_TEST_DATABASE,'1','Disposable database required');
const objects=new Map<string,{body:Buffer;type:string}>();const requests:string[]=[];
const readBody=(req:IncomingMessage)=>new Promise<Buffer>((resolve,reject)=>{const chunks:Buffer[]=[];req.on('data',c=>chunks.push(c));req.on('end',()=>resolve(Buffer.concat(chunks)));req.on('error',reject);});
const r2=createServer(async(req,res)=>{
 const url=new URL(req.url!,'http://r2.test');const [,bucket,...rest]=url.pathname.split('/');const key=rest.map(decodeURIComponent).join('/');requests.push(`${req.method} ${key}`);
 const signed=url.searchParams.has('X-Amz-Signature')||String(req.headers.authorization??'').startsWith('AWS4-HMAC-SHA256');
 if(bucket!=='crm-material'||!signed){res.writeHead(403).end();return;}
 const o=objects.get(key);
 if(req.method==='PUT'){objects.set(key,{body:await readBody(req),type:String(req.headers['content-type']??'')});res.writeHead(200,{ETag:'"etag-'+key.length+'"'}).end();return;}
 if(req.method==='DELETE'){objects.delete(key);res.writeHead(204).end();return;}
 if(!o){res.writeHead(404).end();return;}
 if(req.method==='HEAD'){res.writeHead(200,{'Content-Length':o.body.length,'Content-Type':o.type,ETag:'"etag"'}).end();return;}
 const range=/^bytes=(\d+)-(\d+)$/.exec(String(req.headers.range??''));
 const body=range?o.body.subarray(Number(range[1]),Number(range[2])+1):o.body;
 res.writeHead(range?206:200,{'Content-Type':url.searchParams.get('response-content-type')??o.type,'Content-Length':body.length}).end(body);
});
await new Promise<void>(resolve=>r2.listen(0,'127.0.0.1',resolve));
Object.assign(process.env,{R2_ACCOUNT_ID:'test-account',R2_ACCESS_KEY_ID:'test-key',R2_SECRET_ACCESS_KEY:'test-secret',R2_BUCKET:'crm-material',R2_ENDPOINT:`http://127.0.0.1:${(r2.address() as AddressInfo).port}`});
const {db}=await import('../src/helpers/db');
const {setServerSession}=await import('../src/helpers/getSetServerSession');
const endpoints=await import('../src/endpoints/salesMaterials');
const {get:searchGet}=await import('../src/endpoints/search');
const {post:resourcesPost}=await import('../src/endpoints/resources');
const {sweepAbandonedSalesMaterialUploads}=await import('../src/helpers/salesMaterialService');
const {setR2StorageForTests,createR2Storage,r2Config,R2Unavailable}=await import('../src/helpers/r2');
const stamp=randomUUID().slice(0,8),userIds:number[]=[];
async function identity(role:'admin'|'user'){
 const user=await db.insertInto('users').values({email:`sales-material-${role}-${stamp}-${userIds.length}@example.com`,displayName:'Material '+role,role}).returningAll().executeTakeFirstOrThrow();userIds.push(user.id);
 const id='sales-material-'+user.id;await db.insertInto('sessions').values({id,userId:user.id,expiresAt:new Date(Date.now()+3600000)}).execute();
 const r=new Response();await setServerSession(r,{id,createdAt:Date.now(),lastAccessed:Date.now()});return {user,cookie:r.headers.get('set-cookie')!.split(';')[0]};
}
type Handler=(r:Request)=>Promise<Response>;
async function call(handler:Handler,path:string,cookie:string,body?:unknown,status=200){
 const r=await handler(new Request('http://localhost/_api/'+path,{headers:{cookie},...(body===undefined?{}:{method:'POST',body:superjson.stringify(body)})}));
 const text=await r.text();const data=text?superjson.parse<any>(text):null;assert.equal(r.status,status,`${path}: ${data?.error??text}`);return data;
}
const raw=(handler:Handler,path:string,cookie:string)=>handler(new Request('http://localhost/_api/'+path,{headers:{cookie}}));
const pdf=(text:string)=>Buffer.from('%PDF-1.7\n'+text+'\n%%EOF');
const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),Buffer.alloc(40,1)]);
async function upload(cookie:string,input:{purpose:'file'|'cover';fileName:string;mimeType:string;materialId:string},body:Buffer,{declared=body.length,putType=input.mimeType}:{declared?:number;putType?:string}={}){
 const u=await call(endpoints.uploadUrl,'sales_materials/upload_url',cookie,{...input,byteSize:declared});
 const put=await fetch(u.putUrl,{method:'PUT',headers:{'Content-Type':putType},body:new Uint8Array(body)});assert.equal(put.status,200);return u.uploadId as string;
}
const material=async(id:string)=>(await sql<any>`SELECT * FROM crm_sales_materials WHERE id=${id}::uuid`.execute(db)).rows[0];
const uploadRow=async(id:string)=>(await sql<any>`SELECT * FROM crm_sales_material_uploads WHERE id=${id}::uuid`.execute(db)).rows[0];
try{
 const admin=await identity('admin'),seller=await identity('user');let checks=0;
 // Authentication and seller permissions: every write is admin-only on the server.
 assert.equal((await raw(endpoints.get,'sales_materials','')).status,401);
 assert.equal((await raw(endpoints.file,'sales_materials/file?versionId='+randomUUID(),'')).status,401);
 const sellerList=await call(endpoints.get,'sales_materials',seller.cookie);assert.equal(sellerList.limits.storageConfigured,true);assert.equal(sellerList.limits.maxUploadBytes,524288000);assert.equal(sellerList.truncated,false);
 await call(endpoints.get,'sales_materials?includeArchived=1',seller.cookie,undefined,403);
 const id=randomUUID();
 for(const body of [{action:'category_create',name:'Vendedor '+stamp},{action:'create',id,title:'Intento',description:'',kind:'deliverable',source:'url',categoryIds:[],version:{url:'https://example.com/a'}},{action:'archive',id,revision:1}])await call(endpoints.post,'sales_materials',seller.cookie,body,403);
 await call(endpoints.uploadUrl,'sales_materials/upload_url',seller.cookie,{purpose:'file',fileName:'a.pdf',mimeType:'application/pdf',byteSize:10,materialId:id},403);
 checks++;
 // Categories: case-insensitive unique names, rename and deactivate.
 const category=(await call(endpoints.post,'sales_materials',admin.cookie,{action:'category_create',name:'Folletos '+stamp})).id as string;
 await call(endpoints.post,'sales_materials',admin.cookie,{action:'category_create',name:' folletos '+stamp.toUpperCase()+' '},400);
 const spare=(await call(endpoints.post,'sales_materials',admin.cookie,{action:'category_create',name:'Inactiva '+stamp})).id as string;
 await call(endpoints.post,'sales_materials',admin.cookie,{action:'category_update',id:spare,name:'Inactiva '+stamp,active:false});
 assert(!(await call(endpoints.get,'sales_materials',seller.cookie)).categories.some((c:any)=>c.id===spare),'Sellers do not see inactive categories');
 checks++;
 // Presigned PUT: signed query, 30 minutes, Content-Type signed; create is idempotent by client id.
 const first=await call(endpoints.uploadUrl,'sales_materials/upload_url',admin.cookie,{purpose:'file',fileName:'folleto.pdf',mimeType:'application/pdf',byteSize:pdf('v1').length,materialId:id});
 const put=new URL(first.putUrl);assert.equal(put.searchParams.get('X-Amz-Expires'),'1800');assert.match(put.searchParams.get('X-Amz-SignedHeaders')!,/content-type/);assert.match(put.searchParams.get('X-Amz-SignedHeaders')!,/content-length/,'The declared size is signed');assert(put.searchParams.get('X-Amz-Signature'));assert.match(decodeURIComponent(put.pathname),new RegExp(`^/crm-material/materials/${id}/v1-[0-9a-f-]{36}\\.pdf$`));
 assert.equal(first.headers['Content-Type'],'application/pdf');
 assert.equal((await fetch(first.putUrl,{method:'PUT',headers:{'Content-Type':'application/pdf'},body:new Uint8Array(pdf('v1'))})).status,200);
 const create={action:'create',id,title:'Folleto '+stamp,description:'Tarifas y beneficios',kind:'deliverable',source:'file',categoryIds:[category,category],version:{uploadId:first.uploadId}};
 await call(endpoints.post,'sales_materials',admin.cookie,{...create,categoryIds:[spare]},400);
 assert.deepEqual(await call(endpoints.post,'sales_materials',admin.cookie,create),{id,revision:1});
 assert.deepEqual(await call(endpoints.post,'sales_materials',admin.cookie,create),{id},'A double submit returns the stored material');
 assert.equal((await material(id)).currentVersion,1);assert.equal((await uploadRow(first.uploadId)).status,'completed');
 await call(endpoints.post,'sales_materials',admin.cookie,{action:'version',id,revision:1,version:{uploadId:first.uploadId}},409);
 checks++;
 // Upload verification: size, type and signature mismatches delete the object and discard the upload.
 for(const [label,body,options] of [['size',pdf('short'),{declared:pdf('short').length+10}],['type',pdf('typed'),{putType:'image/png'}],['signature',png,{}]] as const){
  const before=objects.size;const uploadId=await upload(admin.cookie,{purpose:'file',fileName:'mal.pdf',mimeType:'application/pdf',materialId:id},Buffer.from(body),options);assert.equal(objects.size,before+1);
  const error=(await call(endpoints.post,'sales_materials',admin.cookie,{action:'version',id,revision:1,version:{uploadId}},400)).error as string;assert.match(error,/Volvé a subirlo/,label);
  assert.equal(objects.size,before,label+' object deleted');const row=await uploadRow(uploadId);assert.equal(row.status,'discarded');assert(row.deletedAt);
 }
 await call(endpoints.uploadUrl,'sales_materials/upload_url',admin.cookie,{purpose:'file',fileName:'video.pdf',mimeType:'video/mp4',byteSize:10,materialId:id},400);
 await call(endpoints.uploadUrl,'sales_materials/upload_url',admin.cookie,{purpose:'file',fileName:'enorme.mp4',mimeType:'video/mp4',byteSize:524288001,materialId:id},400);
 checks++;
 // New version, revision conflict, and what each role can read.
 const second=await upload(admin.cookie,{purpose:'file',fileName:'folleto v2.pdf',mimeType:'application/pdf',materialId:id},pdf('v2'));
 await call(endpoints.post,'sales_materials',admin.cookie,{action:'version',id,revision:7,version:{uploadId:second}},409);
 assert.deepEqual(await call(endpoints.post,'sales_materials',admin.cookie,{action:'version',id,revision:1,version:{uploadId:second}}),{ok:true,revision:2});
 const sellerView=(await call(endpoints.get,'sales_materials?search='+encodeURIComponent('FOLLETO '+stamp),seller.cookie)).materials;assert.equal(sellerView.length,1);
 assert.equal(sellerView[0].currentVersion.version,2);assert.equal(sellerView[0].versions,undefined);assert.deepEqual(sellerView[0].categories.map((c:any)=>c.id),[category]);
 assert(!JSON.stringify(sellerView).includes('materials/'),'Object keys never reach the client');
 assert.equal((await call(endpoints.get,'sales_materials?search=tarifas+'+stamp,seller.cookie)).materials.length,0,'Search is per field, not across title and description');
 assert.equal((await call(endpoints.get,'sales_materials?categoryId='+category,seller.cookie)).materials.length,1);
 assert.equal((await call(endpoints.get,`sales_materials?categoryIds=${spare},${category}`,seller.cookie)).materials.length,1,'Several categories match any of them');assert.equal((await call(endpoints.get,'sales_materials?categoryIds='+spare,seller.cookie)).materials.length,0);
 await call(endpoints.get,'sales_materials?categoryIds=1,x',seller.cookie,undefined,400);
 const adminView=(await call(endpoints.get,'sales_materials?search='+encodeURIComponent('folleto '+stamp),admin.cookie)).materials[0];assert.deepEqual(adminView.versions.map((v:any)=>v.version),[2,1]);
 const [v2,v1]=adminView.versions;
 const sellerFile=await raw(endpoints.file,'sales_materials/file?disposition=attachment&versionId='+v2.id,seller.cookie);assert.equal(sellerFile.status,302);assert.equal(sellerFile.headers.get('Cache-Control'),'no-store');
 const location=new URL(sellerFile.headers.get('Location')!);assert.equal(location.searchParams.get('X-Amz-Expires'),'300');assert.match(location.searchParams.get('response-content-disposition')!,/^attachment; filename="folleto v2\.pdf"; filename\*=UTF-8''folleto%20v2\.pdf$/);assert.equal(location.searchParams.get('response-content-type'),'application/pdf');
 assert.deepEqual(Buffer.from(await (await fetch(location)).arrayBuffer()),pdf('v2'));
 assert.equal((await raw(endpoints.file,'sales_materials/file?versionId='+v1.id,seller.cookie)).status,403,'Older versions are admin-only');
 assert.equal((await raw(endpoints.file,'sales_materials/file?versionId='+v1.id,admin.cookie)).status,302);
 assert.equal((await raw(endpoints.file,'sales_materials/file?versionId='+randomUUID(),seller.cookie)).status,404);
 checks++;
 // Update (kind, categories), archive and restore with optimistic revisions.
 assert.deepEqual(await call(endpoints.post,'sales_materials',admin.cookie,{action:'update',id,revision:2,title:'Folleto interno '+stamp,description:'Solo equipo',kind:'internal',categoryIds:[]}),{ok:true,revision:3});
 assert.equal((await call(endpoints.get,'sales_materials?kind=deliverable&search='+stamp,seller.cookie)).materials.length,0);
 assert.equal((await call(endpoints.get,'sales_materials?kind=internal&search='+stamp,seller.cookie)).materials.length,1,'Sellers read internal material');
 await call(endpoints.post,'sales_materials',admin.cookie,{action:'archive',id,revision:2},409);
 await call(endpoints.post,'sales_materials',admin.cookie,{action:'archive',id,revision:3});
 assert.equal((await call(endpoints.get,'sales_materials?search='+stamp,seller.cookie)).materials.length,0);
 assert.equal((await raw(endpoints.file,'sales_materials/file?versionId='+v2.id,seller.cookie)).status,403);
 assert.equal((await call(endpoints.get,'sales_materials?includeArchived=1&search='+stamp,admin.cookie)).materials[0].status,'archived');
 await call(endpoints.uploadUrl,'sales_materials/upload_url',admin.cookie,{purpose:'file',fileName:'x.pdf',mimeType:'application/pdf',byteSize:10,materialId:id},400);
 await call(endpoints.post,'sales_materials',admin.cookie,{action:'restore',id,revision:4});
 const archivedRow=await material(id);assert.equal(archivedRow.status,'active');assert.equal(archivedRow.archivedAt,null);
 checks++;
 // External URL material: https only, no files, the file route redirects to the URL.
 const linkId=randomUUID();
 await call(endpoints.post,'sales_materials',admin.cookie,{action:'create',id:linkId,title:'Video '+stamp,description:'',kind:'deliverable',source:'url',categoryIds:[],version:{url:'http://example.com/video'}},400);
 await call(endpoints.post,'sales_materials',admin.cookie,{action:'create',id:linkId,title:'Video '+stamp,description:'',kind:'deliverable',source:'url',categoryIds:[],version:{url:'https://user:pass@example.com/video'}},400);
 await call(endpoints.post,'sales_materials',admin.cookie,{action:'create',id:linkId,title:'Video '+stamp,description:'',kind:'deliverable',source:'file',categoryIds:[],version:{url:'https://example.com/video'}},400);
 await call(endpoints.post,'sales_materials',admin.cookie,{action:'create',id:linkId,title:'Video '+stamp,description:'',kind:'deliverable',source:'url',categoryIds:[category],version:{url:'https://example.com/video'}});
 await call(endpoints.uploadUrl,'sales_materials/upload_url',admin.cookie,{purpose:'file',fileName:'x.pdf',mimeType:'application/pdf',byteSize:10,materialId:linkId},400);
 const linkVersion=(await call(endpoints.get,'sales_materials?search=video+'+stamp,seller.cookie)).materials[0].currentVersion;assert.equal(linkVersion.url,'https://example.com/video');
 assert.equal((await raw(endpoints.file,'sales_materials/file?versionId='+linkVersion.id,seller.cookie)).headers.get('Location'),'https://example.com/video');
 checks++;
 // Covers: images up to 1 MB, served through our server; a small image material is its own cover.
 await call(endpoints.uploadUrl,'sales_materials/upload_url',admin.cookie,{purpose:'cover',fileName:'tapa.pdf',mimeType:'application/pdf',byteSize:10,materialId:id},400);
 await call(endpoints.uploadUrl,'sales_materials/upload_url',admin.cookie,{purpose:'cover',fileName:'tapa.png',mimeType:'image/png',byteSize:1048577,materialId:id},400);
 const coverUpload=await upload(admin.cookie,{purpose:'cover',fileName:'tapa.png',mimeType:'image/png',materialId:id},png);
 assert.match((await uploadRow(coverUpload)).objectKey,new RegExp(`^covers/${id}/[0-9a-f-]{36}\\.png$`));
 await call(endpoints.post,'sales_materials',admin.cookie,{action:'cover',id,revision:5,uploadId:coverUpload});
 assert.equal((await call(endpoints.get,'sales_materials?search=interno+'+stamp,seller.cookie)).materials[0].hasCover,true);
 const coverResponse=await raw(endpoints.cover,'sales_materials/cover?materialId='+id,seller.cookie);assert.equal(coverResponse.status,200);assert.equal(coverResponse.headers.get('Content-Type'),'image/png');assert.deepEqual(Buffer.from(await coverResponse.arrayBuffer()),png);
 assert.equal((await raw(endpoints.cover,'sales_materials/cover?materialId='+linkId,seller.cookie)).status,404);
 await call(endpoints.post,'sales_materials',admin.cookie,{action:'cover',id,revision:6,uploadId:null});assert.equal((await material(id)).coverKey,null);
 const imageId=randomUUID();const imageUpload=await upload(admin.cookie,{purpose:'file',fileName:'foto.png',mimeType:'image/png',materialId:imageId},png);
 await call(endpoints.post,'sales_materials',admin.cookie,{action:'create',id:imageId,title:'Foto '+stamp,description:'',kind:'deliverable',source:'file',categoryIds:[],version:{uploadId:imageUpload}});
 assert.equal((await call(endpoints.get,'sales_materials?search=foto+'+stamp,seller.cookie)).materials[0].hasCover,true);assert.equal((await raw(endpoints.cover,'sales_materials/cover?materialId='+imageId,seller.cookie)).status,200);
 checks++;
 // Spec 95: cover modes. `auto` is reported as such, dropped by a new version (its object handed to the sweep), never replacing a manual choice;
 // a manual cover replaces it and survives versions; a removal (`none`) is kept: no automatic cover is accepted and a version does not reopen it.
 const jpg=Buffer.concat([Buffer.from([0xff,0xd8,0xff,0xe0]),Buffer.alloc(40,2)]);
 const autoId=randomUUID();const autoFile=await upload(admin.cookie,{purpose:'file',fileName:'auto.pdf',mimeType:'application/pdf',materialId:autoId},pdf('a1'));
 await call(endpoints.post,'sales_materials',admin.cookie,{action:'create',id:autoId,title:'Portada auto '+stamp,description:'',kind:'deliverable',source:'file',categoryIds:[],version:{uploadId:autoFile}});
 const listedAuto=async()=>(await call(endpoints.get,'sales_materials?search='+encodeURIComponent('portada auto '+stamp),admin.cookie)).materials[0];
 const postAuto=async(revision:number,body=jpg)=>{const uploadId=await upload(admin.cookie,{purpose:'cover',fileName:'portada-automatica.jpg',mimeType:'image/jpeg',materialId:autoId},body);return {uploadId,result:await call(endpoints.post,'sales_materials',admin.cookie,{action:'cover',id:autoId,revision,uploadId,auto:true})};};
 const sweepAndHas=async(key:string)=>{await sweepAbandonedSalesMaterialUploads(db);return objects.has(key);};
 assert.equal((await material(autoId)).coverMode,'manual');assert.equal((await listedAuto()).coverSource,null,'Never set: manual without key');assert.equal((await listedAuto()).hasCover,false);
 const auto1=await postAuto(1);assert.deepEqual(auto1.result,{ok:true,revision:2});
 const auto1Key=(await material(autoId)).coverKey;assert.equal((await material(autoId)).coverMode,'auto');assert.equal((await listedAuto()).coverSource,'auto');assert.equal((await listedAuto()).hasCover,true);
 assert.deepEqual(Buffer.from(await (await raw(endpoints.cover,'sales_materials/cover?materialId='+autoId,seller.cookie)).arrayBuffer()),jpg);
 // The automatic cover gets the same checks as any cover: a PDF declared as JPEG is discarded.
 const fakeAuto=await upload(admin.cookie,{purpose:'cover',fileName:'portada-automatica.jpg',mimeType:'image/jpeg',materialId:autoId},pdf('no'));
 await call(endpoints.post,'sales_materials',admin.cookie,{action:'cover',id:autoId,revision:2,uploadId:fakeAuto,auto:true},400);assert.equal((await uploadRow(fakeAuto)).status,'discarded');
 // An automatic cover replacing another one hands the old object to the sweep.
 await postAuto(2);const auto2Key=(await material(autoId)).coverKey;assert.notEqual(auto2Key,auto1Key);
 assert.equal((await sql<any>`SELECT status FROM crm_sales_material_uploads WHERE object_key=${auto1Key}`.execute(db)).rows[0].status,'pending');
 assert.equal(await sweepAndHas(auto1Key),false,'The replaced automatic cover is deleted by the sweep');assert.equal(objects.has(auto2Key),true);
 const a2=await upload(admin.cookie,{purpose:'file',fileName:'auto v2.pdf',mimeType:'application/pdf',materialId:autoId},pdf('a2'));
 assert.deepEqual(await call(endpoints.post,'sales_materials',admin.cookie,{action:'version',id:autoId,revision:3,version:{uploadId:a2}}),{ok:true,revision:4});
 let autoRow=await material(autoId);assert.equal(autoRow.coverKey,null);assert.equal(autoRow.coverMime,null);assert.equal(autoRow.coverMode,'manual','A new version drops the automatic cover of the old file');assert.equal((await listedAuto()).coverSource,null);
 assert.equal(await sweepAndHas(auto2Key),false,'The dropped automatic cover is deleted by the sweep');
 await postAuto(4);const auto3Key=(await material(autoId)).coverKey;
 const manualCover=await upload(admin.cookie,{purpose:'cover',fileName:'tapa.png',mimeType:'image/png',materialId:autoId},png);
 await call(endpoints.post,'sales_materials',admin.cookie,{action:'cover',id:autoId,revision:5,uploadId:manualCover});
 const manualKey=(await material(autoId)).coverKey;assert.equal((await listedAuto()).coverSource,'manual');
 assert.equal(await sweepAndHas(auto3Key),false,'A manual cover replacing an automatic one releases the automatic object');assert.equal(objects.has(manualKey),true);
 const late=await postAuto(6);assert.deepEqual(late.result,{ok:true,revision:6,coverKept:true});
 autoRow=await material(autoId);assert.equal(autoRow.coverKey,manualKey,'A manual cover always wins');assert.equal(autoRow.revision,6);assert.equal((await uploadRow(late.uploadId)).status,'pending','The refused upload is left for the sweep');
 const a3=await upload(admin.cookie,{purpose:'file',fileName:'auto v3.pdf',mimeType:'application/pdf',materialId:autoId},pdf('a3'));
 await call(endpoints.post,'sales_materials',admin.cookie,{action:'version',id:autoId,revision:6,version:{uploadId:a3}});
 autoRow=await material(autoId);assert.equal(autoRow.coverKey,manualKey,'A new version keeps a manual cover');assert.equal(autoRow.coverMode,'manual');
 // «Quitar portada» is a manual choice: `none`. The manual object stays in R2; no automatic cover is accepted and a new version keeps `none`.
 await call(endpoints.post,'sales_materials',admin.cookie,{action:'cover',id:autoId,revision:7,uploadId:null});
 assert.equal((await material(autoId)).coverMode,'none');assert.equal((await listedAuto()).coverSource,'none');assert.equal(await sweepAndHas(manualKey),true,'A manual cover object is never deleted');
 assert.deepEqual((await postAuto(8)).result,{ok:true,revision:8,coverKept:true});assert.equal((await material(autoId)).coverKey,null);
 const a4=await upload(admin.cookie,{purpose:'file',fileName:'auto v4.pdf',mimeType:'application/pdf',materialId:autoId},pdf('a4'));
 await call(endpoints.post,'sales_materials',admin.cookie,{action:'version',id:autoId,revision:8,version:{uploadId:a4}});
 assert.equal((await material(autoId)).coverMode,'none','A new version does not undo a removal');assert.equal((await listedAuto()).coverSource,'none');
 // A manual upload after a removal is again a manual cover.
 const again=await upload(admin.cookie,{purpose:'cover',fileName:'tapa2.png',mimeType:'image/png',materialId:autoId},png);
 await call(endpoints.post,'sales_materials',admin.cookie,{action:'cover',id:autoId,revision:9,uploadId:again});assert.equal((await material(autoId)).coverMode,'manual');
 await sql`UPDATE crm_sales_materials SET cover_mode='auto',cover_key=NULL WHERE id=${autoId}::uuid`.execute(db).then(()=>assert.fail('auto needs a key'),e=>assert.match(String(e),/cover_mode_check/));
 // `status=archived` lists only archived material (admins), so the 500-row limit is not spent on active ones.
 await call(endpoints.get,'sales_materials?status=archived',seller.cookie,undefined,403);
 const archivedOnly=await call(endpoints.get,'sales_materials?status=archived',admin.cookie);assert(archivedOnly.materials.every((m:any)=>m.status==='archived'));
 await call(endpoints.get,'sales_materials?status=active',admin.cookie,undefined,400);
 checks++;
 // Abandoned-upload sweep: only expired pending uploads, a 404 counts as deleted, and one sweeper at a time.
 const expired=await call(endpoints.uploadUrl,'sales_materials/upload_url',admin.cookie,{purpose:'file',fileName:'abandonado.pdf',mimeType:'application/pdf',byteSize:pdf('x').length,materialId:id});
 await fetch(expired.putUrl,{method:'PUT',headers:{'Content-Type':'application/pdf'},body:new Uint8Array(pdf('x'))});
 const missing=await call(endpoints.uploadUrl,'sales_materials/upload_url',admin.cookie,{purpose:'file',fileName:'nunca.pdf',mimeType:'application/pdf',byteSize:10,materialId:id});
 const fresh=await call(endpoints.uploadUrl,'sales_materials/upload_url',admin.cookie,{purpose:'file',fileName:'reciente.pdf',mimeType:'application/pdf',byteSize:10,materialId:id});
 await sql`UPDATE crm_sales_material_uploads SET expires_at=now()-interval '1 minute' WHERE id IN (${expired.uploadId}::uuid,${missing.uploadId}::uuid)`.execute(db);
 const expiredKey=(await uploadRow(expired.uploadId)).objectKey;assert(objects.has(expiredKey));
 const holder=postgres(process.env.DATABASE_URL!,{max:1,prepare:false,path:process.env.CRM_TEST_DATABASE_SOCKET});
 try{await holder.begin(async tx=>{await tx`SELECT pg_advisory_xact_lock(hashtext('crm_sales_material_upload_sweep'))`;assert.deepEqual(await sweepAbandonedSalesMaterialUploads(db),{locked:false,discarded:0,failed:0});});}finally{await holder.end();}
 assert.equal((await uploadRow(expired.uploadId)).status,'pending','A held lock skips the sweep');
 const swept=await sweepAbandonedSalesMaterialUploads(db);assert.equal(swept.locked,true);assert(swept.discarded>=2);assert.equal(swept.failed,0);
 for(const u of [expired.uploadId,missing.uploadId]){const row=await uploadRow(u);assert.equal(row.status,'discarded');assert(row.deletedAt);}
 assert(!objects.has(expiredKey));assert.equal((await uploadRow(fresh.uploadId)).status,'pending');
 assert.equal((await uploadRow(first.uploadId)).status,'completed','Completed uploads are never swept');
 await sql`UPDATE crm_sales_material_uploads SET expires_at=now()-interval '1 minute' WHERE id=${fresh.uploadId}::uuid`.execute(db);
 await call(endpoints.post,'sales_materials',admin.cookie,{action:'version',id,revision:7,version:{uploadId:fresh.uploadId}},400);
 checks++;

 // Upload ownership and purpose: another admin's upload, a cover used as a file, an upload made for another material.
 const other=await identity('admin');
 const currentRevision=async(materialId:string)=>(await material(materialId)).revision as number;
 const mine=await upload(admin.cookie,{purpose:'file',fileName:'ajeno.pdf',mimeType:'application/pdf',materialId:id},pdf('mine'));
 assert.match((await call(endpoints.post,'sales_materials',other.cookie,{action:'version',id,revision:await currentRevision(id),version:{uploadId:mine}},400)).error,/otra persona/);
 assert.equal((await uploadRow(mine)).status,'pending','Another admin cannot consume or discard the upload');
 const asCover=await upload(admin.cookie,{purpose:'cover',fileName:'tapa2.png',mimeType:'image/png',materialId:id},png);
 assert.match((await call(endpoints.post,'sales_materials',admin.cookie,{action:'version',id,revision:await currentRevision(id),version:{uploadId:asCover}},400)).error,/no corresponde a este material/);
 const forImage=await upload(admin.cookie,{purpose:'file',fileName:'otro.pdf',mimeType:'application/pdf',materialId:imageId},pdf('other'));
 assert.match((await call(endpoints.post,'sales_materials',admin.cookie,{action:'version',id,revision:await currentRevision(id),version:{uploadId:forImage}},400)).error,/no corresponde a este material/);
 for(const u of [mine,asCover,forImage])assert.equal((await uploadRow(u)).status,'pending','A mismatch does not consume the upload');
 checks++;
 // Archived material: a seller gets 403 on its cover, an admin still reads it.
 const archId=randomUUID();const archUpload=await upload(admin.cookie,{purpose:'file',fileName:'archivada.png',mimeType:'image/png',materialId:archId},png);
 await call(endpoints.post,'sales_materials',admin.cookie,{action:'create',id:archId,title:'Archivada '+stamp,description:'',kind:'deliverable',source:'file',categoryIds:[],version:{uploadId:archUpload}});
 assert.equal((await raw(endpoints.cover,'sales_materials/cover?materialId='+archId,seller.cookie)).status,200);
 await call(endpoints.post,'sales_materials',admin.cookie,{action:'archive',id:archId,revision:await currentRevision(archId)});
 assert.equal((await raw(endpoints.cover,'sales_materials/cover?materialId='+archId,seller.cookie)).status,403);assert.equal((await raw(endpoints.cover,'sales_materials/cover?materialId='+archId,admin.cookie)).status,200);
 checks++;
 // Concurrent duplicates of the same create answer with the stored material, never «Esa subida ya se usó».
 const dupId=randomUUID();const dupUpload=await upload(admin.cookie,{purpose:'file',fileName:'doble.pdf',mimeType:'application/pdf',materialId:dupId},pdf('dup'));
 const dupBody={action:'create',id:dupId,title:'Doble envío '+stamp,description:'',kind:'deliverable',source:'file',categoryIds:[],version:{uploadId:dupUpload}};
 const dups=await Promise.all([1,2,3,4].map(()=>call(endpoints.post,'sales_materials',admin.cookie,dupBody)));
 assert(dups.every(d=>d.id===dupId));assert.equal((await sql<{n:string}>`SELECT count(*) AS n FROM crm_sales_material_versions WHERE material_id=${dupId}::uuid`.execute(db)).rows[0].n,'1');
 checks++;
 // R2 down: verification answers 503 and keeps the upload pending; the sweep puts a failed delete back to pending.
 const real=createR2Storage({config:r2Config()!});
 const down=(over:Partial<typeof real>)=>({...real,...over});
 const downUpload=await upload(admin.cookie,{purpose:'file',fileName:'caido.pdf',mimeType:'application/pdf',materialId:id},pdf('down'));
 setR2StorageForTests({storage:down({head:async()=>{throw new R2Unavailable('R2 down')}})});
 try{await call(endpoints.post,'sales_materials',admin.cookie,{action:'version',id,revision:await currentRevision(id),version:{uploadId:downUpload}},503);}finally{setR2StorageForTests({storage:undefined});}
 assert.equal((await uploadRow(downUpload)).status,'pending','An R2 outage does not discard the upload');
 const downKey=(await uploadRow(downUpload)).objectKey;await sql`UPDATE crm_sales_material_uploads SET expires_at=now()-interval '1 minute' WHERE id=${downUpload}::uuid`.execute(db);
 const failedSweep=await sweepAbandonedSalesMaterialUploads(db,{storage:down({remove:async input=>{if(input.key!==downKey)return real.remove(input);throw new R2Unavailable('R2 down')}})});
 assert.equal(failedSweep.failed,1);
 const afterFail=await uploadRow(downUpload);assert.equal(afterFail.status,'pending');assert.equal(afterFail.claimedAt,null);assert(objects.has(downKey),'The object stays when R2 could not delete it');
 // Sweep and confirmation never cross: a confirmed upload is not claimed, a claimed one cannot be confirmed.
 const completedKey=(await uploadRow(first.uploadId)).objectKey;await sql`UPDATE crm_sales_material_uploads SET expires_at=now()-interval '1 minute' WHERE id=${first.uploadId}::uuid`.execute(db);
 const beforeConfirmedSweep=objects.size;await sweepAbandonedSalesMaterialUploads(db);
 assert(objects.has(completedKey));assert.equal((await uploadRow(first.uploadId)).status,'completed','A confirmed upload is never deleted, even when expired');
 assert(!objects.has(downKey));assert.equal((await uploadRow(downUpload)).status,'discarded');assert(objects.size<beforeConfirmedSweep);
 // Confirmation attempted while the sweep is deleting (status deleting) is refused.
 const mid=await upload(admin.cookie,{purpose:'file',fileName:'medio.pdf',mimeType:'application/pdf',materialId:id},pdf('mid'));
 await sql`UPDATE crm_sales_material_uploads SET expires_at=now()-interval '1 minute' WHERE id=${mid}::uuid`.execute(db);
 let attempted=false;const midKey=(await uploadRow(mid)).objectKey;
 const midSweep=await sweepAbandonedSalesMaterialUploads(db,{storage:down({remove:async input=>{
  if(input.key!==midKey)return real.remove(input);
  assert.equal((await uploadRow(mid)).status,'deleting');
  assert.match((await call(endpoints.post,'sales_materials',admin.cookie,{action:'version',id,revision:await currentRevision(id),version:{uploadId:mid}},400)).error,/descart|venci/);attempted=true;return real.remove(input);}})});
 assert(attempted);assert(midSweep.discarded>=1);assert.equal((await uploadRow(mid)).status,'discarded');
 // The sweep claims the upload after verification passed but before the transaction consumes it: the version is not created.
 const raced=await upload(admin.cookie,{purpose:'file',fileName:'carrera.pdf',mimeType:'application/pdf',materialId:id},pdf('race'));
 const racedKey=(await uploadRow(raced)).objectKey,revisionBefore=await currentRevision(id),versionsBefore=(await sql<{n:string}>`SELECT count(*) AS n FROM crm_sales_material_versions WHERE material_id=${id}::uuid`.execute(db)).rows[0].n;
 setR2StorageForTests({storage:down({readPrefix:async input=>{const bytes=await real.readPrefix(input);await sql`UPDATE crm_sales_material_uploads SET expires_at=now()-interval '1 minute' WHERE id=${raced}::uuid`.execute(db);await sweepAbandonedSalesMaterialUploads(db,{storage:real});return bytes;}})});
 try{assert.match((await call(endpoints.post,'sales_materials',admin.cookie,{action:'version',id,revision:revisionBefore,version:{uploadId:raced}},400)).error,/venció|descartó/);}finally{setR2StorageForTests({storage:undefined});}
 assert.equal((await uploadRow(raced)).status,'discarded');assert(!objects.has(racedKey));assert.equal(await currentRevision(id),revisionBefore);
 assert.equal((await sql<{n:string}>`SELECT count(*) AS n FROM crm_sales_material_versions WHERE material_id=${id}::uuid`.execute(db)).rows[0].n,versionsBefore);
 checks++;
 // Without R2 configuration storage routes answer 503 and listing keeps working.
 setR2StorageForTests({storage:null});
 try{
  assert.equal((await call(endpoints.get,'sales_materials',seller.cookie)).limits.storageConfigured,false);
  await call(endpoints.uploadUrl,'sales_materials/upload_url',admin.cookie,{purpose:'file',fileName:'a.pdf',mimeType:'application/pdf',byteSize:10,materialId:id},503);
  await call(endpoints.uploadUrl,'sales_materials/upload_url',seller.cookie,{purpose:'file',fileName:'a.pdf',mimeType:'application/pdf',byteSize:10,materialId:id},403);
  assert.equal((await raw(endpoints.file,'sales_materials/file?versionId='+v2.id,seller.cookie)).status,503);
  await call(endpoints.post,'sales_materials',admin.cookie,{action:'update',id,revision:7,title:'Folleto interno '+stamp,description:'Solo equipo',kind:'internal',categoryIds:[category]});
 }finally{setR2StorageForTests({storage:undefined});}
 checks++;
 // Ctrl+K: the «Material de venta» group lists active material only; the retired library rejects writes.
 const results=(await call(searchGet,'search?q='+encodeURIComponent('foto '+stamp),seller.cookie)).results.filter((r:any)=>r.kind==='Material de venta');
 assert.deepEqual(results.map((r:any)=>r.url),['/sales-material?material='+imageId]);
 const archivedImage=await material(imageId);await call(endpoints.post,'sales_materials',admin.cookie,{action:'archive',id:imageId,revision:archivedImage.revision});
 assert.equal((await call(searchGet,'search?q='+encodeURIComponent('foto '+stamp),seller.cookie)).results.filter((r:any)=>r.kind==='Material de venta').length,0);
 assert.equal((await call(resourcesPost,'resources',admin.cookie,{action:'create',id:randomUUID(),title:'Vieja biblioteca',type:'propuesta',accountId:null,leadId:null,activityId:null,library:true,categoryId:null,version:{url:'https://example.com/x'}},400)).error,'La biblioteca fue reemplazada por Material de venta.');
 checks++;
 // Journal: every write is audited with the acting admin; category sets are journaled as one row.
 const journal=(await sql<{entity:string;action:string;actorEmail:string|null}>`SELECT entity,action,actor_email FROM crm_resource_journal WHERE entity_id=${id} ORDER BY id`.execute(db)).rows;
 assert(journal.some(j=>j.entity==='crm_sales_materials'&&j.action==='INSERT'));assert(journal.filter(j=>j.entity==='crm_sales_materials'&&j.action==='UPDATE').length>=6);
 assert(journal.some(j=>j.entity==='crm_sales_material_category_links'));
 const linkJournal=(await sql<{kind:string}>`SELECT jsonb_typeof(after_value->'categoryIds') AS kind FROM crm_resource_journal WHERE entity='crm_sales_material_category_links' AND entity_id=${id}`.execute(db)).rows;assert(linkJournal.length>0&&linkJournal.every(r=>r.kind==='array'),'Category journal stores JSON objects, not strings');assert(journal.every(j=>j.actorEmail===admin.user.email));
 // The migration only creates tables and a settings key: no DML on the old library.
 const migration=await readFile('migrations/046_sales_material.sql','utf8');assert(!/[\u0300-\u036f]/.test(migration),'Combining characters are written as escapes');
 assert.deepEqual((await sql<{t:string}>`SELECT tgname AS t FROM pg_trigger WHERE tgrelid='crm_sales_material_uploads'::regclass AND NOT tgisinternal ORDER BY 1`.execute(db)).rows.map(r=>r.t),['resource_audit'],'Upload bookkeeping does not bump the live domain');assert(!/(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+crm_document/i.test(migration));
 assert.equal(JSON.parse((await db.selectFrom('appSettings').select('value').where('key','=','crm_communication').executeTakeFirstOrThrow()).value).maxDocumentBytes,2097152);
 assert(requests.some(r=>r.startsWith('HEAD '))&&requests.some(r=>r.startsWith('DELETE ')));
 checks++;
 console.log(`Sales material (spec 89 F1): ${checks} groups passed: permissions, categories, presigned upload, verification and discard, versions, revisions, archive/restore, URLs, covers, automatic covers (spec 95), sweep with lock and claim, upload ownership and purpose, archived cover, duplicate create, R2 outage and sweep races, missing R2, search, legacy library and journal`);
}finally{
 await db.deleteFrom('sessions').where('userId','in',userIds).execute();await db.destroy();r2.close();
}
