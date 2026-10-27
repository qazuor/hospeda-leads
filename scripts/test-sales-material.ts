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
const {setR2StorageForTests}=await import('../src/helpers/r2');
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
 const sellerList=await call(endpoints.get,'sales_materials',seller.cookie);assert.equal(sellerList.limits.storageConfigured,true);assert.equal(sellerList.limits.maxUploadBytes,524288000);
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
 const put=new URL(first.putUrl);assert.equal(put.searchParams.get('X-Amz-Expires'),'1800');assert.match(put.searchParams.get('X-Amz-SignedHeaders')!,/content-type/);assert(put.searchParams.get('X-Amz-Signature'));assert.match(decodeURIComponent(put.pathname),new RegExp(`^/crm-material/materials/${id}/v1-[0-9a-f-]{36}\\.pdf$`));
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
 // Without R2 configuration storage routes answer 503 and listing keeps working.
 setR2StorageForTests({storage:null});
 try{
  assert.equal((await call(endpoints.get,'sales_materials',seller.cookie)).limits.storageConfigured,false);
  await call(endpoints.uploadUrl,'sales_materials/upload_url',admin.cookie,{purpose:'file',fileName:'a.pdf',mimeType:'application/pdf',byteSize:10,materialId:id},503);
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
 const migration=await readFile('migrations/046_sales_material.sql','utf8');assert(!/(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+crm_document/i.test(migration));
 assert.equal(JSON.parse((await db.selectFrom('appSettings').select('value').where('key','=','crm_communication').executeTakeFirstOrThrow()).value).maxDocumentBytes,2097152);
 assert(requests.some(r=>r.startsWith('HEAD '))&&requests.some(r=>r.startsWith('DELETE ')));
 checks++;
 console.log(`Sales material (spec 89 F1): ${checks} groups passed: permissions, categories, presigned upload, verification and discard, versions, revisions, archive/restore, URLs, covers, sweep with lock, missing R2, search, legacy library and journal`);
}finally{
 await db.deleteFrom('sessions').where('userId','in',userIds).execute();await db.destroy();r2.close();
}
