import {handle as saveSettings} from '../src/endpoints/settings_save_POST';
import {seedDncTasks,assertDncCancelled,assertDncUntouched} from './lib/dnc-tasks';
import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import superjson from 'superjson';import {sql} from 'kysely';import {pendingContactFollowUps,resolveMessageForWork} from '../src/helpers/communicationService';import {setWorkActor} from '../src/helpers/workAudit';import {db} from '../src/helpers/db';import {post,get,webhook} from '../src/endpoints/communication';import {post as workPost} from '../src/endpoints/work';import {post as resourcePost,get as resourcesGet,download} from '../src/endpoints/resources';import {app} from '../src/server/app';import {setServerSession} from '../src/helpers/getSetServerSession';import {businessFields} from '../src/helpers/dataNormalization';import {post as quality} from '../src/endpoints/dataQuality';import {restartDraftRequest,type Message} from '../src/endpoints/communication.schema';
assert.equal(process.env.CRM_TEST_DATABASE,'1');const stamp=Date.now();
async function identity(role:'admin'|'user'){const u=await db.insertInto('users').values({email:`communication-${role}-${randomUUID()}@example.com`,displayName:role,role}).returningAll().executeTakeFirstOrThrow();const s={id:u.email,createdAt:Date.now(),lastAccessed:Date.now()};await db.insertInto('sessions').values({id:s.id,userId:u.id,expiresAt:new Date(Date.now()+3600000)}).execute();const r=new Response();await setServerSession(r,s);return {user:u,cookie:r.headers.get('set-cookie')!.split(';')[0]};}
const admin=await identity('admin'),user=await identity('user'),other=await identity('user');
const request=(body:unknown,cookie=admin.cookie)=>new Request('http://localhost/_api/communication',{method:'POST',headers:{cookie},body:superjson.stringify(body)});
async function call(body:unknown,status=200,cookie=admin.cookie){const r=await post(request(body,cookie));const d=superjson.parse<any>(await r.text());assert.equal(r.status,status,d.error);return d;}
/** Moves the contact-outcome cutoff back one day (openSends ignores older sends) and returns the previous value for restoring. */
async function backOutcomeCutoff(){const since=(await sql<{value:string}>`SELECT value FROM app_settings WHERE key='crm_contact_outcome_since'`.execute(db)).rows[0]?.value;
 await sql`UPDATE app_settings SET value=to_char((now()-interval '1 day') AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') WHERE key='crm_contact_outcome_since'`.execute(db);return since;}
