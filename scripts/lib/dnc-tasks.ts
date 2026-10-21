import assert from 'node:assert/strict';
import {sql} from 'kysely';
import {db} from '../../src/helpers/db';

/** Owner decision D3 reason, recorded as the task result. */
export const DNC_TASK_REASON='Se canceló porque el negocio quedó marcado No contactar.';
export type DncFixture={pending:Record<string,string>;untouched:Record<string,string>;other:string;accountId:string};

/**
 * Seeds the tasks a business can carry: pending ones of several kinds (business-level and management-level) that D3 must cancel,
 * plus completed / cancelled / deleted ones and a pending task of ANOTHER business that must stay as they are.
 */
export async function seedDncTasks({accountId,leadId,email,otherAccountId}:{accountId:string|number;leadId:string|number|null;email:string;otherAccountId:string|number}):Promise<DncFixture> {
 const add=async(account:string|number,lead:string|number|null,title:string,extra:Record<string,unknown>={})=>String((await db.insertInto('crmTasks').values({accountId:account,leadId:lead,title,typeId:'followup',assignedUserEmail:email,dueDate:'2027-09-01' as never,priority:'media',...extra} as never).returning('id').executeTakeFirstOrThrow()).id);
 const pending:Record<string,string>={
  seller:await add(accountId,null,'Llamar al dueño'),
  volver:await add(accountId,null,'Volver a contactar',{purpose:'reactivation'}),
  retomar:await add(accountId,null,'Retomar conversación',{purpose:'reactivation'}),
  withTime:await add(accountId,null,'Visita agendada',{dueAt:new Date('2027-09-01T15:00:00Z')}),
  ...(leadId?{acordado:await add(accountId,leadId,'Recontactar según lo acordado',{purpose:'reactivation'}),mgmtSeller:await add(accountId,leadId,'Enviar propuesta')}:{})
 };
 const untouched:Record<string,string>={
  completed:await add(accountId,null,'Ya hecha',{status:'completed',completedAt:new Date(),result:'Hecha'}),
  cancelled:await add(accountId,null,'Ya cancelada',{status:'cancelled',result:'Cancelada antes'}),
  deleted:await add(accountId,null,'Borrada',{deletedAt:new Date()})
 };
 return {pending,untouched,other:await add(otherAccountId,null,'Volver a contactar',{purpose:'reactivation'}),accountId:String(accountId)};
}
const rowsOf=async(ids:string[])=>new Map((await db.selectFrom('crmTasks').select(['id','status','result','deletedAt']).where('id','in',ids as never).execute()).map(r=>[String(r.id),r]));

/** Every seeded pending task of the business is cancelled with the D3 reason, recorded against `actorEmail`; the rest is untouched. */
export async function assertDncCancelled(f:DncFixture,actorEmail:string,label:string):Promise<void> {
 const rows=await rowsOf([...Object.values(f.pending),...Object.values(f.untouched),f.other]);
 for(const [kind,id] of Object.entries(f.pending)){const r=rows.get(id)!;assert.equal(r.status,'cancelled',`${label}: "${kind}" task is cancelled`);assert.equal(r.result,DNC_TASK_REASON,`${label}: "${kind}" task carries the factual reason`);}
 assert.equal(rows.get(f.untouched.completed)!.status,'completed',`${label}: completed task untouched`);
 assert.equal(rows.get(f.untouched.cancelled)!.result,'Cancelada antes',`${label}: cancelled task keeps its own result`);
 assert.equal(rows.get(f.untouched.deleted)!.status,'pending',`${label}: deleted task untouched`);
 assert.equal(rows.get(f.other)!.status,'pending',`${label}: another business keeps its tasks`);
 const ids=Object.values(f.pending);
 const journal=(await sql<{actorEmail:string|null;n:string}>`SELECT actor_email,count(*) n FROM crm_work_journal WHERE entity='crm_tasks' AND action='UPDATE' AND entity_id::text=ANY(${ids}::text[]) AND after_value->>'status'='cancelled' GROUP BY actor_email`.execute(db)).rows;
 assert.deepEqual(journal.map(j=>[j.actorEmail,Number(j.n)]),[[actorEmail,ids.length]],`${label}: history records ${actorEmail} as the actor of every cancellation`);
}

/** Nothing was cancelled (the action was rejected and rolled back, or the business is not No contactar). */
export async function assertDncUntouched(f:DncFixture,label:string):Promise<void> {
 const rows=await rowsOf(Object.values(f.pending));
 for(const [kind,id] of Object.entries(f.pending)){const r=rows.get(id)!;assert.equal(r.status,'pending',`${label}: "${kind}" task still pending`);assert.equal(r.result,null,`${label}: "${kind}" task has no result`);}
}
