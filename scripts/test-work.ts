import {post as importLeads} from "../src/endpoints/dataQuality";
import type {ImportReview} from "../src/endpoints/dataQuality.schema";
import {localDay} from "../src/helpers/workDates";
import assert from 'node:assert/strict';
import {sql} from 'kysely';
import superjson from 'superjson';
import {db} from '../src/helpers/db';
import {setServerSession} from '../src/helpers/getSetServerSession';
import {get,post} from '../src/endpoints/work';
import {handle as quick} from '../src/endpoints/leads_quick_POST';
import {handle as save} from '../src/endpoints/leads_save_POST';
import {handle as contact} from '../src/endpoints/lead_contact_POST';
import type {WorkData} from '../src/endpoints/work.schema';
import {handle as liveVersion} from '../src/endpoints/live_version_GET';
import type {OutputType as LiveVersion} from '../src/endpoints/live_version_GET.schema';
assert.equal(process.env.CRM_TEST_DATABASE,'1','Use disposable DB');
const suffix=Date.now();
async function identity(role:'admin'|'user'){
 const user=await db.insertInto('users').values({email:`work-${role}-${suffix}-${Math.random()}@example.com`,displayName:'Work '+role,role}).returningAll().executeTakeFirstOrThrow();
 const session={id:user.email,createdAt:Date.now(),lastAccessed:Date.now()};await db.insertInto('sessions').values({id:session.id,userId:user.id,expiresAt:new Date(Date.now()+3600000)}).execute();
 const r=new Response();await setServerSession(r,session);return {user,cookie:r.headers.get('set-cookie')!.split(';')[0]};
}
const admin=await identity('admin'),user=await identity('user'),other=await identity('user');
const request=(body:unknown,cookie=user.cookie)=>new Request('http://localhost/_api/work',{method:'POST',headers:{cookie},body:superjson.stringify(body)});
async function mutate(body:unknown,cookie=user.cookie,status=200){const r=await post(request(body,cookie));const value=superjson.parse<{id:string;error?:string}>(await r.text());assert.equal(r.status,status,value.error);return value.id;}
async function read(params='',cookie=user.cookie,status=200){const r=await get(new Request('http://localhost/_api/work?'+params,{headers:{cookie}}));const value=superjson.parse<WorkData&{error?:string}>(await r.text());assert.equal(r.status,status,value.error);return value;}
const EXPECTED_LIVE_TRIGGERS=[
  "CREATE TRIGGER authorized_emails_live_version AFTER INSERT OR DELETE OR UPDATE ON public.authorized_emails FOR EACH STATEMENT EXECUTE FUNCTION bump_crm_live_domain('catalog')",
  "CREATE TRIGGER crm_accounts_live_version AFTER INSERT OR DELETE OR UPDATE ON public.crm_accounts FOR EACH STATEMENT EXECUTE FUNCTION bump_crm_live_domain('business')",
  "CREATE TRIGGER crm_activities_live AFTER INSERT OR DELETE OR UPDATE ON public.crm_activities FOR EACH STATEMENT EXECUTE FUNCTION bump_crm_live_domain('business', 'work')",
  "CREATE TRIGGER crm_cities_live_version AFTER INSERT OR DELETE OR UPDATE ON public.crm_cities FOR EACH STATEMENT EXECUTE FUNCTION bump_crm_live_domain('catalog')",
  "CREATE TRIGGER crm_commercial_journal_live_version AFTER INSERT OR DELETE OR UPDATE ON public.crm_commercial_journal FOR EACH STATEMENT EXECUTE FUNCTION bump_crm_live_domain('journal')",
  "CREATE TRIGGER crm_communication_interaction_corrections_live AFTER INSERT OR DELETE OR UPDATE ON public.crm_communication_interaction_corrections FOR EACH STATEMENT EXECUTE FUNCTION bump_crm_live_domain('communication')",
  "CREATE TRIGGER crm_communication_journal_live AFTER INSERT OR DELETE OR UPDATE ON public.crm_communication_journal FOR EACH STATEMENT EXECUTE FUNCTION bump_crm_live_domain('communication')",
  "CREATE TRIGGER crm_communication_response_corrections_live AFTER INSERT OR DELETE OR UPDATE ON public.crm_communication_response_corrections FOR EACH STATEMENT EXECUTE FUNCTION bump_crm_live_domain('communication')",
  "CREATE TRIGGER crm_communication_responses_live AFTER INSERT OR DELETE OR UPDATE ON public.crm_communication_responses FOR EACH STATEMENT EXECUTE FUNCTION bump_crm_live_domain('communication')",
  "CREATE TRIGGER crm_contacts_live_version AFTER INSERT OR DELETE OR UPDATE ON public.crm_contacts FOR EACH STATEMENT EXECUTE FUNCTION bump_crm_live_domain('business')",
  "CREATE TRIGGER crm_evidence_live AFTER INSERT ON public.crm_data_evidence FOR EACH STATEMENT EXECUTE FUNCTION bump_crm_live_domain('business')",
  "CREATE TRIGGER crm_import_live AFTER INSERT OR UPDATE ON public.crm_import_batches FOR EACH STATEMENT EXECUTE FUNCTION bump_crm_live_domain('business')",
  "CREATE TRIGGER crm_management_reasons_live AFTER INSERT OR DELETE OR UPDATE ON public.crm_management_reasons FOR EACH STATEMENT EXECUTE FUNCTION bump_crm_live_domain('catalog')",
  "CREATE TRIGGER crm_merge_live AFTER INSERT ON public.crm_account_merges FOR EACH STATEMENT EXECUTE FUNCTION bump_crm_live_domain('business')",
  "CREATE TRIGGER crm_message_template_versions_live AFTER INSERT OR DELETE OR UPDATE ON public.crm_message_template_versions FOR EACH STATEMENT EXECUTE FUNCTION bump_crm_live_domain('communication')",
  "CREATE TRIGGER crm_objection_types_live AFTER INSERT OR DELETE OR UPDATE ON public.crm_objection_types FOR EACH STATEMENT EXECUTE FUNCTION bump_crm_live_domain('catalog')",
  "CREATE TRIGGER crm_objections_live AFTER INSERT OR DELETE OR UPDATE ON public.crm_objections FOR EACH STATEMENT EXECUTE FUNCTION bump_crm_live_domain('business')",
  "CREATE TRIGGER crm_pipeline_events_live AFTER INSERT OR DELETE OR UPDATE ON public.crm_pipeline_events FOR EACH STATEMENT EXECUTE FUNCTION bump_crm_live_domain('business')",
  "CREATE TRIGGER crm_reasons_live AFTER INSERT OR DELETE OR UPDATE ON public.crm_loss_reasons FOR EACH STATEMENT EXECUTE FUNCTION bump_crm_live_domain('catalog')",
  "CREATE TRIGGER crm_stages_live AFTER INSERT OR DELETE OR UPDATE ON public.crm_stages FOR EACH STATEMENT EXECUTE FUNCTION bump_crm_live_domain('catalog')",
  "CREATE TRIGGER crm_subtypes_live_version AFTER INSERT OR DELETE OR UPDATE ON public.crm_subtypes FOR EACH STATEMENT EXECUTE FUNCTION bump_crm_live_domain('catalog')",
  "CREATE TRIGGER crm_tasks_live AFTER INSERT OR DELETE OR UPDATE ON public.crm_tasks FOR EACH STATEMENT EXECUTE FUNCTION bump_crm_live_domain('business', 'work')",
  "CREATE TRIGGER crm_verticals_live_version AFTER INSERT OR DELETE OR UPDATE ON public.crm_verticals FOR EACH STATEMENT EXECUTE FUNCTION bump_crm_live_domain('catalog')",
  "CREATE TRIGGER crm_work_settings_live AFTER INSERT OR UPDATE ON public.app_settings FOR EACH ROW WHEN ((new.key = 'crm_work_followup'::text)) EXECUTE FUNCTION bump_crm_live_domain('work')",
  "CREATE TRIGGER crm_work_types_live AFTER INSERT OR DELETE OR UPDATE ON public.crm_work_types FOR EACH STATEMENT EXECUTE FUNCTION bump_crm_live_domain('work')",
  "CREATE TRIGGER email_outbox_live_version AFTER INSERT OR DELETE OR UPDATE ON public.email_outbox FOR EACH STATEMENT EXECUTE FUNCTION bump_crm_live_domain('communication')",
  "CREATE TRIGGER lead_journal_live_version AFTER INSERT OR DELETE OR UPDATE ON public.lead_journal FOR EACH STATEMENT EXECUTE FUNCTION bump_crm_live_domain('journal')",
  "CREATE TRIGGER lead_notes_live_version AFTER INSERT OR DELETE OR UPDATE ON public.lead_notes FOR EACH STATEMENT EXECUTE FUNCTION bump_crm_live_domain('business')",
  "CREATE TRIGGER leads_live_version AFTER INSERT OR DELETE OR UPDATE ON public.leads FOR EACH STATEMENT EXECUTE FUNCTION bump_crm_live_domain('business')",
  "CREATE TRIGGER message_templates_live_version AFTER INSERT OR DELETE OR UPDATE ON public.message_templates FOR EACH STATEMENT EXECUTE FUNCTION bump_crm_live_domain('communication')",
  "CREATE TRIGGER resource_live AFTER INSERT ON public.crm_document_links FOR EACH STATEMENT EXECUTE FUNCTION bump_crm_live_domain('communication')",
  "CREATE TRIGGER resource_live AFTER INSERT OR DELETE OR UPDATE ON public.crm_contact_restrictions FOR EACH STATEMENT EXECUTE FUNCTION bump_crm_live_domain('communication')",
  "CREATE TRIGGER resource_live AFTER INSERT OR DELETE OR UPDATE ON public.crm_document_categories FOR EACH STATEMENT EXECUTE FUNCTION bump_crm_live_domain('communication')",
  "CREATE TRIGGER resource_live AFTER INSERT OR DELETE OR UPDATE ON public.crm_document_versions FOR EACH STATEMENT EXECUTE FUNCTION bump_crm_live_domain('communication')",
  "CREATE TRIGGER resource_live AFTER INSERT OR DELETE OR UPDATE ON public.crm_documents FOR EACH STATEMENT EXECUTE FUNCTION bump_crm_live_domain('communication')",
  "CREATE TRIGGER resource_live AFTER INSERT OR DELETE OR UPDATE ON public.crm_messages FOR EACH STATEMENT EXECUTE FUNCTION bump_crm_live_domain('communication')",
  "CREATE TRIGGER users_live_version AFTER INSERT OR DELETE OR UPDATE ON public.users FOR EACH STATEMENT EXECUTE FUNCTION bump_crm_live_domain('catalog')"
];
async function liveVersions(){const r=await liveVersion(new Request('http://localhost/_api/live_version',{headers:{cookie:user.cookie}}));assert.equal(r.status,200);const value=superjson.parse<LiveVersion>(await r.text());assert(value.domains,'Live version must report domains');return {version:value.version,...value.domains};}
try{
 assert.equal((await get(new Request('http://localhost/_api/work'))).status,401);
 const legacyTriggers=await sql<{name:string}>`SELECT t.tgname AS name FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid WHERE NOT t.tgisinternal AND p.proname='bump_crm_live_version'`.execute(db);
 assert.deepEqual(legacyTriggers.rows,[],'Every live trigger must bump a domain');
 // Migration 026 must keep each trigger's events, level and WHEN exactly as migrations 001-022 defined them.
 const domainTriggers=await sql<{def:string}>`SELECT pg_get_triggerdef(t.oid) AS def FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid WHERE NOT t.tgisinternal AND p.proname='bump_crm_live_domain'`.execute(db);
 assert.deepEqual(domainTriggers.rows.map(row=>row.def).sort(),[...EXPECTED_LIVE_TRIGGERS].sort(),'Live trigger definitions drifted');
 assert.deepEqual(Object.keys(await liveVersions()).sort(),['business','catalog','communication','journal','version','work']);
 const importName='Import without tasks '+suffix;
 const previewResponse=await importLeads(request({action:'import_preview',rows:[{nombre:importName,fechaProximaAccion:'01/10/2026'}],source:'Work test'},admin.cookie));
 assert.equal(previewResponse.status,200);
 const preview=superjson.parse<ImportReview>(await previewResponse.text());
 assert(preview.rows[0].errors.length,'Commercial task fields must not be accepted for business imports');
 assert.equal((await importLeads(request({action:'import_confirm',batchId:preview.batchId,decisions:[{index:0,action:'create'}],confirm:true},admin.cookie))).status,400);
 assert.equal((await db.selectFrom('crmAccounts').select('id').where('nombre','=',importName).execute()).length,0);
 const cleanResponse=await importLeads(request({action:'import_preview',rows:[{nombre:importName}],source:'Work test'},admin.cookie));
 const clean=superjson.parse<ImportReview>(await cleanResponse.text());
 assert.equal((await importLeads(request({action:'import_confirm',batchId:clean.batchId,decisions:[{index:0,action:'create'}],confirm:true},admin.cookie))).status,200);
 const imported=await db.selectFrom('crmAccounts').selectAll().where('nombre','=',importName).executeTakeFirstOrThrow();
 assert.equal((await db.selectFrom('leads').select('id').where('accountId','=',imported.id).execute()).length,0);
 assert.equal((await db.selectFrom('crmTasks').select('id').where('accountId','=',imported.id).execute()).length,0);

 assert.equal((await post(request({action:'task_delete',id:'1'},''))).status,401);
 const a=await db.insertInto('crmAccounts').values({nombre:'Work test',ciudad:'Colón',assignedUserEmail:user.user.email}).returningAll().executeTakeFirstOrThrow();
 const b=await db.insertInto('crmAccounts').values({nombre:'Other test',assignedUserEmail:other.user.email}).returningAll().executeTakeFirstOrThrow();
 const l=await db.insertInto('leads').values({nombre:a.nombre,accountId:a.id,opportunityName:'Plan Premium',estado:'Interesado',assignedUserEmail:user.user.email}).returningAll().executeTakeFirstOrThrow();
 const own=await db.insertInto('crmContacts').values({accountId:a.id,name:'Ana'}).returning('id').executeTakeFirstOrThrow();
 const foreign=await db.insertInto('crmContacts').values({accountId:b.id,name:'No corresponde'}).returning('id').executeTakeFirstOrThrow();
 const base={action:'task_save',accountId:a.id,leadId:l.id,title:'Llamar',typeId:'call',dueDate:'2026-10-01',contactIds:[own.id],participants:'Propietaria'};
 const liveBeforeTask=await liveVersions();
 const unassigned=await mutate({...base,title:'Sin responsable',leadId:null,assignedUserEmail:null},admin.cookie);
 const liveAfterTask=await liveVersions();
 assert.notEqual(liveAfterTask.work,liveBeforeTask.work,'Task writes bump the work domain');
 assert.notEqual(liveAfterTask.business,liveBeforeTask.business,'Task writes bump the business domain');
 assert.notEqual(liveAfterTask.version,liveBeforeTask.version,'Task writes keep bumping the legacy version');
 assert.equal(liveAfterTask.communication,liveBeforeTask.communication,'Task writes do not bump communication');
 assert.equal(liveAfterTask.catalog,liveBeforeTask.catalog,'Task writes do not bump catalog');
 await db.updateTable('messageTemplates').set({updatedAt:new Date()}).where('id','=','0').execute();
 const liveAfterTemplate=await liveVersions();
 assert.notEqual(liveAfterTemplate.communication,liveAfterTask.communication,'Template writes bump communication');
 assert.notEqual(liveAfterTemplate.version,liveAfterTask.version,'Template writes keep bumping the legacy version');
 assert.equal(liveAfterTemplate.business,liveAfterTask.business,'Template writes do not bump business');
 assert.equal(liveAfterTemplate.work,liveAfterTask.work,'Template writes do not bump work');
 await mutate({...base,id:unassigned,title:'Sin responsable editada',leadId:null},admin.cookie);
 assert.equal((await db.selectFrom('crmTasks').select('assignedUserEmail').where('id','=',unassigned).executeTakeFirstOrThrow()).assignedUserEmail,null);
 await mutate({action:'task_delete',id:unassigned},admin.cookie);
 const call=await mutate(base);
 const visit=await mutate({...base,title:'Visita',typeId:'visit',dueDate:'2026-10-02',dueAt:'2026-10-02T15:00:00-03:00'});
 await mutate({...base,title:'Forbidden',assignedUserEmail:other.user.email},user.cookie,403);
 await mutate({...base,contactIds:[foreign.id]},user.cookie,400);
 await mutate({...base,accountId:b.id},user.cookie,400);
 await mutate({...base,accountId:b.id,leadId:null},user.cookie,403);
 await mutate({...base,dueAt:'2026-10-02T01:00:00-03:00'},user.cookie,400);
 await mutate({action:'task_status',id:call,status:'completed',result:'Confirmed'},other.cookie,403);
 await read('responsible=all',user.cookie,403);await read('responsible='+other.user.email,user.cookie,403);
 assert.equal((await read('responsible=all',admin.cookie)).tasks.filter(t=>t.leadId===l.id).length,2);
 assert.equal((await read()).attention.some(x=>x.id===l.id),false);
 const completedAt='2026-09-01T13:30:00-03:00';
 // Decision 2B: completing a task must say how it continues.
 await mutate({action:'task_status',id:call,status:'completed',result:'Aceptó la visita',completedAt},user.cookie,400);
 await mutate({action:'task_status',id:call,status:'completed',result:'Aceptó la visita',completedAt,continuation:'done'},user.cookie,400);
 await mutate({action:'task_status',id:call,status:'completed',result:'Aceptó la visita',completedAt,continuation:'done',continuationReason:'Ya quedó todo resuelto'});
 assert.equal((await db.selectFrom('crmTasks').select('continuationReason').where('id','=',call).executeTakeFirstOrThrow()).continuationReason,'Ya quedó todo resuelto');
 let lead=await db.selectFrom('leads').selectAll().where('id','=',l.id).executeTakeFirstOrThrow();
 assert.equal(lead.fechaProximaAccion!.toISOString().slice(0,10),'2026-10-02');
 assert.equal(lead.assignedUserEmail,user.user.email);
 await mutate({action:'task_status',id:call,status:'completed',result:'Duplicado',continuation:'done',continuationReason:'Ya quedó todo resuelto'},user.cookie,400);
 let activity=await db.selectFrom('crmActivities').selectAll().where('taskId','=',call).executeTakeFirstOrThrow();assert.equal(activity.continuation,'done');assert.equal(activity.continuationReason,'Ya quedó todo resuelto');
 assert.equal(activity.occurredAt.toISOString(),new Date(completedAt).toISOString());assert.deepEqual(activity.contactIds,[own.id]);
 await mutate({action:'activity_save',id:activity.id,accountId:a.id,leadId:l.id,title:'Llamada real',typeId:'call',occurredAt:'2026-09-01T14:00:00-03:00',result:'Editado',contactIds:[own.id]});
 const completed=await db.selectFrom('crmTasks').selectAll().where('id','=',call).executeTakeFirstOrThrow();assert.equal(completed.result,'Editado');assert.equal(completed.completedAt!.toISOString(),'2026-09-01T17:00:00.000Z');
 const before=await db.selectFrom('crmActivities').select(eb=>eb.fn.countAll().as('n')).executeTakeFirstOrThrow();
 await mutate({action:'activity_save',accountId:a.id,leadId:l.id,title:'Carga retrospectiva',typeId:'meeting',occurredAt:'2026-08-01T09:00:00-03:00',result:'Conversamos'});
 await mutate({action:'activity_save',accountId:a.id,leadId:l.id,title:'Futuro',typeId:'meeting',occurredAt:'2099-01-01T09:00:00-03:00'},user.cookie,400);
 const after=await db.selectFrom('crmActivities').select(eb=>eb.fn.countAll().as('n')).executeTakeFirstOrThrow();assert.equal(Number(after.n),Number(before.n)+1);
 // Single outcome list (3A) and mandatory next step (2B) for new results.
 const outcomeBase={action:'activity_save',accountId:a.id,leadId:l.id,title:'Llamada con resultado',typeId:'call',occurredAt:'2026-08-02T10:00:00-03:00',purpose:'commercial'};
 const missing=await post(request({...outcomeBase,outcome:'no_answer'}));assert.equal(missing.status,400);assert.equal(superjson.parse<{error:string}>(await missing.text()).error,'Elegí cómo sigue: agendá una tarea o elegí «No agendar nada» y contá por qué.');
 await mutate({...outcomeBase,outcome:'no_answer',continuation:'done',continuationReason:'  '},user.cookie,400);
 await mutate({...outcomeBase,outcome:'replied',continuation:'done',continuationReason:'Ya quedó todo resuelto'},user.cookie,400);
 await mutate({...outcomeBase,outcome:'delivered',continuation:'done',continuationReason:'Ya quedó todo resuelto'},user.cookie,400);
 const later=await mutate({...outcomeBase,outcome:'later',continuation:'wait',nextTask:{title:'Retomar conversación',dueDate:'2026-11-02',typeId:'followup'}});
 assert.equal((await db.selectFrom('crmActivities').select(['outcome','continuation']).where('id','=',later).executeTakeFirstOrThrow()).outcome,'later');
 assert.equal((await db.selectFrom('crmTasks').select('continuation').where('leadId','=',l.id).where('title','=','Retomar conversación').where('status','=','pending').executeTakeFirstOrThrow()).continuation,'wait');
 const closed=await mutate({...outcomeBase,outcome:'not_interested',continuation:'done',continuationReason:'Ya trabaja con otra empresa'});
 // Editing an existing activity stays exempt and keeps its continuation and reason.
 await mutate({...outcomeBase,id:closed,outcome:'not_interested',result:'Corrijo el detalle'});
 const edited=await db.selectFrom('crmActivities').select(['continuation','continuationReason','result']).where('id','=',closed).executeTakeFirstOrThrow();
 assert.deepEqual(edited,{continuation:'done',continuationReason:'Ya trabaja con otra empresa',result:'Corrijo el detalle'});
 // The constraints keep every historical value and reject unknown ones and blank reasons (rolled back: no unaudited writes remain).
 const rollback=async(statement:(t:typeof db)=>Promise<unknown>)=>assert.rejects(db.transaction().execute(async t=>{await statement(t);throw new Error('rollback');}),/rollback/);
 await rollback(async t=>{for(const value of ['no_answer','interested','later','replied','not_interested','do_not_contact','other','delivered','needs_help','awaiting_confirmation','care_completed']){await sql`UPDATE crm_activities SET outcome=${value} WHERE id=${closed}::bigint`.execute(t);await sql`UPDATE crm_tasks SET outcome=${value} WHERE id=${call}::bigint`.execute(t);}});
 for(const [statement,constraint] of [[sql`UPDATE crm_activities SET outcome='bogus' WHERE id=${closed}::bigint`,/crm_activities_outcome_check/],[sql`UPDATE crm_tasks SET outcome='bogus' WHERE id=${call}::bigint`,/crm_tasks_outcome_check/],[sql`UPDATE crm_activities SET continuation_reason=' a ' WHERE id=${closed}::bigint`,/crm_activities_continuation_reason_check/],[sql`UPDATE crm_tasks SET continuation_reason=' a ' WHERE id=${call}::bigint`,/crm_tasks_continuation_reason_check/]] as const)await assert.rejects(db.transaction().execute(async t=>{await statement.execute(t);}),constraint);
 lead=await db.selectFrom('leads').selectAll().where('id','=',l.id).executeTakeFirstOrThrow();assert.equal(lead.fechaUltimoContacto!.toISOString().slice(0,10),'2026-09-01');
 const versionBefore=(await db.selectFrom('appSettings').select('value').where('key','=','crm_live_version').executeTakeFirstOrThrow()).value;
 await mutate({action:'followup_settings',stages:['Interesado'],newAssignmentDays:10},user.cookie,403);
 await mutate({action:'followup_settings',stages:['Interesado'],newAssignmentDays:10},admin.cookie);
 const configured=await read();assert.equal(configured.newAssignmentDays,10);assert.deepEqual(configured.followupStages,['Interesado']);
 assert.notEqual((await db.selectFrom('appSettings').select('value').where('key','=','crm_live_version').executeTakeFirstOrThrow()).value,versionBefore);
 assert.equal((await quick(request({id:l.id,field:'fechaProximaAccion',value:'2026-10-03'}))).status,200);
 assert.equal((await quick(request({id:l.id,field:'fechaProximaAccion',value:'2026-10-03'}))).status,200);
 let legacy=await db.selectFrom('crmTasks').selectAll().where('leadId','=',l.id).where('legacy','=',true).execute();assert.equal(legacy.length,1);
 assert.equal((await quick(request({id:l.id,field:'fechaProximaAccion',value:null}))).status,200);
 assert.equal((await db.selectFrom('crmTasks').select('status').where('id','=',visit).executeTakeFirstOrThrow()).status,'pending');
 // Full editor omission must not clear existing tasks.
 assert.equal((await save(request({id:l.id,scope:'opportunity',nombre:a.nombre,estado:'Interesado'}))).status,200);
 assert.equal((await db.selectFrom('leads').select('fechaProximaAccion').where('id','=',l.id).executeTakeFirstOrThrow()).fechaProximaAccion!.toISOString().slice(0,10),'2026-10-02');
 await mutate({...base,id:visit,title:'Visita reprogramada',typeId:'visit',dueDate:'2026-10-04',dueAt:null});
 await mutate({...base,id:visit,title:'Visit delegated',typeId:'visit',dueDate:'2026-10-04',assignedUserEmail:other.user.email},admin.cookie);
 await mutate({...base,id:visit,title:'No me apropio',typeId:'visit',dueDate:'2026-10-04',assignedUserEmail:user.user.email},user.cookie,403);
 const delegated=await read('',other.cookie);assert(delegated.tasks.some(t=>t.id===visit));assert(delegated.accounts.some(x=>x.id===a.id));
 await mutate({action:'task_status',id:visit,status:'completed',result:'Visita efectuada',completedAt:'2026-09-15T15:00:00-03:00',continuation:'done',continuationReason:'Ya quedó todo resuelto'},other.cookie);
 assert.equal((await db.selectFrom('leads').select('assignedUserEmail').where('id','=',l.id).executeTakeFirstOrThrow()).assignedUserEmail,user.user.email);
 // A toast destination reads one exact task, including delegated work outside the inbox page.
 const exactTask='mode=detail&accountId='+a.id+'&taskId='+visit;
 assert.deepEqual((await read(exactTask,other.cookie)).tasks.map(t=>t.id),[visit]);
 assert.equal((await read(exactTask,user.cookie)).tasks.length,0);
 assert.deepEqual((await read(exactTask+'&responsible=all',admin.cookie)).tasks.map(t=>t.id),[visit]);
 assert.equal((await read('mode=detail&accountId='+b.id+'&taskId='+visit,admin.cookie)).tasks.length,0);
 assert.equal((await get(new Request('http://localhost/_api/work?taskId='+visit,{headers:{cookie:user.cookie}}))).status,400);
 assert.equal((await contact(request({leadId:l.id,channel:'phone',result:'Respondió'}))).status,200);
 const logged=await db.selectFrom('crmActivities').selectAll().where('leadId','=',l.id).where('title','=','Contacto registrado').executeTakeFirstOrThrow();assert.equal(logged.typeId,'call');
 const audit=await db.selectFrom('crmWorkJournal').selectAll().where('accountId','=',a.id).execute();assert(audit.every(j=>j.actorEmail));assert(audit.some(j=>j.entity==='crm_activities'&&j.action==='UPDATE'));
 await mutate({action:'type_save',id:'demo',name:'Demostración',agenda:true,active:true},user.cookie,403);
 await mutate({action:'type_save',id:'demo',name:'Demostración',agenda:true,active:true},admin.cookie);
 const demo=await mutate({...base,typeId:'demo',dueDate:'2026-10-02'});
 const agenda=await read('mode=agenda&from=2026-10-01&to=2026-10-31');assert(agenda.tasks.some(t=>t.id===demo));assert(agenda.tasks.every(t=>t.typeId!=='call'));
 await mutate({action:'type_save',id:'demo',name:'Demostración',agenda:true,active:false},admin.cookie);
 await mutate({...base,typeId:'demo'},user.cookie,400);
 await mutate({action:'task_delete',id:demo});assert(!(await read()).tasks.some(t=>t.id===demo));
 // Many overdue items must not push today's work off the initial inbox page.
 await db.insertInto('crmTasks').values(Array.from({length:27},(_,i)=>({accountId:a.id,leadId:l.id,title:'Old backlog '+i,typeId:'call',assignedUserEmail:user.user.email,dueDate:'2020-01-01'}))).execute();
 const todays=await mutate({...base,title:'Hoy pese a vencidas',dueDate:localDay()});
 const inbox=await read();assert(inbox.tasks.some(t=>t.id===todays));assert(inbox.bucketCounts!.overdue>=27);assert(inbox.tasks.filter(t=>t.dueDate==='2020-01-01').length===25);
 await db.updateTable('leads').set({deletedAt:new Date()}).where('id','=',l.id).execute();assert(!(await read()).tasks.some(t=>t.leadId===l.id));
 await db.updateTable('leads').set({deletedAt:null}).where('id','=',l.id).execute();
 // Duplicate advice checks the whole matching scope, without depending on inbox pagination.
 const duplicateBase={...base,title:'Revisar propuesta turística',typeId:'followup',dueDate:'2027-01-18'};
 const duplicate1=await mutate(duplicateBase),duplicate2=await mutate({...duplicateBase,title:'REVISAR PROPUESTA TURI\u0301STICA'});
 const duplicateOther=await mutate({...duplicateBase,assignedUserEmail:other.user.email},admin.cookie);
 const duplicateGeneral=await mutate({...duplicateBase,leadId:null});
 const duplicateParams={mode:'duplicates',accountId:a.id,leadId:l.id,duplicateTitle:'revisar propuesta turistica',duplicateType:'followup',from:'2027-01-18',to:'2027-01-18'};
 const findDuplicates=async(params:Record<string,string>,cookie=user.cookie)=>await read(new URLSearchParams(params).toString(),cookie) as unknown as {tasks:{id:string}[];total:number};
 const ownDuplicates=await findDuplicates(duplicateParams);assert.equal(ownDuplicates.total,2);assert.deepEqual(new Set(ownDuplicates.tasks.map(t=>t.id)),new Set([duplicate1,duplicate2]));
 assert.equal((await findDuplicates({...duplicateParams,responsible:'all'},admin.cookie)).total,3);
 assert.deepEqual((await findDuplicates(duplicateParams,other.cookie)).tasks.map(t=>t.id),[duplicateOther]);
 assert.equal((await findDuplicates({...duplicateParams,excludeTaskId:duplicate1})).total,1);
 const generalParams={...duplicateParams};delete (generalParams as Partial<typeof duplicateParams>).leadId;assert.deepEqual((await findDuplicates(generalParams)).tasks.map(t=>t.id),[duplicateGeneral]);
 await mutate({action:'task_status',id:duplicate2,status:'cancelled',result:'La acción ya estaba planificada'});assert.equal((await findDuplicates(duplicateParams)).total,1);
 assert.equal((await get(new Request('http://localhost/_api/work?mode=duplicates',{headers:{cookie:user.cookie}}))).status,400);
 console.log('Work API: auth, assignee restriction/delegation, contact ownership, multiple tasks, retrospective completion/activity/audit, legacy quick/full editors, agenda/catalog, logical deletion passed');
}finally{await db.destroy()}
