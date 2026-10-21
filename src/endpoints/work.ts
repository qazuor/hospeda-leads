import {searchSql,normalizeSearchSql} from "../helpers/searchSql";
import {CrmForbidden,assertBusinessAccess,assertLeadAccess,assertAccountReadable} from '../helpers/crmPermissions';
import {outcomeOptions} from '../helpers/workOutcomes';
import {parseBody} from '../helpers/parseBody';
import {crmError,fallbackStatus} from '../helpers/crmErrors';
import {accountFamily} from '../helpers/accountIdentity';
import superjson from 'superjson';
import {sql} from 'kysely';
import {db} from '../helpers/db';
import {getServerUserSession} from '../helpers/getServerUserSession';
import {NotAuthenticatedError} from '../helpers/getSetServerSession';
import {calendarDay,localDay} from '../helpers/workDates';
import {workMutation,workQuery,followupSettings} from './work.schema';
import {suggestedStageForOutcome} from '../helpers/businessManagement';
import {canModifyManagement} from '../helpers/crmPermissions';
import {outcomeLabel} from '../helpers/crmLabels';
/** Mi día returns every overdue and today task up to this many per bucket. */
const URGENT_CAP=300;
class Forbidden extends Error {}
/** The task changed since the client read it (409). */
class RescheduleConflict extends Error {}
/** The management moved on since the seller saw the suggested stage (409, decision 9A). */
class StageSuggestionConflict extends Error {}
const reply=(data:unknown,status=200)=>new Response(superjson.stringify(data),{status,headers:{'Content-Type':'application/json'}});
const fail=(e:unknown)=>reply({error:crmError(e)},e instanceof Forbidden||e instanceof CrmForbidden||e instanceof CommunicationForbidden?403:e instanceof NotAuthenticatedError?401:e instanceof CommunicationConflict||e instanceof RescheduleConflict||e instanceof StageSuggestionConflict?409:fallbackStatus(e));
const serialize=(v:unknown)=>JSON.parse(JSON.stringify(v));
import {setWorkActor} from '../helpers/workAudit';
import {CommunicationConflict,CommunicationForbidden,linkMessageActivity,lockCommunication,pendingContactOutcomes,resolveMessageForWork} from '../helpers/communicationService';
export async function get(request:Request){
 try{
  const {user}=await getServerUserSession(request);
  const input=workQuery.parse(Object.fromEntries(new URL(request.url).searchParams));
  if(input.accountId)await assertBusinessAccess(db,input.accountId,user);
  if(input.leadId)await assertLeadAccess(db,input.leadId,user);
  if(input.calendar&&(input.mode!=='agenda'||!input.from||!input.to||Date.parse(input.to)-Date.parse(input.from)>31*86400000||input.from&&input.to&&input.from>input.to))throw new Error('Elegí un mes para el calendario.');
  const setting=await db.selectFrom('appSettings').select('value').where('key','=','crm_work_followup').executeTakeFirstOrThrow();
  const followup=followupSettings.parse({action:'followup_settings',...JSON.parse(setting.value)});
  const responsible=input.responsible??user.email;
  if(user.role!=='admin'&&responsible!==user.email)throw new Forbidden('La vista de equipo es exclusiva de administradores.');
  let tasks=db.selectFrom('crmTasks as t').innerJoin('crmAccounts as a','a.id','t.accountId').leftJoin('leads as l','l.id','t.leadId').where('t.deletedAt','is',null).where(eb=>eb.or([eb('t.leadId','is',null),eb('l.deletedAt','is',null)]));
  let activities=db.selectFrom('crmActivities as t').innerJoin('crmAccounts as a','a.id','t.accountId').leftJoin('leads as l','l.id','t.leadId').where('t.deletedAt','is',null).where(eb=>eb.or([eb('t.leadId','is',null),eb('l.deletedAt','is',null)]));
  let attention=db.selectFrom('leads as l').innerJoin('crmAccounts as a','a.id','l.accountId').where('l.deletedAt','is',null).where(sql<string>`coalesce((select classification from crm_stages where name=l.estado),'open')`,'=','open');
  tasks=tasks.where('a.deletedAt','is',null);activities=activities.where('a.deletedAt','is',null);attention=attention.where('a.deletedAt','is',null);
  // Detail of one business already passed assertBusinessAccess, which lets only its responsible seller view it once archived (decision 1C).
  if(user.role!=='admin'&&!(input.mode==='detail'&&input.accountId)){tasks=tasks.where('a.archivedAt','is',null);activities=activities.where('a.archivedAt','is',null);attention=attention.where('a.archivedAt','is',null);}
  if(responsible!=='all'){
   tasks=tasks.where('t.assignedUserEmail','=',responsible);
   activities=activities.where(eb=>eb.or([eb('t.actorEmail','=',responsible),eb.exists(eb.selectFrom('crmTasks').select('id').whereRef('crmTasks.id','=','t.taskId').where('crmTasks.assignedUserEmail','=',responsible)),eb('l.assignedUserEmail','=',responsible),eb.and([eb('t.leadId','is',null),eb('a.assignedUserEmail','=',responsible)])]));
   attention=attention.where('l.assignedUserEmail','=',responsible);
  }
  if(input.accountId){tasks=tasks.where('t.accountId','=',input.accountId);activities=activities.where('t.accountId','=',input.accountId);attention=attention.where('l.accountId','=',input.accountId);}
  if(input.leadId){tasks=tasks.where('t.leadId','=',input.leadId);activities=activities.where('t.leadId','=',input.leadId);attention=attention.where('l.id','=',input.leadId);}
  if(input.taskId){if(input.mode!=='detail'||!input.accountId)throw new Error('Elegí el negocio del pendiente.');tasks=tasks.where('t.id','=',input.taskId);activities=activities.where('t.taskId','=',input.taskId);}
  if(input.city){tasks=tasks.where('a.ciudad','=',input.city);activities=activities.where('a.ciudad','=',input.city);attention=attention.where('a.ciudad','=',input.city);}
  if(input.vertical){tasks=tasks.where('l.tipo','=',input.vertical);activities=activities.where('l.tipo','=',input.vertical);attention=attention.where('l.tipo','=',input.vertical);}
  // Decision U-22: progress "Hoy: N de M hechas" counts tasks completed today, so keep the pre-status builder.
  const tasksAnyStatus=tasks;
  if(input.mode==='day')tasks=tasks.where('t.status','=','pending');
  if(input.mode==='agenda'){
   const agendaTypes=await db.selectFrom('crmWorkTypes').select('id').where('agenda','=',true).execute();
   const ids=agendaTypes.map(t=>t.id);
   tasks=tasks.where('t.typeId','in',ids.length?ids:['__none__']).where('t.status','=','pending');
   activities=activities.where('t.typeId','in',ids.length?ids:['__none__']);
  }
  if(input.from){tasks=tasks.where(sql<string>`t.due_date`,'>=',input.from);activities=activities.where(sql<string>`(t.occurred_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date`,'>=',input.from);}
  if(input.to){tasks=tasks.where(sql<string>`t.due_date`,'<=',input.to);activities=activities.where(sql<string>`(t.occurred_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date`,'<=',input.to);}
  if(input.mode==='duplicates'){
   if(!input.accountId||!input.duplicateTitle||!input.duplicateType||!input.from||input.from!==input.to)throw new Error('Falta el contexto, título, tipo o fecha para revisar pendientes.');
   let matches=tasks.where('t.status','=','pending').where('t.typeId','=',input.duplicateType).where(sql<boolean>`${normalizeSearchSql(sql<string>`trim(t.title)`)} = ${normalizeSearchSql(sql<string>`${input.duplicateTitle}`)}`);
   if(!input.leadId)matches=matches.where('t.leadId','is',null);
   if(input.excludeTaskId)matches=matches.where('t.id','!=',input.excludeTaskId);
   const [rows,count]=await Promise.all([matches.selectAll('t').select(['a.nombre as accountName','a.ciudad as city','l.opportunityName']).orderBy('t.dueAt').orderBy('t.id').limit(5).execute(),matches.select(eb=>eb.fn.countAll().as('n')).executeTakeFirstOrThrow()]);
   return reply({tasks:rows.map(t=>({...t,dueDate:calendarDay(t.dueDate)})),total:Number(count.n)});
  }
  let accountsQuery=db.selectFrom('crmAccounts').select(['id','nombre','ciudad','assignedUserEmail','doNotContact']).where('mergedIntoId','is',null).where('deletedAt','is',null);
  let opportunitiesQuery=db.selectFrom('leads').select(['id','accountId','opportunityName','tipo','estado','managementType','pipelineRevision','assignedUserEmail','createdAt','fechaUltimoContacto']).where('deletedAt','is',null);
  opportunitiesQuery=opportunitiesQuery.where('accountId','in',db.selectFrom('crmAccounts').select('id').where('deletedAt','is',null));
  if(user.role!=='admin'){
   accountsQuery=accountsQuery.where('archivedAt','is',null);
   opportunitiesQuery=opportunitiesQuery.where('accountId','in',db.selectFrom('crmAccounts').select('id').where('archivedAt','is',null));
   accountsQuery=accountsQuery.where(eb=>eb.or([eb('assignedUserEmail','=',user.email),eb.exists(eb.selectFrom('crmTasks').select('id').whereRef('crmTasks.accountId','=','crmAccounts.id').where('crmTasks.assignedUserEmail','=',user.email).where('crmTasks.deletedAt','is',null)),eb.exists(eb.selectFrom('leads').select('id').whereRef('leads.accountId','=','crmAccounts.id').where('leads.assignedUserEmail','=',user.email).where('deletedAt','is',null))]));
   opportunitiesQuery=opportunitiesQuery.where(eb=>eb.or([eb('assignedUserEmail','=',user.email),eb.exists(eb.selectFrom('crmTasks').select('id').whereRef('crmTasks.leadId','=','leads.id').where('crmTasks.assignedUserEmail','=',user.email).where('crmTasks.deletedAt','is',null))]));
  }
  if(input.accountId){accountsQuery=accountsQuery.where('id','=',input.accountId);opportunitiesQuery=opportunitiesQuery.where('accountId','=',input.accountId);}
  if(input.q)accountsQuery=accountsQuery.where(eb=>eb.or([searchSql('nombre',input.q!),searchSql('ciudad',input.q!)]));
  // Search results are bounded; a concrete context is fetched separately.
  const selectedAccounts=await accountsQuery.orderBy('nombre').limit(input.accountId?1:50).execute();
  opportunitiesQuery=opportunitiesQuery.where('accountId','in',selectedAccounts.length?selectedAccounts.map(a=>a.id):['0']);
  if(input.mode==='lookup'){
   const contacts=selectedAccounts.length?await db.selectFrom('crmContacts').select(['id','accountId','name']).where('accountId','in',selectedAccounts.map(a=>a.id)).where('deletedAt','is',null).orderBy('name').execute():[];
   return reply({accounts:selectedAccounts,opportunities:await opportunitiesQuery.execute(),contacts});
  }
  const now=new Date(),today=localDay(now);
  const dayQueries=[
   tasks.where(eb=>eb.or([eb(sql<string>`t.due_date`,'<',today),eb('t.dueAt','<',now)])),
   tasks.where(sql<string>`t.due_date`,'=',today).where(eb=>eb.or([eb('t.dueAt','is',null),eb('t.dueAt','>=',now)])),
   tasks.where(sql<string>`t.due_date`,'>',today)
  ];
  const taskPage=(query:typeof tasks,limit:number,offset=(input.page-1)*limit)=>query.selectAll('t').select(['a.nombre as accountName','a.ciudad as city','l.opportunityName',sql<string|null>`(select ca.id from crm_activities ca where ca.task_id=t.id and ca.deleted_at is null order by ca.occurred_at desc, ca.id desc limit 1)`.as('activityId')]).orderBy(sql`CASE WHEN t.status='pending' THEN 0 ELSE 1 END`).orderBy('t.dueDate').orderBy('t.dueAt').orderBy('t.id').$if(!input.calendar,q=>q.limit(limit).offset(offset)).execute();
  // Overdue and today are never paginated (capped at URGENT_CAP): hiding them on page 2 buried the urgent work. Only upcoming pages.
  const taskRowsPromise=input.mode==='day'?Promise.all([taskPage(dayQueries[0],URGENT_CAP,0),taskPage(dayQueries[1],URGENT_CAP,0),taskPage(dayQueries[2],25)]).then(rows=>rows.flat()):taskPage(tasks,100);
  const doneTodayPromise=input.mode==='day'?tasksAnyStatus.where('t.status','=','completed').where(sql<string>`t.due_date`,'<=',today).where(sql<string>`(t.completed_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date`,'=',today).select(eb=>eb.fn.countAll().as('n')).executeTakeFirstOrThrow().then(r=>Number(r.n)):Promise.resolve(undefined);
  const bucketCountsPromise=input.mode==='day'?Promise.all(dayQueries.map(query=>query.select(eb=>eb.fn.countAll().as('n')).executeTakeFirstOrThrow())).then(rows=>({overdue:Number(rows[0].n),today:Number(rows[1].n),upcoming:Number(rows[2].n)})):Promise.resolve(undefined);
  const [taskRows,activityRows,taskCount,activityCount,types,accounts,opportunities,users,needs,bucketCounts,doneToday]=await Promise.all([

   taskRowsPromise,
   activities.selectAll('t').select(['a.nombre as accountName','a.ciudad as city']).orderBy('t.occurredAt','desc').orderBy('t.id','desc').$if(!input.calendar,q=>q.limit(100).offset((input.page-1)*100)).execute(),
   tasks.select(eb=>eb.fn.countAll().as('n')).executeTakeFirstOrThrow(),activities.select(eb=>eb.fn.countAll().as('n')).executeTakeFirstOrThrow(),
   db.selectFrom('crmWorkTypes').selectAll().orderBy('name').execute(),Promise.resolve(selectedAccounts),opportunitiesQuery.execute(),
   db.selectFrom('users').select(['email','displayName']).orderBy('displayName').execute(),
   attention.select(['l.id','l.accountId','a.nombre','l.opportunityName','l.createdAt','l.fechaUltimoContacto','l.estado']).where(eb=>eb.not(eb.exists(eb.selectFrom('crmTasks').select('id').whereRef('crmTasks.leadId','=','l.id').where('status','=','pending').where('deletedAt','is',null)))).where(eb=>eb.or([eb('l.estado','in',followup.stages.length?followup.stages:['__none__']),eb.and([eb('l.fechaUltimoContacto','is',null),eb(sql`l.assigned_at AT TIME ZONE 'America/Argentina/Buenos_Aires'`,'>=',sql`${localDay()}::date - ${followup.newAssignmentDays}::integer`)])])).orderBy('l.createdAt','desc').execute(),bucketCountsPromise,doneTodayPromise
  ]);
  const cities=(await db.selectFrom('crmAccounts').select('ciudad').where('mergedIntoId','is',null).where('deletedAt','is',null).where('ciudad','is not',null).distinct().orderBy('ciudad').execute()).map(r=>r.ciudad).filter(Boolean);
  const verticals=(await db.selectFrom('leads').select('tipo').where('deletedAt','is',null).where('tipo','is not',null).distinct().orderBy('tipo').execute()).map(r=>r.tipo).filter(Boolean);
  const contacts=accounts.length?await db.selectFrom('crmContacts').select(['id','accountId','name']).where('accountId','in',accounts.map(a=>a.id)).where('deletedAt','is',null).orderBy('name').execute():[];
  // Audit is available for a concrete context only, to avoid mixing it into the day inbox.
  let journal:unknown[]=[];
  if(input.accountId){
   if(user.role==='admin'||accounts.length){journal=await db.selectFrom('crmWorkJournal').selectAll().where('accountId','in',await accountFamily(db,input.accountId)).orderBy('createdAt','desc').limit(200).execute();}
  }
  // Decision 2B: the seller's own contacts still waiting for "¿Cómo salió?" stay visible in Hoy.
  const firstSteps=input.mode==='day'?await firstStepFlags(db,user.email):undefined;
  const pendingOutcomes=input.mode==='day'?await pendingContactOutcomes(db,{ownerEmail:user.email,isAdmin:user.role==='admin'}):[];
  return reply({firstSteps,pendingOutcomes,cities,verticals,tasks:taskRows.map(t=>({...t,dueDate:calendarDay(t.dueDate)})),activities:activityRows,types,accounts,opportunities,contacts,users,attention:needs.map(l=>({id:l.id,accountId:l.accountId,nombre:l.nombre,opportunityName:l.opportunityName,reason:followup.stages.includes(l.estado??'')?'Interesado sin tarea pendiente':`Nueva asignada sin contacto (últimos ${followup.newAssignmentDays} días)`})),journal,bucketCounts,doneToday,truncated:bucketCounts?bucketCounts.overdue>URGENT_CAP||bucketCounts.today>URGENT_CAP:undefined,followupStages:followup.stages,newAssignmentDays:followup.newAssignmentDays,totalTasks:Number(taskCount.n),totalActivities:Number(activityCount.n),page:input.page});
 }catch(e){return fail(e)}
}
/** First-use checklist flags: true only from the user's own recorded actions (confirmed contact, outcome noted, task scheduled), never from opening a screen or saving a draft. */
async function firstStepFlags(e:typeof db,email:string){
 const r=(await sql<{contacted:boolean;logged:boolean;scheduled:boolean}>`SELECT
  (EXISTS(SELECT 1 FROM crm_messages WHERE owner_email=${email} AND status IN ('manual_sent','accepted','delivery_confirmed','replied')) OR EXISTS(SELECT 1 FROM crm_activities WHERE actor_email=${email} AND deleted_at IS NULL AND outcome IS NOT NULL AND outcome<>'no_answer')) AS contacted,
  EXISTS(SELECT 1 FROM crm_activities WHERE actor_email=${email} AND deleted_at IS NULL AND outcome IS NOT NULL) AS logged,
  EXISTS(SELECT 1 FROM crm_work_journal WHERE actor_email=${email} AND entity='crm_tasks' AND action='INSERT') AS scheduled`.execute(e)).rows[0];
 return {contacted:!!r?.contacted,logged:!!r?.logged,scheduled:!!r?.scheduled};
}
export async function post(request:Request){
 try{
  const {user}=await getServerUserSession(request);
  const input=workMutation.parse(await parseBody(request));
  const id=await db.transaction().execute(async trx=>{
   await setWorkActor(trx,user);
   if(input.action==='followup_settings'){
    if(user.role!=='admin')throw new Forbidden('Solo admin puede configurar el seguimiento.');
    await trx.updateTable('appSettings').set({value:JSON.stringify({stages:input.stages,newAssignmentDays:input.newAssignmentDays}),updatedAt:new Date()}).where('key','=','crm_work_followup').execute();return 'crm_work_followup';
   }
   if(input.action==='type_save'){
    if(user.role!=='admin')throw new Forbidden('Solo admin puede configurar tipos.');
    if(input.id==='followup'&&!input.active)throw new Error('Seguimiento se usa en la compatibilidad de próxima acción.');
    await trx.insertInto('crmWorkTypes').values({id:input.id,name:input.name,agenda:input.agenda,active:input.active}).onConflict(oc=>oc.column('id').doUpdateSet({name:input.name,agenda:input.agenda,active:input.active})).execute();
    return input.id;
   }
   // Lock the lead before its tasks, consistent with legacy editors/projection triggers.
   const isTask=input.action.startsWith('task_');
   const previous=input.id?(isTask?await trx.selectFrom('crmTasks').selectAll().where('id','=',input.id).where('deletedAt','is',null).executeTakeFirstOrThrow():await trx.selectFrom('crmActivities').selectAll().where('id','=',input.id).where('deletedAt','is',null).executeTakeFirstOrThrow()):null;
   const accountId='accountId' in input?input.accountId:previous!.accountId;
   const leadId='accountId' in input?(input.leadId??null):previous!.leadId;
   if(previous&&(String(previous.accountId)!==String(accountId)||String(previous.leadId??'')!==String(leadId??'')))throw new Error('No se puede mover un registro a otro contexto.');
   // A contact outcome also writes its message: take the communication locks first, so the order stays account → lead → message.
   const messageId='messageId' in input?input.messageId:undefined;
   if(messageId)await lockCommunication(trx,async()=>({accountIds:[accountId]}));
   const account=await trx.selectFrom('crmAccounts').selectAll().where('id','=',accountId).forUpdate().executeTakeFirstOrThrow();
   const lead=leadId?await trx.selectFrom('leads').selectAll().where('id','=',leadId).where('accountId','=',accountId).where('deletedAt','is',null).forUpdate().executeTakeFirstOrThrow():null;
   assertAccountReadable(user,account);
   const commercialOwner=lead?lead.assignedUserEmail:account.assignedUserEmail;
   const delegatedTask=previous&&isTask&&'assignedUserEmail' in previous&&previous.assignedUserEmail===user.email;
   const linkedTask=previous&&!isTask&&'taskId' in previous&&previous.taskId?await trx.selectFrom('crmTasks').select('assignedUserEmail').where('id','=',previous.taskId).executeTakeFirst():null;
   if(user.role!=='admin'&&commercialOwner!==user.email&&!delegatedTask&&linkedTask?.assignedUserEmail!==user.email)throw new Forbidden('Solo podés gestionar trabajo de tus negocios o gestiones asignados.');
   if(previous&&isTask){
    const old=await trx.selectFrom('crmTasks').selectAll().where('id','=',input.id!).where('deletedAt','is',null).forUpdate().executeTakeFirstOrThrow();
    if(user.role!=='admin'&&old.assignedUserEmail!==user.email)throw new Forbidden('La tarea corresponde a otro responsable.');
   }
   // Decision 9A: moving the stage is only ever the seller's explicit answer to the suggestion. It runs here, in the same transaction, but is validated against the same rules as the pipeline transition before anything is written.
   const stageChange='stageChange' in input?input.stageChange:undefined,stageOutcome='outcome' in input?input.outcome:null;
   if(stageChange){
    if(!lead)throw new Error('La etapa pertenece a una gestión: elegí la gestión de este registro.');
    if(input.action==='activity_save'&&input.id)throw new Error('La etapa solo se propone al registrar un resultado nuevo.');
    if(input.action==='task_status'&&input.status!=='completed')throw new Error('La etapa solo se propone al registrar un resultado.');
    if(!canModifyManagement(user,lead,account)||(account.archivedAt&&user.role!=='admin'))throw new Forbidden('Solo el responsable de esta gestión o un administrador puede cambiar su etapa.');
    if(account.doNotContact)throw new Forbidden('Este negocio está marcado como No contactar: no se cambia la etapa desde un resultado.');
    const suggestion=lead.managementType?suggestedStageForOutcome(lead.managementType as Parameters<typeof suggestedStageForOutcome>[0],lead.estado,stageOutcome):null;
    if(!suggestion||suggestion.key!==stageChange.stage)throw new Error('Esa etapa ya no se sugiere para este resultado. Guardá el resultado sin cambiar la etapa o revisá la gestión.');
    if(lead.pipelineRevision!==stageChange.revision)throw new StageSuggestionConflict('La gestión cambió; revisala.');
   }
   const moveStage=async()=>{
    if(!stageChange||!lead)return;
    const chosen=(await sql<{name:string}>`SELECT name FROM crm_stages WHERE name=${stageChange.stage} AND active AND classification='open' AND management_type=${lead.managementType}`.execute(trx)).rows[0];
    if(!chosen)throw new Error('Elegí una etapa disponible.');
    // Same audit trail as a manual transition: the guard triggers write the event and journals; the cause says the seller accepted it from a result.
    await sql`SELECT set_config('crm.state_change_origin','automatic',true),set_config('crm.state_change_cause','work_outcome',true),set_config('crm.management_reason_id','',true),set_config('crm.loss_reason','',true),set_config('crm.loss_comment','',true),set_config('crm.recontact','',true),set_config('crm.management_note',${'Lo elegiste al registrar «'+outcomeLabel(stageOutcome)+'».'},true)`.execute(trx);
    await trx.updateTable('leads').set({estado:chosen.name,updatedAt:new Date()}).where('id','=',lead.id).execute();
    await sql`SELECT set_config('crm.state_change_origin','',true),set_config('crm.state_change_cause','',true),set_config('crm.management_note','',true)`.execute(trx);
   };
   if(input.action==='task_delete'){
    await trx.updateTable('crmTasks').set({deletedAt:new Date(),updatedAt:new Date()}).where('id','=',input.id).execute();return input.id;
   }
   if(input.action==='activity_delete'){
    await trx.updateTable('crmActivities').set({deletedAt:new Date(),updatedAt:new Date()}).where('id','=',input.id).execute();
    return input.id;
   }
   if('outcome' in input&&input.outcome){
    const purpose=('purpose' in input?input.purpose:undefined)??previous?.purpose;
    if(input.outcome==='do_not_contact'&&previous?.outcome!=='do_not_contact')throw new Error('Registrá “Pidió no contactar” en Comunicación para activar el bloqueo y elegir las gestiones que querés cerrar.');
    // One canonical list plus the purpose's own extras (decision 3A); an edit may keep its historical value.
    if(input.outcome!==previous?.outcome&&!(outcomeOptions(purpose) as readonly string[]).includes(input.outcome))throw new Error('Elegí un resultado que corresponda al propósito de esta acción.');
   }
   if(messageId){
    if(input.action==='activity_save'&&input.id)throw new Error('Un registro ya guardado no se vincula a otro mensaje.');
    if(input.action==='task_status'&&input.status!=='completed')throw new Error('Solo una tarea completada se vincula a un mensaje.');
    if(!('outcome' in input)||!input.outcome)throw new Error('Elegí cómo salió el contacto.');
    if('messageSent' in input&&input.messageSent===false)throw new Error('Si no se envió, marcalo como no enviado.');
   }
   // Decision 2B: a new result always says how it continues, including an edit that adds the first result. Other edits stay exempt.
   const requiresNextStep=(input.action==='activity_save'&&!!input.outcome&&!previous?.outcome)||(input.action==='task_status'&&input.status==='completed');
   if(requiresNextStep&&(!('continuation' in input)||!input.continuation))throw new Error('Elegí cómo sigue: agendá una tarea o elegí «No agendar nada» y contá por qué.');
   if(requiresNextStep&&'continuation' in input&&input.continuation==='done'&&!input.continuationReason)throw new Error('Elegiste «No agendar nada»: contá por qué.');
   if('continuation' in input&&input.continuation){
    if(['task','wait'].includes(input.continuation)&&!('nextTask' in input&&input.nextTask))throw new Error('Elegí qué hacer y una fecha para continuar.');
    if(input.continuation==='done'&&'nextTask' in input&&input.nextTask)throw new Error('«No agendar nada» no crea otra tarea.');
   }
   // The contact's message is resolved once and keeps a single activity: the one the communication service created, if any.
   const linked=messageId&&(input.action==='activity_save'||input.action==='task_status')?await resolveMessageForWork(trx,user,{messageId,sent:input.messageSent,result:input.result??null,accountId:String(accountId),leadId:leadId==null?null:String(leadId)}):null;
   const createNextTask=async()=>{
    if(!('nextTask' in input)||!input.nextTask)return;
    if(input.outcome==='do_not_contact'||account.doNotContact)throw new Error('No se puede planificar contacto para un negocio bloqueado.');
    await trx.selectFrom('crmWorkTypes').select('id').where('id','=',input.nextTask.typeId).where('active','=',true).executeTakeFirstOrThrow();
    await trx.insertInto('crmTasks').values({accountId,leadId,title:input.nextTask.title,continuation:'continuation' in input&&input.continuation==='wait'?'wait':null,purpose:input.nextTask.purpose??('purpose' in input?input.purpose:undefined)??previous?.purpose??null,typeId:input.nextTask.typeId,dueDate:input.nextTask.dueDate,assignedUserEmail:previous&&'assignedUserEmail' in previous?previous.assignedUserEmail:commercialOwner,priority:'media',contactIds:serialize(('contactIds' in input?input.contactIds:undefined)||previous?.contactIds||[])}).execute();
   };
   if(input.action==='task_status'){
    const task=await trx.selectFrom('crmTasks').selectAll().where('id','=',input.id).executeTakeFirstOrThrow();
    if(task.status!=='pending')throw new Error('Esta tarea ya fue completada o cancelada.');
    const actualContacts=input.contactIds??(Array.isArray(task.contactIds)?task.contactIds.map(String):[]);
    for(const contactId of actualContacts)await trx.selectFrom('crmContacts').select('id').where('id','=',contactId).where('accountId','=',accountId).where('deletedAt','is',null).executeTakeFirstOrThrow();
    const completedAt=input.status==='completed'?new Date(input.completedAt??new Date().toISOString()):null;
    if(completedAt&&completedAt>new Date())throw new Error('La finalización no puede estar en el futuro.');
    const continuationReason=input.continuation==='done'?input.continuationReason??null:null;
    await trx.updateTable('crmTasks').set({status:input.status,purpose:input.purpose??task.purpose,continuation:input.continuation??null,continuationReason,outcome:input.outcome??null,result:input.result,completedAt,updatedAt:new Date()}).where('id','=',input.id).execute();
    if(completedAt){
     const values={accountId,leadId,taskId:input.id,purpose:input.purpose??task.purpose,continuation:input.continuation??null,continuationReason,typeId:task.typeId,title:task.title,occurredAt:completedAt,outcome:input.outcome??null,result:input.result,notes:task.description,participants:task.participants,channel:input.channel??null,contactIds:serialize(actualContacts)};
     if(linked?.activityId)await trx.updateTable('crmActivities').set({...values,updatedAt:new Date()}).where('id','=',linked.activityId).execute();
     else{const created=await trx.insertInto('crmActivities').values({...values,actorEmail:user.email}).returning('id').executeTakeFirstOrThrow();if(messageId)await linkMessageActivity(trx,messageId,created.id);}

    }
    await createNextTask();
    await moveStage();
    return input.id;
   }
   if(input.action==='task_reschedule'){
    // Moves only the date/time. The client's expected current value guards against overwriting a concurrent change; no other field is read from the client.
    const current=await trx.selectFrom('crmTasks').selectAll().where('id','=',input.id).where('deletedAt','is',null).forUpdate().executeTakeFirstOrThrow();
    if(current.status!=='pending')throw new Error('Solo se pueden reprogramar tareas pendientes.');
    const sameDay=calendarDay(current.dueDate)===input.expectedDueDate,sameTime=(current.dueAt?current.dueAt.getTime():null)===(input.expectedDueAt?new Date(input.expectedDueAt).getTime():null);
    if(!sameDay||!sameTime)throw new RescheduleConflict('La tarea cambió mientras tanto. Revisala.');
    const dueAt=input.dueAt?new Date(input.dueAt):null;
    if(dueAt&&localDay(dueAt)!==input.dueDate)throw new Error('La fecha y hora deben pertenecer al mismo día en Argentina.');
    await trx.updateTable('crmTasks').set({dueDate:input.dueDate,dueAt,updatedAt:new Date()}).where('id','=',input.id).execute();
    return input.id;
   }
   const type=await trx.selectFrom('crmWorkTypes').selectAll().where('id','=',input.typeId).executeTakeFirstOrThrow();
   if(!type.active&&(!previous||previous.typeId!==input.typeId))throw new Error('Tipo desactivado.');
   for(const contactId of input.contactIds)await trx.selectFrom('crmContacts').select('id').where('id','=',contactId).where('accountId','=',accountId).where('deletedAt','is',null).executeTakeFirstOrThrow();
   if(input.action==='task_save'){
    const existing=input.id?await trx.selectFrom('crmTasks').selectAll().where('id','=',input.id).executeTakeFirstOrThrow():null;
    if(existing&&existing.status!=='pending')throw new Error('Solo se pueden editar o reprogramar tareas pendientes.');
    const assignee=input.assignedUserEmail===undefined?(existing?existing.assignedUserEmail:commercialOwner):input.assignedUserEmail;
    if(user.role!=='admin'&&assignee!==(existing?existing.assignedUserEmail:commercialOwner))throw new Forbidden('Solo admin puede asignar o cambiar el responsable de una tarea.');
    if(existing?.legacy&&assignee!==commercialOwner)throw new Error('El seguimiento histórico conserva el responsable de la gestión.');
    const dueAt=input.dueAt?new Date(input.dueAt):null;
    if(dueAt&&localDay(dueAt)!==input.dueDate)throw new Error('La fecha y hora deben pertenecer al mismo día en Argentina.');
    const fields={accountId,leadId,title:input.title,purpose:input.purpose??previous?.purpose??null,description:input.description??null,typeId:input.typeId,assignedUserEmail:assignee,dueDate:input.dueDate,dueAt,priority:input.priority,participants:input.participants,contactIds:serialize(input.contactIds),updatedAt:new Date()};
    const row=existing?await trx.updateTable('crmTasks').set(fields).where('id','=',input.id!).returning('id').executeTakeFirstOrThrow():await trx.insertInto('crmTasks').values(fields).returning('id').executeTakeFirstOrThrow();return row.id;
   }
   const occurredAt=new Date(input.occurredAt);
   if(occurredAt>new Date())throw new Error('Registrá una tarea para lo que todavía no ocurrió.');
   // An edit that does not choose a continuation keeps the stored one and its reason.
   const continuation=input.continuation??(previous&&'continuation' in previous?previous.continuation:null)??null;
   const continuationReason=continuation==='done'?input.continuationReason??(previous&&'continuationReason' in previous?previous.continuationReason:null)??null:null;
   const fields={accountId,leadId,title:input.title,purpose:input.purpose??previous?.purpose??null,typeId:input.typeId,occurredAt,continuation,continuationReason,participants:input.participants,contactIds:serialize(input.contactIds),channel:input.channel??null,outcome:input.outcome??null,result:input.result??null,notes:input.notes??null,updatedAt:new Date()};
   const row=input.id?await trx.updateTable('crmActivities').set(fields).where('id','=',input.id).returning('id').executeTakeFirstOrThrow():linked?.activityId?await trx.updateTable('crmActivities').set({...fields,notes:input.notes?.trim()?input.notes:sql<string|null>`notes`}).where('id','=',linked.activityId).returning('id').executeTakeFirstOrThrow():await trx.insertInto('crmActivities').values({...fields,actorEmail:user.email}).returning('id').executeTakeFirstOrThrow();
   if(messageId&&!linked?.activityId)await linkMessageActivity(trx,messageId,row.id);
   // The activity linked to a completion owns the factual completion date/result.
   if(previous&&'taskId' in previous&&previous.taskId)await trx.updateTable('crmTasks').set({completedAt:occurredAt,purpose:input.purpose??previous.purpose,continuation,continuationReason,outcome:input.outcome??null,result:input.result??null,updatedAt:new Date()}).where('id','=',previous.taskId).where('status','=','completed').execute();

   await createNextTask();
   await moveStage();
   return row.id;
  });
  return reply({id});
 }catch(e){return fail(e)}
}
