import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {sql} from 'kysely';
import superjson from 'superjson';
import {db} from '../src/helpers/db';
import {setServerSession} from '../src/helpers/getSetServerSession';
import {get} from '../src/endpoints/commercial';
import {post as pipelinePost} from '../src/endpoints/pipeline';
assert.equal(process.env.CRM_TEST_DATABASE,'1','Use a disposable database');
const stamp=randomUUID();
async function session(role:'admin'|'user',tag=''){
 const u=await db.insertInto('users').values({email:stamp+role+tag+'@example.com',displayName:'History test',role}).returningAll().executeTakeFirstOrThrow();
 const id=stamp+role+tag;await db.insertInto('sessions').values({id,userId:u.id,expiresAt:new Date(Date.now()+3600000)}).execute();
 const r=new Response();await setServerSession(r,{id,createdAt:Date.now(),lastAccessed:Date.now()});return r.headers.get('set-cookie')!.split(';')[0];
}
try{
 const admin=await session('admin'),reader=await session('user');
 const a=await db.insertInto('crmAccounts').values({nombre:'History '+stamp,status:'reviewed'}).returningAll().executeTakeFirstOrThrow();
 const lead=await db.insertInto('leads').values({accountId:a.id,nombre:a.nombre,opportunityName:'Propuesta histórica',managementType:'main',estado:'main:contact'}).returningAll().executeTakeFirstOrThrow();
 const activities=await db.insertInto('crmActivities').values(Array.from({length:52},(_,i)=>({accountId:a.id,leadId:lead.id,typeId:'call',title:'Conversación '+i,occurredAt:new Date(1700000000000+i*1000),outcome:'interested',result:'Pidió propuesta',channel:'phone',continuation:'task'}))).returningAll().execute();
 const addMessage=async(status:string,activityId:string|null=null)=>{
  const id=randomUUID();await sql`INSERT INTO crm_messages(id,account_id,original_account_id,lead_id,channel,recipient,owner_email,status,activity_id,text_body) VALUES(${id}::uuid,${a.id},${a.id},${lead.id},'whatsapp','5493442000000','history@example.com',${status},${activityId},'Texto registrado')`.execute(db);return id;
 };
 await addMessage('manual_sent',activities[0].id);const opened=await addMessage('whatsapp_opened');await addMessage('draft');await addMessage('cancelled');
 await db.insertInto('crmTasks').values({accountId:a.id,leadId:lead.id,typeId:'followup',title:'Revisar propuesta',dueDate:'2027-01-18',assignedUserEmail:null,continuation:'wait'}).execute();
 // Stage events come from the real leads trigger (insert with a stage + an update), never hand-inserted.
 await db.updateTable('leads').set({estado:'main:contacted'}).where('id','=',lead.id).execute();
 await sql`INSERT INTO crm_commercial_journal(account_id,action,actor_email,actor_name) VALUES(${a.id},'account_updated','history@example.com','History test')`.execute(db);
 await sql`INSERT INTO crm_communication_journal(account_id,original_account_id,lead_id,entity_type,entity_id,action,actor_email,after_value) VALUES(${a.id},${a.id},${lead.id},'interaction','x','contact_completed','history@example.com',${JSON.stringify({status:'manual_sent',channel:'whatsapp',outboxId:7,destination:'549344'})}::text::jsonb)`.execute(db);
 async function history(page=1,cookie=reader,status=200,kind='all'){const r=await get(new Request('http://localhost/_api/commercial?'+new URLSearchParams({accountId:a.id,historyPage:String(page),...(kind==='all'?{}:{historyKind:kind})}),{headers:{cookie}}));const d=superjson.parse<any>(await r.text());assert.equal(r.status,status,d.error);return d;}
 const first=await history(),second=await history(2);assert.equal(first.total,58);assert.equal(first.events.length,50);assert.equal(second.events.length,8);assert.equal(new Set([...first.events,...second.events].map(e=>e.id)).size,58);
 assert(first.events.some(e=>e.id==='message:'+opened&&e.messageStatus==='whatsapp_opened'));
 const combined=[...first.events,...second.events].find(e=>e.id==='activity:'+activities[0].id);assert.equal(combined.messageStatus,'manual_sent');assert.equal(combined.result,'Pidió propuesta');assert.equal(combined.opportunityName,'Propuesta histórica');
 const all=[...first.events,...second.events];
 const stages=all.filter(e=>e.kind==='stage');assert.deepEqual(stages.map(e=>e.title).sort(),['Gestión iniciada → Por contactar','Por contactar → Contactado'],'stage events use stage names');assert(stages.every(e=>e.opportunityName==='Propuesta histórica'&&e.result===null),'management notes are not shown');
 assert.equal(all.find(e=>e.kind==='communication').title,'Contacto realizado','raw journal actions are labeled');assert.equal(all.find(e=>e.kind==='change').title,'Datos del negocio editados');
 assert(all.every(e=>!/^[a-z]+(_[a-z]+)+$/.test(e.title)),'no internal key reaches the timeline');
 const journalled=all.find(e=>e.kind==='communication');assert.equal(journalled.result,'Envío confirmado manualmente · WhatsApp','communication entries read as plain words');
 assert(all.every(e=>![e.result,e.messageText].some(v=>typeof v==='string'&&/[{}]|"status"|outboxId|triggeredBy/.test(v))),'no raw JSON or internal keys in any entry');assert(all.filter(e=>e.kind==='communication').every(e=>e.messageText===null));assert(all.every(e=>e.messageStatus!=='no_linked_message'),'the internal evidence marker never reaches the timeline');
 const contacts=await history(1,reader,200,'contact'),managements=await history(1,reader,200,'management'),changes=await history(1,reader,200,'change');
 assert.equal(contacts.total,54);assert(contacts.events.every(e=>['activity','message','response','communication'].includes(e.kind)));assert.equal(managements.total,2);assert(managements.events.every(e=>e.kind==='stage'));assert.equal(changes.total,2,'the edit plus the status change the management trigger made');assert(changes.events.every(e=>e.kind==='change'));
 assert(all.some(e=>e.id===first.lastContact?.id),'page 1 carries the latest qualifying contact');assert.equal(first.lastContact?.id,'activity:'+activities[51]!.id,'opened WhatsApp is visible in history but is not latest contact evidence');assert(!('lastContact' in second)&&!('lastContact' in contacts),'only page 1 of the full stream computes it');
 assert.equal(first.totalPending,1);assert.equal(first.pending[0].title,'Revisar propuesta');assert.equal(first.pending[0].continuation,'wait');
 await db.updateTable('leads').set({deletedAt:new Date()}).where('id','=',lead.id).execute();assert.equal((await history()).total,3,'only business-level data changes stay once the management is deleted (the status trigger added one more)');assert.equal((await history()).totalPending,0);
 await db.updateTable('crmAccounts').set({archivedAt:new Date()}).where('id','=',a.id).execute();await history(1,reader,403);await history(1,admin);
 const r=await get(new Request('http://localhost/_api/commercial?accountId='+a.id+'&historyPage=1'));assert.equal(r.status,401);
 // U-28B: stage-change notes (and the reason's label) of managements reach the timeline for every business reader; the legacy comment still shows.
 {
  const colleague=await session('user','colleague'),ownerEmail=stamp+'user@example.com';
  const b=await db.insertInto('crmAccounts').values({nombre:'Notes '+stamp,status:'reviewed',assignedUserEmail:ownerEmail}).returningAll().executeTakeFirstOrThrow();
  const typed=await db.insertInto('leads').values({accountId:b.id,nombre:b.nombre,opportunityName:'Gestión con nota',managementType:'main',estado:'main:contact',assignedUserEmail:ownerEmail} as never).returningAll().executeTakeFirstOrThrow();
  const legacy=await db.insertInto('leads').values({accountId:b.id,nombre:b.nombre,opportunityName:'Gestión heredada',estado:'Cargado',assignedUserEmail:ownerEmail}).returningAll().executeTakeFirstOrThrow();
  const reason=await db.selectFrom('crmManagementReasons').selectAll().where('managementType','=','main').where('outcomeKey','=','lost').where('active','=',true).where('doNotContact','=',false).where('requiresNote','=',false).executeTakeFirstOrThrow();
  const transition=async(leadId:string,stage:string,extra:object)=>{const rev=(await db.selectFrom('leads').select('pipelineRevision').where('id','=',leadId).executeTakeFirstOrThrow()).pipelineRevision;const r=await pipelinePost(new Request('http://localhost/_api/pipeline',{method:'POST',headers:{cookie:reader},body:superjson.stringify({action:'transition',leadId,revision:rev,stage,...extra})}));assert.equal(r.status,200,await r.text());};
  await transition(typed.id,'main:lost',{reasonId:reason.id,comment:'Prefiere seguir con su proveedor actual'});
  await transition(legacy.id,'En tratativas',{comment:'Nota de gestión anterior'});
  const stored=await db.selectFrom('crmPipelineEvents').select(['managementNote','comment']).where('leadId','=',typed.id).where('newStage','=','main:lost').executeTakeFirstOrThrow();assert.equal(stored.managementNote,'Prefiere seguir con su proveedor actual');assert.equal(stored.comment,null,'a typed management keeps its note in management_note, not comment');
  const historyOf=async(cookie:string|null,status=200)=>{const r=await get(new Request('http://localhost/_api/commercial?'+new URLSearchParams({accountId:b.id,historyPage:'1',historyKind:'management'}),{headers:cookie?{cookie}:{}}));const d=superjson.parse<any>(await r.text());assert.equal(r.status,status,d.error);return d;};
  const checkNotes=(d:any)=>{
   const t=d.events.find((e:any)=>e.opportunityName==='Gestión con nota'&&!e.title.startsWith('Gestión iniciada'));assert(t,'typed stage entry present');assert.equal(t.result,'Motivo: '+reason.name+' · Prefiere seguir con su proveedor actual','typed note shows with the reason label');
   const l=d.events.find((e:any)=>e.opportunityName==='Gestión heredada'&&e.result);assert(l,'legacy stage entry with a note present');assert.equal(l.result,'Nota de gestión anterior','legacy comment still shows');
   assert(d.events.every((e:any)=>typeof e.result!=='string'||!/[{}]|reason_id|^\d+$/.test(e.result)),'no raw ids or keys');
  };
  checkNotes(await historyOf(reader));checkNotes(await historyOf(colleague));checkNotes(await historyOf(admin));
  await historyOf(null,401);
  await db.updateTable('crmAccounts').set({archivedAt:new Date()}).where('id','=',b.id).execute();
  checkNotes(await historyOf(reader));await historyOf(colleague,403);
 }
 // Spec 90: one entry per Instagram echo (its automatic «Contacto realizado» journal row is folded in), calls titled «Llamada»,
 // received-message journal actions with real titles, and Instagram named as such.
 {
  const c=await db.insertInto('crmAccounts').values({nombre:'Zz Channels '+stamp,status:'reviewed'}).returningAll().executeTakeFirstOrThrow();
  const echo=randomUUID(),call=randomUUID(),inbound=randomUUID(),wa=randomUUID(),mail=randomUUID(),fb=randomUUID(),mid='mid-'+stamp;
  await sql`INSERT INTO crm_messages(id,account_id,original_account_id,channel,recipient,recipient_name,subject,owner_email,status,text_body,last_interaction_at) VALUES(${wa}::uuid,${c.id},${c.id},'whatsapp','+5493442000000','Julia','','history@example.com','whatsapp_opened','Hola',now()-interval '6 hours'),(${mail}::uuid,${c.id},${c.id},'email','julia@example.com','','Propuesta','history@example.com','accepted','Te paso',now()-interval '5 hours')`.execute(db);
  await sql`INSERT INTO crm_inbound_messages(id,channel,channel_detail,external_id,account_id,match_method,from_address,text_body,received_at,status,source) VALUES(${fb}::uuid,'social','facebook',${'fb-'+mid},${c.id},'manual','Aguas FB','Hola',now()-interval '30 minutes','pending_review','instagram_webhook')`.execute(db);
  await sql`INSERT INTO crm_communication_journal(account_id,original_account_id,entity_type,entity_id,action,actor_email,triggered_by_email,after_value) VALUES(${c.id},${c.id},'inbound',${fb},'inbound_received',NULL,'instagram-webhook','{}'::jsonb)`.execute(db);
  await sql`INSERT INTO crm_messages(id,account_id,original_account_id,channel,recipient,owner_email,status,text_body,last_interaction_at,external_id) VALUES(${echo}::uuid,${c.id},${c.id},'social','@channels','instagram@hospeda','manual_sent','Por mail es mejor',now()-interval '3 hours',${mid})`.execute(db);
  await sql`INSERT INTO crm_communication_journal(account_id,original_account_id,entity_type,entity_id,action,actor_email,triggered_by_email,after_value) VALUES(${c.id},${c.id},'interaction',${echo},'contact_completed',NULL,'instagram-webhook',${JSON.stringify({channel:'instagram',status:'manual_sent',externalId:mid,to:'@channels'})}::jsonb)`.execute(db);
  await sql`INSERT INTO crm_messages(id,account_id,original_account_id,channel,recipient,owner_email,status,summary,last_interaction_at) VALUES(${call}::uuid,${c.id},${c.id},'call','+5493442000000','history@example.com','manual_no_contact','No atendió',now()-interval '2 hours')`.execute(db);
  await sql`INSERT INTO crm_inbound_messages(id,channel,channel_detail,external_id,account_id,match_method,from_address,text_body,received_at,status,source) VALUES(${inbound}::uuid,'social','instagram',${'in-'+mid},${c.id},'instagram_handle','@channels','Hola',now()-interval '1 hour','pending_review','instagram_webhook')`.execute(db);
  await sql`INSERT INTO crm_communication_journal(account_id,original_account_id,entity_type,entity_id,action,actor_email,triggered_by_email,after_value) VALUES(${c.id},${c.id},'inbound',${inbound},'inbound_received',NULL,'instagram-webhook',${JSON.stringify({channel:'instagram',from:'@channels'})}::jsonb)`.execute(db);
  const r=await get(new Request('http://localhost/_api/commercial?'+new URLSearchParams({accountId:c.id,historyPage:'1'}),{headers:{cookie:admin}}));assert.equal(r.status,200);
  const events=superjson.parse<any>(await r.text()).events as any[];
  assert.equal(events.filter(e=>e.id==='message:'+echo).length,1,'the echo is one message entry');
  assert.equal(events.filter(e=>e.kind==='communication'&&e.title==='Contacto realizado').length,0,'no extra «Contacto realizado» for the echo');
  const echoed=events.find(e=>e.id==='message:'+echo);assert.equal(echoed.title,'Mensaje por Instagram');assert.equal(echoed.channel,'social');assert.equal(echoed.isInstagram,true);
  const called=events.find(e=>e.id==='message:'+call);assert.equal(called.title,'Llamada');assert.equal(called.channel,'call');
  const received=events.find(e=>e.kind==='communication'&&e.title.includes('@channels'));assert.equal(received.title,'Mensaje recibido por Instagram de @channels');assert.equal(received.channel,'social');assert.equal(received.isInstagram,true);
  // A: outgoing messages say channel and recipient (never delivery); an email keeps its subject.
  assert.equal(events.find(e=>e.id==='message:'+wa).title,'WhatsApp a Julia');assert.equal(events.find(e=>e.id==='message:'+mail).title,'Email a julia@example.com · «Propuesta»');
  // L2/L3: a received social row from another network is «Red social», not Instagram.
  const other=events.find(e=>e.kind==='communication'&&e.title.includes('Aguas FB'));assert.equal(other.title,'Mensaje recibido por Red social de Aguas FB');assert.equal(other.isInstagram,false);
  assert.equal(events.length,6,'echo, call, two messages and two received messages, nothing duplicated');
 }
 // Spec 99 block 1: source labels are derived at read time, and later draft/open rows do not move lastContact.
 {
  const c=await db.insertInto('crmAccounts').values({nombre:'Zz contact evidence '+stamp,status:'reviewed'}).returningAll().executeTakeFirstOrThrow(),messageId=randomUUID();
  const activityId=(await sql<{id:string}>`INSERT INTO crm_activities(account_id,type_id,title,occurred_at,result,outcome,actor_email) VALUES(${c.id},'call','WhatsApp a Julia',now()-interval '3 hours','Envío confirmado manualmente','interested','history@example.com') RETURNING id::text AS id`.execute(db)).rows[0]!.id;
  await sql`INSERT INTO crm_messages(id,account_id,original_account_id,channel,recipient,recipient_name,owner_email,status,activity_id,external_id,last_interaction_at) VALUES(${messageId}::uuid,${c.id},${c.id},'whatsapp','+5493442000000','Julia','history@example.com','manual_sent',${activityId}::bigint,${'wa-'+stamp},now()-interval '3 hours')`.execute(db);
  await sql`INSERT INTO crm_communication_journal(account_id,original_account_id,entity_type,entity_id,action,actor_email,triggered_by_email,after_value) VALUES(${c.id},${c.id},'interaction',${messageId},'contact_completed',NULL,'userscript','{"status":"manual_sent"}'::jsonb)`.execute(db);
  await sql`INSERT INTO crm_messages(id,account_id,original_account_id,channel,recipient,owner_email,status,last_interaction_at) VALUES(${randomUUID()}::uuid,${c.id},${c.id},'whatsapp','+5493442000000','history@example.com','whatsapp_opened',now()-interval '1 hour'),(${randomUUID()}::uuid,${c.id},${c.id},'whatsapp','+5493442000000','history@example.com','draft',now())`.execute(db);
  const result=await get(new Request('http://localhost/_api/commercial?'+new URLSearchParams({accountId:c.id,historyPage:'1'}),{headers:{cookie:admin}}));assert.equal(result.status,200);
  const data=superjson.parse<any>(await result.text());const activity=data.events.find((e:any)=>e.id==='activity:'+activityId);
  assert.equal(activity.result,'Envío confirmado por el script de WhatsApp','legacy activity result is corrected on display');
  assert.equal(data.lastContact.id,'activity:'+activityId,'draft and opened WhatsApp do not replace contact evidence');
  const editedMessage=randomUUID();
  const editedId=(await sql<{id:string}>`INSERT INTO crm_activities(account_id,type_id,title,occurred_at,result,outcome,actor_email) VALUES(${c.id},'call','WhatsApp a Julia',now()-interval '2 hours','Resultado corregido por vendedor','replied','history@example.com') RETURNING id::text AS id`.execute(db)).rows[0]!.id;
  await sql`INSERT INTO crm_messages(id,account_id,original_account_id,channel,recipient,recipient_name,owner_email,status,activity_id,external_id,last_interaction_at) VALUES(${editedMessage}::uuid,${c.id},${c.id},'whatsapp','+5493442000000','Julia','history@example.com','manual_sent',${editedId}::bigint,${'wa-edited-'+stamp},now()-interval '2 hours')`.execute(db);
  const editedHistory=superjson.parse<any>(await (await get(new Request('http://localhost/_api/commercial?'+new URLSearchParams({accountId:c.id,historyPage:'1'}),{headers:{cookie:admin}}))).text());
  assert.equal(editedHistory.events.find((e:any)=>e.id==='activity:'+editedId).result,'Resultado corregido por vendedor','edited activity results are preserved');
  assert.equal(activity.messageStatus,'userscript_sent','legacy script confirmation keeps the script status');
  // N1: new script confirmations store USERSCRIPT_CONFIRMED_RESULT; the status line follows the journal, not the stored text.
  const scriptMessage=randomUUID(),scriptId=(await sql<{id:string}>`INSERT INTO crm_activities(account_id,type_id,title,occurred_at,result,actor_email) VALUES(${c.id},'call','WhatsApp a Julia',now()-interval '4 hours','Envío confirmado por el script de WhatsApp','history@example.com') RETURNING id::text AS id`.execute(db)).rows[0]!.id;
  await sql`INSERT INTO crm_messages(id,account_id,original_account_id,channel,recipient,recipient_name,owner_email,status,activity_id,external_id,last_interaction_at) VALUES(${scriptMessage}::uuid,${c.id},${c.id},'whatsapp','+5493442000000','Julia','history@example.com','manual_sent',${scriptId}::bigint,${'wa-n1-'+stamp},now()-interval '4 hours')`.execute(db);
  await sql`INSERT INTO crm_communication_journal(account_id,original_account_id,entity_type,entity_id,action,actor_email,triggered_by_email,after_value) VALUES(${c.id},${c.id},'interaction',${scriptMessage},'contact_resolved',NULL,'userscript','{"status":"manual_sent"}'::jsonb)`.execute(db);
  const igMessage=randomUUID(),igId=(await sql<{id:string}>`INSERT INTO crm_activities(account_id,type_id,title,occurred_at,result,actor_email) VALUES(${c.id},'call','Instagram a Julia',now()-interval '5 hours','Envío confirmado por Instagram','history@example.com') RETURNING id::text AS id`.execute(db)).rows[0]!.id;
  await sql`INSERT INTO crm_messages(id,account_id,original_account_id,channel,destination_detail,recipient,recipient_name,owner_email,status,activity_id,external_id,last_interaction_at) VALUES(${igMessage}::uuid,${c.id},${c.id},'social','instagram','@julia','Julia','history@example.com','manual_sent',${igId}::bigint,${'mid-n1-'+stamp},now()-interval '5 hours')`.execute(db);
  await sql`INSERT INTO crm_communication_journal(account_id,original_account_id,entity_type,entity_id,action,actor_email,triggered_by_email,after_value) VALUES(${c.id},${c.id},'interaction',${igMessage},'contact_resolved',NULL,'instagram-webhook','{"status":"manual_sent"}'::jsonb)`.execute(db);
  const newHistory=superjson.parse<any>(await (await get(new Request('http://localhost/_api/commercial?'+new URLSearchParams({accountId:c.id,historyPage:'1'}),{headers:{cookie:admin}}))).text());
  const scriptEntry=newHistory.events.find((e:any)=>e.id==='activity:'+scriptId),igEntry=newHistory.events.find((e:any)=>e.id==='activity:'+igId);
  assert.equal(scriptEntry.messageStatus,'userscript_sent','a new script confirmation shows the script status');assert.equal(scriptEntry.result,'Envío confirmado por el script de WhatsApp');
  assert.equal(igEntry.messageStatus,'instagram_sent','an echo confirmation shows the Instagram status');assert.equal(igEntry.result,'Envío confirmado por Instagram');
 }
 // Spec 99 E2/E3/M3: the summary uses response and received-message timestamps, excludes no-answer and automatic inbound, and ignores inbound journal time.
 {
  const makeAccount=async(name:string)=>db.insertInto('crmAccounts').values({nombre:name+stamp,status:'reviewed'}).returningAll().executeTakeFirstOrThrow();
  const historyOf=async(accountId:string)=>{const r=await get(new Request('http://localhost/_api/commercial?'+new URLSearchParams({accountId,historyPage:'1'}),{headers:{cookie:admin}}));assert.equal(r.status,200,await r.clone().text());return superjson.parse<any>(await r.text());};
  const answered=await makeAccount('Response evidence '),responseId=randomUUID(),responseAt=new Date(Date.now()-90*60_000);
  await sql`INSERT INTO crm_communication_responses(id,account_id,original_account_id,channel,recipient,category,summary,actor_email,occurred_at) VALUES(${responseId}::uuid,${answered.id},${answered.id},'whatsapp','Julia','interested','Respondió',${stamp+'admin@example.com'},${responseAt})`.execute(db);
  const responseHistory=await historyOf(answered.id);assert.equal(responseHistory.lastContact.id,'response:'+responseId);assert.equal(new Date(responseHistory.lastContact.occurredAt).getTime(),responseAt.getTime());
  for(const automatic of [false,true]){
   const account=await makeAccount(automatic?'Automatic inbound ':'Received inbound '),inboundId=randomUUID(),receivedAt=new Date(Date.now()-3*60*60_000);
   await sql`INSERT INTO crm_inbound_messages(id,channel,external_id,account_id,match_method,from_address,text_body,is_automatic,received_at,status,source) VALUES(${inboundId}::uuid,'whatsapp',${'inbound-'+randomUUID()},${account.id},'manual','guest@example.com','Consulta',${automatic},${receivedAt},'pending_review','userscript')`.execute(db);
   await sql`INSERT INTO crm_communication_journal(account_id,original_account_id,entity_type,entity_id,action,actor_email,triggered_by_email,created_at,after_value) VALUES(${account.id},${account.id},'inbound',${inboundId},'inbound_registered',NULL,'userscript',now(),'{"status":"registered"}'::jsonb)`.execute(db);
   const history=await historyOf(account.id);
   if(automatic)assert.equal(history.lastContact,null,'automatic inbound does not count');
   else{assert.equal(history.lastContact.id,'inbound:'+inboundId);assert.equal(new Date(history.lastContact.occurredAt).getTime(),receivedAt.getTime(),'inbound uses received_at rather than journal created_at');}
  }
  const unanswered=await makeAccount('Unanswered ');
  await db.insertInto('crmActivities').values({accountId:unanswered.id,typeId:'call',title:'No atendió',outcome:'no_answer',occurredAt:new Date()}).execute();
  assert.equal((await historyOf(unanswered.id)).lastContact,null,'no_answer does not count as a contact');
 }
 console.log('Commercial history: pagination, one event per linked message/activity, honest WhatsApp state, pending commitments and archived/deleted permissions passed');
}finally{await db.destroy()}
