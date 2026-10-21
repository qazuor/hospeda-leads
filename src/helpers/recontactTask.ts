import type {Kysely,Transaction} from 'kysely';
import type {DB} from './schema';
import {calendarDay} from './workDates';
import {formatDate} from './crmDates';

/** Title of the task that a business "Recontactar" date schedules (owner decision 7A). */
export const RECONTACT_TASK_TITLE='Volver a contactar';
/** What the seller is told before saving a Recontactar date. */
export const recontactNotice=(day:string)=>`Te agendamos «${RECONTACT_TASK_TITLE}» para el ${formatDate(day)}.`;
/** Result written on a recontact task that the system cancels (factual, not a verdict about the business). */
export const recontactCancelReason=(why:'status'|'date')=>why==='status'?'Se canceló porque el estado del negocio dejó de ser Recontactar.':'Se canceló porque se quitó la fecha de recontacto del negocio.';
/** Task created, moved or left by a business status save. */
export type RecontactTaskResult={id:string;dueDate:string;action:'created'|'moved'|'kept'}|null;

type Db=Kysely<DB>|Transaction<DB>;
type Previous={status:string|null;recontactAt:Date|string|null};
type Account={id:string|number;assignedUserEmail:string|null};

/**
 * Keeps the business "Volver a contactar" task in step with a saved business status (decision 7A). Runs in the status transaction.
 * - Recontactar + date: one pending task per business and date. An untouched task of the previous date moves; otherwise one is created.
 * - Anything else: an untouched pending task (same title, no management, still on the previous recontact day) is cancelled with a factual reason; tasks the seller renamed, rescheduled or completed are left alone.
 * The assignee is the business responsible (`crm_accounts.assigned_user_email`), or the actor when the business has none.
 */
export async function syncRecontactTask(trx:Db,{account,previous,status,recontactDay,actorEmail}:{account:Account;previous:Previous;status:string;recontactDay:string|null;actorEmail:string}):Promise<RecontactTaskResult> {
 const previousDay=previous.status==='recontact'&&previous.recontactAt?calendarDay(previous.recontactAt):null;
 const accountId=String(account.id);
 const untouched=previousDay?await trx.selectFrom('crmTasks').selectAll().where('accountId','=',accountId).where('leadId','is',null).where('title','=',RECONTACT_TASK_TITLE).where('purpose','=','reactivation').where('status','=','pending').where('deletedAt','is',null).where('dueDate','=',previousDay as never).orderBy('id','desc').forUpdate().executeTakeFirst():undefined;
 if(status!=='recontact'||!recontactDay){
  if(untouched)await trx.updateTable('crmTasks').set({status:'cancelled',result:recontactCancelReason(status!=='recontact'?'status':'date'),completedAt:null,updatedAt:new Date()}).where('id','=',untouched.id).execute();
  return null;
 }
 const assignee=account.assignedUserEmail??actorEmail;
 const same=await trx.selectFrom('crmTasks').select('id').where('accountId','=',accountId).where('purpose','=','reactivation').where('status','=','pending').where('deletedAt','is',null).where('dueDate','=',recontactDay as never).orderBy('id','asc').executeTakeFirst();
 if(same){// Idempotent: a pending reactivation task already exists on that day (also the one a lost-management close schedules).
  if(untouched&&String(untouched.id)!==String(same.id))await trx.updateTable('crmTasks').set({status:'cancelled',result:recontactCancelReason('date'),completedAt:null,updatedAt:new Date()}).where('id','=',untouched.id).execute();
  return {id:String(same.id),dueDate:recontactDay,action:'kept'};
 }
 if(untouched){
  await trx.updateTable('crmTasks').set({dueDate:recontactDay as never,dueAt:null,assignedUserEmail:assignee,updatedAt:new Date()}).where('id','=',untouched.id).execute();
  return {id:String(untouched.id),dueDate:recontactDay,action:'moved'};
 }
 const created=await trx.insertInto('crmTasks').values({accountId,leadId:null,title:RECONTACT_TASK_TITLE,typeId:'followup',purpose:'reactivation',assignedUserEmail:assignee,dueDate:recontactDay as never,priority:'media'}).returning('id').executeTakeFirstOrThrow();
 return {id:String(created.id),dueDate:recontactDay,action:'created'};
}
