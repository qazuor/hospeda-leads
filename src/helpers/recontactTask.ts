import type {Kysely,Transaction} from 'kysely';
import type {DB} from './schema';
import {calendarDay,localDay} from './workDates';
import {formatDate} from './crmDates';

/** Title of the task that a business "Recontactar" date schedules (owner decision 7A). */
export const RECONTACT_TASK_TITLE='Volver a contactar';
const forWhom=(name?:string|null)=>name?` para ${name}`:'';
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

/** This feature's own task that nobody touched: pending, no management, no time, on `day`, still with the business responsible. */
const untouchedTask=(trx:Db,accountId:string,responsible:string|null,day:string)=>responsible?trx.selectFrom('crmTasks').selectAll().where('accountId','=',accountId).where('leadId','is',null).where('title','=',RECONTACT_TASK_TITLE).where('purpose','=','reactivation').where('status','=','pending').where('deletedAt','is',null).where('dueAt','is',null).where('assignedUserEmail','=',responsible).where('dueDate','=',day as never).orderBy('id','desc').forUpdate().executeTakeFirst():Promise.resolve(undefined);
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
 const same=await trx.selectFrom('crmTasks').select('id').where('accountId','=',accountId).where('leadId','is',null).where('title','=',RECONTACT_TASK_TITLE).where('purpose','=','reactivation').where('status','=','pending').where('deletedAt','is',null).where('assignedUserEmail','=',assignee).where('dueDate','=',recontactDay as never).orderBy('id','asc').executeTakeFirst();
 if(same){// Idempotent: this feature's task already exists on that day.
  if(untouched&&String(untouched.id)!==String(same.id))await cancel(trx,untouched.id,'changed');
  return {id:String(same.id),dueDate:recontactDay,action:'kept'};
 }
 if(untouched){
  await trx.updateTable('crmTasks').set({dueDate:recontactDay as never,dueAt:null,assignedUserEmail:assignee,updatedAt:new Date()}).where('id','=',untouched.id).execute();
  return {id:String(untouched.id),dueDate:recontactDay,action:'moved'};
 }
 const created=await trx.insertInto('crmTasks').values({accountId,leadId:null,title:RECONTACT_TASK_TITLE,typeId:'followup',purpose:'reactivation',assignedUserEmail:assignee,dueDate:recontactDay as never,priority:'media'}).returning('id').executeTakeFirstOrThrow();
 return {id:String(created.id),dueDate:recontactDay,action:'created'};
}

/**
 * Cancels the business's untouched "Volver a contactar" task when the business stops being workable (No contactar or archived).
 * Call it BEFORE the account update so `recontact_at` still names the day. Never touches any other task.
 */
export async function cancelRecontactTaskFor(trx:Db,{accountId,cause}:{accountId:string|number;cause:'dnc'|'archived'}):Promise<void> {
 const account=await trx.selectFrom('crmAccounts').select(['assignedUserEmail','recontactAt']).where('id','=',String(accountId) as never).executeTakeFirst();
 if(!account?.recontactAt)return;
 const task=await untouchedTask(trx,String(accountId),account.assignedUserEmail,calendarDay(account.recontactAt));
 if(task)await cancel(trx,task.id,cause);
}
