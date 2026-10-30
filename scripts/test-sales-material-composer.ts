// Spec 89 F3 integration: material_add / material_remove / material_attach in the composer, permission and No contactar checks on every write,
// revocation on cancel, dispatch validation (409, «Quitado del texto», sent_version, journal), Brevo attachment.url (fetch mocked, never the network),
// «Reintentar sin adjuntos», «Revocar enlace» and materials[] in GET /_api/communication. R2 is never contacted: presigning is local.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import superjson from 'superjson';
import {sql} from 'kysely';
import postgres from 'postgres';
assert.equal(process.env.CRM_TEST_DATABASE,'1','Disposable database required');
Object.assign(process.env,{R2_ACCOUNT_ID:'test-account',R2_ACCESS_KEY_ID:'test-key',R2_SECRET_ACCESS_KEY:'test-secret',R2_BUCKET:'crm-material',R2_ENDPOINT:'http://127.0.0.1:9',PUBLIC_APP_URL:'https://crm.example.test',BREVO_API_KEY:'fixture-never-network'});
const {db}=await import('../src/helpers/db');
const {app}=await import('../src/server/app');
const {post,get}=await import('../src/endpoints/communication');
const {shareRevoke}=await import('../src/endpoints/salesMaterials');
const {setServerSession}=await import('../src/helpers/getSetServerSession');
const {resetShareRateLimitsForTests}=await import('../src/endpoints/materialShare');
const stamp=randomUUID().slice(0,8);
const realFetch=globalThis.fetch;
const {claimDraftMaterials}=await import('../src/helpers/salesMaterialDraft');
const {hashShareToken,generateShareToken}=await import('../src/helpers/salesMaterialShare');
import type {User} from '../src/helpers/User';
async function identity(role:'admin'|'user'){
 const u=await db.insertInto('users').values({email:`composer-${role}-${stamp}-${randomUUID().slice(0,4)}@example.com`,displayName:'Composer '+role,role}).returningAll().executeTakeFirstOrThrow();
 const s={id:u.email,createdAt:Date.now(),lastAccessed:Date.now()};await db.insertInto('sessions').values({id:s.id,userId:u.id,expiresAt:new Date(Date.now()+3600000)}).execute();
 const r=new Response();await setServerSession(r,s);return {user:u,cookie:r.headers.get('set-cookie')!.split(';')[0]!};
}
type Id=Awaited<ReturnType<typeof identity>>;
async function call(body:unknown,status:number,who:Id,pattern?:RegExp){
 const r=await post(new Request('http://localhost/_api/communication',{method:'POST',headers:{cookie:who.cookie},body:superjson.stringify(body)}));const d=superjson.parse<any>(await r.text());
 assert.equal(r.status,status,d?.error);if(pattern)assert.match(d.error,pattern);return d;
}
async function revoke(body:unknown,status:number,who:Id){const r=await shareRevoke(new Request('http://localhost/_api/sales_materials/share_revoke',{method:'POST',headers:{cookie:who.cookie},body:superjson.stringify(body)}));const d=superjson.parse<any>(await r.text());assert.equal(r.status,status,d?.error);return d;}
async function detail(accountId:string,who:Id){const r=await get(new Request('http://localhost/_api/communication?accountId='+accountId,{headers:{cookie:who.cookie}}));assert.equal(r.status,200);return superjson.parse<any>(await r.text());}
const share=async(id:string)=>(await sql<{messageId:string|null;revokedAt:Date|null;revokeReason:string|null;sentVersion:number|null;attach:boolean;attachedVersion:number|null;preparedVersion:number}>`SELECT message_id,revoked_at,revoke_reason,sent_version,attach,attached_version,prepared_version FROM crm_sales_material_shares WHERE id=${id}::uuid`.execute(db)).rows[0]!;
const message=async(id:string)=>(await sql<{status:string;body:string;revision:number}>`SELECT status,body,revision FROM crm_messages WHERE id=${id}::uuid`.execute(db)).rows[0]!;
const journal=async(id:string,action:string)=>(await sql<{after:any}>`SELECT after_value AS after FROM crm_communication_journal WHERE entity_type='interaction' AND entity_id=${id} AND action=${action} ORDER BY id`.execute(db)).rows;
const tokenOf=(body:string,title:string)=>new RegExp(`«${title.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}» en: (?:<a href=")?https://crm\\.example\\.test/m/([A-Za-z0-9_-]{43})`).exec(body)?.[1];
async function material(title:string,{kind='deliverable',bytes=2048,url,fileName}:{kind?:string;bytes?:number;url?:string;fileName?:string|null}={}){
 const id=randomUUID();
 await sql`INSERT INTO crm_sales_materials(id,title,kind,source,created_by_email) VALUES(${id}::uuid,${title},${kind},${url?'url':'file'},'admin@example.com')`.execute(db);
 if(url)await sql`INSERT INTO crm_sales_material_versions(id,material_id,version,url,actor_email) VALUES(${randomUUID()}::uuid,${id}::uuid,1,${url},'admin@example.com')`.execute(db);
 else await sql`INSERT INTO crm_sales_material_versions(id,material_id,version,object_key,file_name,mime_type,byte_size,actor_email) VALUES(${randomUUID()}::uuid,${id}::uuid,1,${`materials/${id}/v1-${randomUUID()}.pdf`},${fileName===undefined?title.toLowerCase().replace(/\W+/g,'-')+'.pdf':fileName},'application/pdf',${bytes},'admin@example.com')`.execute(db);
 await sql`UPDATE crm_sales_materials SET current_version=1 WHERE id=${id}::uuid`.execute(db);return id;
}
try{
 let checks=0;
 const admin=await identity('admin'),owner=await identity('user'),other=await identity('user');
 await db.insertInto('appSettings').values({key:'brevo_sender_email',value:'sender@example.com'}).onConflict(oc=>oc.column('key').doUpdateSet({value:'sender@example.com'})).execute();
 const a=await db.insertInto('crmAccounts').values({nombre:'Zz Composer '+stamp,status:'reviewed',assignedUserEmail:owner.user.email,telefono:'+5493442000201'}).returningAll().executeTakeFirstOrThrow();
 const l=await db.insertInto('leads').values({accountId:a.id,nombre:a.nombre,estado:'Cargado',assignedUserEmail:owner.user.email}).returningAll().executeTakeFirstOrThrow();
 const c=await db.insertInto('crmContacts').values({accountId:a.id,name:'Persona '+stamp,email:'composer-person@example.com',phone:'+5493442000202'}).returningAll().executeTakeFirstOrThrow();
 const brochure=await material('Folleto '+stamp),big=await material('Video grande '+stamp,{bytes:11*1048576}),tour=await material('Tour '+stamp,{url:'https://example.com/tour'});
 const internal=await material('Interno '+stamp,{kind:'internal'}),gone=await material('Archivado '+stamp);await sql`UPDATE crm_sales_materials SET status='archived',archived_at=now() WHERE id=${gone}::uuid`.execute(db);
 // A distinct variation per prepare: with a repeated one, prepare reuses the open draft of the same lead, contact and channel instead of creating one.
 let variations=10;const prepare=async(channel:'email'|'whatsapp')=>call({action:'prepare',id:randomUUID(),leadId:String(l.id),contactId:String(c.id),channel,templateId:null,variation:variations++},200,owner);

 // material_add on a WhatsApp draft: link in the body, new token, revision up, materials returned; refusals for duplicates, internal, missing, archived, attach on WhatsApp, other users and stale revisions.
 let wa=await prepare('whatsapp');assert.deepEqual(wa.materials,[]);
 let r=await call({action:'material_add',id:wa.id,revision:wa.revision,materialId:brochure,attach:false},200,owner);
 assert.equal(r.message.revision,wa.revision+1);assert.equal(r.materials.length,1);assert.equal(r.materials[0].materialId,brochure);assert.equal(r.materials[0].preparedVersion,1);assert.equal(r.materials[0].attachBlockedReason,'WhatsApp no adjunta archivos: va solo el enlace.');
 const waToken=tokenOf(r.message.body,'Folleto '+stamp);assert(waToken,'The body carries «Título» en: URL: '+r.message.body);
 assert.equal((await share(r.materials[0].shareId)).messageId,wa.id);wa=r.message;
 await call({action:'material_add',id:wa.id,revision:wa.revision,materialId:brochure,attach:false},409,owner,/ya está en el mensaje/);
 await call({action:'material_add',id:wa.id,revision:wa.revision,materialId:internal,attach:false},403,owner,/interno/);
 await call({action:'material_add',id:wa.id,revision:wa.revision,materialId:randomUUID(),attach:false},404,owner);
 await call({action:'material_add',id:wa.id,revision:wa.revision,materialId:gone,attach:false},409,owner,/ya no está disponible/);
 await call({action:'material_add',id:wa.id,revision:wa.revision,materialId:tour,attach:true},409,owner,/WhatsApp no adjunta/);
 await call({action:'material_add',id:wa.id,revision:wa.revision,materialId:tour,attach:false},403,other,/otro usuario/);
 await call({action:'material_add',id:wa.id,revision:wa.revision-1,materialId:tour,attach:false},409,owner,/cambió/);
 assert.equal((await sql<{n:number}>`SELECT count(*)::int AS n FROM crm_sales_material_shares WHERE message_id=${wa.id}::uuid`.execute(db)).rows[0]!.n,1,'Refused adds leave no share behind');
 checks++;

 // No contactar and every contact restriction refuse material_add (spec 89 §10), and so does a closed management or a business in the trash.
 const refuse=async(change:()=>Promise<unknown>,undo:()=>Promise<unknown>,pattern:RegExp)=>{await change();try{await call({action:'material_add',id:wa.id,revision:wa.revision,materialId:tour,attach:false},403,owner,pattern);await call({action:'material_add',id:wa.id,revision:wa.revision,materialId:tour,attach:false},403,admin,pattern);}finally{await undo();}};
 await refuse(()=>sql`UPDATE crm_accounts SET do_not_contact=true WHERE id=${a.id}`.execute(db),()=>sql`UPDATE crm_accounts SET do_not_contact=false WHERE id=${a.id}`.execute(db),/no contactar/i);
 await refuse(()=>sql`INSERT INTO crm_contact_restrictions(account_id,contact_id,channel,reason,actor_email) VALUES(${a.id},${c.id},'whatsapp','Pidió solo email',${admin.user.email})`.execute(db),()=>sql`UPDATE crm_contact_restrictions SET lifted_at=now(),lifted_by=${admin.user.email},lift_reason='fin de prueba' WHERE account_id=${a.id} AND lifted_at IS NULL`.execute(db),/Pidió solo email/);
 await refuse(()=>sql`UPDATE leads SET estado='Ganada' WHERE id=${l.id}`.execute(db),()=>sql`UPDATE leads SET estado='Cargado' WHERE id=${l.id}`.execute(db),/cerrada/);
 await refuse(()=>sql`UPDATE crm_accounts SET deleted_at=now() WHERE id=${a.id}`.execute(db),()=>sql`UPDATE crm_accounts SET deleted_at=NULL WHERE id=${a.id}`.execute(db),/papelera/);
 checks++;

 // material_remove: the share is revoked «Quitado del borrador», its line leaves the body and the public link answers 410.
 r=await call({action:'material_add',id:wa.id,revision:wa.revision,materialId:tour,attach:false},200,owner);wa=r.message;
 const tourShare=r.materials.find((m:any)=>m.materialId===tour).shareId,tourToken=tokenOf(wa.body,'Tour '+stamp)!;assert(tourToken);
 r=await call({action:'material_remove',id:wa.id,revision:wa.revision,shareId:tourShare},200,owner);wa=r.message;
 assert(!wa.body.includes(tourToken),'The link left the body');assert(wa.body.includes(waToken),'The other link stays');assert.equal(r.materials.length,1);
 assert.equal((await share(tourShare)).revokeReason,'Quitado del borrador');
 resetShareRateLimitsForTests();assert.equal((await app.request('/m/'+tourToken,{headers:{'x-real-ip':'198.51.100.7'}})).status,410);
 await call({action:'material_remove',id:wa.id,revision:wa.revision,shareId:tourShare},409,owner,/ya no está en el mensaje/);
 assert.equal((await journal(wa.id,'material_added')).length,2);assert.equal((await journal(wa.id,'material_removed')).length,1);
 checks++;

 // dispatch: a material archived after adding it blocks the send with 409 and nothing changes; a link deleted from the text is revoked «Quitado del texto».
 r=await call({action:'material_add',id:wa.id,revision:wa.revision,materialId:tour,attach:false},200,owner);wa=r.message;const tourShare2=r.materials.find((m:any)=>m.materialId===tour).shareId;
 const edited=await call({action:'edit',id:wa.id,revision:wa.revision,subject:'',body:wa.body.split('\n').filter((line:string)=>!line.includes('«Tour ')).join('\n')},200,owner);
 await sql`UPDATE crm_sales_materials SET status='archived',archived_at=now() WHERE id=${brochure}::uuid`.execute(db);
 await call({action:'dispatch',id:wa.id,revision:edited.revision,confirm:true},409,owner,/ya no está disponible\. Quitalo del mensaje/);
 assert.equal((await message(wa.id)).status,'draft');assert.equal((await share(tourShare2)).revokedAt,null,'A refused dispatch changes nothing');
 await sql`UPDATE crm_sales_materials SET status='active',archived_at=NULL WHERE id=${brochure}::uuid`.execute(db);
 await sql`INSERT INTO crm_sales_material_versions(id,material_id,version,object_key,file_name,mime_type,byte_size,actor_email) VALUES(${randomUUID()}::uuid,${brochure}::uuid,2,${`materials/${brochure}/v2-${randomUUID()}.pdf`},'folleto-2.pdf','application/pdf',4096,'admin@example.com')`.execute(db);
 await sql`UPDATE crm_sales_materials SET current_version=2 WHERE id=${brochure}::uuid`.execute(db);
 const opened=await call({action:'dispatch',id:wa.id,revision:edited.revision,confirm:true},200,owner);assert.equal(opened.message.status,'whatsapp_opened');assert(new URL(opened.url).searchParams.get('text')!.includes('/m/'+waToken));
 const sent=(await sql<{id:string;sentVersion:number|null;preparedVersion:number;revokeReason:string|null}>`SELECT id,sent_version,prepared_version,revoke_reason FROM crm_sales_material_shares WHERE message_id=${wa.id}::uuid ORDER BY created_at`.execute(db)).rows;
 const brochureShare=sent[0]!;assert.equal(brochureShare.preparedVersion,1);assert.equal(brochureShare.sentVersion,2,'sent_version is the version current at dispatch');
 assert.equal((await share(tourShare2)).revokeReason,'Quitado del texto');assert.equal((await share(tourShare2)).sentVersion,null);
 const openedLog=(await journal(wa.id,'whatsapp_opened_unconfirmed'))[0]!.after;assert.deepEqual(openedLog.materials,[{materialId:brochure,version:2,attach:false}]);
 const waDetail=(await detail(String(a.id),owner)).messages.find((m:any)=>m.id===wa.id);assert.deepEqual(waDetail.materials.map((m:any)=>[m.materialId,m.sentVersion,m.revokedAt]),[[brochure,2,null]],'Links that never left the draft are not listed');
 checks++;

 // cancel_draft revokes the links of the draft («Borrador cancelado»): they never left.
 let cancel=await prepare('whatsapp');r=await call({action:'material_add',id:cancel.id,revision:cancel.revision,materialId:tour,attach:false},200,owner);cancel=r.message;
 await call({action:'cancel_draft',id:cancel.id,revision:cancel.revision},200,owner);assert.equal((await share(r.materials[0].shareId)).revokeReason,'Borrador cancelado');
 checks++;

 // Email: attach within the limit, refusals for external links and files over the limit, and Brevo receives attachment.url (1-hour presigned GET) + attached_version.
 let mail=await prepare('email');mail=await call({action:'edit',id:mail.id,revision:mail.revision,subject:'Material',body:'<p>Hola, te paso el material.</p>'},200,owner);
 r=await call({action:'material_add',id:mail.id,revision:mail.revision,materialId:brochure,attach:true},200,owner);mail=r.message;
 assert(mail.body.includes('<a href="https://crm.example.test/m/'),'Email body carries a paragraph with the link');assert(mail.htmlBody.includes('/m/'),'The reviewed final HTML is refreshed');assert.equal(r.materials[0].attach,true);
 await call({action:'material_add',id:mail.id,revision:mail.revision,materialId:big,attach:true},409,owner,/Supera el límite de adjuntos de email \(10 MB\)/);
 await call({action:'material_add',id:mail.id,revision:mail.revision,materialId:tour,attach:true},409,owner,/enlace externo/);
 r=await call({action:'material_add',id:mail.id,revision:mail.revision,materialId:big,attach:false},200,owner);mail=r.message;
 const bigShare=r.materials.find((m:any)=>m.materialId===big);assert.match(bigShare.attachBlockedReason,/Supera el límite/);
 await call({action:'material_attach',id:mail.id,revision:mail.revision,shareId:bigShare.shareId,attach:true},409,owner,/Supera el límite/);
 r=await call({action:'material_attach',id:mail.id,revision:mail.revision,shareId:bigShare.shareId,attach:false},200,owner);mail=r.message;
 let payload:any=null;globalThis.fetch=async(url,init)=>{assert.equal(String(url),'https://api.brevo.com/v3/smtp/email');payload=JSON.parse(String(init?.body));return new Response(JSON.stringify({messageId:'<composer-'+stamp+'@brevo.test>'}),{status:201});};
 const accepted=await call({action:'dispatch',id:mail.id,revision:mail.revision,confirm:true},200,owner);globalThis.fetch=realFetch;
 assert.equal(accepted.message.status,'accepted');assert.equal(payload.attachment.length,1);assert.equal(payload.attachment[0].name,'folleto-2.pdf');
 const attachmentUrl=new URL(payload.attachment[0].url);assert.equal(attachmentUrl.searchParams.get('X-Amz-Expires'),'3600');assert.match(decodeURIComponent(attachmentUrl.pathname),new RegExp(`/crm-material/materials/${brochure}/v2-`));
 assert(payload.htmlContent.includes('https://crm.example.test/m/'),'The link always goes in the body too');
 const mailShares=(await sql<{materialId:string;attach:boolean;sentVersion:number;attachedVersion:number|null}>`SELECT material_id,attach,sent_version,attached_version FROM crm_sales_material_shares WHERE message_id=${mail.id}::uuid ORDER BY created_at`.execute(db)).rows;
 assert.deepEqual(mailShares.map(s=>[s.materialId,s.attach,s.sentVersion,s.attachedVersion]),[[brochure,true,2,2],[big,false,1,null]]);
 assert.deepEqual((await journal(mail.id,'email_submission_started'))[0]!.after.materials,[{materialId:brochure,version:2,attach:true},{materialId:big,version:1,attach:false}]);
 checks++;

 // Brevo refuses the attachment: the email is failed (no automatic retry); «Reintentar sin adjuntos» creates a new draft with the same links and no attachments.
 let refused=await prepare('email');refused=await call({action:'edit',id:refused.id,revision:refused.revision,subject:'Otro',body:'<p>Va el folleto.</p>'},200,owner);
 r=await call({action:'material_add',id:refused.id,revision:refused.revision,materialId:brochure,attach:true},200,owner);refused=r.message;const refusedShare=r.materials[0].shareId;
 let sends=0;globalThis.fetch=async()=>{sends++;return new Response('{"code":"invalid_parameter","message":"attachment too big"}',{status:400});};
 const failed=await call({action:'dispatch',id:refused.id,revision:refused.revision,confirm:true},200,owner);globalThis.fetch=realFetch;
 assert.equal(failed.message.status,'failed');assert.equal(sends,1);assert.equal((await share(refusedShare)).attachedVersion,null);
 const retryId=randomUUID();
 await call({action:'material_retry_without_attachments',id:retryId,messageId:refused.id},403,other,/otro usuario/);
 const retry=await call({action:'material_retry_without_attachments',id:retryId,messageId:refused.id},200,owner);
 assert.equal(retry.message.status,'draft');assert.equal(retry.message.body,refused.body,'Same text, so the same links');assert.equal(retry.materials.length,1);assert.equal(retry.materials[0].attach,false);
 const moved=await share(refusedShare);assert.equal(moved.messageId,retryId);assert.equal(moved.sentVersion,null);assert.equal(moved.revokedAt,null);
 assert.equal((await call({action:'material_retry_without_attachments',id:retryId,messageId:refused.id},200,owner)).message.id,retryId,'Replay returns the same draft');
 await call({action:'material_retry_without_attachments',id:randomUUID(),messageId:accepted.message.id},409,owner,/rechazó/);
 checks++;

 // «Revocar enlace»: only admin, the author or whoever writes on the business; drafts are handled from the message; the public page answers 410.
 resetShareRateLimitsForTests();assert.equal((await app.request('/m/'+waToken,{headers:{'x-real-ip':'198.51.100.8'}})).status,200);
 await revoke({shareId:brochureShare.id,reason:'Prueba'},403,other);
 await revoke({shareId:refusedShare,reason:'En borrador'},409,owner);
 await revoke({shareId:brochureShare.id,reason:'x'},400,owner);
 await revoke({shareId:brochureShare.id,reason:'Le mandé otra versión'},200,owner);await revoke({shareId:brochureShare.id,reason:'Otra vez'},200,admin);
 const revokedRow=await share(brochureShare.id);assert.equal(revokedRow.revokeReason,'Le mandé otra versión','A second revoke is a no-op');
 assert.equal((await app.request('/m/'+waToken,{headers:{'x-real-ip':'198.51.100.8'}})).status,410);
 assert.equal((await journal(wa.id,'material_link_revoked'))[0]!.after.reason,'Le mandé otra versión');
 const listed=(await detail(String(a.id),owner)).messages.find((m:any)=>m.id===wa.id).materials[0];assert.equal(listed.revokeReason,'Le mandé otra versión');assert.equal(listed.revokedByEmail,owner.user.email);
 // No contactar after a send never revokes what was sent; revoking stays allowed for the author and the responsible (it lowers exposure).
 const bigMailShare=(await sql<{id:string}>`SELECT id FROM crm_sales_material_shares WHERE message_id=${mail.id}::uuid AND material_id=${big}::uuid`.execute(db)).rows[0]!.id;
 await sql`UPDATE crm_accounts SET do_not_contact=true WHERE id=${a.id}`.execute(db);
 try{assert.equal((await share(bigMailShare)).revokedAt,null);await revoke({shareId:bigMailShare,reason:'Pidió no ser contactado'},200,owner);}finally{await sql`UPDATE crm_accounts SET do_not_contact=false WHERE id=${a.id}`.execute(db);}
 checks++;

 // Regression (review F3 #1): send A+B, Brevo refuses, A is revoked from «Comunicación», «Reintentar sin adjuntos», dispatch: A's revoked link must never go out.
 // Brevo's error text keeps no presigned signature (X-Amz-*). The new draft keeps task_id and the task completes when the retry is accepted (review #4).
 const catalogue=await material('Catálogo '+stamp);
 const task=await db.insertInto('crmTasks').values({accountId:a.id,leadId:l.id,title:'Mandar material '+stamp,typeId:'call',dueDate:'2027-01-15',assignedUserEmail:owner.user.email}).returningAll().executeTakeFirstOrThrow();
 let twice=await prepare('email');twice=await call({action:'edit',id:twice.id,revision:twice.revision,subject:'Dos',body:'<p>Te mando dos cosas.</p>'},200,owner);
 r=await call({action:'material_add',id:twice.id,revision:twice.revision,materialId:brochure,attach:true},200,owner);twice=r.message;const shareA=r.materials[0].shareId;
 r=await call({action:'material_add',id:twice.id,revision:twice.revision,materialId:catalogue,attach:false},200,owner);twice=r.message;const shareB=r.materials.find((m:any)=>m.materialId===catalogue).shareId;
 await sql`UPDATE crm_messages SET task_id=${task.id} WHERE id=${twice.id}::uuid`.execute(db);
 const tokenA=tokenOf(twice.body,'Folleto '+stamp)!,tokenB=tokenOf(twice.body,'Catálogo '+stamp)!;assert(tokenA&&tokenB);
 globalThis.fetch=async(_url,init)=>{const sentUrl=JSON.parse(String(init?.body)).attachment[0].url;return new Response(JSON.stringify({code:'invalid_parameter',message:`Unable to fetch ${sentUrl}`}),{status:400});};
 await call({action:'dispatch',id:twice.id,revision:twice.revision,confirm:true},200,owner);globalThis.fetch=realFetch;
 const stored=(await sql<{lastError:string}>`SELECT o.last_error FROM email_outbox o JOIN crm_messages m ON m.outbox_id=o.id WHERE m.id=${twice.id}::uuid`.execute(db)).rows[0]!.lastError;
 assert(!/X-Amz-/i.test(stored),'No presigned signature in last_error: '+stored);assert.match(stored,/\?\[redacted\]/);
 assert(!/X-Amz-/i.test(JSON.stringify((await journal(twice.id,'brevo_rejected'))[0]!.after)),'No presigned signature in the journal');
 await revoke({shareId:shareA,reason:'Versión vieja'},200,owner);
 const retried=await call({action:'material_retry_without_attachments',id:randomUUID(),messageId:twice.id},200,owner);
 assert(!retried.message.body.includes(tokenA),'The revoked link is stripped from the copy: '+retried.message.body);assert(retried.message.body.includes(tokenB),'The live link stays');
 assert(retried.message.body.includes('Te mando dos cosas.'),'The seller text stays');assert.equal(retried.message.htmlBody,null,'The stripped copy needs a new review');
 assert.equal(String(retried.message.taskId),String(task.id),'The retry keeps task_id');assert.equal((await share(shareA)).messageId,twice.id,'The revoked share stays on the failed message');
 assert.deepEqual(retried.materials.map((m:any)=>m.shareId),[shareB]);
 let again=await call({action:'edit',id:retried.message.id,revision:retried.message.revision,subject:'Dos',body:retried.message.body},200,owner);
 // Pasting the revoked link back is refused at dispatch: it belongs to another message (and is revoked).
 const pasted=await call({action:'edit',id:again.id,revision:again.revision,subject:'Dos',body:again.body+`<p>Otra vez: <a href="https://crm.example.test/m/${tokenA}">https://crm.example.test/m/${tokenA}</a></p>`},200,owner);
 let leaks=0;globalThis.fetch=async()=>{leaks++;return new Response('{}',{status:201});};
 await call({action:'dispatch',id:pasted.id,revision:pasted.revision,confirm:true},409,owner,/pertenece a otro mensaje/);globalThis.fetch=realFetch;assert.equal(leaks,0,'Nothing reached Brevo');
 again=await call({action:'edit',id:pasted.id,revision:pasted.revision,subject:'Dos',body:retried.message.body},200,owner);
 let finalPayload:any=null;globalThis.fetch=async(_url,init)=>{finalPayload=JSON.parse(String(init?.body));return new Response(JSON.stringify({messageId:'<retry-'+stamp+'@brevo.test>'}),{status:201});};
 const retriedSent=await call({action:'dispatch',id:again.id,revision:again.revision,confirm:true},200,owner);globalThis.fetch=realFetch;
 assert.equal(retriedSent.message.status,'accepted');assert(!finalPayload.htmlContent.includes(tokenA)&&!finalPayload.textContent.includes(tokenA),'The revoked link never went out');assert(finalPayload.htmlContent.includes(tokenB));assert.equal(finalPayload.attachment,undefined);
 assert.equal((await db.selectFrom('crmTasks').select('status').where('id','=',task.id).executeTakeFirstOrThrow()).status,'completed','The task completes after the retry is accepted');
 checks++;

 // Regression (review F3 #1): a pasted `/m/<token>` of another business or an unknown token is refused at dispatch, and nothing is recorded as sent.
 const b=await db.insertInto('crmAccounts').values({nombre:'Zz Ajeno '+stamp,status:'reviewed',assignedUserEmail:other.user.email}).returningAll().executeTakeFirstOrThrow();
 const foreignToken=generateShareToken().token;
 await sql`INSERT INTO crm_sales_material_shares(id,token_hash,material_id,account_id,original_account_id,channel,prepared_version,sent_version,created_by_email) VALUES(${randomUUID()}::uuid,${hashShareToken({token:foreignToken})},${brochure}::uuid,${b.id},${b.id},'whatsapp',1,1,${other.user.email})`.execute(db);
 let paste=await prepare('whatsapp');
 paste=await call({action:'edit',id:paste.id,revision:paste.revision,subject:'',body:`Hola, mirá https://crm.example.test/m/${foreignToken}`},200,owner);
 await call({action:'dispatch',id:paste.id,revision:paste.revision,confirm:true},409,owner,/pertenece a otro mensaje/);
 paste=await call({action:'edit',id:paste.id,revision:paste.revision,subject:'',body:`Hola, mirá https://crm.example.test/m/${generateShareToken().token}`},200,owner);
 await call({action:'dispatch',id:paste.id,revision:paste.revision,confirm:true},409,owner,/no se reconoce/);
 assert.equal((await message(paste.id)).status,'draft');
 checks++;

 // Regression (review F3 #2): Brevo only attaches its extension list; webp/webm and a file without a name go only as a link, also when attach was forced.
 const webp=await material('Foto '+stamp,{fileName:'foto.webp'}),nameless=await material('Sin nombre '+stamp,{fileName:null});
 let ext=await prepare('email');ext=await call({action:'edit',id:ext.id,revision:ext.revision,subject:'Fotos',body:'<p>Fotos.</p>'},200,owner);
 await call({action:'material_add',id:ext.id,revision:ext.revision,materialId:webp,attach:true},409,owner,/Brevo no adjunta este tipo de archivo \(\.webp\)/);
 await call({action:'material_add',id:ext.id,revision:ext.revision,materialId:nameless,attach:true},409,owner,/no tiene nombre/);
 r=await call({action:'material_add',id:ext.id,revision:ext.revision,materialId:webp,attach:false},200,owner);ext=r.message;assert.match(r.materials[0].attachBlockedReason,/Brevo no adjunta/);
 await sql`UPDATE crm_sales_material_shares SET attach=true WHERE id=${r.materials[0].shareId}::uuid`.execute(db);
 let extSends=0;globalThis.fetch=async()=>{extSends++;return new Response('{}',{status:201});};
 await call({action:'dispatch',id:ext.id,revision:ext.revision,confirm:true},409,owner,/Brevo no adjunta/);globalThis.fetch=realFetch;assert.equal(extSends,0);
 checks++;

 // Regression (review F3 #3): revoking lowers exposure. On a No contactar business the responsible of the business or of the management can revoke a link
 // someone else sent; a seller with no role on it gets 403. Removing a link from a draft works under No contactar; adding or attaching does not.
 const leadSeller=await identity('user');
 const l2=await db.insertInto('leads').values({accountId:a.id,nombre:a.nombre,opportunityName:'Segunda '+stamp,estado:'Cargado',assignedUserEmail:leadSeller.user.email}).returningAll().executeTakeFirstOrThrow();
 const adminShare=async(leadId:string|null)=>{const id=randomUUID();await sql`INSERT INTO crm_sales_material_shares(id,token_hash,material_id,account_id,original_account_id,lead_id,channel,prepared_version,sent_version,created_by_email) VALUES(${id}::uuid,${generateShareToken().tokenHash},${brochure}::uuid,${a.id},${a.id},${leadId},'whatsapp',1,1,${admin.user.email})`.execute(db);return id;};
 const byOwner=await adminShare(String(l.id)),byLeadSeller=await adminShare(String(l2.id)),denied=await adminShare(String(l.id));
 let dnc=await prepare('whatsapp');r=await call({action:'material_add',id:dnc.id,revision:dnc.revision,materialId:catalogue,attach:false},200,owner);dnc=r.message;
 await sql`UPDATE crm_accounts SET do_not_contact=true WHERE id=${a.id}`.execute(db);
 try{
  await revoke({shareId:byOwner,reason:'Pidió no ser contactado'},200,owner);
  await revoke({shareId:byLeadSeller,reason:'Pidió no ser contactado'},200,leadSeller);
  await revoke({shareId:denied,reason:'No me corresponde'},403,other);
  await call({action:'material_add',id:dnc.id,revision:dnc.revision,materialId:tour,attach:false},403,owner,/no contactar/i);
  r=await call({action:'material_remove',id:dnc.id,revision:dnc.revision,shareId:r.materials[0].shareId},200,owner);
  assert(!r.message.body.includes('/m/'),'The link left the draft under No contactar');
 }finally{await sql`UPDATE crm_accounts SET do_not_contact=false WHERE id=${a.id}`.execute(db);}
 assert.equal((await share(denied)).revokedAt,null);assert(String((await share(byLeadSeller)).revokeReason).includes('Pidió'));
 checks++;

 // Regression (review F3 #5): the claim locks the material FOR SHARE, so an archive waits for the dispatch instead of racing it.
 let race=await prepare('whatsapp');r=await call({action:'material_add',id:race.id,revision:race.revision,materialId:catalogue,attach:false},200,owner);race=r.message;
 const raceMessage=(await sql<Parameters<typeof claimDraftMaterials>[1]['message']>`SELECT * FROM crm_messages WHERE id=${race.id}::uuid`.execute(db)).rows[0];
 let release!:()=>void;const held=new Promise<void>(resolve=>{release=resolve;});let claimed!:()=>void;const isClaimed=new Promise<void>(resolve=>{claimed=resolve;});
 const holder=db.transaction().execute(async e=>{await claimDraftMaterials(e,{message:raceMessage,user:{...owner.user,role:'user'} as User});claimed();await held;throw new Error('rollback');}).catch(error=>{if(String(error).includes('rollback'))return;throw error;});
 await isClaimed;
 // The test pool has one connection, so the archive runs on a second client (same DATABASE_URL and, locally, the same unix socket).
 const probe=postgres(process.env.DATABASE_URL!,{max:1,prepare:false,path:process.env.CRM_TEST_DATABASE_SOCKET,onnotice:()=>{}});
 try{await assert.rejects(probe.begin(async t=>{await t`SET LOCAL lock_timeout='300ms'`;await t`UPDATE crm_sales_materials SET status='archived',archived_at=now() WHERE id=${catalogue}::uuid`;}),/lock timeout/i);}
 finally{release();await holder;await probe.end();}
 assert.equal((await sql<{status:string}>`SELECT status FROM crm_sales_materials WHERE id=${catalogue}::uuid`.execute(db)).rows[0]!.status,'active');
 checks++;

 console.log(`Sales material composer (spec 89 F3): ${checks} groups passed: material_add refusals, No contactar and restrictions, material_remove, dispatch validation and «Quitado del texto», cancel revocation, Brevo attachment.url and attached_version, «Reintentar sin adjuntos», «Revocar enlace», revoked and foreign links at dispatch, Brevo extensions, revoke and remove under No contactar, material lock`);
}finally{
 globalThis.fetch=realFetch;await db.destroy();
}
