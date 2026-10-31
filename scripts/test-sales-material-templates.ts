// Spec 89 F4 integration: sales material references in message templates ({{material:<uuid>}}) and the WhatsApp user script.
// Save validation (missing / internal / channel / subject refused, archived warned), settings materialRefs, resolution at prepare and prepare_general
// (fresh link per send, archived / internal left out with materialWarnings, email :attach), the dispatch claim accepting resolved links and refusing
// unresolved references, No contactar, and /_api/userscript/materials, material_add, prepare and templates. Brevo is mocked; R2 is never contacted.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import superjson from 'superjson';
import {sql} from 'kysely';
import postgres from 'postgres';
assert.equal(process.env.CRM_TEST_DATABASE,'1','Disposable database required');
Object.assign(process.env,{R2_ACCOUNT_ID:'test-account',R2_ACCESS_KEY_ID:'test-key',R2_SECRET_ACCESS_KEY:'test-secret',R2_BUCKET:'crm-material',R2_ENDPOINT:'http://127.0.0.1:9',PUBLIC_APP_URL:'https://crm.example.test',BREVO_API_KEY:'fixture-never-network'});
const {db}=await import('../src/helpers/db');
const {post}=await import('../src/endpoints/communication');
const {handle:saveSettings}=await import('../src/endpoints/settings_save_POST');
const {handle:getSettings}=await import('../src/endpoints/settings_GET');
const script=await import('../src/endpoints/userscript');
const {setServerSession}=await import('../src/helpers/getSetServerSession');
const {USERSCRIPT_VERSION}=await import('../userscript/src/version');
const stamp=randomUUID().slice(0,8);
const realFetch=globalThis.fetch;
async function identity(role:'admin'|'user'){
 const u=await db.insertInto('users').values({email:`templates-${role}-${stamp}-${randomUUID().slice(0,4)}@example.com`,displayName:'Templates '+role,role}).returningAll().executeTakeFirstOrThrow();
 const s={id:u.email,createdAt:Date.now(),lastAccessed:Date.now()};await db.insertInto('sessions').values({id:s.id,userId:u.id,expiresAt:new Date(Date.now()+3600000)}).execute();
 const r=new Response();await setServerSession(r,s);return {user:u,cookie:r.headers.get('set-cookie')!.split(';')[0]!};
}
type Id=Awaited<ReturnType<typeof identity>>;
async function call(body:unknown,status:number,who:Id,pattern?:RegExp){
 const r=await post(new Request('http://localhost/_api/communication',{method:'POST',headers:{cookie:who.cookie},body:superjson.stringify(body)}));const d=superjson.parse<any>(await r.text());
 assert.equal(r.status,status,d?.error);if(pattern)assert.match(d.error,pattern);return d;
}
async function saveTemplate(input:Record<string,unknown>,status:number,who:Id,pattern?:RegExp){
 const r=await saveSettings(new Request('http://localhost/_api/settings_save',{method:'POST',headers:{cookie:who.cookie,'Content-Type':'application/json'},body:superjson.stringify({action:'saveTemplate',...input})}));const d=superjson.parse<any>(await r.text());
 assert.equal(r.status,status,d?.error);if(pattern)assert.match(d.error,pattern);
 return status===200?String((await db.selectFrom('messageTemplates').select('id').where('name','=',String(input.name)).orderBy('id','desc').executeTakeFirstOrThrow()).id):null;
}
async function settings(who:Id){const r=await getSettings(new Request('http://localhost/_api/settings',{headers:{cookie:who.cookie}}));assert.equal(r.status,200);return superjson.parse<any>(await r.text());}
const scripted=(token:string)=>({Authorization:`Bearer ${token}`,'X-Hospeda-Userscript-Version':USERSCRIPT_VERSION,'Content-Type':'application/json'});
const shares=async(messageId:string)=>(await sql<{materialId:string;attach:boolean;sentVersion:number|null;revokedAt:Date|null}>`SELECT material_id::text,attach,sent_version,revoked_at FROM crm_sales_material_shares WHERE message_id=${messageId}::uuid ORDER BY created_at`.execute(db)).rows;
/** The `/m/<slug>-<token>` segments (spec 101) of the share links of a body. */
const tokens=(body:string)=>[...body.matchAll(/https:\/\/crm\.example\.test\/m\/([a-z0-9]+(?:-[a-z0-9]+)*-[A-Za-z0-9]{4})(?![A-Za-z0-9_-])/g)].map(m=>m[1]!);
async function material(title:string,{kind='deliverable',bytes=2048,url}:{kind?:string;bytes?:number;url?:string}={}){
 const id=randomUUID();
 await sql`INSERT INTO crm_sales_materials(id,title,kind,source,created_by_email) VALUES(${id}::uuid,${title},${kind},${url?'url':'file'},'admin@example.com')`.execute(db);
 if(url)await sql`INSERT INTO crm_sales_material_versions(id,material_id,version,url,actor_email) VALUES(${randomUUID()}::uuid,${id}::uuid,1,${url},'admin@example.com')`.execute(db);
 else await sql`INSERT INTO crm_sales_material_versions(id,material_id,version,object_key,file_name,mime_type,byte_size,actor_email) VALUES(${randomUUID()}::uuid,${id}::uuid,1,${`materials/${id}/v1-${randomUUID()}.pdf`},${title.toLowerCase().replace(/\W+/g,'-')+'.pdf'},'application/pdf',${bytes},'admin@example.com')`.execute(db);
 await sql`UPDATE crm_sales_materials SET current_version=1 WHERE id=${id}::uuid`.execute(db);return id;
}
try{
 let checks=0;
 const admin=await identity('admin'),owner=await identity('user');
 await db.insertInto('appSettings').values({key:'brevo_sender_email',value:'sender@example.com'}).onConflict(oc=>oc.column('key').doUpdateSet({value:'sender@example.com'})).execute();
 // Business names sort after «Negocio E2E» (the commercial e2e expects its business on the first page of the list).
 const a=await db.insertInto('crmAccounts').values({nombre:'Zz Templates '+stamp,status:'reviewed',assignedUserEmail:owner.user.email,telefono:'+5493442000301'}).returningAll().executeTakeFirstOrThrow();
 const l=await db.insertInto('leads').values({accountId:a.id,nombre:a.nombre,estado:'Cargado',assignedUserEmail:owner.user.email}).returningAll().executeTakeFirstOrThrow();
 const c=await db.insertInto('crmContacts').values({accountId:a.id,name:'Persona '+stamp,email:'templates-person@example.com',phone:'+5493442000302'}).returningAll().executeTakeFirstOrThrow();
 const brochure=await material('Folleto '+stamp),tour=await material('Tour '+stamp,{url:'https://example.com/tour'}),big=await material('Video '+stamp,{bytes:11*1048576});
 const internal=await material('Interno '+stamp,{kind:'internal'}),gone=await material('Archivado '+stamp),later=await material('Precios '+stamp);
 await sql`UPDATE crm_sales_materials SET status='archived',archived_at=now() WHERE id=${gone}::uuid`.execute(db);
 const category=(await sql<{id:string}>`INSERT INTO crm_sales_material_categories(name) VALUES(${'Folletos '+stamp}) RETURNING id`.execute(db)).rows[0]!.id;
 await sql`INSERT INTO crm_sales_material_category_links(material_id,category_id) VALUES(${brochure}::uuid,${category})`.execute(db);
 const ref=(id:string,attach=false)=>`{{material:${id}${attach?':attach':''}}}`;

 // Saving: missing, internal, a non WhatsApp/email channel and the subject are refused; archived is saved (warned when opened); sellers cannot save.
 const waBody=`<p>Hola {{contact}}, te paso el material:</p><p>${ref(brochure)}</p><p>Y el recorrido: ${ref(tour)}</p><p>${ref(gone)}</p>`;
 const waName='Zz modelo material '+stamp;
 await saveTemplate({channel:'whatsapp',name:waName,body:`<p>${ref(internal)}</p>`},400,admin,/material interno/);
 await saveTemplate({channel:'whatsapp',name:waName,body:`<p>${ref(randomUUID())}</p>`},400,admin,/ya no existe/);
 await saveTemplate({channel:'social',name:waName,body:`<p>${ref(brochure)}</p>`},400,admin,/Solo los modelos de WhatsApp y email/);
 await saveTemplate({channel:'email',name:waName,subject:`Material ${ref(brochure)}`,body:'<p>Hola</p>'},400,admin,/El asunto no puede llevar material/);
 await saveTemplate({channel:'whatsapp',name:waName,body:waBody},403,owner);
 const waTemplate=(await saveTemplate({channel:'whatsapp',name:waName,body:waBody},200,admin))!;
 const plainName='Zz modelo sin material '+stamp,plainTemplate=(await saveTemplate({channel:'whatsapp',name:plainName,body:'<p>Hola {{contact}}, ¿cómo estás?</p>'},200,admin))!;
 checks++;

 // settings: each template lists its references with title and problem, so the editor never shows a uuid.
 const listed=(await settings(admin)).templates.find((t:any)=>t.id===waTemplate);
 assert.deepEqual(listed.materialRefs,[{materialId:brochure,title:'Folleto '+stamp,problem:null},{materialId:tour,title:'Tour '+stamp,problem:null},{materialId:gone,title:'Archivado '+stamp,problem:'archived'}]);
 assert.deepEqual((await settings(admin)).templates.find((t:any)=>t.id===plainTemplate).materialRefs,[]);
 checks++;

 // prepare: each reference becomes a share of this draft; the archived one is left out with a reason; the dispatch claim accepts the links.
 // prepare reuses an open draft with the same lead, contact, channel, template and variation, so every prepare gets its own variation. A random one
 // collided now and then (regression: CI run 40479186115): with 0 the user script, which never sends a variation, reused the draft poisoned below.
 let variations=10;const nextVariation=()=>variations++;
 const prepare=(templateId:string|null,channel:'whatsapp'|'email'='whatsapp',variation=nextVariation())=>call({action:'prepare',id:randomUUID(),leadId:String(l.id),contactId:String(c.id),channel,templateId,variation},200,owner);
 const wa=await prepare(waTemplate);
 assert(!wa.body.includes('{{material:'),'No reference survives prepare: '+wa.body);
 assert.match(wa.body,new RegExp(`Folleto ${stamp}: https://crm\\.example\\.test/m/[a-z0-9]+(?:-[a-z0-9]+)*-[A-Za-z0-9]{4}(?![A-Za-z0-9_-])`));assert.match(wa.body,new RegExp(`Y el recorrido: Tour ${stamp}: https://crm\\.example\\.test/m/`));
 assert(!wa.body.includes('Archivado'),'The archived material is dropped from the text');
 assert.deepEqual(wa.materialWarnings.map((w:any)=>[w.materialId,w.problem,w.message]),[[gone,'archived',`«Archivado ${stamp}» ya no está disponible. No se agregó al mensaje.`]]);
 assert.deepEqual(wa.materials.map((m:any)=>m.materialId).sort(),[brochure,tour].sort());
 assert.deepEqual((await shares(wa.id)).map(s=>s.materialId).sort(),[brochure,tour].sort());
 const resolved=(await sql<{after:any}>`SELECT after_value AS after FROM crm_communication_journal WHERE entity_type='interaction' AND entity_id=${wa.id} AND action='template_materials_resolved'`.execute(db)).rows;
 assert.equal(resolved.length,1);assert.deepEqual(resolved[0]!.after.skipped,[{materialId:gone,problem:'archived',title:'Archivado '+stamp}]);
 const again=await prepare(waTemplate);
 assert.equal(tokens(again.body).length,2);assert(tokens(again.body).every(t=>!tokens(wa.body).includes(t)),'Every send gets its own links');
 const opened=await call({action:'dispatch',id:wa.id,revision:wa.revision,confirm:true},200,owner);assert.equal(opened.message.status,'whatsapp_opened');
 assert.deepEqual((await shares(wa.id)).map(s=>s.sentVersion),[1,1],'The claim accepted both links and fixed sent_version');
 const plain=await prepare(plainTemplate);assert.deepEqual(plain.materialWarnings,[]);assert.deepEqual(plain.materials,[]);
 checks++;

 // A material that turned internal after the template was saved is left out at prepare and never shared.
 const laterName='Zz modelo precios '+stamp,laterTemplate=(await saveTemplate({channel:'whatsapp',name:laterName,body:`<p>Precios: ${ref(later)}</p><p>${ref(brochure)}</p>`},200,admin))!;
 await sql`UPDATE crm_sales_materials SET kind='internal' WHERE id=${later}::uuid`.execute(db);
 const turned=await prepare(laterTemplate);
 assert.equal(turned.materialWarnings[0].problem,'internal');assert.match(turned.materialWarnings[0].message,/material interno/);
 assert.deepEqual((await shares(turned.id)).map(s=>s.materialId),[brochure]);assert(!turned.body.includes(later));
 assert.equal((await settings(admin)).templates.find((t:any)=>t.id===laterTemplate).materialRefs[0].problem,'internal');
 await saveTemplate({id:laterTemplate,channel:'whatsapp',name:laterName,body:`<p>Precios: ${ref(later)}</p>`},400,admin,/material interno/);
 checks++;

 // Email: :attach attaches the file when Brevo and the limit allow it; otherwise only the link goes, with a warning. Brevo receives attachment.url.
 const mailTemplate=(await saveTemplate({channel:'email',name:'Zz modelo email '+stamp,subject:'Material de Hospeda',body:`<p>Hola, te paso ${ref(brochure,true)} y ${ref(big,true)}.</p>`},200,admin))!;
 let mail=await prepare(mailTemplate,'email');
 assert.match(mail.body,new RegExp(`Folleto ${stamp}: <a href="https://crm\\.example\\.test/m/[a-z0-9]+(?:-[a-z0-9]+)*-[A-Za-z0-9]{4}">`));
 assert.deepEqual(Object.fromEntries((await shares(mail.id)).map(s=>[s.materialId,s.attach])),{[brochure]:true,[big]:false});
 assert.equal(mail.materialWarnings.length,1);assert.equal(mail.materialWarnings[0].problem,'attach');assert.match(mail.materialWarnings[0].message,/va solo como enlace: Supera el límite/);
 mail=await call({action:'edit',id:mail.id,revision:mail.revision,subject:mail.subject,body:mail.body},200,owner);
 let payload:any=null;globalThis.fetch=async(url,init)=>{assert.equal(String(url),'https://api.brevo.com/v3/smtp/email');payload=JSON.parse(String(init?.body));return new Response(JSON.stringify({messageId:'<templates-'+stamp+'@brevo.test>'}),{status:201});};
 const accepted=await call({action:'dispatch',id:mail.id,revision:mail.revision,confirm:true},200,owner);globalThis.fetch=realFetch;
 assert.equal(accepted.message.status,'accepted');assert.equal(payload.attachment.length,1);assert.equal(payload.attachment[0].name,`folleto-${stamp}.pdf`);
 checks++;

 // prepare_general resolves the same way.
 const general=await call({action:'prepare_general',id:randomUUID(),accountId:String(a.id),leadId:String(l.id),contactId:String(c.id),channel:'whatsapp',templateId:waTemplate,purpose:null,otherPurpose:null,variation:7},200,owner);
 assert.equal(tokens(general.body).length,2);assert.equal(general.materialWarnings.length,1);assert.deepEqual((await shares(general.id)).map(s=>s.materialId).sort(),[brochure,tour].sort());
 checks++;

 // A reference typed by hand (or copied from a chip) is refused at edit; one that reached a draft anyway is never resolved on reuse or replay,
 // and dispatch refuses it in the body, the reviewed html or the text: nothing is recorded as sent (regression).
 const manual=await prepare(null);
 await call({action:'edit',id:manual.id,revision:manual.revision,subject:'',body:`Mirá ${ref(brochure)}`},400,owner,/referencia de material sin resolver/);
 const reuseVariation=nextVariation(),firstDraft=await prepare(plainTemplate,'whatsapp',reuseVariation);
 await sql`UPDATE crm_messages SET body=${'Hola '+ref(brochure)} WHERE id=${firstDraft.id}::uuid`.execute(db);
 const reused=await prepare(plainTemplate,'whatsapp',reuseVariation);
 assert.equal(reused.id,firstDraft.id);assert.equal(reused.reusedDraft,true);assert.equal(reused.body,'Hola '+ref(brochure),'A reused draft is not resolved');assert.equal(reused.revision,firstDraft.revision);assert.deepEqual(await shares(firstDraft.id),[]);
 const replay=await call({action:'prepare',id:firstDraft.id,leadId:String(l.id),contactId:String(c.id),channel:'whatsapp',templateId:plainTemplate,variation:reuseVariation},200,owner);
 assert.equal(replay.body,'Hola '+ref(brochure),'A replayed id is not resolved');assert.deepEqual(await shares(firstDraft.id),[]);assert.equal(replay.freshDraft,undefined);
 await call({action:'dispatch',id:firstDraft.id,revision:reused.revision,confirm:true},409,owner,/referencia de material sin resolver/);
 let leftover=await prepare(null,'email');leftover=await call({action:'edit',id:leftover.id,revision:leftover.revision,subject:'Material',body:'<p>Hola</p>'},200,owner);
 await sql`UPDATE crm_messages SET html_body=${'<p>Hola '+ref(brochure)+'</p>'},text_body=${'Hola '+ref(brochure)} WHERE id=${leftover.id}::uuid`.execute(db);
 let brevoCalls=0;globalThis.fetch=async()=>{brevoCalls++;return new Response('{}',{status:201});};
 await call({action:'dispatch',id:leftover.id,revision:leftover.revision,confirm:true},409,owner,/referencia de material sin resolver/);globalThis.fetch=realFetch;
 assert.equal(brevoCalls,0,'Brevo is never called');assert.equal((await sql<{status:string}>`SELECT status FROM crm_messages WHERE id=${leftover.id}::uuid`.execute(db)).rows[0]!.status,'draft');
 checks++;

 // User script: materials list, prepare with materialWarnings, material_add, labelled template bodies, blocked businesses, internal and email refusals.
 const created=await script.tokenCreate(new Request('http://localhost/_api/userscript/tokens',{method:'POST',headers:{Cookie:owner.cookie,'Content-Type':'application/json'},body:JSON.stringify({label:'Templates'})}));
 const token=(await created.json() as {token:string}).token;
 const list=await script.materials(new Request(`http://localhost/_api/userscript/materials?accountId=${a.id}`,{headers:scripted(token)}));assert.equal(list.status,200);
 const listBody=await list.json() as {blocked:string|null;materials:{id:string;title:string;categories:string[];format:string;formatLabel:string}[]};
 assert.equal(listBody.blocked,null);const ids=listBody.materials.map(m=>m.id);
 assert(ids.includes(brochure)&&ids.includes(tour)&&!ids.includes(internal)&&!ids.includes(gone)&&!ids.includes(later),'Only active deliverables');
 assert.deepEqual(listBody.materials.find(m=>m.id===brochure),{id:brochure,title:'Folleto '+stamp,categories:['Folletos '+stamp],format:'pdf',formatLabel:'PDF'});
 assert.equal((await script.materials(new Request(`http://localhost/_api/userscript/materials?accountId=${a.id}`,{headers:{...scripted(token),'X-Hospeda-Userscript-Version':'1.1.0'}}))).status,426);
 const listing=await script.templates(new Request(`http://localhost/_api/userscript/templates?accountId=${a.id}`,{headers:scripted(token)}));
 const scriptTemplate=(await listing.json() as {leads:{templates:{id:string;body:string}[]}[]}).leads[0]!.templates.find(t=>t.id===waTemplate)!;
 assert(scriptTemplate.body.includes(`[Material: Folleto ${stamp}]`)&&scriptTemplate.body.includes(`[Material: Archivado ${stamp}]`)&&!scriptTemplate.body.includes(brochure),'The popover shows titles, never uuids');
 const scriptPrepare=await script.prepare(new Request('http://localhost/_api/userscript/prepare',{method:'POST',headers:scripted(token),body:JSON.stringify({id:randomUUID(),leadId:String(l.id),contactId:String(c.id),templateId:plainTemplate})}));
 assert.equal(scriptPrepare.status,200);const prepared=await scriptPrepare.json() as {messageId:string;revision:number;body:string;materialWarnings:string[]};assert.deepEqual(prepared.materialWarnings,[]);
 assert.notEqual(prepared.messageId,firstDraft.id,'The script (variation 0) never reuses a draft prepared with another variation');
 const withWarning=await script.prepare(new Request('http://localhost/_api/userscript/prepare',{method:'POST',headers:scripted(token),body:JSON.stringify({id:randomUUID(),leadId:String(l.id),contactId:null,templateId:waTemplate})}));
 assert.equal(withWarning.status,200);assert.deepEqual((await withWarning.json() as {materialWarnings:string[]}).materialWarnings,[`«Archivado ${stamp}» ya no está disponible. No se agregó al mensaje.`]);
 const add=(materialId:string,revision:number,messageId=prepared.messageId)=>script.materialAdd(new Request('http://localhost/_api/userscript/material_add',{method:'POST',headers:scripted(token),body:JSON.stringify({messageId,revision,materialId})}));
 const added=await add(tour,prepared.revision);assert.equal(added.status,200);const addedBody=await added.json() as {revision:number;body:string};
 assert.equal(addedBody.revision,prepared.revision+1);assert(addedBody.body.startsWith(prepared.body)&&new RegExp(`«Tour ${stamp}» en: https://crm\\.example\\.test/m/`).test(addedBody.body));
 assert.equal((await add(tour,addedBody.revision)).status,409,'The same material twice is refused');
 assert.equal((await add(internal,addedBody.revision)).status,403,'An internal material is never shared from the script');
 assert.equal((await add(brochure,prepared.revision)).status,409,'A stale revision is refused');
 assert.equal((await add(brochure,wa.revision+1,wa.id)).status,409,'A message already opened in WhatsApp is no longer a draft');
 const emailDraft=await prepare(null,'email');assert.equal((await add(brochure,emailDraft.revision,emailDraft.id)).status,400,'The script only handles WhatsApp');
 const pasted=await script.dispatch(new Request('http://localhost/_api/userscript/dispatch',{method:'POST',headers:scripted(token),body:JSON.stringify({id:prepared.messageId,revision:addedBody.revision})}));assert.equal(pasted.status,200);
 assert.deepEqual((await shares(prepared.messageId)).map(s=>s.sentVersion),[1]);
 checks++;

 // No contactar: the script lists nothing, prepare and material_add are refused and no share is created.
 const fresh=await script.prepare(new Request('http://localhost/_api/userscript/prepare',{method:'POST',headers:scripted(token),body:JSON.stringify({id:randomUUID(),leadId:String(l.id),contactId:String(c.id),templateId:plainTemplate,})}));const freshBody=await fresh.json() as {messageId:string;revision:number};
 await db.updateTable('crmAccounts').set({doNotContact:true}).where('id','=',a.id).execute();
 const blocked=await script.materials(new Request(`http://localhost/_api/userscript/materials?accountId=${a.id}`,{headers:scripted(token)}));
 assert.deepEqual(await blocked.json(),{materials:[],blocked:'El negocio tiene No contactar activo.'});
 assert.equal((await add(brochure,freshBody.revision,freshBody.messageId)).status,403);assert.deepEqual(await shares(freshBody.messageId),[]);
 const refusedId=randomUUID();
 await call({action:'prepare',id:refusedId,leadId:String(l.id),contactId:String(c.id),channel:'whatsapp',templateId:waTemplate,variation:999},403,owner);
 assert.deepEqual(await shares(refusedId),[]);
 await db.updateTable('crmAccounts').set({doNotContact:false}).where('id','=',a.id).execute();
 checks++;


 await db.updateTable('crmAccounts').set({doNotContact:false}).where('id','=',a.id).execute();
 // A business or person name can never inject a reference through a variable (regression).
 const injected=await db.insertInto('crmAccounts').values({nombre:`Zz Inject ${ref(brochure)} ${stamp}`,status:'reviewed',assignedUserEmail:owner.user.email,telefono:'+5493442000303'}).returningAll().executeTakeFirstOrThrow();
 const injectedLead=await db.insertInto('leads').values({accountId:injected.id,nombre:injected.nombre,estado:'Cargado',assignedUserEmail:owner.user.email}).returningAll().executeTakeFirstOrThrow();
 const nameTemplate=(await saveTemplate({channel:'whatsapp',name:'Zz modelo nombre '+stamp,body:'<p>Hola {{name}}</p>'},200,admin))!;
 const injectedDraft=await call({action:'prepare',id:randomUUID(),leadId:String(injectedLead.id),contactId:null,channel:'whatsapp',templateId:nameTemplate,variation:1},200,owner);
 assert(!injectedDraft.body.includes('{{material:')&&!injectedDraft.body.includes('/m/'),'The name stays text: '+injectedDraft.body);assert.deepEqual(await shares(injectedDraft.id),[]);
 checks++;

 // References only in text: an attribute (href) is refused at save; restoring a version with a missing or internal material is refused.
 await saveTemplate({channel:'email',name:'Zz modelo href '+stamp,subject:'Hola',body:`<p><a href="${ref(brochure)}">Folleto</a></p>`},400,admin,/no dentro de un enlace/);
 const restore=async(input:Record<string,unknown>,status:number,pattern?:RegExp)=>{const r=await saveSettings(new Request('http://localhost/_api/settings_save',{method:'POST',headers:{cookie:admin.cookie,'Content-Type':'application/json'},body:superjson.stringify({action:'restoreTemplateVersion',...input})}));const d=superjson.parse<any>(await r.text());assert.equal(r.status,status,d?.error);if(pattern)assert.match(d.error,pattern);};
 const turning=await material('Lista '+stamp),restoreName='Zz modelo restaurar '+stamp,restoreTemplate=(await saveTemplate({channel:'whatsapp',name:restoreName,body:`<p>${ref(turning)}</p>`},200,admin))!;
 await saveTemplate({id:restoreTemplate,channel:'whatsapp',name:restoreName,body:'<p>Sin material</p>'},200,admin);
 const firstVersion=(await sql<{version:number}>`SELECT min(version) AS version FROM crm_message_template_versions WHERE template_id=${restoreTemplate}`.execute(db)).rows[0]!.version;
 await sql`UPDATE crm_sales_materials SET kind='internal' WHERE id=${turning}::uuid`.execute(db);
 await restore({id:restoreTemplate,version:firstVersion},400,/material interno/);
 await sql`INSERT INTO crm_message_template_versions(template_id,version,snapshot,actor_email) SELECT template_id,version+1,jsonb_set(snapshot,'{body}',to_jsonb(${`<p>${ref(randomUUID())}</p>`}::text)),${admin.user.email} FROM crm_message_template_versions WHERE template_id=${restoreTemplate} ORDER BY version DESC LIMIT 1`.execute(db);
 const missingVersion=(await sql<{version:number}>`SELECT max(version) AS version FROM crm_message_template_versions WHERE template_id=${restoreTemplate}`.execute(db)).rows[0]!.version;
 await restore({id:restoreTemplate,version:missingVersion},400,/ya no existe/);
 assert.equal((await db.selectFrom('messageTemplates').select('body').where('id','=',restoreTemplate).executeTakeFirstOrThrow()).body,'<p>Sin material</p>','A refused restore changes nothing');
 checks++;

 // Cancelling the draft or discarding it from a new prepare revokes the links created at prepare.
 const toCancel=await prepare(waTemplate);
 assert.equal((await shares(toCancel.id)).length,2);
 await call({action:'cancel_draft',id:toCancel.id,revision:toCancel.revision},200,owner);
 assert((await shares(toCancel.id)).every(s=>s.revokedAt),'cancel_draft revokes the template links');
 const toDiscard=await prepare(waTemplate);
 await call({action:'prepare',id:randomUUID(),leadId:String(l.id),contactId:String(c.id),channel:'whatsapp',templateId:waTemplate,variation:nextVariation(),discardDraft:{id:toDiscard.id,revision:toDiscard.revision}},200,owner);
 const discarded=await shares(toDiscard.id);assert.equal(discarded.length,2);assert(discarded.every(s=>s.revokedAt),'discardDraft revokes the template links');
 checks++;

 // Delegated prepare (spec 87): the assignee of a pending task resolves the references with her own user.
 const delegate=await identity('user');
 const task=await db.insertInto('crmTasks').values({accountId:a.id,leadId:l.id,title:'Mandar material '+stamp,typeId:'call',dueDate:'2027-01-15',assignedUserEmail:delegate.user.email}).returningAll().executeTakeFirstOrThrow();
 const delegated=await call({action:'prepare',id:randomUUID(),leadId:String(l.id),contactId:String(c.id),channel:'whatsapp',templateId:waTemplate,variation:nextVariation(),taskId:String(task.id)},200,delegate);
 assert.equal(tokens(delegated.body).length,2);assert.deepEqual(delegated.materialWarnings.map((w:any)=>w.problem),['archived']);
 assert.deepEqual((await sql<{createdByEmail:string}>`SELECT DISTINCT created_by_email FROM crm_sales_material_shares WHERE message_id=${delegated.id}::uuid`.execute(db)).rows.map(r=>r.createdByEmail),[delegate.user.email]);
 checks++;

 // A material archived while prepare waits for it is left out with a warning instead of failing the prepare (regression). The archive runs on a
 // second client through the same unix socket with triggers off: the real archive also bumps the live version row that prepare holds, so in
 // production the two serialize there (or Postgres aborts one as a deadlock) before reaching the material.
 const racing=await material('Carrera '+stamp),raceTemplate=(await saveTemplate({channel:'whatsapp',name:'Zz modelo carrera '+stamp,body:`<p>${ref(racing)}</p><p>${ref(brochure)}</p>`},200,admin))!;
 const probe=postgres(process.env.DATABASE_URL!,{max:1,prepare:false,path:process.env.CRM_TEST_DATABASE_SOCKET,onnotice:()=>{}}),watcher=postgres(process.env.DATABASE_URL!,{max:1,prepare:false,path:process.env.CRM_TEST_DATABASE_SOCKET,onnotice:()=>{}});
 try{
  let release:()=>void=()=>{},locked:()=>void=()=>{};const gate=new Promise<void>(r=>{release=r;}),archivedRow=new Promise<void>(r=>{locked=r;});
  const holder=probe.begin(async t=>{await t`SET LOCAL session_replication_role=replica`;await t`UPDATE crm_sales_materials SET status='archived',archived_at=now() WHERE id=${racing}::uuid`;locked();await gate;});
  await archivedRow;
  const pending=prepare(raceTemplate);
  // Release only once prepare is really waiting on the material row (a backend of the app blocked on a lock).
  let waited=false;for(let i=0;i<100&&!waited;i++){const [w]=await watcher`SELECT count(*)::int AS n FROM pg_stat_activity WHERE application_name='hospeda-crm' AND wait_event_type='Lock'`;waited=w!.n>0;if(!waited)await new Promise(r=>setTimeout(r,50));}
  assert(waited,'prepare reached the locked material');release();await holder;
  const raced=await pending;
  assert.deepEqual(raced.materialWarnings.map((w:any)=>[w.materialId,w.problem]),[[racing,'archived']]);assert.deepEqual((await shares(raced.id)).map(s=>s.materialId),[brochure]);
 }finally{await probe.end();await watcher.end();}
 checks++;

 // User script: server-side search (the list is capped), inactive categories hidden, and another seller's draft is refused.
 const tourOnly=await script.materials(new Request(`http://localhost/_api/userscript/materials?accountId=${a.id}&search=${encodeURIComponent('tour '+stamp)}`,{headers:scripted(token)}));
 assert.deepEqual(((await tourOnly.json()) as {materials:{id:string}[]}).materials.map(m=>m.id),[tour]);
 assert.equal((await script.materials(new Request(`http://localhost/_api/userscript/materials?accountId=${a.id}&search=${'x'.repeat(201)}`,{headers:scripted(token)}))).status,400);
 await sql`UPDATE crm_sales_material_categories SET active=false WHERE id=${category}`.execute(db);
 const hiddenCategory=await script.materials(new Request(`http://localhost/_api/userscript/materials?accountId=${a.id}&search=${encodeURIComponent('folleto '+stamp)}`,{headers:scripted(token)}));
 assert.deepEqual(((await hiddenCategory.json()) as {materials:{id:string;categories:string[]}[]}).materials.find(m=>m.id===brochure)!.categories,[]);
 const colleague=await identity('user');
 const colleagueToken=(await (await script.tokenCreate(new Request('http://localhost/_api/userscript/tokens',{method:'POST',headers:{Cookie:colleague.cookie,'Content-Type':'application/json'},body:JSON.stringify({label:'Colega'})}))).json() as {token:string}).token;
 const ownDraft=await prepare(plainTemplate);
 const foreign=await script.materialAdd(new Request('http://localhost/_api/userscript/material_add',{method:'POST',headers:scripted(colleagueToken),body:JSON.stringify({messageId:ownDraft.id,revision:ownDraft.revision,materialId:brochure})}));
 assert.equal(foreign.status,403);assert.deepEqual(await shares(ownDraft.id),[]);
 checks++;

 console.log(`Sales material templates (spec 89 F4): ${checks} groups passed: save validation, settings materialRefs, prepare resolution with fresh links and materialWarnings, internal after save, email :attach and Brevo, prepare_general, unresolved references refused at dispatch, user script materials / material_add / prepare / templates, No contactar, variable injection, attribute and restore refusals, cancel/discard revocation, delegated prepare, archive race lock, script search and foreign drafts.`);
}finally{
 globalThis.fetch=realFetch;await db.destroy();
}
