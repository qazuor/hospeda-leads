// Spec 89 F2 integration: public share page /m/<token> (states, current version, Open Graph, bots, technical access, rate limit)
// and createSalesMaterialShare permission and No contactar checks. R2 is a local HTTP stub that R2_ENDPOINT points to; nothing reaches Cloudflare.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import type {AddressInfo} from 'node:net';
import {createHash,randomUUID} from 'node:crypto';
import {sql} from 'kysely';
assert.equal(process.env.CRM_TEST_DATABASE,'1','Disposable database required');
const objects=new Map<string,{body:Buffer;type:string}>();
const r2=createServer((req,res)=>{
 const url=new URL(req.url!,'http://r2.test');const [,bucket,...rest]=url.pathname.split('/');const key=rest.map(decodeURIComponent).join('/');
 const signed=url.searchParams.has('X-Amz-Signature')||String(req.headers.authorization??'').startsWith('AWS4-HMAC-SHA256');
 if(bucket!=='crm-material'||!signed){res.writeHead(403).end();return;}
 const o=objects.get(key);if(!o){res.writeHead(404).end();return;}
 if(req.method==='HEAD'){res.writeHead(200,{'Content-Length':o.body.length,'Content-Type':o.type}).end();return;}
 res.writeHead(200,{'Content-Type':url.searchParams.get('response-content-type')??o.type,'Content-Disposition':url.searchParams.get('response-content-disposition')??'','Content-Length':o.body.length}).end(o.body);
});
await new Promise<void>(resolve=>r2.listen(0,'127.0.0.1',resolve));
Object.assign(process.env,{R2_ACCOUNT_ID:'test-account',R2_ACCESS_KEY_ID:'test-key',R2_SECRET_ACCESS_KEY:'test-secret',R2_BUCKET:'crm-material',R2_ENDPOINT:`http://127.0.0.1:${(r2.address() as AddressInfo).port}`,PUBLIC_APP_URL:'https://crm.example.test'});
const {db}=await import('../src/helpers/db');
const {app}=await import('../src/server/app');
const {createSalesMaterialShare}=await import('../src/helpers/salesMaterialShareService');
const {resetShareRateLimitsForTests}=await import('../src/endpoints/materialShare');
const {setR2StorageForTests}=await import('../src/helpers/r2');
const {CrmForbidden}=await import('../src/helpers/crmPermissions');
const {CommunicationConflict,CommunicationForbidden}=await import('../src/helpers/communicationService');
const {SalesMaterialNotFound}=await import('../src/helpers/salesMaterialService');
type User=import('../src/helpers/User').User;
const stamp=randomUUID().slice(0,8);
const CHROME='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
let ipSeq=0;const freshIp=()=>`198.51.100.${++ipSeq%250+1}`;let ip=freshIp();
const get=(path:string,{ua=CHROME,method='GET',from=ip}:{ua?:string;method?:string;from?:string}={})=>app.request(path,{method,headers:{'user-agent':ua,'x-real-ip':from}});
const meta=(html:string,property:string)=>new RegExp(`<meta (?:property|name)="${property}" content="([^"]*)">`).exec(html)?.[1];
async function user(role:'admin'|'user'):Promise<User>{const u=await db.insertInto('users').values({email:`share-${role}-${stamp}-${randomUUID().slice(0,4)}@example.com`,displayName:'Share '+role,role}).returningAll().executeTakeFirstOrThrow();return {id:u.id,email:u.email,displayName:u.displayName,fullName:null,avatarUrl:null,role};}
async function business(owner:User,extra:Record<string,unknown>={}){
 const a=await db.insertInto('crmAccounts').values({nombre:'Share '+stamp+' '+randomUUID().slice(0,4),status:'reviewed',assignedUserEmail:owner.email,telefono:'+5493442000101',...extra}).returningAll().executeTakeFirstOrThrow();
 const l=await db.insertInto('leads').values({accountId:a.id,nombre:a.nombre,estado:'Cargado',assignedUserEmail:owner.email}).returningAll().executeTakeFirstOrThrow();
 const c=await db.insertInto('crmContacts').values({accountId:a.id,name:'Persona '+stamp,email:'persona@example.com',phone:'+5493442000102'}).returningAll().executeTakeFirstOrThrow();
 return {accountId:String(a.id),leadId:String(l.id),contactId:String(c.id)};
}
const pdf=(text:string)=>Buffer.from('%PDF-1.7\n'+text+'\n%%EOF');
const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),Buffer.alloc(64,7)]);
async function material({title,kind='deliverable',file,url,cover}:{title:string;kind?:'deliverable'|'internal';file?:{name:string;mime:string;body:Buffer};url?:string;cover?:Buffer}){
 const id=randomUUID();let coverKey:string|null=null;
 if(cover){coverKey=`covers/${id}/${randomUUID()}.png`;objects.set(coverKey,{body:cover,type:'image/png'});}
 await sql`INSERT INTO crm_sales_materials(id,title,description,kind,source,created_by_email,cover_key,cover_mime,cover_bytes) VALUES(${id}::uuid,${title},${'Descripción de '+title+'\nsegunda línea'},${kind},${url?'url':'file'},'admin@example.com',${coverKey},${cover?'image/png':null},${cover?.length??null})`.execute(db);
 await addVersion(id,1,{file,url});return id;
}
async function addVersion(id:string,version:number,{file,url}:{file?:{name:string;mime:string;body:Buffer};url?:string}){
 if(url)await sql`INSERT INTO crm_sales_material_versions(id,material_id,version,url,actor_email) VALUES(${randomUUID()}::uuid,${id}::uuid,${version},${url},'admin@example.com')`.execute(db);
 else{const key=`materials/${id}/v${version}-${randomUUID()}.${file!.name.split('.').pop()}`;objects.set(key,{body:file!.body,type:file!.mime});
  await sql`INSERT INTO crm_sales_material_versions(id,material_id,version,object_key,file_name,mime_type,byte_size,actor_email) VALUES(${randomUUID()}::uuid,${id}::uuid,${version},${key},${file!.name},${file!.mime},${file!.body.length},'admin@example.com')`.execute(db);}
 await sql`UPDATE crm_sales_materials SET current_version=${version},revision=revision+1,updated_at=now() WHERE id=${id}::uuid`.execute(db);
}
const shareRow=async(id:string)=>(await sql<{technicalAccessCount:number;lastTechnicalAccessAt:Date|null;tokenHash:string;preparedVersion:number}>`SELECT technical_access_count,last_technical_access_at,token_hash,prepared_version FROM crm_sales_material_shares WHERE id=${id}::uuid`.execute(db)).rows[0];
const rejects=async(fn:()=>Promise<unknown>,type:new(...args:never[])=>Error,pattern?:RegExp)=>{try{await fn()}catch(e){assert(e instanceof type,`Expected ${type.name}, got ${e instanceof Error?e.constructor.name+': '+e.message:String(e)}`);if(pattern)assert.match((e as Error).message,pattern);return;}assert.fail('Expected a rejection');};
try{
 let checks=0;
 const admin=await user('admin'),owner=await user('user'),other=await user('user');
 const b=await business(owner);
 const brochure=await material({title:`Folleto <b>"${stamp}"</b> & más`,file:{name:'folleto.pdf',mime:'application/pdf',body:pdf('v1')},cover:png});
 const photo=await material({title:'Foto '+stamp,file:{name:'foto.png',mime:'image/png',body:png}});
 const link=await material({title:'Tour '+stamp,url:'https://example.com/tour?x=1'});
 const internal=await material({title:'Interno '+stamp,kind:'internal',file:{name:'guia.pdf',mime:'application/pdf',body:pdf('i')}});

 // createSalesMaterialShare: write access, No contactar, restrictions, closed managements, material kind and status (spec 89 §10).
 const share=await createSalesMaterialShare(db,{user:owner,input:{materialId:brochure,accountId:b.accountId,leadId:b.leadId,contactId:b.contactId,channel:'whatsapp'}});
 assert.match(share.token,/^[A-Za-z0-9_-]{43}$/);assert.equal(share.path,'/m/'+share.token);assert.equal(share.preparedVersion,1);
 const stored=await shareRow(share.id);assert.equal(stored.tokenHash,createHash('sha256').update(share.token).digest('hex'),'Only the sha256 is stored');
 const journal=(await sql<{actorEmail:string|null;row:string}>`SELECT actor_email,after_value::text AS row FROM crm_resource_journal WHERE entity='crm_sales_material_shares' AND entity_id=${share.id}`.execute(db)).rows;
 assert.equal(journal.length,1);assert.equal(journal[0].actorEmail,owner.email);assert(!journal[0].row.includes(share.token),'The plain token never reaches the journal');
 await createSalesMaterialShare(db,{user:admin,input:{materialId:brochure,accountId:b.accountId,leadId:null,contactId:null,channel:'email'}});
 await rejects(()=>createSalesMaterialShare(db,{user:other,input:{materialId:brochure,accountId:b.accountId,leadId:b.leadId,contactId:b.contactId,channel:'whatsapp'}}),CrmForbidden);
 await rejects(()=>createSalesMaterialShare(db,{user:other,input:{materialId:brochure,accountId:b.accountId,leadId:null,contactId:null,channel:'whatsapp'}}),CrmForbidden);
 const dnc=await business(owner,{doNotContact:true});
 await rejects(()=>createSalesMaterialShare(db,{user:admin,input:{materialId:brochure,accountId:dnc.accountId,leadId:dnc.leadId,contactId:dnc.contactId,channel:'whatsapp'}}),CommunicationForbidden,/no contactar/i);
 await rejects(()=>createSalesMaterialShare(db,{user:owner,input:{materialId:brochure,accountId:dnc.accountId,leadId:null,contactId:null,channel:'email'}}),CrmForbidden);
 const archived=await business(owner,{archivedAt:new Date()});
 await rejects(()=>createSalesMaterialShare(db,{user:admin,input:{materialId:brochure,accountId:archived.accountId,leadId:null,contactId:null,channel:'email'}}),CommunicationForbidden,/archivado/);
 const trashed=await business(owner,{deletedAt:new Date()});
 await rejects(()=>createSalesMaterialShare(db,{user:admin,input:{materialId:brochure,accountId:trashed.accountId,leadId:null,contactId:null,channel:'email'}}),Error,/papelera/);
 const restricted=await business(owner);
 await sql`INSERT INTO crm_contact_restrictions(account_id,contact_id,channel,reason,actor_email) VALUES(${restricted.accountId},${restricted.contactId},'whatsapp','Pidió solo email',${admin.email})`.execute(db);
 await rejects(()=>createSalesMaterialShare(db,{user:owner,input:{materialId:brochure,accountId:restricted.accountId,leadId:restricted.leadId,contactId:restricted.contactId,channel:'whatsapp'}}),CommunicationForbidden,/Pidió solo email/);
 await createSalesMaterialShare(db,{user:owner,input:{materialId:brochure,accountId:restricted.accountId,leadId:restricted.leadId,contactId:restricted.contactId,channel:'email'}});
 const closed=await business(owner);await sql`UPDATE leads SET estado='Ganada' WHERE id=${closed.leadId}`.execute(db);
 await rejects(()=>createSalesMaterialShare(db,{user:admin,input:{materialId:brochure,accountId:closed.accountId,leadId:closed.leadId,contactId:null,channel:'email'}}),CommunicationForbidden,/cerrada/);
 await rejects(()=>createSalesMaterialShare(db,{user:owner,input:{materialId:brochure,accountId:b.accountId,leadId:b.leadId,contactId:restricted.contactId,channel:'whatsapp'}}),Error,/no pertenece/);
 await rejects(()=>createSalesMaterialShare(db,{user:admin,input:{materialId:internal,accountId:b.accountId,leadId:null,contactId:null,channel:'email'}}),CommunicationForbidden,/interno/);
 await rejects(()=>createSalesMaterialShare(db,{user:admin,input:{materialId:randomUUID(),accountId:b.accountId,leadId:null,contactId:null,channel:'email'}}),SalesMaterialNotFound);
 await rejects(()=>createSalesMaterialShare(db,{user:admin,input:{materialId:brochure,accountId:b.accountId,leadId:null,contactId:null,channel:'email',messageId:randomUUID()}}),Error,/inexistente/);
 // A person from another business is a typed conflict, not a plain Error.
 await rejects(()=>createSalesMaterialShare(db,{user:owner,input:{materialId:brochure,accountId:b.accountId,leadId:b.leadId,contactId:restricted.contactId,channel:'whatsapp'}}),CommunicationConflict,/La persona no pertenece/);
 // messageId: the draft must belong to the same management and person (a draft of another recipient is refused).
 const otherLead=await db.insertInto('leads').values({accountId:b.accountId,nombre:'Otra gestión '+stamp,estado:'Cargado',assignedUserEmail:owner.email}).returningAll().executeTakeFirstOrThrow();
 const otherContact=await db.insertInto('crmContacts').values({accountId:b.accountId,name:'Otra persona '+stamp,email:'otra@example.com',phone:'+5493442000103'}).returningAll().executeTakeFirstOrThrow();
 const draft=async(leadId:string|null,contactId:string|null)=>{const id=randomUUID();await sql`INSERT INTO crm_messages(id,account_id,original_account_id,lead_id,contact_id,channel,recipient,owner_email,status) VALUES(${id}::uuid,${b.accountId},${b.accountId},${leadId},${contactId},'whatsapp','+5493442000102',${owner.email},'draft')`.execute(db);return id;};
 const goodDraft=await draft(b.leadId,b.contactId);
 await rejects(async()=>createSalesMaterialShare(db,{user:owner,input:{materialId:brochure,accountId:b.accountId,leadId:b.leadId,contactId:b.contactId,channel:'whatsapp',messageId:await draft(String(otherLead.id),b.contactId)}}),CommunicationConflict,/no corresponde a esta gestión/);
 await rejects(async()=>createSalesMaterialShare(db,{user:owner,input:{materialId:brochure,accountId:b.accountId,leadId:b.leadId,contactId:b.contactId,channel:'whatsapp',messageId:await draft(b.leadId,String(otherContact.id))}}),CommunicationConflict,/no corresponde a esta persona/);
 await rejects(async()=>createSalesMaterialShare(db,{user:owner,input:{materialId:brochure,accountId:b.accountId,leadId:b.leadId,contactId:b.contactId,channel:'whatsapp',messageId:await draft(null,b.contactId)}}),CommunicationConflict,/no corresponde a esta gestión/);
 const tied=await createSalesMaterialShare(db,{user:owner,input:{materialId:brochure,accountId:b.accountId,leadId:b.leadId,contactId:b.contactId,channel:'whatsapp',messageId:goodDraft}});
 assert.equal((await sql<{messageId:string}>`SELECT message_id FROM crm_sales_material_shares WHERE id=${tied.id}::uuid`.execute(db)).rows[0].messageId,goodDraft);
 checks++;

 // Valid share: Open Graph, enforced CSP, headers, file inline/attachment via fresh presigned URLs, cover through our server.
 const page=await get(share.path);const html=await page.text();
 assert.equal(page.status,200);assert.equal(meta(html,'og:title'),`Folleto &#60;b&#62;&#34;${stamp}&#34;&#60;/b&#62; &#38; más`);
 assert.equal(meta(html,'og:url'),'https://crm.example.test'+share.path);assert.equal(meta(html,'og:image'),'https://crm.example.test'+share.path+'/cover');assert.equal(meta(html,'twitter:card'),'summary_large_image');
 assert.equal(meta(html,'og:description'),`Descripción de Folleto &#60;b&#62;&#34;${stamp}&#34;&#60;/b&#62; &#38; más segunda línea`);
 assert(!html.includes('<b>')&&!html.includes(owner.email)&&!html.includes('Share '+stamp),'No unescaped admin text, seller or business');
 assert.match(page.headers.get('content-security-policy')!,/^default-src 'none'; img-src 'self' http:\/\/127\.0\.0\.1:\d+;/);assert.equal(page.headers.get('content-security-policy-report-only'),null);
 assert.equal(page.headers.get('cache-control'),'no-store');assert.equal(page.headers.get('x-robots-tag'),'noindex, nofollow, noarchive');assert.equal(page.headers.get('referrer-policy'),'no-referrer');
 assert(html.includes(`<iframe src="${share.path}/file"`)&&html.includes(`href="${share.path}/download">Descargar</a>`));
 const inline=await get(share.path+'/file');assert.equal(inline.status,302);const location=new URL(inline.headers.get('location')!);
 assert.equal(location.searchParams.get('X-Amz-Expires'),'300');assert.match(location.searchParams.get('response-content-disposition')!,/^inline; filename="folleto.pdf"/);assert.equal(inline.headers.get('cache-control'),'no-store');
 assert.deepEqual(Buffer.from(await (await fetch(location)).arrayBuffer()),pdf('v1'));
 const download=await get(share.path+'/download');assert.match(new URL(download.headers.get('location')!).searchParams.get('response-content-disposition')!,/^attachment;/);
 const coverRes=await get(share.path+'/cover');assert.equal(coverRes.status,200);assert.equal(coverRes.headers.get('cache-control'),'public, max-age=3600');assert.deepEqual(Buffer.from(await coverRes.arrayBuffer()),png);
 checks++;

 // Always the CURRENT version (D6): a new version replaces what the same link shows.
 await addVersion(brochure,2,{file:{name:'folleto-2027.pdf',mime:'application/pdf',body:pdf('v2')}});
 assert((await (await get(share.path)).text()).includes('folleto-2027.pdf'));
 const v2=new URL((await get(share.path+'/file')).headers.get('location')!);assert.match(decodeURIComponent(v2.pathname),new RegExp(`/materials/${brochure}/v2-`));
 assert.deepEqual(Buffer.from(await (await fetch(v2)).arrayBuffer()),pdf('v2'));
 assert.equal((await shareRow(share.id)).preparedVersion,1,'The prepared version is history; the link still shows the current one');
 checks++;

 // Technical access: people count at most once every 10 minutes; bots and HEAD never count; nothing else changes.
 const messageCount=async()=>(await sql<{n:number}>`SELECT count(*)::int AS n FROM crm_messages WHERE account_id=${b.accountId}`.execute(db)).rows[0].n;const messagesBefore=await messageCount();
 const liveVersion=async()=>(await sql<{value:string}>`SELECT value FROM app_settings WHERE key='crm_live_version:communication'`.execute(db)).rows[0].value;
 const journalRows=async(id:string)=>(await sql<{n:number}>`SELECT count(*)::int AS n FROM crm_resource_journal WHERE entity='crm_sales_material_shares' AND entity_id=${id}`.execute(db)).rows[0].n;
 const before=await shareRow(share.id);assert.equal(before.technicalAccessCount,1,'The first human GET above counted once');assert(before.lastTechnicalAccessAt);
 for(const ua of ['WhatsApp/2.23.20.0','facebookexternalhit/1.1','Twitterbot/1.0','TelegramBot (like TwitterBot)','Mozilla/5.0 (compatible; Googlebot/2.1)','Slackbot-LinkExpanding 1.0'])assert.equal((await get(share.path,{ua})).status,200);
 assert.equal((await get(share.path,{method:'HEAD'})).status,200);await get(share.path);
 assert.equal((await shareRow(share.id)).technicalAccessCount,1);
 await sql`UPDATE crm_sales_material_shares SET last_technical_access_at=now()-interval '11 minutes' WHERE id=${share.id}::uuid`.execute(db);
 assert.equal((await get(share.path,{ua:'WhatsApp/2.23.20.0'})).status,200);assert.equal((await shareRow(share.id)).technicalAccessCount,1,'A bot after the interval still does not count');
 const journalBefore=await journalRows(share.id),liveBefore=await liveVersion();
 await get(share.path);assert.equal((await shareRow(share.id)).technicalAccessCount,2);
 assert.equal(await journalRows(share.id),journalBefore,'A counted visit writes no actor-less journal row');assert.equal(await liveVersion(),liveBefore,'A counted visit does not wake the CRM tabs');
 const lead=await db.selectFrom('leads').select(['estado']).where('id','=',b.leadId).executeTakeFirstOrThrow();assert.equal(lead.estado,'Cargado','An access never moves a stage');
 assert.equal(await messageCount(),messagesBefore,'An access never creates messages');
 checks++;

 // States: archived 410, restored works again, internal 410 even with a valid token, revoked 410, unknown 404 identical for any token.
 await sql`UPDATE crm_sales_materials SET status='archived',archived_at=now() WHERE id=${brochure}::uuid`.execute(db);
 for(const suffix of ['','/file','/download','/cover']){const r=await get(share.path+suffix);assert.equal(r.status,410,suffix);assert((await r.text()).includes('Este material ya no está disponible'));assert.equal(r.headers.get('location'),null);}
 await sql`UPDATE crm_sales_materials SET status='active',archived_at=NULL WHERE id=${brochure}::uuid`.execute(db);assert.equal((await get(share.path)).status,200);
 await sql`UPDATE crm_sales_materials SET kind='internal' WHERE id=${brochure}::uuid`.execute(db);
 for(const suffix of ['','/file','/cover'])assert.equal((await get(share.path+suffix)).status,410,'internal '+suffix);
 await sql`UPDATE crm_sales_materials SET kind='deliverable' WHERE id=${brochure}::uuid`.execute(db);assert.equal((await get(share.path)).status,200);
 const toRevoke=await createSalesMaterialShare(db,{user:owner,input:{materialId:photo,accountId:b.accountId,leadId:b.leadId,contactId:b.contactId,channel:'whatsapp'}});
 const photoPage=await (await get(toRevoke.path)).text();assert(photoPage.includes(`<img src="${toRevoke.path}/file"`));assert.equal(meta(photoPage,'og:image'),'https://crm.example.test'+toRevoke.path+'/cover','A small image is its own cover');
 assert.deepEqual(Buffer.from(await (await get(toRevoke.path+'/cover')).arrayBuffer()),png);
 const liveBeforeRevoke=await liveVersion();
 await sql`UPDATE crm_sales_material_shares SET revoked_at=now(),revoked_by_email=${owner.email},revoke_reason='Prueba de revocación' WHERE id=${toRevoke.id}::uuid`.execute(db);
 const revoked=await get(toRevoke.path);assert.equal(revoked.status,410);
 assert((await journalRows(toRevoke.id))>=2,'A revoke is still journaled');assert.notEqual(await liveVersion(),liveBeforeRevoke,'A revoke still bumps the live version');assert((await revoked.text()).includes('Este enlace ya no está disponible'));
 assert.equal((await shareRow(toRevoke.id)).technicalAccessCount,1,'A revoked link stops counting');await get(toRevoke.path);assert.equal((await shareRow(toRevoke.id)).technicalAccessCount,1);
 const unknownA=await get('/m/'+'a'.repeat(43)),unknownB=await get('/m/'+share.token.slice(0,42)+(share.token.endsWith('A')?'B':'A')),malformed=await get('/m/abc');
 assert.deepEqual([unknownA.status,unknownB.status,malformed.status],[404,404,404]);const unknownBody=await unknownA.text();assert.equal(await unknownB.text(),unknownBody);assert.equal(await malformed.text(),unknownBody);
 assert.equal((await get('/m/'+share.token+'/nope')).status,404);assert.equal((await app.request(share.path,{method:'POST',headers:{'x-real-ip':ip}})).status,404);
 checks++;

 // External URL: «Abrir» button only, never a redirect from our domain (no open redirect).
 const linkShare=await createSalesMaterialShare(db,{user:owner,input:{materialId:link,accountId:b.accountId,leadId:b.leadId,contactId:b.contactId,channel:'whatsapp'}});
 const linkHtml=await (await get(linkShare.path)).text();assert(linkHtml.includes('href="https://example.com/tour?x=1" target="_blank" rel="noopener noreferrer">Abrir</a>'));assert(!linkHtml.includes('Descargar'));
 assert.equal(meta(linkHtml,'og:image'),'https://crm.example.test/hospeda-logo.jpg');
 for(const suffix of ['/file','/download']){const r=await get(linkShare.path+suffix);assert.equal(r.status,404);assert.equal(r.headers.get('location'),null);}
 checks++;

 // Storage missing: file material answers 503 (the rest of the CRM keeps working), an external URL still renders.
 setR2StorageForTests({storage:null});
 try{assert.equal((await get(share.path)).status,503);assert.equal((await get(share.path+'/file')).status,503);assert.equal((await get(linkShare.path)).status,200);}
 finally{setR2StorageForTests({storage:undefined});}
 checks++;

 // Mangled links: a trailing slash or punctuation added by chat apps and linkifiers redirects to the clean token; tokens always end in an alphanumeric.
 resetShareRateLimitsForTests();
 for(const tail of ['/','.',',',')','%29']){const r=await get(share.path+tail);assert.equal(r.status,308,tail);assert.equal(r.headers.get('location'),share.path,tail);assert.equal(r.headers.get('cache-control'),'no-store');}
 assert.equal((await get(share.path+'..')).status,404);assert.equal((await get('/m/'+share.token.slice(1)+'/')).status,404,'A malformed token is never redirected');assert.equal((await get(share.path+'/file/')).status,404);
 assert.equal((await get(share.path+'.',{method:'HEAD'})).status,308);
 assert.equal((await app.request(share.path+'/',{method:'POST',headers:{'x-real-ip':ip}})).status,404);
 for(let i=0;i<200;i++)assert.match((await createSalesMaterialShare(db,{user:owner,input:{materialId:brochure,accountId:b.accountId,leadId:b.leadId,contactId:b.contactId,channel:'email'}})).token,/[A-Za-z0-9]$/);
 checks++;

 // Audio and video redirects last 6 hours (playback and seeking); documents keep 5 minutes.
 const video=await material({title:'Video '+stamp,file:{name:'clip.mp4',mime:'video/mp4',body:Buffer.from('....ftypmp42video')}});
 const videoShare=await createSalesMaterialShare(db,{user:owner,input:{materialId:video,accountId:b.accountId,leadId:b.leadId,contactId:b.contactId,channel:'whatsapp'}});
 const videoLocation=await get(videoShare.path+'/file');assert.equal(videoLocation.status,302);assert.equal(new URL(videoLocation.headers.get('location')!).searchParams.get('X-Amz-Expires'),'21600');assert.equal(videoLocation.headers.get('cache-control'),'no-store');
 checks++;

 // Rate limit (in memory, per client IP from X-Real-IP): 20 unknown tokens per 10 minutes (only unknown tokens get 429), 300 requests per minute.
 resetShareRateLimitsForTests();const scanner=freshIp();
 for(let i=0;i<20;i++)assert.equal((await get('/m/'+randomUUID().replace(/-/g,'').padEnd(43,'x'),{from:scanner})).status,404);
 const limited=await get('/m/'+'z'.repeat(43),{from:scanner});assert.equal(limited.status,429,'More unknown tokens from the same IP are refused');assert.equal(limited.headers.get('retry-after'),'600');
 assert.equal((await get(share.path,{from:scanner})).status,200,'A valid link is never locked out, even from an IP that is scanning');
 assert.equal((await get(share.path+'/file',{from:scanner})).status,302);
 assert.equal((await get('/m/'+'z'.repeat(43),{from:freshIp()})).status,404,'Other IPs are not affected');
 const busy=freshIp();for(let i=0;i<300;i++)assert.equal((await get(share.path,{from:busy,ua:'WhatsApp/2'})).status,200);
 assert.equal((await get(share.path,{from:busy,ua:'WhatsApp/2'})).status,429);
 ip=freshIp();
 checks++;
 console.log(`Sales material share (spec 89 F2): ${checks} groups passed: createSalesMaterialShare permissions and No contactar, Open Graph and headers, current version, technical access without bots, states (archived, internal, revoked, unknown), external URL, missing storage, mangled links, media URL expiry and rate limit`);
}finally{
 await db.destroy();r2.close();
}
