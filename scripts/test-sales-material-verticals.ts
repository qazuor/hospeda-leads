// Spec 102 blocks 3-5 integration: material verticals (migration 057, admin writes, seller ordering by context vertical), category creation
// permissions from the single selector, and the link preview endpoint (admin only, URL read from the database, SSRF guard, fake fetcher).
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import superjson from 'superjson';
import {sql} from 'kysely';
assert.equal(process.env.CRM_TEST_DATABASE,'1','Disposable database required');
const {db}=await import('../src/helpers/db');
const {setServerSession}=await import('../src/helpers/getSetServerSession');
const endpoints=await import('../src/endpoints/salesMaterials');
const {setLinkPreviewFetcherForTests}=await import('../src/helpers/salesMaterialService');
const {LinkPreviewError}=await import('../src/helpers/linkPreview');
const stamp=randomUUID().slice(0,8),userIds:number[]=[],verticalNames:string[]=[];
async function identity(role:'admin'|'user'){
 const user=await db.insertInto('users').values({email:`material-verticals-${role}-${stamp}-${userIds.length}@example.com`,displayName:'Verticales '+role,role}).returningAll().executeTakeFirstOrThrow();userIds.push(user.id);
 const id='material-verticals-'+user.id;await db.insertInto('sessions').values({id,userId:user.id,expiresAt:new Date(Date.now()+3600000)}).execute();
 const r=new Response();await setServerSession(r,{id,createdAt:Date.now(),lastAccessed:Date.now()});return {user,cookie:r.headers.get('set-cookie')!.split(';')[0]};
}
type Handler=(r:Request)=>Promise<Response>;
async function call(handler:Handler,path:string,cookie:string,body?:unknown,status=200){
 const r=await handler(new Request('http://localhost/_api/'+path,{headers:{cookie},...(body===undefined?{}:{method:'POST',body:superjson.stringify(body)})}));
 const text=await r.text();let data:any=null;try{data=text?superjson.parse<any>(text):null;}catch{data=text;}assert.equal(r.status,status,`${path}: ${data?.error??text}`);return data;
}
const post=(cookie:string,body:unknown,status=200)=>call(endpoints.post,'sales_materials',cookie,body,status);
const link=(id:string,title:string,verticals?:string[])=>({action:'create',id,title,description:'',kind:'deliverable',source:'url',categoryIds:[],...(verticals?{verticals}:{}),version:{url:'https://example.com/'+id}});
const row=async(id:string)=>(await sql<any>`SELECT * FROM crm_sales_materials WHERE id=${id}::uuid`.execute(db)).rows[0];
try{
 const admin=await identity('admin'),seller=await identity('user'),other=await identity('user');let checks=0;
 const gastro='Zz Gastro '+stamp,old='Zz Vieja '+stamp;verticalNames.push(gastro,old);
 await sql`INSERT INTO crm_verticals(name,sort_order,active) VALUES(${gastro},90,true),(${old},91,false)`.execute(db);
 // Migration 057: the column exists, defaults to «all verticals» (empty) and caps at 20; nothing else changed.
 const column=(await sql<{dataType:string;columnDefault:string;isNullable:string}>`SELECT data_type,column_default,is_nullable FROM information_schema.columns WHERE table_name='crm_sales_materials' AND column_name='verticals'`.execute(db)).rows[0];
 assert.deepEqual([column.dataType,column.isNullable],['ARRAY','NO']);assert.match(column.columnDefault,/'\{\}'/);
 const legacy=randomUUID();await sql`INSERT INTO crm_sales_materials(id,title,kind,source,created_by_email) VALUES(${legacy}::uuid,${'Zz Legado '+stamp},'deliverable','url','admin@example.com')`.execute(db);
 assert.deepEqual((await row(legacy)).verticals,[],'An existing material stays «all verticals»');
 await assert.rejects(sql`UPDATE crm_sales_materials SET verticals=${Array.from({length:21},(_,i)=>'v'+i)}::text[] WHERE id=${legacy}::uuid`.execute(db),/check/i);
 checks++;
 // Admin writes: exact catalog names, sellers refused, unknown and inactive names rejected, an inactive name the material had is kept.
 const specific=randomUUID(),all=randomUUID(),otherOne=randomUUID();
 await post(seller.cookie,link(randomUUID(),'Zz Vendedor '+stamp,['Alojamiento']),403);
 assert.match((await post(admin.cookie,link(randomUUID(),'Zz Mal '+stamp,['alojamiento']),400)).error,/no existe en el catálogo/,'Catalog names compare exactly');
 assert.match((await post(admin.cookie,link(randomUUID(),'Zz Mal '+stamp,['Inventada '+stamp]),400)).error,/no existe/);
 assert.match((await post(admin.cookie,link(randomUUID(),'Zz Mal '+stamp,[old]),400)).error,/desactivada/);
 await post(admin.cookie,link(otherOne,'Zz Vert '+stamp+' otra',[gastro]));
 await post(admin.cookie,link(all,'Zz Vert '+stamp+' todas'));
 await post(admin.cookie,link(specific,'Zz Vert '+stamp+' propia',['Alojamiento','Alojamiento',gastro]));
 assert.deepEqual((await row(specific)).verticals,['Alojamiento',gastro],'Duplicates are dropped');assert.deepEqual((await row(all)).verticals,[]);
 const update=(id:string,revision:number,verticals:string[],status=200)=>post(admin.cookie,{action:'update',id,revision,title:'Zz Vert '+stamp+' otra',description:'',kind:'deliverable',categoryIds:[],verticals},status);
 await sql`UPDATE crm_sales_materials SET verticals=${[gastro,old]}::text[] WHERE id=${otherOne}::uuid`.execute(db);
 await update(otherOne,1,[gastro,old]);assert.deepEqual((await row(otherOne)).verticals,[gastro,old],'An inactive vertical the material already had is kept');
 await post(seller.cookie,{action:'update',id:otherOne,revision:2,title:'x'.repeat(5),description:'',kind:'deliverable',categoryIds:[],verticals:[]},403);
 await update(otherOne,2,[gastro]);
 assert.match((await update(otherOne,3,[gastro,old],400)).error,/desactivada/,'Once dropped, an inactive vertical cannot come back');
 const journal=(await sql<{after:any}>`SELECT after_value AS after FROM crm_resource_journal WHERE entity='crm_sales_materials' AND entity_id=${otherOne} AND action='UPDATE' ORDER BY id`.execute(db)).rows;
 assert(journal.some(j=>JSON.stringify(j.after?.verticals)===JSON.stringify([gastro])),'The audit journal records the verticals change');
 checks++;
 // Listing: the catalog for the form; ordered by the context vertical (management, else business) only with read access.
 const search='search='+encodeURIComponent('zz vert '+stamp);
 const plain=await call(endpoints.get,'sales_materials?'+search,seller.cookie);
 assert(plain.verticals.includes('Alojamiento')&&plain.verticals.includes(gastro)&&!plain.verticals.includes(old),'Active catalog verticals only');
 assert.equal(plain.contextVertical??null,null);assert(plain.materials.every((m:any)=>m.verticalMatch===undefined));
 const mine=await db.insertInto('crmAccounts').values({nombre:'Zz Verticales '+stamp,status:'reviewed',assignedUserEmail:seller.user.email,tipo:'Alojamiento'} as never).returningAll().executeTakeFirstOrThrow();
 const ordered=await call(endpoints.get,`sales_materials?${search}&forAccountId=${mine.id}`,seller.cookie);
 assert.equal(ordered.contextVertical,'Alojamiento');
 assert.deepEqual(ordered.materials.map((m:any)=>[m.id,m.verticalMatch]),[[specific,'specific'],[all,'all'],[otherOne,'other']]);
 const lead=await db.insertInto('leads').values({accountId:mine.id,nombre:mine.nombre,estado:'Cargado',assignedUserEmail:seller.user.email,tipo:gastro} as never).returningAll().executeTakeFirstOrThrow();
 const byLead=await call(endpoints.get,`sales_materials?${search}&forAccountId=${mine.id}&forLeadId=${lead.id}`,seller.cookie);
 assert.equal(byLead.contextVertical,gastro,'The management vertical wins over the business vertical (D5)');
 assert.deepEqual(byLead.materials.map((m:any)=>m.id),[otherOne,specific,all],'Both marked with the management vertical go first, in the list order');
 const plainLead=await db.insertInto('leads').values({accountId:mine.id,nombre:mine.nombre,opportunityName:'Sin vertical '+stamp,estado:'Cargado',assignedUserEmail:seller.user.email} as never).returningAll().executeTakeFirstOrThrow();
 assert.equal((await call(endpoints.get,`sales_materials?${search}&forLeadId=${plainLead.id}`,seller.cookie)).contextVertical,'Alojamiento','A management without vertical falls back to its business');
 const foreign=await db.insertInto('crmAccounts').values({nombre:'Zz Ajeno '+stamp,status:'reviewed',assignedUserEmail:other.user.email,tipo:'Alojamiento',archivedAt:new Date()} as never).returningAll().executeTakeFirstOrThrow();
 const hidden=await call(endpoints.get,`sales_materials?${search}&forAccountId=${foreign.id}`,seller.cookie);
 assert.equal(hidden.contextVertical,null,'Without read access the vertical of the business is not used (nor leaked)');
 assert.deepEqual(hidden.materials.map((m:any)=>m.id),plain.materials.map((m:any)=>m.id));
 assert.equal((await call(endpoints.get,`sales_materials?${search}&forAccountId=999999999`,seller.cookie)).contextVertical,null);
 await call(endpoints.get,'sales_materials?forAccountId=abc',seller.cookie,undefined,400);
 checks++;
 // Category selector (D6): creating from the single control is admin-only server side; names clash case-insensitively.
 await post(seller.cookie,{action:'category_create',name:'Zz Cat '+stamp},403);
 const created=await post(admin.cookie,{action:'category_create',name:'Zz Cat '+stamp});assert.match(created.id,/^\d+$/);
 assert.equal((await post(admin.cookie,{action:'category_create',name:' zz cat '+stamp.toUpperCase()+' '},400)).error,'Ya existe una categoría con ese nombre.');
 await post(admin.cookie,{action:'category_create',name:'Z'},400);
 // Same comparison as the selector and the city catalog: accents, case and spaces ignored (ñ ≠ n); a deactivated one asks to reactivate it.
 const promo=await post(admin.cookie,{action:'category_create',name:'Promoción '+stamp});
 assert.equal((await post(admin.cookie,{action:'category_create',name:'promocion  '+stamp.toUpperCase()},400)).error,'Ya existe una categoría con ese nombre.');
 await post(admin.cookie,{action:'category_create',name:'Niños '+stamp});await post(admin.cookie,{action:'category_create',name:'Ninos '+stamp});
 await post(admin.cookie,{action:'category_update',id:promo.id,name:'Promoción '+stamp,active:false});
 assert.equal((await post(admin.cookie,{action:'category_create',name:'PROMOCION '+stamp},400)).error,`Ya existe la categoría «Promoción ${stamp}», desactivada. Reactivala en Configuración → «Categorías de material».`);
 assert.equal((await post(admin.cookie,{action:'category_update',id:created.id,name:'promoción '+stamp,active:true},400)).error,`Ya existe la categoría «Promoción ${stamp}», desactivada. Reactivala en Configuración → «Categorías de material».`,'A rename is checked the same way');
 await post(admin.cookie,{action:'category_update',id:promo.id,name:'Promoción  '+stamp,active:true});
 checks++;
 // Link preview (D1): admin only, active link material, current revision; the URL comes from the database. Fake fetcher first.
 const fileMaterial=randomUUID();
 await sql`INSERT INTO crm_sales_materials(id,title,kind,source,created_by_email) VALUES(${fileMaterial}::uuid,${'Zz Archivo '+stamp},'deliverable','file','admin@example.com')`.execute(db);
 const png=new Uint8Array([137,80,78,71,13,10,26,10,1,2,3,4,5,6,7,8]);const asked:string[]=[];
 setLinkPreviewFetcherForTests(async({url})=>{asked.push(url);if(url.endsWith(otherOne))throw new LinkPreviewError('no_image','La página no tiene imagen de vista previa.');return {body:png,contentType:'image/png'};});
 await call(endpoints.linkPreview,'sales_materials/link_preview',seller.cookie,{id:specific,revision:1},403);
 await call(endpoints.linkPreview,'sales_materials/link_preview',admin.cookie,{id:fileMaterial,revision:1},400);
 await call(endpoints.linkPreview,'sales_materials/link_preview',admin.cookie,{id:specific,revision:7},409);
 await call(endpoints.linkPreview,'sales_materials/link_preview',admin.cookie,{id:randomUUID(),revision:1},404);
 await call(endpoints.linkPreview,'sales_materials/link_preview',admin.cookie,{id:specific,revision:1,url:'https://evil.example/'},200);
 assert.deepEqual(asked,['https://example.com/'+specific],'Only the stored URL is fetched; a URL in the request is ignored');
 const ok=await endpoints.linkPreview(new Request('http://localhost/_api/sales_materials/link_preview',{method:'POST',headers:{cookie:admin.cookie},body:superjson.stringify({id:specific,revision:1})}));
 assert.equal(ok.status,200);assert.equal(ok.headers.get('content-type'),'image/png');assert.equal(ok.headers.get('x-content-type-options'),'nosniff');assert.equal(ok.headers.get('cache-control'),'no-store');
 assert.deepEqual(new Uint8Array(await ok.arrayBuffer()),png);
 assert.equal((await call(endpoints.linkPreview,'sales_materials/link_preview',admin.cookie,{id:otherOne,revision:3},422)).error,'La página no tiene imagen de vista previa.');
 const archived=await row(all);await post(admin.cookie,{action:'archive',id:all,revision:archived.revision});
 await call(endpoints.linkPreview,'sales_materials/link_preview',admin.cookie,{id:all,revision:archived.revision+1},400);
 // The real guard: links to loopback (by name or IP literal) are refused before any connection.
 setLinkPreviewFetcherForTests(null);
 for(const url of ['https://localhost/','https://127.0.0.1/','https://[::1]/']){
  const id=randomUUID();await post(admin.cookie,{...link(id,'Zz Interno '+stamp),version:{url}});
  assert.equal((await call(endpoints.linkPreview,'sales_materials/link_preview',admin.cookie,{id,revision:1},422)).error.length>0,true,url);
 }
 // At most 20 previews per admin per minute.
 const key='rate-'+stamp;for(let i=0;i<20;i++)assert.equal(endpoints.takeLinkPreviewSlot(key,1000+i),true);
 assert.equal(endpoints.takeLinkPreviewSlot(key,1500),false);assert.equal(endpoints.takeLinkPreviewSlot(key,61001),true,'The window slides');
 checks++;
 console.log(`Sales material verticals, categories and link preview (spec 102): ${checks} groups passed`);
}finally{
 setLinkPreviewFetcherForTests(null);
 await db.deleteFrom('sessions').where('userId','in',userIds).execute();
 await sql`UPDATE crm_sales_materials SET verticals='{}' WHERE ${verticalNames.length>0} AND verticals && ${verticalNames}::text[]`.execute(db);
 await sql`DELETE FROM crm_verticals WHERE name=ANY(${verticalNames}::text[])`.execute(db);
 await db.destroy();
}
