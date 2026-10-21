import type {Kysely,Transaction} from 'kysely';
import type {DB} from './schema';
import {calendarDay,localDay} from './workDates';
import {formatDate} from './crmDates';

/** Title of the task that a business "Recontactar" date schedules (owner decision 7A). */
export const RECONTACT_TASK_TITLE='Volver a contactar';
const forWhom=(name?:string|null)=>name?` · a cargo de ${name}`:'';
/** What the seller is told before saving a Recontactar date. `name` is the assignee, only when it is not the saver. */
export const recontactNotice=(day:string,name?:string|null)=>`Se va a agendar «${RECONTACT_TASK_TITLE}» para el ${formatDate(day)}${forWhom(name)}.`;
/** Same fact after the save. */
export const recontactScheduled=(day:string,name?:string|null)=>`Agendamos «${RECONTACT_TASK_TITLE}» para el ${formatDate(day)}${forWhom(name)}.`;
/** Shown when the chosen day is already behind us in Argentina (not blocking). */
export const RECONTACT_PAST_HINT='La fecha ya pasó: la tarea va a aparecer como vencida.';
/** True when the Argentina calendar day is before today. */
export const isPastDay=(day:string,now:Date=new Date())=>day<localDay(now);
/** Name to show when the task goes to someone other than the saver; null when the saver is the assignee or the responsible is unknown. */
export function scheduledForName({responsibleEmail,currentUserEmail,users}:{responsibleEmail?:string|null;currentUserEmail?:string|null;users?:readonly {email:string;displayName?:string|null}[]|null}):string|null {
 if(!responsibleEmail||responsibleEmail===currentUserEmail)return null;
 return users?.find(u=>u.email===responsibleEmail)?.displayName||responsibleEmail;
}
export type RecontactCancelCause='status'|'date'|'changed'|'dnc'|'archived';
/** Result written on a recontact task that the system cancels (factual, not a verdict about the business). */
export const recontactCancelReason=(why:RecontactCancelCause)=>({
 status:'Se canceló porque el estado del negocio dejó de ser Recontactar.',
 date:'Se canceló porque se quitó la fecha de recontacto del negocio.',
 changed:'Se canceló porque la fecha de recontacto del negocio cambió a otro día.',
 dnc:'Se canceló porque el negocio quedó marcado No contactar.',
 archived:'Se canceló porque el negocio se archivó.'
})[why];
/** Task created, moved or left by a business status save. */
export type RecontactTaskResult={id:string;dueDate:string;action:'created'|'moved'|'kept'}|null;

type Db=Kysely<DB>|Transaction<DB>;
type Previous={status:string|null;recontactAt:Date|string|null};
type Account={id:string|number;assignedUserEmail:string|null};

/**
 * This feature's own task that nobody touched: pending, no management, no time, on `day`, still with the business responsible.
 * A business without responsible gets the saver as assignee (not stored), so there any assignee matches (and moving keeps the assignee).
 */
const untouchedTask=(trx:Db,accountId:string,responsible:string|null,day:string)=>{
 let q=trx.selectFrom('crmTasks').selectAll().where('accountId','=',accountId).where('leadId','is',null).where('title','=',RECONTACT_TASK_TITLE).where('purpose','=','reactivation').where('status','=','pending').where('deletedAt','is',null).where('dueAt','is',null).where('dueDate','=',day as never);
 if(responsible)q=q.where('assignedUserEmail','=',responsible);
 return q.orderBy('id','desc').forUpdate().executeTakeFirst();
};
const cancel=(trx:Db,id:string|number,cause:RecontactCancelCause)=>trx.updateTable('crmTasks').set({status:'cancelled',result:recontactCancelReason(cause),completedAt:null,updatedAt:new Date()}).where('id','=',id as never).execute();

/**
 * Keeps the business "Volver a contactar" task in step with a saved business status (decision 7A). Runs in the status transaction.
 * - Recontactar + date: one pending task of this feature per business and date. An untouched task of the previous date moves; otherwise one is created.
 * - Anything else: an untouched task is cancelled with a factual reason. Tasks the seller renamed, rescheduled, timed, reassigned or completed are left alone.
 * Only this feature's own task is ever reused, moved or cancelled: other reactivation tasks (a lost-management reminder, "Retomar conversación") are never adopted.
 * The assignee is the business responsible (`crm_accounts.assigned_user_email`), or the actor when the business has none.
 */
