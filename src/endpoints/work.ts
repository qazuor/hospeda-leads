import {accountFamily} from '../helpers/accountIdentity';
import superjson from 'superjson';
import {sql} from 'kysely';
import {db} from '../helpers/db';
import {getServerUserSession} from '../helpers/getServerUserSession';
import {NotAuthenticatedError} from '../helpers/getSetServerSession';
import {calendarDay,localDay} from '../helpers/workDates';
import {workMutation,workQuery,followupSettings} from './work.schema';
class Forbidden extends Error {}
const reply=(data:unknown,status=200)=>new Response(superjson.stringify(data),{status,headers:{'Content-Type':'application/json'}});
const fail=(e:unknown)=>reply({error:e instanceof Error?e.message:'No se pudo guardar'},e instanceof Forbidden?403:e instanceof NotAuthenticatedError?401:400);
const serialize=(v:unknown)=>JSON.parse(JSON.stringify(v));
import {setWorkActor} from '../helpers/workAudit';
export async function get(request:Request){
 try{
  const {user}=await getServerUserSession(request);
  const input=workQuery.parse(Object.fromEntries(new URL(request.url).searchParams));
  const setting=await db.selectFrom('appSettings').select('value').where('key','=','crm_work_followup').executeTakeFirstOrThrow();
  const followup=followupSettings.parse({action:'followup_settings',...JSON.parse(setting.value)});
  const responsible=input.responsible??user.email;
  if(user.role!=='admin'&&responsible!==user.email)throw new Forbidden('La vista de equipo es exclusiva de administradores.');
  let tasks=db.selectFrom('crmTasks as t').innerJoin('crmAccounts as a','a.id','t.accountId').leftJoin('leads as l','l.id','t.leadId').where('t.deletedAt','is',null).where(eb=>eb.or([eb('t.leadId','is',null),eb('l.deletedAt','is',null)]));
  let activities=db.selectFrom('crmActivities as t').innerJoin('crmAccounts as a','a.id','t.accountId').leftJoin('leads as l','l.id','t.leadId').where('t.deletedAt','is',null).where(eb=>eb.or([eb('t.leadId','is',null),eb('l.deletedAt','is',null)]));
  let attention=db.selectFrom('leads as l').innerJoin('crmAccounts as a','a.id','l.accountId').where('l.deletedAt','is',null);
  if(responsible!=='all'){
   tasks=tasks.where('t.assignedUserEmail','=',responsible);
   activities=activities.where(eb=>eb.or([eb('t.actorEmail','=',responsible),eb.exists(eb.selectFrom('crmTasks').select('id').whereRef('crmTasks.id','=','t.taskId').where('crmTasks.assignedUserEmail','=',responsible)),eb('l.assignedUserEmail','=',responsible),eb.and([eb('t.leadId','is',null),eb('a.assignedUserEmail','=',responsible)])]));
   attention=attention.where('l.assignedUserEmail','=',responsible);
  }
  if(input.accountId){tasks=tasks.where('t.accountId','=',input.accountId);activities=activities.where('t.accountId','=',input.accountId);attention=attention.where('l.accountId','=',input.accountId);}
  if(input.leadId){tasks=tasks.where('t.leadId','=',input.leadId);activities=activities.where('t.leadId','=',input.leadId);attention=attention.where('l.id','=',input.leadId);}
  if(input.city){tasks=tasks.where('a.ciudad','=',input.city);activities=activities.where('a.ciudad','=',input.city);attention=attention.where('a.ciudad','=',input.city);}
  if(input.vertical){tasks=tasks.where('l.tipo','=',input.vertical);activities=activities.where('l.tipo','=',input.vertical);attention=attention.where('l.tipo','=',input.vertical);}
  if(input.mode==='day')tasks=tasks.where('t.status','=','pending');
  if(input.mode==='agenda'){
   const agendaTypes=await db.selectFrom('crmWorkTypes').select('id').where('agenda','=',true).execute();
   const ids=agendaTypes.map(t=>t.id);
   tasks=tasks.where('t.typeId','in',ids.length?ids:['__none__']).where('t.status','=','pending');
   activities=activities.where('t.typeId','in',ids.length?ids:['__none__']);
  }
  if(input.from){tasks=tasks.where(sql<string>`t.due_date`,'>=',input.from);activities=activities.where(sql<string>`(t.occurred_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date`,'>=',input.from);}
  if(input.to){tasks=tasks.where(sql<string>`t.due_date`,'<=',input.to);activities=activities.where(sql<string>`(t.occurred_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date`,'<=',input.to);}
  let accountsQuery=db.selectFrom('crmAccounts').select(['id','nombre','ciudad','assignedUserEmail']).where('mergedIntoId','is',null);
  let opportunitiesQuery=db.selectFrom('leads').select(['id','accountId','opportunityName','tipo','estado','assignedUserEmail','createdAt','fechaUltimoContacto']).where('deletedAt','is',null);
  if(user.role!=='admin'){
   accountsQuery=accountsQuery.where(eb=>eb.or([eb('assignedUserEmail','=',user.email),eb.exists(eb.selectFrom('crmTasks').select('id').whereRef('crmTasks.accountId','=','crmAccounts.id').where('crmTasks.assignedUserEmail','=',user.email).where('crmTasks.deletedAt','is',null)),eb.exists(eb.selectFrom('leads').select('id').whereRef('leads.accountId','=','crmAccounts.id').where('leads.assignedUserEmail','=',user.email).where('deletedAt','is',null))]));
   opportunitiesQuery=opportunitiesQuery.where(eb=>eb.or([eb('assignedUserEmail','=',user.email),eb.exists(eb.selectFrom('crmTasks').select('id').whereRef('crmTasks.leadId','=','leads.id').where('crmTasks.assignedUserEmail','=',user.email).where('crmTasks.deletedAt','is',null))]));
  }
  if(input.accountId){accountsQuery=accountsQuery.where('id','=',input.accountId);opportunitiesQuery=opportunitiesQuery.where('accountId','=',input.accountId);}
  const now=new Date(),today=localDay(now);
  const dayQueries=[
   tasks.where(eb=>eb.or([eb(sql<string>`t.due_date`,'<',today),eb('t.dueAt','<',now)])),
   tasks.where(sql<string>`t.due_date`,'=',today).where(eb=>eb.or([eb('t.dueAt','is',null),eb('t.dueAt','>=',now)])),
   tasks.where(sql<string>`t.due_date`,'>',today)
  ];
  const taskPage=(query:typeof tasks,limit:number)=>query.selectAll('t').select(['a.nombre as accountName','a.ciudad as city','l.opportunityName']).orderBy(sql`CASE WHEN t.status='pending' THEN 0 ELSE 1 END`).orderBy('t.dueDate').orderBy('t.dueAt').orderBy('t.id').limit(limit).offset((input.page-1)*limit).execute();
  const taskRowsPromise=input.mode==='day'?Promise.all(dayQueries.map(query=>taskPage(query,25))).then(rows=>rows.flat()):taskPage(tasks,100);
  const bucketCountsPromise=input.mode==='day'?Promise.all(dayQueries.map(query=>query.select(eb=>eb.fn.countAll().as('n')).executeTakeFirstOrThrow())).then(rows=>({overdue:Number(rows[0].n),today:Number(rows[1].n),upcoming:Number(rows[2].n)})):Promise.resolve(undefined);
  const [taskRows,activityRows,taskCount,activityCount,types,accounts,opportunities,users,needs,bucketCounts]=await Promise.all([

   taskRowsPromise,
   activities.selectAll('t').select(['a.nombre as accountName','a.ciudad as city']).orderBy('t.occurredAt','desc').orderBy('t.id','desc').limit(100).offset((input.page-1)*100).execute(),
   tasks.select(eb=>eb.fn.countAll().as('n')).executeTakeFirstOrThrow(),activities.select(eb=>eb.fn.countAll().as('n')).executeTakeFirstOrThrow(),
   db.selectFrom('crmWorkTypes').selectAll().orderBy('name').execute(),accountsQuery.orderBy('nombre').execute(),opportunitiesQuery.execute(),
   db.selectFrom('users').select(['email','displayName']).orderBy('displayName').execute(),
   attention.select(['l.id','l.accountId','a.nombre','l.opportunityName','l.createdAt','l.fechaUltimoContacto','l.estado']).where(eb=>eb.not(eb.exists(eb.selectFrom('crmTasks').select('id').whereRef('crmTasks.leadId','=','l.id').where('status','=','pending').where('deletedAt','is',null)))).where(eb=>eb.or([eb('l.estado','in',followup.stages.length?followup.stages:['__none__']),eb.and([eb('l.fechaUltimoContacto','is',null),eb(sql`l.assigned_at AT TIME ZONE 'America/Argentina/Buenos_Aires'`,'>=',sql`${localDay()}::date - ${followup.newAssignmentDays}::integer`)])])).orderBy('l.createdAt','desc').execute(),bucketCountsPromise
  ]);
  const contacts=accounts.length?await db.selectFrom('crmContacts').select(['id','accountId','name']).where('accountId','in',accounts.map(a=>a.id)).where('deletedAt','is',null).orderBy('name').execute():[];
  // Audit is available for a concrete context only, to avoid mixing it into the day inbox.
  let journal:unknown[]=[];
  if(input.accountId){
   if(user.role==='admin'||accounts.length){journal=await db.selectFrom('crmWorkJournal').selectAll().where('accountId','in',await accountFamily(db,input.accountId)).orderBy('createdAt','desc').limit(200).execute();}
  }
  return reply({tasks:taskRows.map(t=>({...t,dueDate:calendarDay(t.dueDate)})),activities:activityRows,types,accounts,opportunities,contacts,users,attention:needs.map(l=>({id:l.id,accountId:l.accountId,nombre:l.nombre,opportunityName:l.opportunityName,reason:followup.stages.includes(l.estado??'')?'Interesado sin tarea pendiente':`Nueva asignada sin contacto (últimos ${followup.newAssignmentDays} días)`})),journal,bucketCounts,followupStages:followup.stages,newAssignmentDays:followup.newAssignmentDays,totalTasks:Number(taskCount.n),totalActivities:Number(activityCount.n),page:input.page});
 }catch(e){return fail(e)}
}
export async function post(request:Request){
 try{
  const {user}=await getServerUserSession(request);
  const input=workMutation.parse(superjson.parse(await request.text()));
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
   const account=await trx.selectFrom('crmAccounts').selectAll().where('id','=',accountId).forUpdate().executeTakeFirstOrThrow();
   const lead=leadId?await trx.selectFrom('leads').selectAll().where('id','=',leadId).where('accountId','=',accountId).where('deletedAt','is',null).forUpdate().executeTakeFirstOrThrow():null;
   const commercialOwner=lead?lead.assignedUserEmail:account.assignedUserEmail;
   const delegatedTask=previous&&isTask&&'assignedUserEmail' in previous&&previous.assignedUserEmail===user.email;
   const linkedTask=previous&&!isTask&&'taskId' in previous&&previous.taskId?await trx.selectFrom('crmTasks').select('assignedUserEmail').where('id','=',previous.taskId).executeTakeFirst():null;
   if(user.role!=='admin'&&commercialOwner!==user.email&&!delegatedTask&&linkedTask?.assignedUserEmail!==user.email)throw new Forbidden('Solo podés gestionar trabajo de tus negocios u oportunidades asignados.');
   if(previous&&isTask){
    const old=await trx.selectFrom('crmTasks').selectAll().where('id','=',input.id!).where('deletedAt','is',null).forUpdate().executeTakeFirstOrThrow();
    if(user.role!=='admin'&&old.assignedUserEmail!==user.email)throw new Forbidden('La tarea corresponde a otro responsable.');
   }
   if(input.action==='task_delete'){
    await trx.updateTable('crmTasks').set({deletedAt:new Date(),updatedAt:new Date()}).where('id','=',input.id).execute();return input.id;
   }
   if(input.action==='activity_delete'){
    await trx.updateTable('crmActivities').set({deletedAt:new Date(),updatedAt:new Date()}).where('id','=',input.id).execute();
    return input.id;
   }
   if(input.action==='task_status'){
    const task=await trx.selectFrom('crmTasks').selectAll().where('id','=',input.id).executeTakeFirstOrThrow();
    if(task.status!=='pending')throw new Error('Esta tarea ya fue completada o cancelada.');
    const completedAt=input.status==='completed'?new Date(input.completedAt??new Date().toISOString()):null;
    if(completedAt&&completedAt>new Date())throw new Error('La finalización no puede estar en el futuro.');
    await trx.updateTable('crmTasks').set({status:input.status,result:input.result,completedAt,updatedAt:new Date()}).where('id','=',input.id).execute();
    if(completedAt){
     await trx.insertInto('crmActivities').values({accountId,leadId,taskId:input.id,typeId:task.typeId,title:task.title,occurredAt:completedAt,result:input.result,notes:task.description,participants:task.participants,contactIds:task.contactIds,actorEmail:user.email}).execute();

    }
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
    if(existing?.legacy&&assignee!==commercialOwner)throw new Error('El seguimiento histórico conserva el responsable de la oportunidad.');
    const dueAt=input.dueAt?new Date(input.dueAt):null;
    if(dueAt&&localDay(dueAt)!==input.dueDate)throw new Error('La fecha y hora deben pertenecer al mismo día en Argentina.');
    const fields={accountId,leadId,title:input.title,description:input.description??null,typeId:input.typeId,assignedUserEmail:assignee,dueDate:input.dueDate,dueAt,priority:input.priority,participants:input.participants,contactIds:serialize(input.contactIds),updatedAt:new Date()};
    const row=existing?await trx.updateTable('crmTasks').set(fields).where('id','=',input.id!).returning('id').executeTakeFirstOrThrow():await trx.insertInto('crmTasks').values(fields).returning('id').executeTakeFirstOrThrow();return row.id;
   }
   const occurredAt=new Date(input.occurredAt);
   if(occurredAt>new Date())throw new Error('Registrá una tarea para lo que todavía no ocurrió.');
   const fields={accountId,leadId,title:input.title,typeId:input.typeId,occurredAt,participants:input.participants,contactIds:serialize(input.contactIds),channel:input.channel??null,result:input.result??null,notes:input.notes??null,updatedAt:new Date()};
   const row=input.id?await trx.updateTable('crmActivities').set(fields).where('id','=',input.id).returning('id').executeTakeFirstOrThrow():await trx.insertInto('crmActivities').values({...fields,actorEmail:user.email}).returning('id').executeTakeFirstOrThrow();
   // The activity linked to a completion owns the factual completion date/result.
   if(previous&&'taskId' in previous&&previous.taskId)await trx.updateTable('crmTasks').set({completedAt:occurredAt,result:input.result??null,updatedAt:new Date()}).where('id','=',previous.taskId).where('status','=','completed').execute();

   return row.id;
  });
  return reply({id});
 }catch(e){return fail(e)}
}