const restoreOutcomeCutoff=async(since:string|undefined)=>{if(since!==undefined)await sql`UPDATE app_settings SET value=${since} WHERE key='crm_contact_outcome_since'`.execute(db);};
async function resource(body:unknown,status=200,cookie=admin.cookie){const r=await resourcePost(request(body,cookie));const d=superjson.parse<any>(await r.text());assert.equal(r.status,status,d.error);return d;}
async function message(id:string){return (await sql<Message>`SELECT * FROM crm_messages WHERE id=${id}::uuid`.execute(db)).rows[0];}
let realFetch=globalThis.fetch;
try{
 assert.equal((await get(new Request('http://localhost/_api/communication?leadId=1'))).status,401);assert.equal((await resourcePost(request({},''))).status,401);assert.equal((await download(new Request('http://localhost/_api/resources/download?versionId='+randomUUID()))).status,401);assert.equal((await app.request('/_api/send_template_email',{method:'POST',headers:{origin:'http://localhost'}})).status,404);
 const a=await db.insertInto('crmAccounts').values({nombre:'Communication '+stamp,ciudad:'Colón',email:'generic@example.com',telefono:'5493442000001',assignedUserEmail:user.user.email}).returningAll().executeTakeFirstOrThrow();
 const l=await db.insertInto('leads').values({accountId:a.id,nombre:a.nombre,estado:'Cargado',assignedUserEmail:user.user.email}).returningAll().executeTakeFirstOrThrow();
 const c=await db.insertInto('crmContacts').values({accountId:a.id,name:'Persona real',email:'person@example.com',phone:'+5493442000002'}).returningAll().executeTakeFirstOrThrow();
 const t=await db.insertInto('messageTemplates').values({name:`Fixture email ${stamp}`,channel:'email',purpose:'first_contact',subject:'Hola {{contact}}',body:'<p>{{#if contact}}Hola {{contact}}{{else}}Hola{{/if}} <strong>Hospeda</strong></p>'}).returningAll().executeTakeFirstOrThrow();const w=await db.insertInto('messageTemplates').values({name:`Fixture WhatsApp ${stamp}`,channel:'whatsapp',body:'<p><strong>Hola {{contact}}</strong> <em>Hospeda</em></p>'}).returningAll().executeTakeFirstOrThrow();
 const scoped=await db.insertInto('messageTemplates').values({name:`Presentación con datos opcionales ${stamp}`,channel:'whatsapp',vertical:'Gastronomía',commercialProfile:'Referente',body:'<p>{{#if contact}}Hola {{contact}}{{else}}Hola{{/if}} {{name}}</p>'}).returningAll().executeTakeFirstOrThrow();
 // Spec 87: selected tasks are resolved atomically with the response and replay does not complete again.
 {
  await db.updateTable('crmAccounts').set({status:'reviewed'}).where('id','=',a.id).execute();
  const task=await db.insertInto('crmTasks').values({accountId:a.id,leadId:l.id,title:'Confirmar propuesta '+stamp,typeId:'call',assignedUserEmail:user.user.email,dueDate:'2026-10-27' as never,priority:'media'}).returningAll().executeTakeFirstOrThrow();
  const response={action:'response_create',id:randomUUID(),accountId:String(a.id),leadId:String(l.id),contactId:String(c.id),channel:'call',recipient:c.phone!,recipientName:c.name,destination:c.phone,linkedMessageId:null,category:'interested',summary:'Aceptó revisar la propuesta',exactText:null,otherDetail:null,resolveTaskIds:[String(task.id)]};
  const created=await call(response,200,user.cookie);const completed=await db.selectFrom('crmTasks').selectAll().where('id','=',task.id).executeTakeFirstOrThrow();
  assert.equal(completed.status,'completed');assert.equal(completed.result,'Resuelta por la respuesta del cliente');assert.equal((completed as unknown as {communicationResponseId:string|null}).communicationResponseId??null,null,'H1: resolved tasks keep communication_response_id free (UNIQUE, reserved for the later reminder)');
  const activity=await db.selectFrom('crmActivities').selectAll().where('taskId','=',task.id).executeTakeFirstOrThrow();assert.equal(activity.actorEmail,user.user.email);const linkJournal=(await sql<{after:{taskId:string;activityId:string}}>`SELECT after_value AS after FROM crm_communication_journal WHERE entity_type='response' AND entity_id=${String(created.id)} AND action='response_task_resolved'`.execute(db)).rows;assert.equal(linkJournal.length,1);assert.equal(String(linkJournal[0].after.taskId),String(task.id));assert.equal(String(linkJournal[0].after.activityId),String(activity.id));assert.equal(activity.result,'Resuelta por la respuesta del cliente');
  await call(response,200,user.cookie);assert.equal((await db.selectFrom('crmActivities').select('id').where('taskId','=',task.id).execute()).length,1,'Replay must not complete or journal the task twice');
  const otherBusiness=await db.insertInto('crmAccounts').values({nombre:'Zz other business '+stamp,status:'reviewed',assignedUserEmail:user.user.email}).returningAll().executeTakeFirstOrThrow();const unrelated=await db.insertInto('crmTasks').values({accountId:otherBusiness.id,leadId:null,title:'Tarea de otro negocio '+stamp,typeId:'followup',assignedUserEmail:user.user.email,dueDate:'2026-10-28' as never,priority:'media'}).returningAll().executeTakeFirstOrThrow();
  const rejectedId=randomUUID();await call({...response,id:rejectedId,resolveTaskIds:[String(unrelated.id)]},409,user.cookie);
  assert.equal((await db.selectFrom('crmCommunicationResponses').select('id').where('id','=',rejectedId).execute()).length,0,'Bad task rejects the entire response');
  assert.equal((await db.selectFrom('crmTasks').select('status').where('id','=',unrelated.id).executeTakeFirstOrThrow()).status,'pending');

  // H1/M3/L1/M2: many tasks plus the «later» reminder in one response; business tasks without management; replay with other tasks; assignee-only.
  const mk=(title:string,leadId:string|null,assignee=user.user.email)=>db.insertInto('crmTasks').values({accountId:a.id,leadId:leadId as never,title:title+' '+stamp,typeId:'call',assignedUserEmail:assignee,dueDate:'2026-11-02' as never,priority:'media'}).returningAll().executeTakeFirstOrThrow();
  const t1=await mk('Resolver 1',String(l.id)),t2=await mk('Resolver 2',String(l.id)),t3=await mk('Resolver negocio',null);
  const multi={...response,id:randomUUID(),category:'later',resolveTaskIds:[String(t1.id),String(t2.id),String(t3.id)],reminder:{dueDate:'2026-12-01',assignedUserEmail:null}};
  const multiCreated=await call(multi,200,user.cookie);
  for(const tk of [t1,t2,t3]){assert.equal((await db.selectFrom('crmTasks').select('status').where('id','=',tk.id).executeTakeFirstOrThrow()).status,'completed');assert.equal((await db.selectFrom('crmActivities').select('id').where('taskId','=',tk.id).execute()).length,1);}
  const reminder=(await sql<{n:string}>`SELECT count(*) n FROM crm_tasks WHERE communication_response_id=${multiCreated.id}::uuid`.execute(db)).rows[0];assert.equal(Number(reminder.n),1,'the reminder is the only task using communication_response_id');
  await call(multi,200,user.cookie);
  // Spec 90: GET returns, read-only, the titles of the tasks each response completed (shown attached to the response).
  {const detail=superjson.parse<any>(await (await get(new Request('http://localhost/_api/communication?accountId='+a.id,{headers:{cookie:user.cookie}}))).text());const byId=new Map((detail.responses as any[]).map(r=>[String(r.id),r]));assert.deepEqual(byId.get(String(created.id)).resolvedTaskTitles,['Confirmar propuesta '+stamp]);assert.deepEqual(byId.get(String(multiCreated.id)).resolvedTaskTitles,[t1,t2,t3].map(tk=>tk.title));assert.equal(byId.get(String(created.id)).hasInbound,false,'a response registered by hand has no received message');
   // L5: a deleted task disappears from the titles; L1: linking a received message turns hasInbound on.
   await db.updateTable('crmTasks').set({deletedAt:new Date()}).where('id','=',t2.id).execute();
   const inboundId=randomUUID();await sql`INSERT INTO crm_inbound_messages(id,channel,external_id,account_id,match_method,from_address,text_body,received_at,status,source,response_id) VALUES(${inboundId}::uuid,'email',${'spec90-'+inboundId},${a.id},'sender_email','person@example.com','Hola',now(),'registered','email_worker',${String(created.id)}::uuid)`.execute(db);
   const after=superjson.parse<any>(await (await get(new Request('http://localhost/_api/communication?accountId='+a.id,{headers:{cookie:user.cookie}}))).text());const again=new Map((after.responses as any[]).map(r=>[String(r.id),r]));
   assert.deepEqual(again.get(String(multiCreated.id)).resolvedTaskTitles,[t1,t3].map(tk=>tk.title));assert.equal(again.get(String(created.id)).hasInbound,true);
   await db.updateTable('crmTasks').set({deletedAt:null}).where('id','=',t2.id).execute();await sql`DELETE FROM crm_inbound_messages WHERE id=${inboundId}::uuid`.execute(db);}
  await call({...multi,resolveTaskIds:[String(t1.id)]},409,user.cookie);// L1: same id, different tasks is a conflict, not a silent success
  await call({...response,id:randomUUID(),resolveTaskIds:[String(t1.id),String(t1.id)]},400,user.cookie);// L1: duplicates are rejected
  const notAssignee=await mk('Del otro',String(l.id),other.user.email);
  await call({...response,id:randomUUID(),resolveTaskIds:[String(notAssignee.id)]},403,user.cookie);// M2: the management owner who is not the assignee cannot resolve it
  assert.equal((await db.selectFrom('crmTasks').select('status').where('id','=',notAssignee.id).executeTakeFirstOrThrow()).status,'pending');
  await call({...response,id:randomUUID(),resolveTaskIds:[String(notAssignee.id)]},200,admin.cookie);// admin may
  const lead2=await db.insertInto('leads').values({accountId:a.id,nombre:a.nombre+' 2',estado:'Cargado',assignedUserEmail:user.user.email}).returningAll().executeTakeFirstOrThrow();
  const foreignLead=await mk('De otra gestión',String(lead2.id));
  await call({...response,id:randomUUID(),resolveTaskIds:[String(foreignLead.id)]},409,user.cookie);
  const general=await mk('Solo negocio general',null);
  await call({...response,id:randomUUID(),leadId:null,resolveTaskIds:[String(foreignLead.id)]},409,user.cookie);// a response without management does not resolve management tasks
  await call({...response,id:randomUUID(),leadId:null,resolveTaskIds:[String(general.id)]},200,user.cookie);
 }
 // Spec 87: a delegate can prepare/send only through their own pending task, for its management and business contacts.
 {
  const delegatedAccount=await db.insertInto('crmAccounts').values({nombre:`Zz delegated ${stamp}`,status:'reviewed',assignedUserEmail:user.user.email,telefono:'+5493442000031'}).returningAll().executeTakeFirstOrThrow();
  const delegatedLead=await db.insertInto('leads').values({accountId:delegatedAccount.id,nombre:delegatedAccount.nombre,estado:'Cargado',assignedUserEmail:user.user.email}).returningAll().executeTakeFirstOrThrow();
  const delegatedContact=await db.insertInto('crmContacts').values({accountId:delegatedAccount.id,name:'Delegated contact',phone:'+5493442000032'}).returningAll().executeTakeFirstOrThrow();
  const delegated=await db.insertInto('crmTasks').values({accountId:delegatedAccount.id,leadId:delegatedLead.id,title:'Mensaje delegado '+stamp,typeId:'message',assignedUserEmail:other.user.email,dueDate:'2026-10-29' as never,priority:'media'}).returningAll().executeTakeFirstOrThrow();
  const delegatedCall=(body:unknown,status=200)=>call(body,status,other.cookie);
  const base={action:'prepare',id:randomUUID(),leadId:String(delegatedLead.id),contactId:String(delegatedContact.id),channel:'whatsapp',templateId:w.id};
  await delegatedCall(base,403);
  const prepared=await delegatedCall({...base,id:randomUUID(),taskId:String(delegated.id)});
  assert.equal(String(prepared.delegatedTaskId),String(delegated.id));
  assert((await sql`SELECT id FROM crm_communication_journal WHERE entity_id=${prepared.id} AND action='message_prepared_by_delegation'`.execute(db)).rows.length===1,'Preparation delegation is journaled');
  const sent=await delegatedCall({action:'dispatch',id:prepared.id,revision:prepared.revision,confirm:true,taskId:String(delegated.id)});
  assert.equal(sent.message.status,'whatsapp_opened');assert(sent.url);
  const edited=await delegatedCall({action:'prepare',...base,id:randomUUID(),taskId:String(delegated.id)});
  await delegatedCall({action:'edit',id:edited.id,revision:edited.revision,taskId:String(delegated.id),subject:'',body:'<p>Mensaje revisado</p>'});
  await db.updateTable('crmTasks').set({status:'completed',completedAt:new Date()}).where('id','=',delegated.id).execute();
  await delegatedCall({action:'dispatch',id:edited.id,revision:edited.revision+1,confirm:true,taskId:String(delegated.id)},403);
  const foreign=await db.insertInto('crmAccounts').values({nombre:'Zz foreign contact '+stamp,status:'reviewed',assignedUserEmail:other.user.email}).returningAll().executeTakeFirstOrThrow();
  const foreignContact=await db.insertInto('crmContacts').values({accountId:foreign.id,name:'Foreign',phone:'+5493442000099'}).returningAll().executeTakeFirstOrThrow();
  const pending=await db.insertInto('crmTasks').values({accountId:delegatedAccount.id,leadId:delegatedLead.id,title:'Delegated mismatch '+stamp,typeId:'message',assignedUserEmail:other.user.email,dueDate:'2026-10-30' as never,priority:'media'}).returningAll().executeTakeFirstOrThrow();
  await delegatedCall({...base,id:randomUUID(),taskId:String(pending.id),contactId:String(foreignContact.id)},400);
  const blockedAccount=await db.insertInto('crmAccounts').values({nombre:`Zz delegated DNC ${stamp}`,status:'reviewed',assignedUserEmail:user.user.email,doNotContact:true}).returningAll().executeTakeFirstOrThrow();
  const blockedLead=await db.insertInto('leads').values({accountId:blockedAccount.id,nombre:blockedAccount.nombre,estado:'Cargado',assignedUserEmail:user.user.email}).returningAll().executeTakeFirstOrThrow();
  const blockedTask=await db.insertInto('crmTasks').values({accountId:blockedAccount.id,leadId:blockedLead.id,title:'Blocked delegated '+stamp,typeId:'message',assignedUserEmail:other.user.email,dueDate:'2026-10-31' as never,priority:'media'}).returningAll().executeTakeFirstOrThrow();
  await delegatedCall({...base,id:randomUUID(),leadId:String(blockedLead.id),taskId:String(blockedTask.id),contactId:null},403);

  // M1/L2/L4: admins act on delegated messages even after the task closed; the message only resolves through its own task; dispatch journals carry the delegation.
  const t2=await db.insertInto('crmTasks').values({accountId:delegatedAccount.id,leadId:delegatedLead.id,title:'Admin cases '+stamp,typeId:'message',assignedUserEmail:other.user.email,dueDate:'2026-11-03' as never,priority:'media'}).returningAll().executeTakeFirstOrThrow();
  const draftA=await delegatedCall({...base,id:randomUUID(),taskId:String(t2.id)});
  await delegatedCall({action:'cancel_draft',id:draftA.id,revision:draftA.revision},403);// the delegate must pass the task
  await call({action:'cancel_draft',id:draftA.id,revision:draftA.revision},200,admin.cookie);
  assert.equal((await message(draftA.id)).status,'cancelled');
  const draftB=await delegatedCall({...base,id:randomUUID(),taskId:String(t2.id)});
  const openedB=await delegatedCall({action:'dispatch',id:draftB.id,revision:draftB.revision,confirm:true,taskId:String(t2.id)});assert.equal(openedB.message.status,'whatsapp_opened');
  const opened=(await sql<{after:{delegatedTaskId?:string}}>`SELECT after_value AS after FROM crm_communication_journal WHERE entity_id=${draftB.id} AND action='whatsapp_opened_unconfirmed'`.execute(db)).rows;assert.equal(String(opened[0].after.delegatedTaskId),String(t2.id),'L4: dispatch journal names the delegated task');
  const prepJournal=(await sql<{after:{managementOwner:string}}>`SELECT after_value AS after FROM crm_communication_journal WHERE entity_id=${draftB.id} AND action='message_prepared_by_delegation'`.execute(db)).rows;assert.equal(prepJournal[0].after.managementOwner,user.user.email,'L4: owner journaled at prepare time');
  await db.updateTable('crmTasks').set({status:'completed',completedAt:new Date()}).where('id','=',t2.id).execute();
  await delegatedCall({action:'outcome',id:draftB.id,taskId:String(t2.id),event:'manual_sent',notes:'x'},403);// the delegate cannot use a closed task
  // Spec 100 §9: a WhatsApp opened just now waits 5 minutes for the user script; age it (and the outcome cutoff) to read it as asking.
  const delegatedSince=await backOutcomeCutoff();
  try{
  const delegatedPending=()=>pendingContactFollowUps(db,{ownerEmail:admin.user.email,isAdmin:true,accountId:String(delegatedAccount.id),leadId:String(delegatedLead.id)});
  assert(!(await delegatedPending()).unconfirmed.items.some(p=>String(p.id)===String(draftB.id)),'Spec 100 §9: a fresh WhatsApp open is not asked yet');
  await sql`UPDATE crm_messages SET last_interaction_at=now()-interval '10 minutes' WHERE id=${draftB.id}::uuid`.execute(db);
  const adminPending=await delegatedPending();
  assert(adminPending.unconfirmed.items.some(p=>String(p.id)===String(draftB.id)),'M1: the admin sees the delegated unconfirmed WhatsApp among «Envíos sin confirmar»');
  assert(!adminPending.outcomes.items.some(p=>String(p.id)===String(draftB.id)),'Spec 99 §3.6: an unconfirmed send is never in «Anotá cómo salió»');
  assert.equal(adminPending.unconfirmed.count,adminPending.unconfirmed.items.length,'Spec 99 §3.6: the count comes with the list');
  assert.equal(adminPending.unconfirmed.items.find(p=>String(p.id)===String(draftB.id))?.delegatedTaskId,String(t2.id),'Spec 100 §6: the item names its delegated task');
  await call({action:'outcome',id:draftB.id,event:'manual_sent',notes:'Confirmado por admin'},200,admin.cookie);
  assert.equal((await message(draftB.id)).status,'manual_sent');
  // Spec 100 §8: answering «¿Lo enviaste?» again on a confirmed send is a conflict the client shows as information.
  for(const event of ['manual_sent','manual_not_sent'])assert.equal((await call({action:'outcome',id:draftB.id,event,notes:''},409,admin.cookie)).error,'Este envío ya estaba confirmado.');
  const confirmedPending=await delegatedPending(),delegatedOutcome=confirmedPending.outcomes.items.find(p=>String(p.id)===String(draftB.id));
  assert.equal(delegatedOutcome?.delegatedTaskId,String(t2.id),'The confirmed delegated send asks how it went in its own task group');
  assert.equal(confirmedPending.outcomes.groupCount,new Set(confirmedPending.outcomes.items.map(p=>p.accountId+'|'+(p.leadId??'')+'|'+(p.delegatedTaskId??''))).size,'groupCount counts business, management and delegated task groups');
  }finally{await restoreOutcomeCutoff(delegatedSince);}
  // L2: a delegated message is not resolved from another task
  const t3=await db.insertInto('crmTasks').values({accountId:delegatedAccount.id,leadId:delegatedLead.id,title:'Other task '+stamp,typeId:'message',assignedUserEmail:other.user.email,dueDate:'2026-11-04' as never,priority:'media'}).returningAll().executeTakeFirstOrThrow();
  const t4=await db.insertInto('crmTasks').values({accountId:delegatedAccount.id,leadId:delegatedLead.id,title:'Own task '+stamp,typeId:'message',assignedUserEmail:other.user.email,dueDate:'2026-11-05' as never,priority:'media'}).returningAll().executeTakeFirstOrThrow();
  const draftC=await delegatedCall({...base,id:randomUUID(),taskId:String(t4.id)});await delegatedCall({action:'dispatch',id:draftC.id,revision:draftC.revision,confirm:true,taskId:String(t4.id)});
  for(const actor of [other.user,admin.user]){
   const attempt=db.transaction().execute(async trx=>{await setWorkActor(trx,actor as never);return resolveMessageForWork(trx,actor as never,{messageId:draftC.id,sent:true,result:null,accountId:String(delegatedAccount.id),leadId:String(delegatedLead.id),taskId:String(t3.id)});});
   await assert.rejects(attempt,/tarea delegada/,'L2: completing another task cannot resolve the delegated message');
  }
  assert.equal((await message(draftC.id)).status,'whatsapp_opened');
 }
 await db.updateTable('leads').set({contactName:'Nombre histórico'}).where('id','=',l.id).execute();
 const withoutPerson=await call({action:'prepare',id:randomUUID(),leadId:l.id,contactId:null,channel:'whatsapp',templateId:scoped.id},200,user.cookie);assert.equal(withoutPerson.recipientName,'');assert.equal(withoutPerson.recipient,a.telefono);assert(withoutPerson.body.includes('Hola'));assert(!withoutPerson.body.includes('Persona real'));assert(!withoutPerson.body.includes('Nombre histórico'));await db.updateTable('leads').set({contactName:null}).where('id','=',l.id).execute();
 await db.updateTable('leads').set({tipo:'Alojamiento'}).where('id','=',l.id).execute();await call({action:'prepare',id:randomUUID(),leadId:l.id,contactId:null,channel:'whatsapp',templateId:scoped.id},400,user.cookie);
 await db.updateTable('leads').set({tipo:null,commercialProfile:'Otro perfil'}).where('id','=',l.id).execute();await call({action:'prepare',id:randomUUID(),leadId:l.id,contactId:null,channel:'whatsapp',templateId:scoped.id},400,user.cookie);
 await db.updateTable('leads').set({commercialProfile:'Referente'}).where('id','=',l.id).execute();
 const savedReferente=await saveSettings(request({action:'saveTemplate',channel:'whatsapp',name:'Referente WhatsApp '+stamp,body:'<p>Hola {{name}}</p>',vertical:'Gastronomía',commercialProfile:'Referente'}));
 assert.equal(savedReferente.status,200,'Admin can save a Referente WhatsApp model');
 const referente=await db.selectFrom('messageTemplates').selectAll().where('name','=','Referente WhatsApp '+stamp).executeTakeFirstOrThrow();
 const referenteDraft=await call({action:'prepare',id:randomUUID(),leadId:l.id,contactId:null,channel:'whatsapp',templateId:referente.id},200,user.cookie);
 assert.equal(referenteDraft.status,'draft');assert.equal(referenteDraft.templateSnapshot.commercialProfile,'Referente');
 await db.updateTable('leads').set({commercialProfile:null}).where('id','=',l.id).execute();console.log('Optional recipients, Referente WhatsApp and explicit segmentation passed');
 await call({action:'prepare',id:randomUUID(),leadId:l.id,contactId:c.id,channel:'email',templateId:t.id},403,other.cookie);
 const id=randomUUID();let m=await call({action:'prepare',id,leadId:l.id,contactId:c.id,channel:'email',templateId:t.id},200,user.cookie);assert(m.body.includes('Persona real'));assert(m.templateSnapshot.version,JSON.stringify(m.templateSnapshot));assert.equal(m.templateSnapshot.purpose,'first_contact');assert.equal(typeof m.templateSnapshot.variantPicks,'object');assert.ok(m.templateSnapshot.variantPicks.saludo,'variant picks are recorded in the snapshot');assert.equal((await call({action:'prepare',id:randomUUID(),leadId:l.id,contactId:c.id,channel:'email',templateId:t.id},200,user.cookie)).id,m.id,'same variation reuses the draft');const rerolled=await call({action:'prepare',id:randomUUID(),leadId:l.id,contactId:c.id,channel:'email',templateId:t.id,variation:1},200,user.cookie);assert.notEqual(rerolled.id,m.id,'Otra redacción must not reuse the draft of another variation');assert.equal(rerolled.templateSnapshot.variation,1);assert.equal((await call({action:'prepare',id,leadId:l.id,contactId:c.id,channel:'email',templateId:t.id},200,user.cookie)).id,id);
 // Spec 96 §2.4: prepare stores the final email exactly as `edit` produces it, so the composer opens on the final view.
 assert.ok(m.htmlBody?.includes('Persona real')&&m.textBody?.includes('Persona real'),'prepare stores the final html and text');{const fresh=await call({action:'prepare',id:randomUUID(),leadId:l.id,contactId:c.id,channel:'email',templateId:t.id,variation:7},200,user.cookie);const asEdited=await call({action:'edit',id:fresh.id,revision:fresh.revision,subject:fresh.subject,body:fresh.body},200,user.cookie);assert.equal(asEdited.htmlBody,fresh.htmlBody,'prepare renders the html edit would');assert.equal(asEdited.textBody,fresh.textBody,'prepare renders the text edit would');}
 {const blank=await call({action:'prepare',id:randomUUID(),leadId:l.id,contactId:c.id,channel:'email',templateId:null,variation:7},200,user.cookie);assert.equal(blank.htmlBody,null,'a blank message still needs an edit');assert.equal(blank.textBody,null);await call({action:'dispatch',id:blank.id,revision:blank.revision,confirm:true},409,user.cookie);}
 await db.updateTable('messageTemplates').set({body:'<p>Otro contenido</p>'}).where('id','=',t.id).execute();assert((await message(id)).body.includes('Persona real'));
 await call({action:'edit',id,revision:99,subject:'Final',body:'<p>Final</p>'},409,user.cookie);
 m=await call({action:'edit',id,revision:m.revision,subject:'Asunto final',body:'<p>Final real <strong>Texto</strong><script>alert(1)</script></p>'},200,user.cookie);assert(!m.htmlBody.includes('<script'));assert(m.htmlBody.includes('Final real'));assert.equal(m.subject,'Asunto final');
 process.env.BREVO_API_KEY='fixture-never-network';await db.insertInto('appSettings').values({key:'brevo_sender_email',value:'sender@example.com'}).onConflict(oc=>oc.column('key').doUpdateSet({value:'sender@example.com'})).execute();
 let sends=0;globalThis.fetch=async (url,init)=>{assert.equal(String(url),'https://api.brevo.com/v3/smtp/email');sends++;const payload=JSON.parse(String(init?.body));assert.equal(payload.htmlContent,m.htmlBody);assert.equal(payload.to[0].name,'Persona real');return new Response(JSON.stringify({messageId:'<fixture-'+id+'@brevo.test>'}),{status:201})};
 await Promise.all([call({action:'dispatch',id,revision:m.revision,confirm:true},200,user.cookie),call({action:'dispatch',id,revision:m.revision,confirm:true},200,user.cookie)]).catch(e=>{if(!String(e).includes('409'))throw e});assert.equal(sends,1);assert.equal((await message(id)).status,'accepted');await call({action:'dispatch',id,revision:m.revision,confirm:true},200,user.cookie);assert.equal(sends,1);
 const originalInteraction=(await message(id)).lastInteractionAt!.getTime();assert.equal((await message(id)).lastActorEmail,user.user.email);
 process.env.BREVO_WEBHOOK_TOKEN='fixture-webhook-token-at-least-32-characters';const at=Math.floor(Date.now()/1000)-20;const event=(event:string,ts_event:number)=>({event,email:'person@example.com','message-id':'fixture-'+id+'@brevo.test',ts_event,id:123});const eventRequest=(body:unknown,auth='Bearer '+process.env.BREVO_WEBHOOK_TOKEN)=>new Request('http://localhost/_api/brevo/events',{method:'POST',headers:{Authorization:auth},body:JSON.stringify(body)});
 assert.equal((await webhook(eventRequest(event('delivered',at),'bad'))).status,401);assert.equal((await webhook(eventRequest(event('delivered',at)))).status,200);assert.equal((await message(id)).status,'delivery_confirmed');assert.equal((await message(id)).lastInteractionAt!.getTime(),originalInteraction,'Delivery events do not invent a new contact date');
 await webhook(eventRequest([event('request',at-10),event('opened',at+2),event('delivered',at)]));assert.equal((await message(id)).status,'delivery_confirmed');assert.equal(Number((await sql<{n:string}>`SELECT count(*) n FROM crm_email_events WHERE message_id=${'fixture-'+id+'@brevo.test'}`.execute(db)).rows[0].n),3);
 await webhook(eventRequest(event('hard_bounce',at+3)));assert.equal((await message(id)).status,'failed');await webhook(eventRequest(event('delivered',at-1)));assert.equal((await message(id)).status,'failed');await call({action:'outcome',id,event:'replied',notes:'Respondió por teléfono'},200,user.cookie);await webhook(eventRequest(event('opened',at+4)));assert.equal((await message(id)).status,'replied');
 // A restriction added after draft creation prevents both editing and dispatch; admin cannot bypass.
 let wm=await call({action:'prepare',id:randomUUID(),leadId:l.id,contactId:c.id,channel:'whatsapp',templateId:w.id},200,user.cookie);assert(wm.body.includes('*Hola Persona real*'));await call({action:'restrict',accountId:String(a.id),leadId:null,contactId:c.id,channel:'whatsapp',reason:'Falla técnica permanente confirmada'},200);await call({action:'edit',id:wm.id,revision:1,subject:'',body:wm.body},403,user.cookie);const restriction=(await sql<{id:string}>`SELECT id FROM crm_contact_restrictions WHERE account_id=${a.id} AND lifted_at IS NULL`.execute(db)).rows[0];await call({action:'lift',id:restriction.id,reason:'Autorización nueva'},403,user.cookie);await call({action:'lift',id:restriction.id,reason:'Autorización nueva'});
 const empty=await call({action:'prepare',id:randomUUID(),leadId:l.id,contactId:null,channel:'email',templateId:t.id},200,user.cookie);assert.equal(empty.recipientName,'');
 // Sequence start retry is idempotent. Pause cancels only its tasks; resume restores pending steps.
 // Simulate network uncertainty and a post-acceptance DB failure. Neither permits a retry.
 let uncertain=await call({action:'prepare',id:randomUUID(),leadId:l.id,contactId:c.id,channel:'email',templateId:t.id},200,user.cookie);uncertain=await call({action:'edit',id:uncertain.id,revision:1,subject:'Prueba',body:'<p>Solo fixture</p>'},200,user.cookie);globalThis.fetch=async()=>{sends++;throw new Error('Network ambiguous')};await call({action:'dispatch',id:uncertain.id,revision:uncertain.revision,confirm:true},409,user.cookie);await call({action:'dispatch',id:uncertain.id,revision:uncertain.revision,confirm:true},409,user.cookie);assert.equal(sends,2);
 let accepted=await call({action:'prepare',id:randomUUID(),leadId:l.id,contactId:c.id,channel:'email',templateId:t.id},200,user.cookie);accepted=await call({action:'edit',id:accepted.id,revision:1,subject:'Prueba',body:'<p>Solo fixture</p>'},200,user.cookie);
 await sql`CREATE FUNCTION communication_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.status='accepted' THEN RAISE EXCEPTION 'Injected post acceptance failure'; END IF; RETURN NEW; END $$`.execute(db);await sql`CREATE TRIGGER communication_fail BEFORE UPDATE ON email_outbox FOR EACH ROW EXECUTE FUNCTION communication_fail()`.execute(db);globalThis.fetch=async()=>{sends++;return new Response(JSON.stringify({messageId:'accepted-but-not-persisted-'+stamp}),{status:201})};await call({action:'dispatch',id:accepted.id,revision:accepted.revision,confirm:true},409,user.cookie);await sql`DROP TRIGGER communication_fail ON email_outbox; DROP FUNCTION communication_fail()`.execute(db);await call({action:'dispatch',id:accepted.id,revision:accepted.revision,confirm:true},409,user.cookie);assert.equal(sends,3);
 const early={event:'delivered',email:'person@example.com','message-id':'accepted-but-not-persisted-'+stamp,ts_event:at,tags:['hospeda-'+accepted.id]};assert.equal((await webhook(eventRequest(early))).status,200);assert.equal((await message(accepted.id)).status,'delivery_confirmed');
 // Spec 96 §2.4: an untouched prepared email is sent as prepared, without an edit.
 {const untouched=await call({action:'prepare',id:randomUUID(),leadId:l.id,contactId:c.id,channel:'email',templateId:t.id,variation:8},200,user.cookie);let calls=0,payload:any=null;globalThis.fetch=async(_url,init)=>{calls++;payload=JSON.parse(String(init?.body));return new Response(JSON.stringify({messageId:'<untouched-'+stamp+'@brevo.test>'}),{status:201})};await call({action:'dispatch',id:untouched.id,revision:untouched.revision,confirm:true},200,user.cookie);assert.equal(calls,1);assert.equal(payload.htmlContent,untouched.htmlBody,'the prepared html is what Brevo receives');assert.equal(payload.textContent,untouched.textBody);assert.equal((await message(untouched.id)).status,'accepted');}
 // Provider callbacks/manual outcomes may arrive before the HTTP acceptance response.
 let racing=await call({action:'prepare',id:randomUUID(),leadId:l.id,contactId:c.id,channel:'email',templateId:t.id},200,user.cookie);racing=await call({action:'edit',id:racing.id,revision:1,subject:'Race fixture',body:'<p>Race fixture</p>'},200,user.cookie);
 globalThis.fetch=async()=>{await call({action:'outcome',id:racing.id,event:'replied',notes:'Respuesta manual mientras Brevo responde'},200,user.cookie);return new Response(JSON.stringify({messageId:'racing-acceptance-'+stamp}),{status:201})};const raced=await call({action:'dispatch',id:racing.id,revision:racing.revision,confirm:true},200,user.cookie);assert.equal(raced.message.status,'replied');const racingActivity=await db.selectFrom('crmActivities').selectAll().where('id','=',raced.message.activityId).executeTakeFirstOrThrow();assert.equal(racingActivity.result,'Respuesta registrada manualmente');assert.equal((await db.selectFrom('crmActivities').select('id').where('notes','=',racingActivity.notes).where('accountId','=',a.id).execute()).length,1);
 let earlyMessage=await call({action:'prepare',id:randomUUID(),leadId:l.id,contactId:c.id,channel:'email',templateId:t.id},200,user.cookie);earlyMessage=await call({action:'edit',id:earlyMessage.id,revision:1,subject:'Early callback',body:'<p>Early callback fixture</p>'},200,user.cookie);
 let earlyActivityId:string|null=null;globalThis.fetch=async()=>{assert.equal((await webhook(eventRequest({event:'delivered',email:'person@example.com','message-id':'early-callback-'+stamp,ts_event:at,tags:['hospeda-'+earlyMessage.id]}))).status,200);earlyActivityId=(await message(earlyMessage.id)).activityId;return new Response(JSON.stringify({messageId:'early-callback-'+stamp}),{status:201})};const earlyResult=await call({action:'dispatch',id:earlyMessage.id,revision:earlyMessage.revision,confirm:true},200,user.cookie);assert.equal(earlyResult.message.status,'delivery_confirmed');assert.equal(earlyResult.message.activityId,earlyActivityId,'Early callback and acceptance reuse one activity');
 // Documents are persisted as immutable version bytes in the DB, access controlled and reused by reference.
 const contextualId=randomUUID();await resource({action:'create',id:contextualId,title:'Documento del negocio',type:'propuesta',accountId:a.id,leadId:l.id,activityId:null,library:false,categoryId:null,version:{url:'https://example.com/contexto.pdf'}},403,user.cookie);await resource({action:'create',id:contextualId,title:'Documento del negocio',type:'propuesta',accountId:a.id,leadId:l.id,activityId:null,library:false,categoryId:null,version:{url:'https://example.com/contexto.pdf'}});await resource({action:'version',id:contextualId,revision:1,version:{url:'https://example.com/contexto-v2.pdf'}},403,user.cookie);await resource({action:'version',id:contextualId,revision:1,version:{url:'https://example.com/contexto-v2.pdf'}});
 const did=randomUUID();const content=Buffer.from('%PDF-1.4\nfixture document\n%%EOF');const create={action:'create',id:did,title:'Documento fixture',type:'propuesta',accountId:a.id,leadId:l.id,activityId:null,library:false,categoryId:null,version:{fileData:content.toString('base64'),fileName:'fixture.pdf',mimeType:'application/pdf'}};
 await resource(create,403,user.cookie);await resource(create);await resource(create);await sql`UPDATE crm_documents SET owner_email=${user.user.email} WHERE id=${did}::uuid`.execute(db);let versions=(await sql<{id:string;version:number}>`SELECT id,version FROM crm_document_versions WHERE document_id=${did}::uuid`.execute(db)).rows;assert.equal(versions.length,1);// Spec 89 retired the library: a business document is readable by whoever reads the business, approved or not.
 let dr=await download(new Request('http://localhost/_api/resources/download?versionId='+versions[0].id,{headers:{cookie:other.cookie}}));assert.equal(dr.status,200);await resource({action:'status',id:did,status:'approved',revision:1},403,user.cookie);await resource({action:'status',id:did,status:'approved',revision:1});
 dr=await download(new Request('http://localhost/_api/resources/download?versionId='+versions[0].id,{headers:{cookie:other.cookie}}));assert.equal(dr.status,200);assert.deepEqual(Buffer.from(await dr.arrayBuffer()),content);assert.match(dr.headers.get('Content-Disposition')!,/^attachment/);
 await resource({action:'version',id:did,revision:1,version:{url:'https://example.com/v2.pdf'}},403,user.cookie);await resource({action:'delete',id:did,revision:1},403,user.cookie);await resource({action:'status',id:did,status:'archived',revision:1},403,user.cookie);await resource({action:'version',id:did,revision:1,version:{url:'https://example.com/v2.pdf'}});await resource({action:'version',id:did,revision:1,version:{url:'https://example.com/stale.pdf'}},409);await resource({action:'status',id:did,status:'approved',revision:2});assert.equal((await resource({action:'link',id:did,accountId:a.id,leadId:l.id,activityId:null},400,user.cookie)).error,'La biblioteca fue reemplazada por Material de venta.');assert.equal((await resource({...create,id:randomUUID(),library:true,accountId:null,leadId:null},400)).error,'La biblioteca fue reemplazada por Material de venta.');
 await resource({...create,id:randomUUID(),version:{url:'javascript:alert(1)'}},400);await resource({...create,id:randomUUID(),version:{fileData:Buffer.from('not pdf').toString('base64'),fileName:'bad.pdf',mimeType:'application/pdf'}},400);await resource({...create,id:randomUUID(),version:{fileData:Buffer.alloc(2097153).toString('base64'),fileName:'big.pdf',mimeType:'application/pdf'}},400);
 // Contextual material reading and linking preserve independent management owners.
 const materialAccount=await db.insertInto('crmAccounts').values({nombre:'Material context '+stamp,assignedUserEmail:user.user.email}).returningAll().executeTakeFirstOrThrow();
 const materialLead=await db.insertInto('leads').values({accountId:materialAccount.id,nombre:materialAccount.nombre,opportunityName:'Propuesta propia',assignedUserEmail:user.user.email}).returningAll().executeTakeFirstOrThrow();
 const colleagueLead=await db.insertInto('leads').values({accountId:materialAccount.id,nombre:materialAccount.nombre,opportunityName:'Propuesta del colega',assignedUserEmail:other.user.email}).returningAll().executeTakeFirstOrThrow();
 const materialActivity=await db.insertInto('crmActivities').values({accountId:materialAccount.id,leadId:materialLead.id,title:'Reunión de propuesta',typeId:'call',occurredAt:new Date(),actorEmail:user.user.email}).returningAll().executeTakeFirstOrThrow();
 const ownMaterial=randomUUID(),colleagueMaterial=randomUUID(),generalMaterial=randomUUID();
 // Links made before spec 89 retired the library stay readable in their business context: seed them as legacy rows.
 for(const materialId of [ownMaterial,colleagueMaterial]){await sql`INSERT INTO crm_documents(id,title,type,owner_email,library,status) VALUES(${materialId}::uuid,${'Material contextual '+materialId},'propuesta',${admin.user.email},true,'approved')`.execute(db);await sql`INSERT INTO crm_document_versions(id,document_id,version,url,actor_email,approved_at) VALUES(${randomUUID()}::uuid,${materialId}::uuid,1,'https://example.com/legacy.pdf',${admin.user.email},now())`.execute(db);}
 const legacyLink=(materialId:string,leadId:string,activityId:string|null,actor:string)=>sql`INSERT INTO crm_document_links(document_id,account_id,original_account_id,lead_id,activity_id,actor_email) VALUES(${materialId}::uuid,${materialAccount.id}::bigint,${materialAccount.id}::bigint,${leadId}::bigint,${activityId}::bigint,${actor})`.execute(db);
 await resource({...create,id:generalMaterial,library:false,accountId:materialAccount.id,leadId:null,title:'Documento general del negocio'});
 await legacyLink(ownMaterial,materialLead.id,materialActivity.id,user.user.email);
 await resource({action:'link',id:colleagueMaterial,accountId:materialAccount.id,leadId:colleagueLead.id,activityId:null},400,other.cookie);
 await legacyLink(colleagueMaterial,colleagueLead.id,null,other.user.email);
 const contextRead=async(accountId:string|null,leadId:string|null,cookie=user.cookie,status=200)=>{const params=new URLSearchParams({...(accountId?{accountId}:{}),...(leadId?{leadId}:{})});const response=await resourcesGet(new Request('http://localhost/_api/resources?'+params,{headers:{cookie}}));const value=superjson.parse<any>(await response.text());assert.equal(response.status,status,value.error);return value;};
 assert.equal((await contextRead(null,null)).documents.length,0,'The retired library is no longer listed without a business');
 const ownResources=await contextRead(materialAccount.id,materialLead.id);assert.deepEqual(ownResources.documents.map((d:any)=>d.id),[ownMaterial]);assert.equal(ownResources.documents[0].links[0].leadName,'Propuesta propia');assert.equal(ownResources.documents[0].links[0].activityTitle,'Reunión de propuesta');
 assert.deepEqual((await contextRead(materialAccount.id,colleagueLead.id)).documents.map((d:any)=>d.id),[colleagueMaterial],'Shared reading does not grant linking permissions');
 assert.equal((await contextRead(materialAccount.id,null)).documents.length,3,'Business reading retains all contexts including general documents');
 await contextRead(a.id,materialLead.id,user.cookie,400);await contextRead(null,materialLead.id,user.cookie,400);
 await db.updateTable('leads').set({deletedAt:new Date()}).where('id','=',colleagueLead.id).execute();
 assert.equal((await contextRead(materialAccount.id,null)).documents.length,2,'Deleted management links do not expose material in active business context');
 await contextRead(materialAccount.id,colleagueLead.id,user.cookie,403);assert.equal((await contextRead(materialAccount.id,colleagueLead.id,admin.cookie)).documents.length,1);
 console.log('Contextual materials: management isolation, general business documents, link labels, independent owners, shared reading, invalid contexts and deleted management permissions passed');
 // General business communication exists without requiring a management; DNC corrections are audited and lift only that block.
 const generalAccount=await db.insertInto('crmAccounts').values({nombre:'General communication '+stamp,email:'general-'+stamp+'@example.com',assignedUserEmail:user.user.email}).returningAll().executeTakeFirstOrThrow();
 await db.updateTable('crmAccounts').set({status:'reviewed'}).where('id','=',generalAccount.id).execute();
 const generalMessage=await call({action:'prepare_general',id:randomUUID(),accountId:String(generalAccount.id),leadId:null,contactId:null,channel:'email',purpose:'first_contact',otherPurpose:null,templateId:null},200,user.cookie);assert.equal(generalMessage.leadId,null);assert.equal(generalMessage.purpose,'first_contact');
 // U-35 + D3: a No contactar response cancels the business's "Volver a contactar" task and, per D3, every other pending task of the business.
 await db.updateTable('crmAccounts').set({status:'recontact',recontactAt:'2027-06-10' as never}).where('id','=',generalAccount.id).execute();
 const recontactTask=await db.insertInto('crmTasks').values({accountId:generalAccount.id,leadId:null,title:'Volver a contactar',typeId:'followup',purpose:'reactivation',assignedUserEmail:user.user.email,dueDate:'2027-06-10' as never,priority:'media'}).returning('id').executeTakeFirstOrThrow();
 const unrelatedTask=await db.insertInto('crmTasks').values({accountId:generalAccount.id,leadId:null,title:'Otra tarea',typeId:'followup',assignedUserEmail:user.user.email,dueDate:'2027-06-10' as never,priority:'media'}).returning('id').executeTakeFirstOrThrow();
 const responseId=randomUUID();await call({action:'response_create',id:responseId,accountId:String(generalAccount.id),leadId:null,contactId:null,channel:'call',recipient:generalAccount.email,recipientName:generalAccount.nombre,destination:null,linkedMessageId:null,category:'do_not_contact',summary:'Solicitó que no la contactemos',exactText:null,otherDetail:null,confirmDoNotContact:true,closeLeadIds:[]},200,user.cookie);
 assert.equal((await db.selectFrom('crmAccounts').select('doNotContact').where('id','=',generalAccount.id).executeTakeFirstOrThrow()).doNotContact,true);
 {const t=await db.selectFrom('crmTasks').select(['id','status','result']).where('accountId','=',generalAccount.id).execute();
  const own=t.find(x=>String(x.id)===String(recontactTask.id))!;assert.equal(own.status,'cancelled');assert.match(String(own.result),/No contactar/);
  assert.equal(t.find(x=>String(x.id)===String(unrelatedTask.id))!.status,'cancelled','D3: unrelated pending tasks of the business are cancelled too');}
 // Replay: retrying the same save after a lost answer returns the same response and changes nothing; the same id for another category, user or business is refused without revealing it.
 {const body={action:'response_create',id:responseId,accountId:String(generalAccount.id),leadId:null,contactId:null,channel:'call',recipient:generalAccount.email,recipientName:generalAccount.nombre,destination:null,linkedMessageId:null,category:'do_not_contact',summary:'Solicitó que no la contactemos',exactText:null,otherDetail:null,confirmDoNotContact:true,closeLeadIds:[]};
  const again=await call(body,200,user.cookie);assert.equal(String(again.id),responseId);
  const count=async(action:string)=>Number((await sql<{n:string}>`SELECT count(*) AS n FROM crm_communication_journal WHERE account_id=${generalAccount.id} AND action=${action}`.execute(db)).rows[0].n);
  assert.equal(Number((await sql<{n:string}>`SELECT count(*) AS n FROM crm_communication_responses WHERE id=${responseId}::uuid`.execute(db)).rows[0].n),1);
  assert.equal(await count('response_registered'),1);assert.equal(await count('do_not_contact_activated'),1);
  const refused=async(change:Record<string,unknown>,cookie:string)=>{const r=await post(request({...body,...change},cookie));const text=await r.text();assert([403,409].includes(r.status),'same id for something else is refused, got '+r.status);assert(!text.includes('Solicitó'),'nothing leaks');};
  await refused({category:'interested'},user.cookie);await refused({},other.cookie);await refused({accountId:String(a.id)},user.cookie);
  assert.equal(await count('response_registered'),1);}
 // Decision 1C: the seller who recorded the block cannot lift it by correcting the response; an admin does.
 await call({action:'response_correct',id:responseId,category:'interested',summary:'La respuesta se había clasificado por error',exactText:null,otherDetail:null,reason:'Revisión con la persona responsable',confirmLiftDoNotContact:true,closeLeadIds:[]},403,user.cookie);
 assert.equal((await db.selectFrom('crmAccounts').select('doNotContact').where('id','=',generalAccount.id).executeTakeFirstOrThrow()).doNotContact,true,'a rejected lift leaves the block');
 await call({action:'response_correct',id:responseId,category:'interested',summary:'La respuesta se había clasificado por error',exactText:null,otherDetail:null,reason:'Revisión con la persona responsable',confirmLiftDoNotContact:true,closeLeadIds:[]},200,admin.cookie);
 assert.equal((await db.selectFrom('crmAccounts').select(['doNotContact','status']).where('id','=',generalAccount.id).executeTakeFirstOrThrow()).doNotContact,false);
 // U-35: correcting a response to No contactar cancels the "Volver a contactar" task (and, per D3, the other pending tasks).
 {await db.updateTable('crmAccounts').set({status:'recontact',recontactAt:'2027-06-20' as never}).where('id','=',generalAccount.id).execute();
  const own=await db.insertInto('crmTasks').values({accountId:generalAccount.id,leadId:null,title:'Volver a contactar',typeId:'followup',purpose:'reactivation',assignedUserEmail:user.user.email,dueDate:'2027-06-20' as never,priority:'media'}).returning('id').executeTakeFirstOrThrow();
  const bystander=await db.insertInto('crmTasks').values({accountId:generalAccount.id,leadId:null,title:'Otra tarea',typeId:'followup',assignedUserEmail:user.user.email,dueDate:'2027-06-20' as never,priority:'media'}).returning('id').executeTakeFirstOrThrow();
  await call({action:'response_correct',id:responseId,category:'do_not_contact',summary:'Pidió que no la contactemos',exactText:null,otherDetail:null,reason:'Se había clasificado mal',confirmDoNotContact:true,closeLeadIds:[]},200,user.cookie);
  const rows=await db.selectFrom('crmTasks').select(['id','status','result']).where('id','in',[own.id,bystander.id]).execute();
  const mine=rows.find(r=>String(r.id)===String(own.id))!;assert.equal(mine.status,'cancelled','response_correct to No contactar cancels the recontact task');assert.match(String(mine.result),/No contactar/);
  assert.equal(rows.find(r=>String(r.id)===String(bystander.id))!.status,'cancelled','D3: every pending task of the business is cancelled');
  await call({action:'response_correct',id:responseId,category:'interested',summary:'La respuesta se había clasificado por error',exactText:null,otherDetail:null,reason:'Revisión con la persona responsable',confirmLiftDoNotContact:true,closeLeadIds:[]},200,admin.cookie);}
 // U-35: closing the last management of an ALREADY No contactar business archives it and cancels the recontact task.
 {const acc=await db.insertInto('crmAccounts').values({nombre:'DNC ya marcado '+stamp,email:'dnc-ya-'+stamp+'@example.com',assignedUserEmail:user.user.email}).returningAll().executeTakeFirstOrThrow();
  await db.updateTable('crmAccounts').set({status:'reviewed'}).where('id','=',acc.id).execute();
  const lead=await db.insertInto('leads').values({accountId:acc.id,nombre:acc.nombre,opportunityName:'Gestión abierta',managementType:'main',estado:'main:contact',assignedUserEmail:user.user.email} as never).returningAll().executeTakeFirstOrThrow();
  await db.updateTable('crmAccounts').set({doNotContact:true,status:'recontact',recontactAt:'2027-06-25' as never}).where('id','=',acc.id).execute();
  const t=await db.insertInto('crmTasks').values({accountId:acc.id,leadId:null,title:'Volver a contactar',typeId:'followup',purpose:'reactivation',assignedUserEmail:user.user.email,dueDate:'2027-06-25' as never,priority:'media'}).returning('id').executeTakeFirstOrThrow();
  const bystander=await db.insertInto('crmAccounts').values({nombre:'Zz D3 ajeno '+stamp}).returningAll().executeTakeFirstOrThrow();
  const fx=await seedDncTasks({accountId:acc.id,leadId:null,email:user.user.email,otherAccountId:bystander.id});
  await call({action:'response_create',id:randomUUID(),accountId:String(acc.id),leadId:null,contactId:null,channel:'call',recipient:acc.email,recipientName:acc.nombre,destination:null,linkedMessageId:null,category:'do_not_contact',summary:'Insistió en que no la contactemos',exactText:null,otherDetail:null,confirmDoNotContact:true,closeLeadIds:[String(lead.id)]},200,user.cookie);
  const after=await db.selectFrom('crmAccounts').select(['archivedAt']).where('id','=',acc.id).executeTakeFirstOrThrow();assert(after.archivedAt,'the business was archived by the close');
  const task=await db.selectFrom('crmTasks').select(['status','result']).where('id','=',t.id).executeTakeFirstOrThrow();assert.equal(task.status,'cancelled','archiving an already No contactar business cancels the recontact task');assert.match(String(task.result),/No contactar/);
  await assertDncCancelled(fx,user.user.email,'closeForDoNotContact on an already No contactar business');}
 // D3: response_create DNC and response_correct TO do_not_contact cancel every pending task of the business, in the same transaction and as the acting user.
 {const mk=async(name:string)=>{const acc=await db.insertInto('crmAccounts').values({nombre:name+' '+stamp,email:`${name.replace(/\W/g,'').toLowerCase()}-${stamp}@example.com`,assignedUserEmail:user.user.email}).returningAll().executeTakeFirstOrThrow();
   await db.updateTable('crmAccounts').set({status:'reviewed'}).where('id','=',acc.id).execute();
   const lead=await db.insertInto('leads').values({accountId:acc.id,nombre:acc.nombre,opportunityName:'Gestión D3',managementType:'main',estado:'main:contact',assignedUserEmail:user.user.email} as never).returningAll().executeTakeFirstOrThrow();
   const bystander=await db.insertInto('crmAccounts').values({nombre:name+' ajeno '+stamp}).returningAll().executeTakeFirstOrThrow();
   return {acc,lead,fx:await seedDncTasks({accountId:acc.id,leadId:lead.id,email:user.user.email,otherAccountId:bystander.id})};};
  const body=(acc:{id:string|number;email:string|null;nombre:string},category:string,extra:Record<string,unknown>={})=>({action:'response_create',id:randomUUID(),accountId:String(acc.id),leadId:null,contactId:null,channel:'call',recipient:acc.email,recipientName:acc.nombre,destination:null,linkedMessageId:null,category,summary:'Respuesta D3',exactText:null,otherDetail:null,confirmDoNotContact:true,closeLeadIds:[],...extra});
  const dncOf=async(id:string|number)=>(await db.selectFrom('crmAccounts').select('doNotContact').where('id','=',id as never).executeTakeFirstOrThrow()).doNotContact;
  const create=await mk('Zz D3 respuesta');
  await call(body(create.acc,'do_not_contact',{closeLeadIds:['999999999']}),409,user.cookie);// rejected after the cancel ran: everything rolls back
  assert.equal(await dncOf(create.acc.id),false);await assertDncUntouched(create.fx,'response_create rejected');
  await call(body(create.acc,'do_not_contact'),200,user.cookie);
  assert.equal(await dncOf(create.acc.id),true);await assertDncCancelled(create.fx,user.user.email,'response_create DNC');
  const correct=await mk('Zz D3 correccion');const original=body(correct.acc,'interested');await call(original,200,user.cookie);
  const fix={action:'response_correct',id:original.id,category:'do_not_contact',summary:'Pidió que no la contactemos',exactText:null,otherDetail:null,reason:'Se había clasificado mal',confirmDoNotContact:true,closeLeadIds:['999999999']};
  await call(fix,409,user.cookie);assert.equal(await dncOf(correct.acc.id),false);await assertDncUntouched(correct.fx,'response_correct rejected');
  await call({...fix,closeLeadIds:[]},200,user.cookie);
  assert.equal(await dncOf(correct.acc.id),true);await assertDncCancelled(correct.fx,user.user.email,'response_correct to DNC');
  console.log('D3: response_create / response_correct DNC cancel every pending task with the factual reason (rolled back when rejected)');}
 const linkedJournal=await sql<{action:string;isAutomatic:boolean;triggeredByEmail:string|null}>`SELECT action,is_automatic,triggered_by_email FROM crm_communication_journal WHERE account_id=${generalAccount.id} ORDER BY id`.execute(db);
 assert(linkedJournal.rows.some(e=>e.action==='do_not_contact_activated'&&e.isAutomatic&&e.triggeredByEmail===user.user.email));assert(linkedJournal.rows.some(e=>e.action==='do_not_contact_lifted'&&e.isAutomatic&&e.triggeredByEmail===admin.user.email));
 const callAttempt=await call({action:'manual_start',id:randomUUID(),accountId:String(generalAccount.id),leadId:null,contactId:null,channel:'call',purpose:'first_contact',otherPurpose:null,recipient:generalAccount.nombre,recipientName:generalAccount.nombre,destination:null,body:'Llamada realizada y registrada',result:'manual_sent',templateId:null},200,user.cookie);
 assert.equal(callAttempt.status,'manual_sent');assert(callAttempt.completedAt);assert.equal(callAttempt.completedByEmail,user.user.email);
 await call({action:'interaction_correct',id:callAttempt.id,result:'manual_no_contact',summary:'La llamada no tuvo respuesta',reason:'El resultado inicial se ingresó mal'},200,user.cookie);
 assert.equal((await message(callAttempt.id)).summary,'La llamada no tuvo respuesta');
 console.log('General communication: no-management contact, DNC activation/correction, automatic journal links and manual interaction correction passed');
 // Replay by request id: a retried save returns the same call; another user, business, management or channel is a conflict that leaks nothing.
 {const id=randomUUID(),callBody={action:'manual_start',id,accountId:String(generalAccount.id),leadId:null,contactId:null,channel:'call',purpose:'first_contact',otherPurpose:null,recipient:generalAccount.nombre,recipientName:generalAccount.nombre,destination:null,body:'Llamada de prueba de reintento',result:'manual_sent',templateId:null};
  const first=await call(callBody,200,user.cookie),again=await call({...callBody,body:'Otra nota tras reintentar'},200,user.cookie);
  assert.equal(again.id,first.id);assert.equal(again.summary,'Llamada de prueba de reintento');
  assert.equal(Number((await sql<{n:string}>`SELECT count(*) AS n FROM crm_messages WHERE id=${id}::uuid`.execute(db)).rows[0].n),1);
  assert.equal(Number((await sql<{n:string}>`SELECT count(*) AS n FROM crm_communication_journal WHERE entity_id=${id}::text AND action='contact_completed'`.execute(db)).rows[0].n),1);
  const leak=async(body:unknown,cookie:string)=>{const r=await post(request(body,cookie));const text=await r.text();assert(r.status>=400,'conflicting replay must be refused');assert(!text.includes('Llamada de prueba de reintento'),'a refused replay must not return the stored call');assert(!text.includes(String(first.recipient)+'"'),'a refused replay must not echo the stored row');return r.status};
  const otherAccount=await db.insertInto('crmAccounts').values({nombre:'Replay other account '+stamp,email:'replay-'+stamp+'@example.com',assignedUserEmail:user.user.email}).returningAll().executeTakeFirstOrThrow();await db.updateTable('crmAccounts').set({status:'reviewed'}).where('id','=',otherAccount.id).execute();
  await leak({...callBody,accountId:String(otherAccount.id)},user.cookie);
  await leak(callBody,other.cookie);
  assert.equal(await leak(callBody,admin.cookie),409);
  await leak({...callBody,channel:'social',destination:'@x',result:null},user.cookie);
  assert.equal(Number((await sql<{n:string}>`SELECT count(*) AS n FROM crm_messages WHERE id=${id}::uuid`.execute(db)).rows[0].n),1);}
 console.log('Manual call replay: same request id returns the same call once; other user, business or channel is refused without leaking it');
 // Report item 1.14: a reused draft is flagged (never reopened silently) and discarding it cancels it under a revision check before starting again.
 {const ra=await db.insertInto('crmAccounts').values({nombre:'Reuse drafts '+stamp,telefono:'5493442000009',assignedUserEmail:user.user.email}).returningAll().executeTakeFirstOrThrow();await db.updateTable('crmAccounts').set({status:'reviewed'}).where('id','=',ra.id).execute();
  const rl=await db.insertInto('leads').values({accountId:ra.id,nombre:ra.nombre,estado:'Cargado',assignedUserEmail:user.user.email}).returningAll().executeTakeFirstOrThrow();
  const rc=await db.insertInto('crmContacts').values({accountId:ra.id,name:'Persona borrador',phone:'+5493442000010'}).returningAll().executeTakeFirstOrThrow();
  const input={action:'prepare',leadId:String(rl.id),contactId:String(rc.id),channel:'whatsapp',templateId:null} as const;
  const first=await call({...input,id:randomUUID()},200,user.cookie);assert.equal(first.reusedDraft,undefined);
  const edited=await call({action:'edit',id:first.id,revision:first.revision,subject:'',body:'Texto viejo del borrador'},200,user.cookie);
  const again=await call({...input,id:randomUUID()},200,user.cookie);assert.equal(again.reusedDraft,true);assert.equal(again.id,first.id);assert.equal(again.body,'Texto viejo del borrador');assert(again.createdAt instanceof Date);
  await call({...input,id:randomUUID(),discardDraft:{id:first.id,revision:first.revision}},409,user.cookie);assert.equal((await message(first.id)).status,'draft');
  const rb=await db.insertInto('crmAccounts').values({nombre:'Other drafts '+stamp,telefono:'5493442000011',assignedUserEmail:user.user.email}).returningAll().executeTakeFirstOrThrow();await db.updateTable('crmAccounts').set({status:'reviewed'}).where('id','=',rb.id).execute();
  const otherLead=await db.insertInto('leads').values({accountId:rb.id,nombre:rb.nombre,estado:'Cargado',assignedUserEmail:user.user.email}).returningAll().executeTakeFirstOrThrow();
  await call({action:'prepare',id:randomUUID(),leadId:String(otherLead.id),contactId:null,channel:'whatsapp',templateId:null,discardDraft:{id:first.id,revision:edited.revision}},400,user.cookie);assert.equal((await message(first.id)).status,'draft');
  const rd=await db.insertInto('crmAccounts').values({nombre:'Other seller drafts '+stamp,telefono:'5493442000012',assignedUserEmail:other.user.email}).returningAll().executeTakeFirstOrThrow();await db.updateTable('crmAccounts').set({status:'reviewed'}).where('id','=',rd.id).execute();
  const otherSellerLead=await db.insertInto('leads').values({accountId:rd.id,nombre:rd.nombre,estado:'Cargado',assignedUserEmail:other.user.email}).returningAll().executeTakeFirstOrThrow();
  await call({action:'prepare',id:randomUUID(),leadId:String(otherSellerLead.id),contactId:null,channel:'whatsapp',templateId:null,discardDraft:{id:first.id,revision:edited.revision}},403,other.cookie);assert.equal((await message(first.id)).status,'draft');
  await db.updateTable('crmAccounts').set({doNotContact:true}).where('id','=',ra.id).execute();
  await call({...input,id:randomUUID(),discardDraft:{id:first.id,revision:edited.revision}},403,user.cookie);assert.equal((await message(first.id)).status,'draft');
  await db.updateTable('crmAccounts').set({doNotContact:false}).where('id','=',ra.id).execute();
  const freshId=randomUUID(),fresh=await call({...input,id:freshId,discardDraft:{id:first.id,revision:edited.revision}},200,user.cookie);
  assert.notEqual(fresh.id,first.id);assert.equal(fresh.reusedDraft,undefined);assert(!fresh.body.includes('Texto viejo'));assert.equal((await message(first.id)).status,'cancelled');
  assert.equal((await call({...input,id:freshId,discardDraft:{id:first.id,revision:edited.revision}},200,user.cookie)).id,freshId);
  const byAdmin=await call({...input,id:randomUUID(),discardDraft:{id:fresh.id,revision:fresh.revision}},200,admin.cookie);
  assert.equal((await message(fresh.id)).status,'cancelled');assert.equal(byAdmin.ownerEmail,admin.user.email);assert.notEqual(byAdmin.id,fresh.id);
  const cancelledJournal=await sql<{n:string}>`SELECT count(*) n FROM crm_communication_journal WHERE entity_id=${first.id} AND action='draft_cancelled'`.execute(db);assert.equal(Number(cancelledJournal.rows[0].n),1);
  const general={action:'prepare_general',accountId:String(ra.id),leadId:null,contactId:String(rc.id),channel:'whatsapp',purpose:'first_contact',otherPurpose:null,templateId:null} as const;
  const g1=await call({...general,id:randomUUID()},200,user.cookie);assert.equal(g1.reusedDraft,undefined);
  const g2=await call({...general,id:randomUUID()},200,user.cookie);assert.equal(g2.reusedDraft,true);assert.equal(g2.id,g1.id);
  const g3=await call(restartDraftRequest(g2,randomUUID()),200,user.cookie);assert.notEqual(g3.id,g1.id);assert.equal(g3.reusedDraft,undefined);assert.equal(g3.purpose,'first_contact');assert.equal((await message(g1.id)).status,'cancelled');
  await sql`INSERT INTO crm_contact_restrictions(account_id,lead_id,channel,reason,actor_email,created_at) VALUES(${ra.id},${rl.id},'whatsapp','Activa y antigua',${admin.user.email},now()-interval '2 days')`.execute(db);
  await sql`INSERT INTO crm_contact_restrictions(account_id,lead_id,channel,reason,actor_email,lifted_at,lifted_by,lift_reason) SELECT ${ra.id},${rl.id},'whatsapp','Levantada '||g,${admin.user.email},now(),${admin.user.email},'Fixture' FROM generate_series(1,205) g`.execute(db);
  const detail=superjson.parse<any>(await (await get(new Request('http://localhost/_api/communication?accountId='+ra.id,{headers:{cookie:user.cookie}}))).text());
  assert.equal(detail.restrictions.length,200);assert(!detail.restrictions.some((r:any)=>r.reason==='Activa y antigua'));
  assert.deepEqual(detail.activeRestrictions.map((r:any)=>r.reason),['Activa y antigua']);
  console.log('Reused drafts: flagged, stale, foreign-business, other-seller and No contactar discards refused, admin discard allowed like cancel_draft, discard cancels with revision check and restarts (lead and general)');}
 // D4: recording a past care send (manual_complete / interaction_correct → manual_sent) on a No contactar business is still recorded, but only an admin's record marks it as client.
 {const careCase=async(name:string,actor:typeof user,dnc:boolean,flow:'complete'|'correct')=>{
   const acc=await db.insertInto('crmAccounts').values({nombre:`Care D4 ${name} ${stamp}`,email:`care-d4-${name}-${stamp}@example.com`,assignedUserEmail:user.user.email}).returningAll().executeTakeFirstOrThrow();await db.updateTable('crmAccounts').set({status:'reviewed'}).where('id','=',acc.id).execute();
   const start=flow==='complete'?{channel:'social',destination:'instagram.com/care-d4',body:'',result:null}:{channel:'call',destination:null,body:'Llamada de acompañamiento',result:'manual_no_contact'};
   const m=await call({action:'manual_start',id:randomUUID(),accountId:String(acc.id),leadId:null,contactId:null,purpose:'care',otherPurpose:null,recipient:acc.nombre,recipientName:acc.nombre,templateId:null,...start},200,actor.cookie);
   if(dnc)await db.updateTable('crmAccounts').set({doNotContact:true}).where('id','=',acc.id).execute();
   const done=flow==='complete'?await call({action:'manual_complete',id:m.id,result:'manual_sent',summary:'Se le escribió antes del pedido'},200,actor.cookie):await call({action:'interaction_correct',id:m.id,result:'manual_sent',summary:'Sí atendió la llamada',reason:'El resultado inicial se ingresó mal'},200,actor.cookie);
   assert.equal(done.status,'manual_sent',`${name}: the send is recorded`);assert.equal((await message(m.id)).status,'manual_sent');
   const marked=Number((await sql<{n:string}>`SELECT count(*) n FROM crm_communication_journal WHERE account_id=${acc.id} AND action='client_marked_by_care_contact'`.execute(db)).rows[0].n);
   return {isClient:(await db.selectFrom('crmAccounts').select('isClient').where('id','=',acc.id).executeTakeFirstOrThrow()).isClient,marked};};
  for(const flow of ['complete','correct'] as const){
   assert.deepEqual(await careCase(`seller-dnc-${flow}`,user,true,flow),{isClient:false,marked:0},`seller ${flow} on No contactar must not mark client`);
   assert.deepEqual(await careCase(`admin-dnc-${flow}`,admin,true,flow),{isClient:true,marked:1},`admin ${flow} on No contactar marks client`);
   assert.deepEqual(await careCase(`seller-open-${flow}`,user,false,flow),{isClient:true,marked:1},`seller ${flow} without No contactar marks client`);
  }
  console.log('D4: past care send on No contactar recorded; only admin marks client (manual_complete and interaction_correct)');}
 // Spec 96 §10.1: a registered response resolves the pending outcome of the send it answers, idempotently, and never guesses.
 {
  const outcomeSince=await backOutcomeCutoff();
  try{
  const acc=await db.insertInto('crmAccounts').values({nombre:'Auto outcome '+stamp,status:'reviewed',assignedUserEmail:user.user.email}).returningAll().executeTakeFirstOrThrow();
  const first=await db.insertInto('leads').values({accountId:acc.id,nombre:acc.nombre,estado:'Cargado',assignedUserEmail:user.user.email}).returningAll().executeTakeFirstOrThrow();
  const second=await db.insertInto('leads').values({accountId:acc.id,nombre:acc.nombre+' B',estado:'Cargado',assignedUserEmail:user.user.email}).returningAll().executeTakeFirstOrThrow();
  const sent=async(leadId:string|number,minutesAgo:number)=>(await sql<{id:string}>`INSERT INTO crm_messages(id,account_id,original_account_id,lead_id,channel,recipient,recipient_name,body,owner_email,status,last_interaction_at,last_actor_email) VALUES(${randomUUID()}::uuid,${acc.id},${acc.id},${leadId},'whatsapp','5493442000999','Ana','Hola',${user.user.email},'manual_sent',now()-make_interval(mins=>${minutesAgo}::int),${user.user.email}) RETURNING id::text AS id`.execute(db)).rows[0].id;
  const older=await sent(first.id,30),newer=await sent(first.id,10),elsewhere=await sent(second.id,5);
  const outcomeOf=async(messageId:string)=>(await sql<{outcome:string|null;responseId:string|null}>`SELECT x.outcome,x.outcome_response_id::text AS "responseId" FROM crm_messages m LEFT JOIN crm_activities x ON x.id=m.activity_id AND x.deleted_at IS NULL WHERE m.id=${messageId}::uuid`.execute(db)).rows[0];
  const answer=(leadId:string|number|null,category='interested')=>({action:'response_create',id:randomUUID(),accountId:String(acc.id),leadId:leadId==null?null:String(leadId),contactId:null,channel:'whatsapp',recipient:'5493442000999',recipientName:'Ana',destination:null,linkedMessageId:null,category,summary:'Le interesa',exactText:null,otherDetail:null});
  // A general response with open sends in two managements is ambiguous: nothing is resolved.
  await call(answer(null),200,user.cookie);for(const id of [older,newer,elsewhere])assert.equal((await outcomeOf(id)).outcome??null,null,'an ambiguous response resolves nothing');
  // A response about a management resolves the most recent open send of that management only.
  const resolving=answer(first.id);const created=await call(resolving,200,user.cookie);
  assert.deepEqual(await outcomeOf(newer),{outcome:'interested',responseId:String(created.id)},'the most recent send of the management takes the response as its outcome');
  assert.equal((await outcomeOf(older)).outcome??null,null);assert.equal((await outcomeOf(elsewhere)).outcome??null,null);
  assert.equal((await sql<{status:string}>`SELECT status FROM crm_messages WHERE id=${newer}::uuid`.execute(db)).rows[0].status,'manual_sent','the message status never changes');
  assert.equal(Number((await sql<{n:string}>`SELECT count(*) n FROM crm_communication_journal WHERE entity_id=${newer} AND action='contact_outcome_from_response' AND is_automatic`.execute(db)).rows[0].n),1);
  await call(resolving,200,user.cookie);assert.deepEqual(await outcomeOf(newer),{outcome:'interested',responseId:String(created.id)},'a replay resolves nothing new');assert.equal((await outcomeOf(older)).outcome??null,null,'a replay does not move on to the next send');
  assert.equal(Number((await sql<{n:string}>`SELECT count(*) n FROM crm_communication_journal WHERE entity_id=${newer} AND action='contact_outcome_from_response'`.execute(db)).rows[0].n),1);
  const afterResponse=await pendingContactFollowUps(db,{ownerEmail:user.user.email,isAdmin:false,accountId:String(acc.id)});assert.ok(![...afterResponse.unconfirmed.items,...afterResponse.outcomes.items].some(p=>p.id===newer),'Hoy no longer asks how it went');
  // Someone who cannot record that outcome (another seller, who can still read the business) saves the response but leaves it pending.
  const foreign=answer(second.id,'later');await call(foreign,200,other.cookie);
  assert.ok(await db.selectFrom('crmCommunicationResponses').select('id').where('id','=',foreign.id).executeTakeFirst(),'the other seller response is saved');
  assert.equal((await outcomeOf(elsewhere)).outcome??null,null,'a reader never resolves another seller outcome');
  // A response linked to a message that is no longer open resolves nothing (never another open send instead).
  await call({...answer(first.id),linkedMessageId:newer},200,user.cookie);assert.equal((await outcomeOf(older)).outcome??null,null,'a response linked to a resolved send does not fall back to another one');
  const work=async(body:unknown,status=200,cookie=user.cookie)=>{const r=await workPost(new Request('http://localhost/_api/work',{method:'POST',headers:{cookie},body:superjson.stringify(body)}));const d=superjson.parse<any>(await r.text());assert.equal(r.status,status,d.error);return d;};
  const log=(leadId:string|number)=>({action:'activity_save',accountId:String(acc.id),leadId:String(leadId),title:'Contacto por WhatsApp',typeId:'message',occurredAt:new Date().toISOString(),purpose:'commercial',channel:'whatsapp',contactIds:[],outcome:'no_answer',result:'No respondió',continuation:'done',continuationReason:'Ya tengo otra tarea agendada'});
  // M3: correcting the response moves the outcome it set automatically, journaled as automatic.
  const correct=(category:string)=>call({action:'response_correct',id:created.id,category,summary:'Ya trabaja con otra plataforma',exactText:null,otherDetail:null,reason:'Se cargó mal la categoría'},200,user.cookie);
  await correct('rejected');assert.deepEqual(await outcomeOf(newer),{outcome:'not_interested',responseId:String(created.id)},'the automatic outcome follows the corrected response');
  assert.equal(Number((await sql<{n:string}>`SELECT count(*) n FROM crm_communication_journal WHERE entity_id=${newer} AND action='contact_outcome_from_response_corrected' AND is_automatic AND related_event_id IS NOT NULL`.execute(db)).rows[0].n),1);
  // A person's correction from the work editor clears the automatic mark, and a later response correction no longer touches it.
  const autoActivity=String((await message(newer)).activityId);
  await work({...log(first.id),id:autoActivity,title:'Comunicación WhatsApp',typeId:'other'});assert.deepEqual(await outcomeOf(newer),{outcome:'no_answer',responseId:null},'a person correction removes the automatic mark');
  await correct('interested');assert.deepEqual(await outcomeOf(newer),{outcome:'no_answer',responseId:null},'a person outcome is never overwritten by a response correction');
  // The common case: WhatsApp opened from the CRM (dispatch already created its activity, without outcome) → the response updates that activity.
  const third=await db.insertInto('leads').values({accountId:acc.id,nombre:acc.nombre+' C',estado:'Cargado',assignedUserEmail:user.user.email}).returningAll().executeTakeFirstOrThrow();
  const opened=(await sql<{id:string}>`INSERT INTO crm_messages(id,account_id,original_account_id,lead_id,channel,recipient,recipient_name,body,owner_email,status,last_interaction_at,last_actor_email) VALUES(${randomUUID()}::uuid,${acc.id},${acc.id},${third.id},'whatsapp','5493442000999','Ana','Hola',${user.user.email},'whatsapp_opened',now()-interval '3 minutes',${user.user.email}) RETURNING id::text AS id`.execute(db)).rows[0].id;
  const dispatched=await db.insertInto('crmActivities').values({accountId:acc.id,leadId:third.id,typeId:'other',title:'Comunicación WhatsApp',channel:'whatsapp',result:'WhatsApp abierto · envío no confirmado',occurredAt:new Date(),contactIds:[],participants:'Ana',actorEmail:user.user.email,notes:'Snapshot de mensaje #'+opened}).returning('id').executeTakeFirstOrThrow();
  await sql`UPDATE crm_messages SET activity_id=${dispatched.id} WHERE id=${opened}::uuid`.execute(db);
  const thirdAnswer=await call(answer(third.id),200,user.cookie);
  assert.deepEqual(await outcomeOf(opened),{outcome:'interested',responseId:String(thirdAnswer.id)},'the activity dispatch created takes the outcome');
  assert.equal(String((await message(opened)).activityId),String(dispatched.id),'no second activity is created');assert.equal((await message(opened)).status,'whatsapp_opened','an unconfirmed send stays unconfirmed');
  // M1: the seller then logs «Anotar lo que pasó» for that WhatsApp: no 409, her outcome replaces the automatic one and the mark is cleared.
  await work({...log(third.id),messageId:opened,messageSent:true});
  assert.deepEqual(await outcomeOf(opened),{outcome:'no_answer',responseId:null},'the seller log over an automatic outcome is a correction');assert.equal((await message(opened)).status,'manual_sent');
  await work({...log(third.id),messageId:opened,messageSent:true},409);// a person's outcome still blocks a second log
  // B2: an activity a response creates writes the management history like the communication flow does.
  assert.equal(Number((await sql<{n:string}>`SELECT count(*) n FROM lead_journal WHERE lead_id=${first.id} AND action='contact_logged' AND metadata->>'messageId'=${newer}`.execute(db)).rows[0].n),1,'contact_logged is written for the activity a response created');
  console.log('Spec 96: a response resolves the pending outcome of its send, idempotently and only when it is unambiguous; corrections follow the rules');
  }finally{await restoreOutcomeCutoff(outcomeSince);}
 }
 // Spec 96 §10.1 M2: a response answers only the sends made before it was received (Monday email, Tuesday WhatsApp, Wednesday register).
 {
  const since=await backOutcomeCutoff();
  try{
   const acc=await db.insertInto('crmAccounts').values({nombre:'Late inbound '+stamp,status:'reviewed',assignedUserEmail:user.user.email}).returningAll().executeTakeFirstOrThrow();
   const lead=await db.insertInto('leads').values({accountId:acc.id,nombre:acc.nombre,estado:'Cargado',assignedUserEmail:user.user.email}).returningAll().executeTakeFirstOrThrow();
   const sent=async(channel:string,minutesAgo:number)=>(await sql<{id:string}>`INSERT INTO crm_messages(id,account_id,original_account_id,lead_id,channel,recipient,recipient_name,body,owner_email,status,last_interaction_at,last_actor_email) VALUES(${randomUUID()}::uuid,${acc.id},${acc.id},${lead.id},${channel},'ana@example.com','Ana','Hola',${user.user.email},'manual_sent',now()-make_interval(mins=>${minutesAgo}::int),${user.user.email}) RETURNING id::text AS id`.execute(db)).rows[0].id;
   const monday=await sent('email',300),tuesday=await sent('whatsapp',200);
   const inboundId=randomUUID();await sql`INSERT INTO crm_inbound_messages(id,channel,external_id,account_id,lead_id,match_method,from_address,text_body,received_at,status,source) VALUES(${inboundId}::uuid,'email',${'spec96-'+inboundId},${acc.id},${lead.id},'sender_email','ana@example.com','Me interesa',now()-interval '250 minutes','pending_review','email_worker')`.execute(db);
   const registered=await call({action:'inbound_register',id:randomUUID(),inboundId,category:'interested',summary:'Le interesa',otherDetail:null},200,user.cookie);
   const outcomeOf=async(id:string)=>(await sql<{outcome:string|null;responseId:string|null}>`SELECT x.outcome,x.outcome_response_id::text AS "responseId" FROM crm_messages m LEFT JOIN crm_activities x ON x.id=m.activity_id AND x.deleted_at IS NULL WHERE m.id=${id}::uuid`.execute(db)).rows[0];
   assert.deepEqual(await outcomeOf(monday),{outcome:'interested',responseId:String(registered.id)},'the late-registered reply resolves the send it answers');
   assert.equal((await outcomeOf(tuesday)).outcome??null,null,'a later send is never resolved by an older reply');
   // No contactar: the seller's response is saved but resolves nothing (she cannot record that outcome); an admin's resolves it.
   const dnc=await db.insertInto('crmAccounts').values({nombre:'Auto outcome DNC '+stamp,status:'reviewed',assignedUserEmail:user.user.email}).returningAll().executeTakeFirstOrThrow();
   const dncLead=await db.insertInto('leads').values({accountId:dnc.id,nombre:dnc.nombre,estado:'Cargado',assignedUserEmail:user.user.email}).returningAll().executeTakeFirstOrThrow();
   const dncSend=(await sql<{id:string}>`INSERT INTO crm_messages(id,account_id,original_account_id,lead_id,channel,recipient,recipient_name,body,owner_email,status,last_interaction_at,last_actor_email) VALUES(${randomUUID()}::uuid,${dnc.id},${dnc.id},${dncLead.id},'whatsapp','5493442000998','Bea','Hola',${user.user.email},'manual_sent',now()-interval '10 minutes',${user.user.email}) RETURNING id::text AS id`.execute(db)).rows[0].id;
   await db.updateTable('crmAccounts').set({doNotContact:true}).where('id','=',dnc.id).execute();
   const dncAnswer=()=>({action:'response_create',id:randomUUID(),accountId:String(dnc.id),leadId:String(dncLead.id),contactId:null,channel:'whatsapp',recipient:'5493442000998',recipientName:'Bea',destination:null,linkedMessageId:null,category:'interested',summary:'Le interesa',exactText:null,otherDetail:null});
   const sellerAnswer=dncAnswer();await call(sellerAnswer,200,user.cookie);
   assert.ok(await db.selectFrom('crmCommunicationResponses').select('id').where('id','=',sellerAnswer.id).executeTakeFirst(),'the seller response is saved on a No contactar business');
   assert.equal((await outcomeOf(dncSend)).outcome??null,null,'a seller does not resolve an outcome of a No contactar business');
   const adminAnswer=dncAnswer();await call(adminAnswer,200,admin.cookie);
   assert.deepEqual(await outcomeOf(dncSend),{outcome:'interested',responseId:adminAnswer.id},'an admin resolves it');
   console.log('Spec 96 M2: a late-registered reply resolves only the sends before it; No contactar resolves only for an admin');
  }finally{await restoreOutcomeCutoff(since);}
 }
 // Spec 99 §3.4: inbound_register saves exactly what the screen shows: an omitted field keeps the row's value, an explicit null clears it.
 {
  const since=await backOutcomeCutoff();
  try{
  const acc=await db.insertInto('crmAccounts').values({nombre:'Spec99 inbound '+stamp,status:'reviewed',assignedUserEmail:user.user.email}).returningAll().executeTakeFirstOrThrow();
  const newLead=async(accountId:string|number,deletedAt:Date|null=null)=>db.insertInto('leads').values({accountId,nombre:'Spec99 gestión '+stamp,estado:'Cargado',assignedUserEmail:user.user.email,deletedAt}).returningAll().executeTakeFirstOrThrow();
  const lead=await newLead(acc.id),lead2=await newLead(acc.id),trashed=await newLead(acc.id,new Date());
  const elsewhere=await db.insertInto('crmAccounts').values({nombre:'Spec99 elsewhere '+stamp,status:'reviewed',assignedUserEmail:user.user.email}).returningAll().executeTakeFirstOrThrow();
  const foreignLead=await newLead(elsewhere.id);
  const person=async(accountId:string|number,name:string,deletedAt:Date|null=null)=>String((await db.insertInto('crmContacts').values({accountId,name,deletedAt}).returning('id').executeTakeFirstOrThrow()).id);
  const ana=await person(acc.id,'Ana'),bea=await person(acc.id,'Bea'),gone=await person(acc.id,'Borrada',new Date()),foreign=await person(elsewhere.id,'Ajena');
  const msg=async(accountId:string|number,status:string,contactId:string|null,leadId:string|number|null=lead.id)=>(await sql<{id:string}>`INSERT INTO crm_messages(id,account_id,original_account_id,lead_id,contact_id,channel,recipient,recipient_name,body,owner_email,status,last_interaction_at,last_actor_email) VALUES(${randomUUID()}::uuid,${accountId},${accountId},${leadId},${contactId},'whatsapp','5493442000777','Ana','Hola',${user.user.email},${status},now()-interval '1 hour',${user.user.email}) RETURNING id::text AS id`.execute(db)).rows[0].id;
  const sentToAna=await msg(acc.id,'manual_sent',ana),opened=await msg(acc.id,'whatsapp_opened',null),foreignSend=await msg(elsewhere.id,'manual_sent',null,foreignLead.id),lead2Send=await msg(acc.id,'manual_sent',null,lead2.id);
  const inbound=async(contactId:string|null=bea,linkedMessageId:string|null=null,accountId:string|number=acc.id,leadId:string|number=lead.id)=>{const id=randomUUID();await sql`INSERT INTO crm_inbound_messages(id,channel,external_id,account_id,lead_id,contact_id,linked_message_id,match_method,from_address,text_body,received_at,status,source) VALUES(${id}::uuid,'whatsapp',${'spec99-'+id},${accountId},${leadId},${contactId},${linkedMessageId}::uuid,'phone','5493442000777','Hola',now()-interval '10 minutes','pending_review','userscript')`.execute(db);return id;};
  const register=(inboundId:string,extra:Record<string,unknown>={})=>({action:'inbound_register',id:randomUUID(),inboundId,category:'information',summary:'Pidió información',otherDetail:null,...extra});
  const saved=async(id:string)=>(await sql<{contactId:string|null;linkedMessageId:string|null;leadId:string|null}>`SELECT contact_id::text AS "contactId",linked_message_id::text AS "linkedMessageId",lead_id::text AS "leadId" FROM crm_communication_responses WHERE id=${id}::uuid`.execute(db)).rows[0];
  const status=async(id:string)=>(await sql<{status:string}>`SELECT status FROM crm_inbound_messages WHERE id=${id}::uuid`.execute(db)).rows[0].status;
  const outcomeOf=async(id:string)=>(await sql<{outcome:string|null}>`SELECT x.outcome FROM crm_messages m LEFT JOIN crm_activities x ON x.id=m.activity_id AND x.deleted_at IS NULL WHERE m.id=${id}::uuid`.execute(db)).rows[0].outcome??null;
  const rejected=await inbound();
  await call(register(rejected,{contactId:foreign}),400,user.cookie);
  await call(register(rejected,{contactId:gone}),400,user.cookie);
  await call(register(rejected,{linkedMessageId:opened}),400,user.cookie);
  await call(register(rejected,{linkedMessageId:foreignSend}),400,user.cookie);
  await call(register(rejected,{leadId:String(foreignLead.id)}),400,user.cookie);
  await call(register(rejected,{leadId:String(trashed.id)}),400,user.cookie);
  await call(register(rejected,{leadId:String(lead2.id),linkedMessageId:sentToAna}),400,user.cookie);// the send belongs to another management than the one chosen
  await call(register(rejected,{linkedMessageId:lead2Send}),400,user.cookie);// omitted leadId keeps the row's management, and the send is of lead2
  assert.equal(await status(rejected),'pending_review','a rejected choice saves nothing');
  // Explicit null clears the row's values (row: Ana + a send M to Ana): «El negocio», «No, es una respuesta nueva», «Ninguna (todo el negocio)».
  const m=await msg(acc.id,'manual_sent',ana);
  const cleared=await call(register(await inbound(ana,m),{contactId:null,linkedMessageId:null,leadId:null}),200,user.cookie);
  assert.deepEqual(await saved(cleared.id),{contactId:null,linkedMessageId:null,leadId:null},'explicit nulls store neither the row person, send nor management');
  assert.equal(await outcomeOf(m),null,'a response the seller said is new does not resolve the row send «Anotá cómo salió» (open sends in two managements)');
  // Omitted fields keep the row's values (older clients, spec 96 M2): the stored send is resolved.
  const kept=await call(register(await inbound(ana,m)),200,user.cookie);
  assert.deepEqual(await saved(kept.id),{contactId:ana,linkedMessageId:m,leadId:String(lead.id)},'omitted fields use the row values');
  assert.equal(await outcomeOf(m),'other','the row send is resolved when the row link is kept');
  // A deleted person stored on the row: the screen shows «El negocio» and sends null, which saves; keeping the row value is rejected.
  const stale=await inbound(gone);
  await call(register(stale),400,user.cookie);
  const staleSaved=await call(register(stale,{contactId:null,linkedMessageId:null,leadId:String(lead.id)}),200,user.cookie);
  assert.deepEqual(await saved(staleSaved.id),{contactId:null,linkedMessageId:null,leadId:String(lead.id)});
  const created=await call(register(await inbound(),{contactId:ana,linkedMessageId:sentToAna,leadId:String(lead.id)}),200,user.cookie);
  assert.deepEqual(await saved(created.id),{contactId:ana,linkedMessageId:sentToAna,leadId:String(lead.id)},'the response keeps what the seller chose');
  // «El negocio» with a send to a person: the send never replaces the chosen person (both may differ).
  const decoupled=await call(register(await inbound(null),{contactId:null,linkedMessageId:sentToAna}),200,user.cookie);
  assert.deepEqual(await saved(decoupled.id),{contactId:null,linkedMessageId:sentToAna,leadId:String(lead.id)});
  // Another management of the business, and a send of it; «Ninguna (todo el negocio)» lists every send of the business.
  const moved=await call(register(await inbound(),{leadId:String(lead2.id),linkedMessageId:lead2Send}),200,user.cookie);
  assert.deepEqual(await saved(moved.id),{contactId:bea,linkedMessageId:lead2Send,leadId:String(lead2.id)},'the chosen management is saved');
  const general=await call(register(await inbound(),{leadId:null,linkedMessageId:sentToAna}),200,user.cookie);
  assert.deepEqual(await saved(general.id),{contactId:bea,linkedMessageId:sentToAna,leadId:null});
  const fallback=await call(register(await inbound()),200,user.cookie);
  assert.deepEqual(await saved(fallback.id),{contactId:bea,linkedMessageId:null,leadId:String(lead.id)},'without choices the row values are used');
  console.log('Spec 99 §3.4: inbound_register saves what the screen shows (undefined keeps the row value, null clears it) and validates person, send and management');
  }finally{await restoreOutcomeCutoff(since);}
 }
 // Spec 100 §8: a bulk «Sí, se enviaron» is one `outcome` call per open, each with its own server checks: an open in a No contactar
 // business is refused alone, the others are confirmed.
 {
  const openIn=async(name:string,dnc:boolean)=>{const acc=await db.insertInto('crmAccounts').values({nombre:name+' '+stamp,status:'reviewed',assignedUserEmail:user.user.email}).returningAll().executeTakeFirstOrThrow();const id=randomUUID();
   await sql`INSERT INTO crm_messages(id,account_id,original_account_id,channel,recipient,recipient_name,body,text_body,owner_email,status,last_interaction_at) VALUES(${id}::uuid,${acc.id},${acc.id},'whatsapp','+5493442555000','Ana','Hola','Hola',${user.user.email},'whatsapp_opened',now()-interval '1 hour')`.execute(db);
   if(dnc)await db.updateTable('crmAccounts').set({doNotContact:true}).where('id','=',acc.id).execute();return id;};
  const bulk=[await openIn('Masivo uno',false),await openIn('Masivo No contactar',true),await openIn('Masivo tres',false)];
  // The client runs them in sequence; the first open answered again in the middle (as the script would have) is a 409, not a failure.
  const statuses:number[]=[],errors:string[]=[];for(const id of [bulk[0],bulk[1],bulk[0],bulk[2]]){const r=await post(request({action:'outcome',id,event:'manual_sent',notes:''},user.cookie));statuses.push(r.status);errors.push(r.status===200?'':superjson.parse<{error:string}>(await r.text()).error);}
  assert.deepEqual(statuses,[200,403,409,200],'Each open is checked on its own; No contactar refuses only its own');
  assert.equal(errors[2],'Este envío ya estaba confirmado.','The repeated answer says it was already confirmed');
  assert.deepEqual([(await message(bulk[0])).status,(await message(bulk[1])).status,(await message(bulk[2])).status],['manual_sent','whatsapp_opened','manual_sent']);
  console.log('Spec 100 §8: sequential outcome calls confirm per item, refuse the No contactar open alone and answer 409 on an already confirmed one');
 }
 // Merge all new relationships while preserving original attribution and snapshots.
 const dest=await db.insertInto('crmAccounts').values({nombre:'Destino '+stamp,ciudad:'Colón'}).returningAll().executeTakeFirstOrThrow();let r=await quality(request({action:'merge_preview',sourceId:a.id,destinationId:dest.id}));assert.equal(r.status,200);const p=superjson.parse<any>(await r.text());r=await quality(request({action:'merge_confirm',sourceId:a.id,destinationId:dest.id,token:p.token,selections:Object.fromEntries(businessFields.map(f=>[f,'destination'])),reason:'Revisado en fixture',confirm:true}));assert.equal(r.status,200,await r.text());assert.equal((await message(id)).accountId,dest.id);assert.equal((await sql<{originalAccountId:string}>`SELECT original_account_id FROM crm_messages WHERE id=${id}::uuid`.execute(db)).rows[0].originalAccountId,a.id);assert.equal((await sql<{accountId:string}>`SELECT account_id FROM crm_documents WHERE id=${did}::uuid`.execute(db)).rows[0].accountId,dest.id);
 await resource({action:'delete',id:did,revision:2});assert.equal((await download(new Request('http://localhost/_api/resources/download?versionId='+versions[0].id,{headers:{cookie:admin.cookie}}))).status,400);assert.equal(Number((await sql<{n:string}>`SELECT count(*) n FROM crm_document_versions WHERE document_id=${did}::uuid`.execute(db)).rows[0].n),2);
 const persistenceAccount=await db.insertInto('crmAccounts').values({nombre:'CI persistence business '+stamp}).returningAll().executeTakeFirstOrThrow();
 await resource({action:'create',id:randomUUID(),title:'CI persistence fixture',type:'test',accountId:persistenceAccount.id,leadId:null,activityId:null,library:false,categoryId:null,version:{fileData:Buffer.from('%PDF-1.4\nPersistent fixture\n%%EOF').toString('base64'),fileName:'persistent.pdf',mimeType:'application/pdf'}});
 console.log('Communication/resources: permissions, snapshots, restrictions, honest statuses, duplicate dispatch, events, uncertainty, immutable files, reuse, fusion and soft delete passed');
}finally{globalThis.fetch=realFetch;await db.destroy();}