export async function syncRecontactTask(trx:Db,{account,previous,status,recontactDay,actorEmail}:{account:Account;previous:Previous;status:string;recontactDay:string|null;actorEmail:string}):Promise<RecontactTaskResult> {
 const previousDay=previous.status==='recontact'&&previous.recontactAt?calendarDay(previous.recontactAt):null;
 const accountId=String(account.id);
 const untouched=previousDay?await untouchedTask(trx,accountId,account.assignedUserEmail,previousDay):undefined;
 if(status!=='recontact'||!recontactDay){
  if(untouched)await cancel(trx,untouched.id,status!=='recontact'?'status':'date');
  return null;
 }
 const assignee=account.assignedUserEmail??actorEmail;
 const same=await trx.selectFrom('crmTasks').select('id').where('accountId','=',accountId).where('leadId','is',null).where('title','=',RECONTACT_TASK_TITLE)
  .where('purpose','=','reactivation').where('status','=','pending').where('deletedAt','is',null).where('dueDate','=',recontactDay as never).$if(!!account.assignedUserEmail,qb=>qb.where('assignedUserEmail','=',assignee)).orderBy('id','asc').executeTakeFirst();
 if(same){// Idempotent: this feature's task already exists on that day.
  if(untouched&&String(untouched.id)!==String(same.id))await cancel(trx,untouched.id,'changed');
  return {id:String(same.id),dueDate:recontactDay,action:'kept'};
 }
 if(untouched){
  await trx.updateTable('crmTasks').set({dueDate:recontactDay as never,dueAt:null,...(account.assignedUserEmail?{assignedUserEmail:assignee}:{}),updatedAt:new Date()}).where('id','=',untouched.id).execute();
  return {id:String(untouched.id),dueDate:recontactDay,action:'moved'};
 }
 const created=await trx.insertInto('crmTasks').values({accountId,leadId:null,title:RECONTACT_TASK_TITLE,typeId:'followup',purpose:'reactivation',assignedUserEmail:assignee,dueDate:recontactDay as never,priority:'media'}).returning('id').executeTakeFirstOrThrow();
 return {id:String(created.id),dueDate:recontactDay,action:'created'};
}

/**
 * Owner decision D3: when a business becomes No contactar, every pending task of it (business-level and management-level, any kind or assignee) is cancelled with a factual reason.
 * Completed, cancelled and deleted tasks and tasks of other businesses are untouched. Lifting the block later does not restore them.
 * Pending "Anotá cómo salió" items (contact outcomes) are not tasks and stay, so the seller can still record how a past contact went.
 * Runs in the caller's transaction, after its permission checks; the audit trigger records the acting user (`setWorkActor`). Returns how many tasks it cancelled.
 */
export async function cancelPendingTasksForDnc(trx:Db,{accountId}:{accountId:string|number}):Promise<number> {
 const rows=await trx.updateTable('crmTasks').set({status:'cancelled',result:recontactCancelReason('dnc'),completedAt:null,updatedAt:new Date()}).where('accountId','=',String(accountId) as never).where('status','=','pending').where('deletedAt','is',null).returning('id').execute();
 return rows.length;
}

/**
 * Cancels the business's untouched "Volver a contactar" task when the business stops being workable (No contactar or archived).
 * Call it BEFORE the account update so `recontact_at` still names the day. Never touches any other task.
 */
export async function cancelRecontactTaskFor(trx:Db,{accountId,cause}:{accountId:string|number;cause:'dnc'|'archived'}):Promise<void> {
 if(cause==='dnc'){await cancelPendingTasksForDnc(trx,{accountId});return;}// D3: a No contactar business loses ALL its pending tasks, so the recontact task is cancelled there with the same reason.
 const account=await trx.selectFrom('crmAccounts').select(['assignedUserEmail','recontactAt']).where('id','=',String(accountId) as never).executeTakeFirst();
 if(!account?.recontactAt)return;
 const task=await untouchedTask(trx,String(accountId),account.assignedUserEmail,calendarDay(account.recontactAt));
 if(task)await cancel(trx,task.id,cause);
}

/**
 * Keeps the business "Volver a contactar" task with the business responsible when the responsible changes (decision 7A).
 * Moves only this feature's untouched task (still assigned to the previous responsible, on the current recontact day) to the new one; tasks someone reassigned, rescheduled, timed or completed stay as they are.
 * The day is the stored `recontact_at` even when an open management moved the status to En gestión (that keeps the date and its task).
 * No-op without a stored date, when the responsible does not change, or when it is cleared (an unassigned business keeps the task with whoever has it).
 * Runs in the caller's transaction, after its permission checks. Returns the moved task id, or null.
 */
export async function reassignRecontactTask(trx:Db,{accountId,fromEmail,toEmail}:{accountId:string|number;fromEmail:string|null;toEmail:string|null}):Promise<string|null> {
 if(!toEmail||fromEmail===toEmail)return null;
 const account=await trx.selectFrom('crmAccounts').select('recontactAt').where('id','=',String(accountId) as never).executeTakeFirst();
 if(!account?.recontactAt)return null;
 const task=await untouchedTask(trx,String(accountId),fromEmail,calendarDay(account.recontactAt));
 if(!task||task.assignedUserEmail===toEmail)return null;
 await trx.updateTable('crmTasks').set({assignedUserEmail:toEmail,updatedAt:new Date()}).where('id','=',task.id).execute();
 return String(task.id);
}
