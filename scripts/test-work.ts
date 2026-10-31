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
import {post as communicationPost} from '../src/endpoints/communication';
import {reconcileEvents} from '../src/helpers/communicationService';
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
  "CREATE TRIGGER resource_live AFTER INSERT OR DELETE OR UPDATE ON public.crm_auto_registrations FOR EACH STATEMENT EXECUTE FUNCTION bump_crm_live_domain('communication')",
  "CREATE TRIGGER resource_live AFTER INSERT OR DELETE OR UPDATE ON public.crm_contact_restrictions FOR EACH STATEMENT EXECUTE FUNCTION bump_crm_live_domain('communication')",
  "CREATE TRIGGER resource_live AFTER INSERT OR DELETE OR UPDATE ON public.crm_document_categories FOR EACH STATEMENT EXECUTE FUNCTION bump_crm_live_domain('communication')",
  "CREATE TRIGGER resource_live AFTER INSERT OR DELETE OR UPDATE ON public.crm_document_versions FOR EACH STATEMENT EXECUTE FUNCTION bump_crm_live_domain('communication')",
  "CREATE TRIGGER resource_live AFTER INSERT OR DELETE OR UPDATE ON public.crm_documents FOR EACH STATEMENT EXECUTE FUNCTION bump_crm_live_domain('communication')",
  "CREATE TRIGGER resource_live AFTER INSERT OR DELETE OR UPDATE ON public.crm_inbound_messages FOR EACH STATEMENT EXECUTE FUNCTION bump_crm_live_domain('communication')",
  "CREATE TRIGGER resource_live AFTER INSERT OR DELETE OR UPDATE ON public.crm_messages FOR EACH STATEMENT EXECUTE FUNCTION bump_crm_live_domain('communication')",
  // 046_sales_material
  "CREATE TRIGGER resource_live AFTER INSERT OR DELETE OR UPDATE ON public.crm_sales_material_categories FOR EACH STATEMENT EXECUTE FUNCTION bump_crm_live_domain('communication')",
  "CREATE TRIGGER resource_live AFTER INSERT OR DELETE OR UPDATE ON public.crm_sales_material_category_links FOR EACH STATEMENT EXECUTE FUNCTION bump_crm_live_domain('communication')",
  // 047_sales_material_share_triggers: counted visits (technical counters only) do not bump the live version
  "CREATE TRIGGER resource_live AFTER INSERT OR DELETE ON public.crm_sales_material_shares FOR EACH STATEMENT EXECUTE FUNCTION bump_crm_live_domain('communication')",
  "CREATE TRIGGER resource_live_update AFTER UPDATE ON public.crm_sales_material_shares FOR EACH ROW WHEN ((((to_jsonb(old.*) - 'technical_access_count'::text) - 'last_technical_access_at'::text) IS DISTINCT FROM ((to_jsonb(new.*) - 'technical_access_count'::text) - 'last_technical_access_at'::text))) EXECUTE FUNCTION bump_crm_live_domain('communication')",
  "CREATE TRIGGER resource_live AFTER INSERT OR DELETE OR UPDATE ON public.crm_sales_material_versions FOR EACH STATEMENT EXECUTE FUNCTION bump_crm_live_domain('communication')",
  "CREATE TRIGGER resource_live AFTER INSERT OR DELETE OR UPDATE ON public.crm_sales_materials FOR EACH STATEMENT EXECUTE FUNCTION bump_crm_live_domain('communication')",
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
 /** The version token of a task as the editor gets it from GET /work. */
 const taskVersion=async(id:string)=>(await read('mode=detail&responsible=all&accountId='+a.id+'&taskId='+id,admin.cookie)).tasks.find(t=>t.id===id)!.updatedAt!.toISOString();
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
 await mutate({...base,id:unassigned,title:'Sin responsable editada',leadId:null,expectedUpdatedAt:await taskVersion(unassigned)},admin.cookie);
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
 const completed=await db.selectFrom('crmTasks').selectAll().where('id','=',call).executeTakeFirstOrThrow();assert.equal(completed.result,'Editado');assert.equal(completed.continuationReason,'Ya quedó todo resuelto','An edit without a continuation keeps the linked task reason');
 // Editing the activity of a completed task propagates the new continuation reason to that task.
 await mutate({action:'activity_save',id:activity.id,accountId:a.id,leadId:l.id,title:'Llamada real',typeId:'call',occurredAt:'2026-09-01T14:00:00-03:00',result:'Editado',contactIds:[own.id],continuation:'done',continuationReason:'La gestión ya está cerrada'});
 assert.equal((await db.selectFrom('crmTasks').select('continuationReason').where('id','=',call).executeTakeFirstOrThrow()).continuationReason,'La gestión ya está cerrada');
 assert.equal((await db.selectFrom('crmActivities').select('continuationReason').where('id','=',activity.id).executeTakeFirstOrThrow()).continuationReason,'La gestión ya está cerrada');assert.equal(completed.completedAt!.toISOString(),'2026-09-01T17:00:00.000Z');
 const before=await db.selectFrom('crmActivities').select(eb=>eb.fn.countAll().as('n')).executeTakeFirstOrThrow();
 const retro=await mutate({action:'activity_save',accountId:a.id,leadId:l.id,title:'Carga retrospectiva',typeId:'meeting',occurredAt:'2026-08-01T09:00:00-03:00',result:'Conversamos'});
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
 // `later` is canonical for every purpose, including delivery and care.
 for(const purpose of ['delivery','care'])await mutate({...outcomeBase,purpose,outcome:'later',continuation:'wait',nextTask:{title:'Retomar '+purpose,dueDate:'2026-11-03',typeId:'followup'}});
 // An edit that adds the first result to an activity is a new result: it must say how it continues.
 const retroBase={action:'activity_save',id:retro,accountId:a.id,leadId:l.id,title:'Carga retrospectiva',typeId:'meeting',occurredAt:'2026-08-01T09:00:00-03:00',purpose:'commercial',outcome:'interested'};
 await mutate(retroBase,user.cookie,400);
 await mutate({...retroBase,continuation:'done',continuationReason:'Ya tengo otra tarea agendada'});
 assert.equal((await db.selectFrom('crmActivities').select('continuationReason').where('id','=',retro).executeTakeFirstOrThrow()).continuationReason,'Ya tengo otra tarea agendada');
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
 // #180 optimistic concurrency: an edit carries the version the editor loaded; a stale one answers 409 and changes nothing.
 const loadedVisit=await taskVersion(visit);
 await mutate({...base,id:visit,title:'Visita sin versión',typeId:'visit',dueDate:'2026-10-04',dueAt:null},user.cookie,400);
 const rescheduled={...base,id:visit,title:'Visita reprogramada',typeId:'visit',dueDate:'2026-10-04',dueAt:null,expectedUpdatedAt:loadedVisit};
 await mutate(rescheduled);
 const afterFirstEdit=await db.selectFrom('crmTasks').selectAll().where('id','=',visit).executeTakeFirstOrThrow();
 assert.notEqual(afterFirstEdit.updatedAt.toISOString(),loadedVisit,'A saved edit moves the version');
 // A retry of the same edit whose answer was lost is accepted without writing again.
 await mutate(rescheduled);
 assert.equal((await db.selectFrom('crmTasks').select('updatedAt').where('id','=',visit).executeTakeFirstOrThrow()).updatedAt.getTime(),afterFirstEdit.updatedAt.getTime(),'The replay does not write');
 // Someone else's editor still holds the old version: its different edit is refused and the saved one stays.
 const stale=await post(request({...rescheduled,title:'Visita pisada',dueDate:'2026-10-09'}));
 assert.equal(stale.status,409);assert.match(superjson.parse<{error:string}>(await stale.text()).error,/otra persona cambió esta tarea/);
 const kept=await db.selectFrom('crmTasks').selectAll().where('id','=',visit).executeTakeFirstOrThrow();
 assert.equal(kept.title,'Visita reprogramada');assert.equal(kept.dueDate instanceof Date?kept.dueDate.toISOString().slice(0,10):String(kept.dueDate),'2026-10-04');assert.equal(kept.updatedAt.getTime(),afterFirstEdit.updatedAt.getTime());
 // A reschedule from the row also moves the version, so an editor opened before it is stale too.
 await mutate({action:'task_reschedule',id:visit,expectedDueDate:'2026-10-04',expectedDueAt:null,dueDate:'2026-10-05',dueAt:null});
 await mutate({...rescheduled,title:'Visita pisada',expectedUpdatedAt:afterFirstEdit.updatedAt.toISOString()},user.cookie,409);
 // With the version reloaded, the same edit goes through.
 await mutate({...rescheduled,dueDate:'2026-10-04',expectedUpdatedAt:await taskVersion(visit)});
 assert.equal((await db.selectFrom('crmTasks').select('title').where('id','=',visit).executeTakeFirstOrThrow()).title,'Visita reprogramada');
 await mutate({...base,id:visit,title:'Visit delegated',typeId:'visit',dueDate:'2026-10-04',assignedUserEmail:other.user.email,expectedUpdatedAt:await taskVersion(visit)},admin.cookie);
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
 const month=await read('mode=month&from=2026-10-01&to=2026-10-31');assert(month.tasks.some(t=>t.id===demo),'Month mode lists pending tasks of the month');assert(month.tasks.every(t=>t.dueDate>='2026-10-01'&&t.dueDate<='2026-10-31'),'Month mode keeps the Argentina calendar range');
 assert(!(await read('mode=month&from=2026-10-01&to=2026-10-31',other.cookie)).tasks.some(t=>t.id===demo),'Month mode keeps the responsible scope');
 await read('mode=month&from=2026-09-28&to=2026-11-08');await read('mode=month&from=2026-10-01&to=2026-12-31',user.cookie,400);await read('mode=month',user.cookie,400);
 await mutate({action:'type_save',id:'demo',name:'Demostración',agenda:true,active:false},admin.cookie);
 await mutate({...base,typeId:'demo'},user.cookie,400);
 await mutate({action:'task_delete',id:demo});assert(!(await read()).tasks.some(t=>t.id===demo));
 // Many overdue items must not push today's work off the initial inbox page.
 await db.insertInto('crmTasks').values(Array.from({length:27},(_,i)=>({accountId:a.id,leadId:l.id,title:'Old backlog '+i,typeId:'call',assignedUserEmail:user.user.email,dueDate:'2020-01-01'}))).execute();
 const todays=await mutate({...base,title:'Hoy pese a vencidas',dueDate:localDay()});
 // U-22: overdue and today are never paginated, so a long backlog cannot hide them; only upcoming pages.
 const inbox=await read();assert(inbox.tasks.some(t=>t.id===todays));assert(inbox.bucketCounts!.overdue>=27);assert.equal(inbox.tasks.filter(t=>t.dueDate==='2020-01-01').length,27);assert.equal(inbox.truncated,false);
 const secondPage=await read('page=2');assert(secondPage.tasks.some(t=>t.id===todays),'page 2 still carries today');assert.equal(secondPage.tasks.filter(t=>t.dueDate==='2020-01-01').length,27,'page 2 still carries overdue');
 // The urgent buckets are capped at 300 and say so.
 await db.insertInto('crmTasks').values(Array.from({length:300},(_,i)=>({accountId:a.id,leadId:l.id,title:'Cap backlog '+i,typeId:'call',assignedUserEmail:user.user.email,dueDate:'2019-01-01'}))).execute();
 const capped=await read();assert.equal(capped.tasks.filter(t=>t.dueDate<localDay()&&t.status==='pending').length,300);assert.equal(capped.truncated,true);assert(capped.bucketCounts!.overdue>300);
 await db.deleteFrom('crmTasks').where('title','like','Cap backlog %').execute();
 assert.equal((await read()).truncated,false);
 // Progress counts tasks completed today; a completed task exposes its completion activity so the result can be corrected.
 const beforeDone=(await read()).doneToday!;
 const doneId=await mutate({...base,title:'Para completar hoy',dueDate:localDay()});
 await mutate({action:'task_status',id:doneId,status:'completed',result:'Listo',continuation:'done',continuationReason:'Ya quedó todo resuelto'});
 assert.equal((await read()).doneToday,beforeDone+1);assert(!(await read()).tasks.some(t=>t.id===doneId));
 const early=await mutate({...base,title:'Hecha por adelantado',dueDate:'2030-06-01'});await mutate({action:'task_status',id:early,status:'completed',result:'Listo',continuation:'done',continuationReason:'Ya quedó todo resuelto'});assert.equal((await read()).doneToday,beforeDone+1,'a task due later does not count as today\'s progress');
 const doneRows=await read('mode=detail&accountId='+a.id+'&taskId='+doneId);const doneTask=doneRows.tasks.find(t=>t.id===doneId)!;
 assert(doneTask.activityId,'completed task has activityId');assert(doneRows.activities.some(x=>x.id===doneTask.activityId&&x.taskId===doneId));
 assert.equal((await read('mode=detail&accountId='+a.id+'&taskId='+todays)).tasks[0].activityId,null);

 // task_reschedule changes only the date/time: a stale client cannot revert other fields, a moved date answers 409, and nothing else is looked up.
 const resched=await mutate({...base,title:'Reprogramar solo fecha',description:'Original',priority:'media',dueDate:'2030-03-01'});
 await mutate({...base,id:resched,title:'Editada por otra persona',description:'Cambió mientras tanto',priority:'alta',dueDate:'2030-03-01',participants:'Otra gente',expectedUpdatedAt:await taskVersion(resched)},admin.cookie);
 await db.updateTable('crmTasks').set({contactIds:sql`'["999999"]'::jsonb`}).where('id','=',resched).execute();
 await mutate({action:'task_reschedule',id:resched,expectedDueDate:'2030-03-01',expectedDueAt:null,dueDate:'2030-03-05',dueAt:null});
 const moved=await db.selectFrom('crmTasks').selectAll().where('id','=',resched).executeTakeFirstOrThrow();
 assert.equal(moved.dueDate.toISOString().slice(0,10),'2030-03-05');assert.equal(moved.title,'Editada por otra persona');assert.equal(moved.description,'Cambió mientras tanto');assert.equal(moved.priority,'alta');assert.equal(moved.participants,'Otra gente');assert.deepEqual(moved.contactIds,['999999']);
 const conflictBody=await post(request({action:'task_reschedule',id:resched,expectedDueDate:'2030-03-01',expectedDueAt:null,dueDate:'2030-03-09',dueAt:null}));assert.equal(conflictBody.status,409);assert.match(superjson.parse<{error:string}>(await conflictBody.text()).error,/cambió mientras tanto/);
 assert.equal((await db.selectFrom('crmTasks').select('dueDate').where('id','=',resched).executeTakeFirstOrThrow()).dueDate.toISOString().slice(0,10),'2030-03-05');
 await mutate({action:'task_reschedule',id:resched,expectedDueDate:'2030-03-05',expectedDueAt:null,dueDate:'2030-03-01',dueAt:null,},user.cookie);
 await mutate({action:'task_reschedule',id:resched,expectedDueDate:'2030-03-01',expectedDueAt:null,dueDate:'2030-03-02',dueAt:'2030-03-03T15:00:00-03:00'},user.cookie,400);
 await mutate({action:'task_reschedule',id:resched,expectedDueDate:'2030-03-01',expectedDueAt:null,dueDate:'2030-03-02',dueAt:null},other.cookie,403);
 await db.updateTable('crmTasks').set({status:'cancelled'}).where('id','=',resched).execute();
 await mutate({action:'task_reschedule',id:resched,expectedDueDate:'2030-03-01',expectedDueAt:null,dueDate:'2030-03-02',dueAt:null},user.cookie,400);
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
 // Decision 2B after a contact: the outcome links its message, resolves it once and keeps a single activity.
 const contactMessage=async(v:{status:string;owner?:string;channel?:string;accountId?:string;leadId?:string|null;activity?:boolean;at?:Date|null})=>{const id=crypto.randomUUID();const accountId=v.accountId??a.id,leadId=v.leadId===undefined?l.id:v.leadId;const activity=v.activity?(await db.insertInto('crmActivities').values({accountId,leadId,typeId:'other',title:'Comunicación WhatsApp',channel:'whatsapp',result:'WhatsApp abierto · envío no confirmado',occurredAt:new Date(),notes:'Snapshot de mensaje #'+id,actorEmail:v.owner??user.user.email}).returning('id').executeTakeFirstOrThrow()).id:null;await sql`INSERT INTO crm_messages(id,account_id,original_account_id,lead_id,channel,recipient,recipient_name,owner_email,status,activity_id,last_interaction_at) VALUES(${id}::uuid,${accountId},${accountId},${leadId},${v.channel??'whatsapp'},'+5493447000000','Ana',${v.owner??user.user.email},${v.status},${activity},${v.at??null}::timestamptz)`.execute(db);return {id,activity};};
 const messageRow=async(id:string)=>(await sql<{status:string;activityId:string|null;completedAt:Date|null;summary:string|null}>`SELECT status,activity_id,completed_at,summary FROM crm_messages WHERE id=${id}::uuid`.execute(db)).rows[0];
 const activityCount=async()=>Number((await db.selectFrom('crmActivities').select(eb=>eb.fn.countAll().as('n')).where('accountId','=',a.id).executeTakeFirstOrThrow()).n);
 const contactOutcome={action:'activity_save',accountId:a.id,leadId:l.id,title:'Contacto por WhatsApp',typeId:'message',occurredAt:'2026-09-20T10:00:00-03:00',purpose:'commercial',channel:'whatsapp',contactIds:[own.id],outcome:'no_answer',result:'No respondió',continuation:'done',continuationReason:'Ya tengo otra tarea agendada'};
 const opened=await contactMessage({status:'whatsapp_opened',activity:true});
 // Opening WhatsApp proves nothing: the seller must say whether it was sent, and an outcome is required.
 const unanswered=await post(request({...contactOutcome,messageId:opened.id}));assert.equal(unanswered.status,400);assert.equal(superjson.parse<{error:string}>(await unanswered.text()).error,'Contá si el mensaje se envió.');
 await mutate({...contactOutcome,outcome:null,messageId:opened.id,messageSent:true},user.cookie,400);
 await mutate({...contactOutcome,messageId:opened.id,messageSent:true,continuation:undefined,continuationReason:undefined},user.cookie,400);
 // A restriction on the channel blocks confirming the send (No contactar is respected).
 const restriction=(await sql<{id:string}>`INSERT INTO crm_contact_restrictions(account_id,channel,reason,actor_email,source,evidence) VALUES(${a.id},'whatsapp','Pidió no recibir WhatsApp',${admin.user.email},'manual','test') RETURNING id`.execute(db)).rows[0].id;
 await mutate({...contactOutcome,messageId:opened.id,messageSent:true},user.cookie,403);
 assert.equal((await messageRow(opened.id)).status,'whatsapp_opened','A rejected outcome leaves the message untouched');
 await sql`UPDATE crm_contact_restrictions SET lifted_at=now(),lifted_by=${admin.user.email},lift_reason='test' WHERE id=${restriction}`.execute(db);
 const beforeLink=await activityCount();
 const linkedActivity=await mutate({...contactOutcome,messageId:opened.id,messageSent:true});
 assert.equal(linkedActivity,opened.activity,'The activity created when WhatsApp was opened records the outcome');
 assert.equal(await activityCount(),beforeLink,'No second activity for the same contact');
 assert.equal((await messageRow(opened.id)).status,'manual_sent');
 const outcomeRow=await db.selectFrom('crmActivities').selectAll().where('id','=',linkedActivity).executeTakeFirstOrThrow();
 assert.deepEqual({outcome:outcomeRow.outcome,continuation:outcomeRow.continuation,continuationReason:outcomeRow.continuationReason,result:outcomeRow.result,notes:outcomeRow.notes,actorEmail:outcomeRow.actorEmail},{outcome:'no_answer',continuation:'done',continuationReason:'Ya tengo otra tarea agendada',result:'No respondió',notes:'Snapshot de mensaje #'+opened.id,actorEmail:user.user.email});
 assert.equal((await sql<{n:string}>`SELECT count(*) AS n FROM crm_communication_journal WHERE entity_id=${opened.id} AND action='contact_resolved'`.execute(db)).rows[0].n,'1');
 // The message is resolved once.
 await mutate({...contactOutcome,messageId:opened.id,messageSent:true},user.cookie,409);
 // Later communication results never overwrite what the seller wrote.
 const replied=await communicationPost(new Request('http://localhost/_api/communication',{method:'POST',headers:{cookie:user.cookie},body:superjson.stringify({action:'outcome',id:opened.id,event:'replied',notes:'Respondió más tarde'})}));assert.equal(replied.status,200,await replied.text());
 const afterReply=await db.selectFrom('crmActivities').select(['result','notes','outcome']).where('id','=',linkedActivity).executeTakeFirstOrThrow();assert.deepEqual(afterReply,{result:'No respondió',notes:'Snapshot de mensaje #'+opened.id,outcome:'no_answer'});
 // A registered call has no activity yet: the outcome creates one and links it.
 const callMessage=await contactMessage({status:'manual_sent',channel:'call'});
 const callActivity=await mutate({...contactOutcome,channel:'phone',title:'Contacto por llamada',messageId:callMessage.id,outcome:'interested',continuation:'task',continuationReason:undefined,nextTask:{title:'Enviar propuesta',dueDate:'2026-10-05',typeId:'followup'}});
 assert.equal(await activityCount(),beforeLink+1);
 assert.equal((await messageRow(callMessage.id)).activityId,callActivity);
 assert.equal((await messageRow(callMessage.id)).status,'manual_sent','An already resolved call keeps its status');
 // A manual attempt that was not sent is closed as not done, without inferring a send.
 const pendingAttempt=await contactMessage({status:'manual_pending',channel:'social'});
 // "Not sent" is never recorded from the outcome step: the communication flow marks it.
 const notSent=await post(request({...contactOutcome,channel:'other',messageId:pendingAttempt.id,messageSent:false,outcome:'other',result:'No lo pude mandar'}));assert.equal(notSent.status,400);assert.equal(superjson.parse<{error:string}>(await notSent.text()).error,'Si no se envió, marcalo como no enviado.');
 assert.equal((await messageRow(pendingAttempt.id)).status,'manual_pending');
 // A confirmed manual attempt is completed and keeps the outcome's words as its summary.
 await mutate({...contactOutcome,channel:'other',messageId:pendingAttempt.id,messageSent:true,outcome:'interested',result:'Contestó por Instagram'});
 const doneAttempt=await messageRow(pendingAttempt.id);assert.equal(doneAttempt.status,'manual_sent');assert(doneAttempt.completedAt);assert.equal(doneAttempt.summary,'Contestó por Instagram');
 // Drafts and uncertain email sends are not contacts; other people's or other businesses' messages are refused.
 await mutate({...contactOutcome,messageId:(await contactMessage({status:'draft'})).id,messageSent:true},user.cookie,409);
 await mutate({...contactOutcome,messageId:(await contactMessage({status:'unknown',channel:'email'})).id},user.cookie,409);
 await mutate({...contactOutcome,messageId:(await contactMessage({status:'whatsapp_opened',owner:admin.user.email})).id,messageSent:true},user.cookie,403);
 await mutate({...contactOutcome,messageId:(await contactMessage({status:'manual_sent',channel:'call',accountId:b.id,leadId:null})).id},user.cookie,400);
 await mutate({...contactOutcome,leadId:null,messageId:(await contactMessage({status:'manual_sent',channel:'call'})).id},user.cookie,400);
 // Completing a task after a contact links the same way: one activity, carrying the task.
 const callTask=await mutate({...base,title:'Llamar por la propuesta',dueDate:'2026-10-06'});
 const taskCall=await contactMessage({status:'manual_sent',channel:'call'});
 await mutate({action:'task_status',id:callTask,status:'cancelled',result:'Ya no hace falta',messageId:taskCall.id},user.cookie,400);
 const beforeTask=await activityCount();
 await mutate({action:'task_status',id:callTask,status:'completed',result:'Atendió Ana',outcome:'interested',completedAt:'2026-09-21T11:00:00-03:00',continuation:'done',continuationReason:'Ya tengo otra tarea agendada',messageId:taskCall.id});
 assert.equal(await activityCount(),beforeTask+1);
 const taskActivity=await db.selectFrom('crmActivities').select(['id','taskId','outcome']).where('taskId','=',callTask).executeTakeFirstOrThrow();
 assert.equal((await messageRow(taskCall.id)).activityId,taskActivity.id);assert.equal(taskActivity.outcome,'interested');
 // Task completion also resolves an opened WhatsApp or a pending attempt, and the reused activity carries the task.
 for(const [status,channel] of [['whatsapp_opened','whatsapp'],['manual_pending','social']] as const){
  const task=await mutate({...base,title:'Seguir '+status,dueDate:'2026-10-07'});const m=await contactMessage({status,channel,activity:status==='whatsapp_opened'});
  await mutate({action:'task_status',id:task,status:'completed',result:'Hecho',outcome:'no_answer',completedAt:'2026-09-22T11:00:00-03:00',continuation:'done',continuationReason:'Ya tengo otra tarea agendada',messageId:m.id},user.cookie,400);
  await mutate({action:'task_status',id:task,status:'completed',result:'Hecho',outcome:'no_answer',completedAt:'2026-09-22T11:00:00-03:00',continuation:'done',continuationReason:'Ya tengo otra tarea agendada',messageId:m.id,messageSent:true});
  const row=await messageRow(m.id);assert.equal(row.status,'manual_sent');const linkedTask=await db.selectFrom('crmActivities').select(['id','taskId','outcome']).where('id','=',row.activityId!).executeTakeFirstOrThrow();assert.equal(linkedTask.taskId,task);assert.equal(linkedTask.outcome,'no_answer');if(m.activity)assert.equal(linkedTask.id,m.activity);
 }
 // A delivery confirmed by Brevo after the outcome never overwrites what the seller wrote.
 const emailMessage=await contactMessage({status:'accepted',channel:'email',activity:true});
 const emailActivity=await mutate({...contactOutcome,channel:'email',title:'Contacto por email',messageId:emailMessage.id,outcome:'later',continuation:'done',result:'Pidió que le escriba en noviembre'});
 const outbox=await db.insertInto('emailOutbox').values({recipientEmail:'brevo-'+suffix+'@example.com',senderEmail:'crm@example.com',senderName:'CRM',subject:'Hola',htmlBody:'<p>Hola</p>',textBody:'Hola',status:'accepted',messageId:'brevo-'+suffix}).returning('id').executeTakeFirstOrThrow();
 await sql`UPDATE crm_messages SET outbox_id=${outbox.id} WHERE id=${emailMessage.id}::uuid`.execute(db);
 await sql`INSERT INTO crm_email_events(fingerprint,message_id,recipient,event,occurred_at,payload) VALUES(${'fp-'+suffix},${'brevo-'+suffix},${'brevo-'+suffix+'@example.com'},'delivered',now(),'{}'::jsonb)`.execute(db);
 await db.transaction().execute(t=>reconcileEvents(t,String(outbox.id)));
 assert.equal((await messageRow(emailMessage.id)).status,'delivery_confirmed');
 assert.equal((await db.selectFrom('crmActivities').select('result').where('id','=',emailActivity).executeTakeFirstOrThrow()).result,'Pidió que le escriba en noviembre');
 // No contactar, archived businesses and closed managements block confirming a send.
 const blockedAccount=async(name:string)=>{const acc=await db.insertInto('crmAccounts').values({nombre:name+' '+suffix,assignedUserEmail:user.user.email}).returningAll().executeTakeFirstOrThrow();const lead=await db.insertInto('leads').values({nombre:acc.nombre,accountId:acc.id,opportunityName:'Plan',estado:'Interesado',assignedUserEmail:user.user.email}).returningAll().executeTakeFirstOrThrow();return {acc,lead};};
 const dnc=await blockedAccount('DNC');const dncMessage=await contactMessage({status:'whatsapp_opened',accountId:dnc.acc.id,leadId:dnc.lead.id});
 await sql`UPDATE crm_accounts SET do_not_contact=true WHERE id=${dnc.acc.id}`.execute(db);
 await mutate({...contactOutcome,accountId:dnc.acc.id,leadId:dnc.lead.id,messageId:dncMessage.id,messageSent:true},user.cookie,403);
 const archived=await blockedAccount('Archivado');const archivedMessage=await contactMessage({status:'whatsapp_opened',owner:admin.user.email,accountId:archived.acc.id,leadId:archived.lead.id});
 await sql`UPDATE crm_accounts SET archived_at=now(),status='archived' WHERE id=${archived.acc.id}`.execute(db);
 await mutate({...contactOutcome,accountId:archived.acc.id,leadId:archived.lead.id,messageId:archivedMessage.id,messageSent:true},admin.cookie,403);
 const closedStage=(await sql<{name:string}>`SELECT name FROM crm_stages WHERE classification NOT IN ('open','lost') AND active LIMIT 1`.execute(db)).rows[0].name;
 const closedLead=await blockedAccount('Cerrada');const closedMessage=await contactMessage({status:'whatsapp_opened',accountId:closedLead.acc.id,leadId:closedLead.lead.id});
 await db.updateTable('leads').set({estado:closedStage}).where('id','=',closedLead.lead.id).execute();
 await mutate({...contactOutcome,accountId:closedLead.acc.id,leadId:closedLead.lead.id,messageId:closedMessage.id,messageSent:true},user.cookie,403);
 for(const id of [dncMessage.id,archivedMessage.id,closedMessage.id])assert.equal((await messageRow(id)).status,'whatsapp_opened');
 // Decision 14A: contacts left without an outcome stay in Hoy until resolved; only the seller's own, only since tracking started.
 const pendingNow=await contactMessage({status:'manual_sent',channel:'call',at:new Date()});
 const pendingOld=await contactMessage({status:'manual_sent',channel:'call',at:new Date('2020-01-01T00:00:00Z')});
 const pendingForeign=await contactMessage({status:'manual_sent',channel:'call',owner:admin.user.email,at:new Date()});
 const pendingDraft=await contactMessage({status:'draft',at:new Date()});
 const pendingIds=async(cookie=user.cookie)=>(await read('',cookie)).pendingOutcomes!.map(p=>p.id);
 const listed=await pendingIds();assert(listed.includes(pendingNow.id));for(const id of [pendingOld.id,pendingForeign.id,pendingDraft.id])assert(!listed.includes(id));
 assert((await pendingIds(admin.cookie)).includes(pendingForeign.id));
 await mutate({...contactOutcome,channel:'phone',messageId:pendingNow.id,occurredAt:new Date().toISOString()});
 assert(!(await pendingIds()).includes(pendingNow.id),'A recorded outcome removes the pending item');
 // Only items the seller can still resolve: her own business or management, still active.
 const fresh=async(name:string,owner=user.user.email)=>db.insertInto('crmAccounts').values({nombre:name+' '+suffix,assignedUserEmail:owner}).returningAll().executeTakeFirstOrThrow();
 const pendingCall=(accountId:string,leadId:string|null=null,status='manual_sent',channel='call')=>contactMessage({status,channel,accountId,leadId,at:new Date()});
 const reassigned=await fresh('Reasignado');const reassignedCall=await pendingCall(reassigned.id);
 assert((await pendingIds()).includes(reassignedCall.id));
 await db.updateTable('crmAccounts').set({assignedUserEmail:other.user.email}).where('id','=',reassigned.id).execute();
 assert(!(await pendingIds()).includes(reassignedCall.id),'A reassigned business leaves the list');
 const foreignLead=await db.insertInto('leads').values({nombre:a.nombre,accountId:a.id,opportunityName:'De otra persona',estado:'Interesado',assignedUserEmail:other.user.email}).returningAll().executeTakeFirstOrThrow();
 const foreignLeadCall=await pendingCall(a.id,foreignLead.id);
 assert(!(await pendingIds()).includes(foreignLeadCall.id),'A management of another seller is not hers to resolve');
 // No contactar and closed managements block confirming a send, so those unconfirmed sends stay out; confirmed contacts stay listed.
 const dncOpened=await pendingCall(dnc.acc.id,dnc.lead.id,'whatsapp_opened','whatsapp'),dncCall=await pendingCall(dnc.acc.id,dnc.lead.id);
 const closedOpened=await pendingCall(closedLead.acc.id,closedLead.lead.id,'manual_pending','social'),closedCall=await pendingCall(closedLead.acc.id,closedLead.lead.id);
 let ids=await pendingIds();
 for(const id of [dncOpened.id,closedOpened.id])assert(!ids.includes(id),'An unconfirmed send that cannot be confirmed is left to the communication panel');
 for(const id of [dncCall.id,closedCall.id])assert(ids.includes(id),'A confirmed contact can still get its outcome');
 // Archived or trashed businesses and trashed managements never appear.
 const archivedCall=await pendingCall(archived.acc.id,archived.lead.id,'manual_sent','call');
 const trashed=await fresh('Papelera');const trashedCall=await pendingCall(trashed.id);await db.updateTable('crmAccounts').set({deletedAt:new Date()}).where('id','=',trashed.id).execute();
 const trashedLeadAccount=await blockedAccount('Gestión en papelera');const trashedLeadCall=await pendingCall(trashedLeadAccount.acc.id,trashedLeadAccount.lead.id);await db.updateTable('leads').set({deletedAt:new Date()}).where('id','=',trashedLeadAccount.lead.id).execute();
 ids=await pendingIds();for(const id of [archivedCall.id,trashedCall.id,trashedLeadCall.id])assert(!ids.includes(id));
 // A No contactar response linked to the contact resolves it (the work editor records that answer as a response, not as an activity); a response of another category does not.
 const dncAnswer=await fresh('Pidió no contactar');const dncAnswerCall=await pendingCall(dncAnswer.id),plainAnswerCall=await pendingCall(dncAnswer.id);
 assert((await pendingIds()).includes(dncAnswerCall.id));
 for(const [message,category] of [[dncAnswerCall,'do_not_contact'],[plainAnswerCall,'interested']] as const)await sql`INSERT INTO crm_communication_responses(id,account_id,original_account_id,channel,recipient,recipient_name,linked_message_id,category,summary,actor_email) VALUES(${crypto.randomUUID()}::uuid,${dncAnswer.id},${dncAnswer.id},'call','x','x',${message.id}::uuid,${category},'x',${user.user.email})`.execute(db);
 ids=await pendingIds();assert(!ids.includes(dncAnswerCall.id),'A linked No contactar response resolves the contact');assert(ids.includes(plainAnswerCall.id),'Another response category does not');
 // A later outcome on the same business resolves a confirmed contact, but never hides an unconfirmed WhatsApp.
 const laterAccount=await fresh('Más tarde');const laterCall=await pendingCall(laterAccount.id),laterOpened=await pendingCall(laterAccount.id,null,'whatsapp_opened','whatsapp');
 assert((await pendingIds()).includes(laterCall.id));
 await new Promise(r=>setTimeout(r,20));
 await mutate({action:'activity_save',accountId:laterAccount.id,leadId:null,title:'Charla en la oficina',typeId:'meeting',occurredAt:new Date().toISOString(),purpose:'commercial',outcome:'interested',continuation:'done',continuationReason:'Ya tengo otra tarea agendada'});
 ids=await pendingIds();assert(!ids.includes(laterCall.id),'A later outcome resolves the confirmed call');assert(ids.includes(laterOpened.id),'An opened WhatsApp still needs its own answer');
 // Edits stay exempt from linking.
 await mutate({...contactOutcome,id:callActivity,messageId:(await contactMessage({status:'manual_sent',channel:'call'})).id},user.cookie,400);
 // U-27 first-use checklist flags: true only from the user's own recorded actions.
 const rookie=await identity('user'),rookieFlags=async()=>(await read('mode=day',rookie.cookie)).firstSteps;
 assert.deepEqual(await rookieFlags(),{contacted:false,logged:false,scheduled:false},'A user with no history has nothing ticked');
 const rookieAccount=await fresh('Primeros pasos',rookie.user.email);
 // Real snapshot behaviour: opening WhatsApp, a failed/denied send and a send marked not done each leave an activity WITH a channel; none of them is a contact.
 for(const status of ['whatsapp_opened','manual_not_done'])await contactMessage({status,owner:rookie.user.email,channel:'whatsapp',accountId:rookieAccount.id,leadId:null,activity:true,at:new Date()});
 assert.equal((await rookieFlags())!.contacted,false,'Opening WhatsApp or a not-done send is not a contact');
 // A registered rejection (the business said no) is contact evidence under section 4; it is checked on another seller so the rookie stays untouched.
 const rejecter=await identity('user'),rejecterAccount=await fresh('Rechazo registrado',rejecter.user.email);
 await contactMessage({status:'rejected',owner:rejecter.user.email,channel:'whatsapp',accountId:rejecterAccount.id,leadId:null,activity:true,at:new Date()});
 assert.equal((await read('mode=day',rejecter.cookie)).firstSteps!.contacted,true,'A registered rejection is contact evidence under section 4');
 const attempt=await identity('user'),attemptAccount=await fresh('Sin respuesta',attempt.user.email);
 await mutate({action:'activity_save',accountId:attemptAccount.id,leadId:null,title:'Llamada sin respuesta',typeId:'call',occurredAt:new Date().toISOString(),purpose:'commercial',channel:'call',outcome:'no_answer',continuation:'done',continuationReason:'Ya tengo otra tarea agendada'},attempt.cookie);
 const attemptFlags=(await read('mode=day',attempt.cookie)).firstSteps!;
 assert.equal(attemptFlags.logged,true,'An unanswered attempt still ticks "Anotá cómo salió"');assert.equal(attemptFlags.contacted,false,'An unanswered attempt is not a contact');
 await mutate({action:'activity_save',accountId:attemptAccount.id,leadId:null,title:'Charla',typeId:'meeting',occurredAt:new Date().toISOString(),purpose:'commercial',channel:'call',outcome:'interested',continuation:'done',continuationReason:'Ya tengo otra tarea agendada'},attempt.cookie);
 assert.equal((await read('mode=day',attempt.cookie)).firstSteps!.contacted,true,'An activity with a real outcome is a contact');
 assert.equal((await rookieFlags())!.contacted,false,'Opening WhatsApp or saving a draft is not a contact');
 assert.deepEqual((await read('mode=day',user.cookie)).firstSteps!.scheduled,true,'Other users never tick the rookie flags and the seller with history does');
 await mutate({action:'task_save',accountId:rookieAccount.id,leadId:null,title:'Primera tarea',typeId:'call',dueDate:localDay(),contactIds:[],participants:''},rookie.cookie);
 assert.deepEqual(await rookieFlags(),{contacted:false,logged:false,scheduled:true},'Scheduling a task ticks only step 4');
 await contactMessage({status:'manual_sent',owner:rookie.user.email,channel:'call',accountId:rookieAccount.id,leadId:null,at:new Date()});
 assert.equal((await rookieFlags())!.contacted,true,'A confirmed contact ticks step 2');
 await mutate({action:'activity_save',accountId:rookieAccount.id,leadId:null,title:'Charla',typeId:'meeting',occurredAt:new Date().toISOString(),purpose:'commercial',outcome:'interested',continuation:'done',continuationReason:'Ya tengo otra tarea agendada'},rookie.cookie);
 assert.equal((await rookieFlags())!.logged,true,'Noting how it went ticks step 3');
 assert.equal((await read('mode=agenda&from=2026-01-01&to=2026-01-31',rookie.cookie)).firstSteps,undefined,'Only day mode carries the flags');
 // Decision 9A: a suggested stage moves only when the seller explicitly sends it, and then through the same rules as a manual transition.
 const sugAccount=await db.insertInto('crmAccounts').values({nombre:'Suggestion '+suffix,status:'reviewed',assignedUserEmail:user.user.email}).returningAll().executeTakeFirstOrThrow();
 const sugLead=await db.insertInto('leads').values({nombre:sugAccount.nombre,accountId:sugAccount.id,opportunityName:'Plan sugerido',estado:'main:contact',managementType:'main',assignedUserEmail:user.user.email} as never).returningAll().executeTakeFirstOrThrow();
 const sugState=async()=>(await db.selectFrom('leads').select(['estado','pipelineRevision']).where('id','=',sugLead.id).executeTakeFirstOrThrow());
 const sugCount=async()=>Number((await db.selectFrom('crmActivities').select(eb=>eb.fn.countAll().as('n')).where('leadId','=',sugLead.id).executeTakeFirstOrThrow()).n);
 const sugBody=(extra:Record<string,unknown>={})=>({action:'activity_save',accountId:sugAccount.id,leadId:sugLead.id,title:'Charla sugerida',typeId:'meeting',occurredAt:new Date().toISOString(),purpose:'commercial',outcome:'interested',continuation:'done',continuationReason:'Ya tengo otra tarea agendada',...extra});
 await mutate(sugBody(),user.cookie);
 assert.equal((await sugState()).estado,'main:contact','Saving a result without the explicit choice never moves the stage');
 let sugBefore=await sugState(),sugActivities=await sugCount();
 await mutate(sugBody({stageChange:{stage:'main:won',revision:sugBefore.pipelineRevision}}),user.cookie,400);
 await mutate(sugBody({outcome:'no_answer',stageChange:{stage:'main:interested',revision:sugBefore.pipelineRevision}}),user.cookie,400);
 await mutate(sugBody({leadId:null,stageChange:{stage:'main:interested',revision:sugBefore.pipelineRevision}}),user.cookie,400);
 await mutate(sugBody({stageChange:{stage:'main:interested',revision:sugBefore.pipelineRevision-1}}),user.cookie,409);
 // A stranger is stopped by the general work guard before the new check; the delegated assignee below is the case that reaches it.
 await mutate(sugBody({stageChange:{stage:'main:interested',revision:sugBefore.pipelineRevision}}),other.cookie,403);
 const sugDelegated=await mutate({action:'task_save',accountId:sugAccount.id,leadId:sugLead.id,title:'Delegada',typeId:'call',dueDate:localDay(),contactIds:[],participants:'',assignedUserEmail:other.user.email},admin.cookie);
 await mutate({action:'task_status',id:sugDelegated,status:'completed',purpose:'commercial',outcome:'interested',continuation:'done',continuationReason:'Ya tengo otra tarea agendada',result:'Le interesa',stageChange:{stage:'main:interested',revision:(await sugState()).pipelineRevision}},other.cookie,403);
 assert.deepEqual([(await sugState()).estado,await sugCount()],['main:contact',sugActivities],'Every rejected request leaves both the stage and the sugActivities untouched');
 await db.updateTable('crmAccounts').set({doNotContact:true}).where('id','=',sugAccount.id).execute();
 await mutate(sugBody({stageChange:{stage:'main:interested',revision:(await sugState()).pipelineRevision}}),user.cookie,403);
 await db.updateTable('crmAccounts').set({doNotContact:false}).where('id','=',sugAccount.id).execute();
 sugBefore=await sugState();
 await mutate(sugBody({stageChange:{stage:'main:interested',revision:sugBefore.pipelineRevision}}),user.cookie);
 assert.equal((await sugState()).estado,'main:interested','An accepted suggestion moves the stage');
 assert.equal(await sugCount(),sugActivities+1,'The result is saved together with the stage');
 const stageEvent=(await sql<{oldStage:string;newStage:string;managementNote:string|null;actorEmail:string|null}>`SELECT old_stage,new_stage,management_note,actor_email FROM crm_pipeline_events WHERE lead_id=${sugLead.id} AND action='stage' ORDER BY id DESC LIMIT 1`.execute(db)).rows[0];
 assert.deepEqual([stageEvent.oldStage,stageEvent.newStage,stageEvent.actorEmail],['main:contact','main:interested',user.user.email]);
 assert.match(stageEvent.managementNote??'',/^Elegido al anotar cómo salió: «.+»\.$/,'The pipeline event carries a neutral note about where the choice came from');
 await mutate(sugBody({stageChange:{stage:'main:interested',revision:(await sugState()).pipelineRevision}}),user.cookie,400);
 const sugEditable=await mutate(sugBody({title:'Editable'}),user.cookie);
 await mutate({...sugBody({title:'Editable',id:sugEditable}),stageChange:{stage:'main:interested',revision:(await sugState()).pipelineRevision}},user.cookie,400);
 assert.equal((await sugState()).estado,'main:interested','An edit or a repeated suggestion cannot move the stage again');
 // Same flow for other actors and outcomes.
 const extra=async(name:string,owner:typeof user,fields:Record<string,unknown>={})=>{
  const account=await db.insertInto('crmAccounts').values({nombre:name+' '+suffix,status:'reviewed',assignedUserEmail:owner.user.email}).returningAll().executeTakeFirstOrThrow();
  const lead=await db.insertInto('leads').values({nombre:account.nombre,accountId:account.id,opportunityName:name,estado:'main:contact',managementType:'main',assignedUserEmail:owner.user.email} as never).returningAll().executeTakeFirstOrThrow();
  if(Object.keys(fields).length)await db.updateTable('crmAccounts').set(fields as never).where('id','=',account.id).execute();
  const rev=async()=>(await db.selectFrom('leads').select(['estado','pipelineRevision']).where('id','=',lead.id).executeTakeFirstOrThrow());
  const body=(more:Record<string,unknown>={})=>({action:'activity_save',accountId:account.id,leadId:lead.id,title:'Charla '+name,typeId:'meeting',occurredAt:new Date().toISOString(),purpose:'commercial',outcome:'interested',continuation:'done',continuationReason:'Ya tengo otra tarea agendada',...more});
  return {account,lead,rev,body};
 };
 // An admin may accept the suggestion on a management that belongs to someone else.
 const adm=await extra('Admin move',other);
 await mutate(adm.body({stageChange:{stage:'main:interested',revision:(await adm.rev()).pipelineRevision}}),admin.cookie);
 assert.equal((await adm.rev()).estado,'main:interested','An admin can accept the suggestion on another seller\'s management');
 // "Más adelante" only suggests the contacted stage, from the first contact stage.
 const lat=await extra('Later move',user);
 await mutate(lat.body({outcome:'later',stageChange:{stage:'main:interested',revision:(await lat.rev()).pipelineRevision}}),user.cookie,400);
 await mutate(lat.body({outcome:'later',stageChange:{stage:'main:contacted',revision:(await lat.rev()).pipelineRevision}}),user.cookie);
 assert.equal((await lat.rev()).estado,'main:contacted');
 // Cancelling a task never carries a stage change.
 const can=await extra('Cancel move',user);
 const canTask=await mutate({action:'task_save',accountId:can.account.id,leadId:can.lead.id,title:'Cancelable',typeId:'call',dueDate:localDay(),contactIds:[],participants:''},user.cookie);
 await mutate({action:'task_status',id:canTask,status:'cancelled',result:'Ya no hace falta',stageChange:{stage:'main:interested',revision:(await can.rev()).pipelineRevision}},user.cookie,400);
 assert.equal((await can.rev()).estado,'main:contact','A cancelled task cannot move the stage');
 // An archived business cannot be moved by its seller (403) and nothing is saved.
 const arc=await extra('Archived move',user,{archivedAt:new Date()});
 await mutate(arc.body({stageChange:{stage:'main:interested',revision:(await arc.rev()).pipelineRevision}}),user.cookie,403);
 assert.equal((await arc.rev()).estado,'main:contact');
 console.log('Work API: auth, assignee restriction/delegation, contact ownership, multiple tasks, retrospective completion/activity/audit, legacy quick/full editors, agenda/catalog, logical deletion passed');
}finally{await db.destroy()}
