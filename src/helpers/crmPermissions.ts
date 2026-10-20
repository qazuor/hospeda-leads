import {sql, type Kysely, type Transaction} from 'kysely';
import type {DB} from './schema';

type Actor = {email:string; role:'admin'|'user'};
type AccountAccess = {assignedUserEmail:string|null; archivedAt?:unknown; deletedAt?:unknown; mergedIntoId?:unknown};
type Executor = Kysely<DB>|Transaction<DB>;

export class CrmForbidden extends Error {}

export function canModifyBusiness(user:Actor|undefined, account:AccountAccess|undefined):boolean {
  return !!user && !!account && !account.deletedAt && !account.mergedIntoId &&
    (user.role==='admin' || (!account.archivedAt && account.assignedUserEmail===user.email));
}

export function canModifyManagement(user:Actor|undefined, lead:{assignedUserEmail:string|null;deletedAt?:unknown}|undefined, account:AccountAccess|undefined):boolean {
  return !!user && !!lead && !!account && !lead.deletedAt && !account.deletedAt && !account.mergedIntoId &&
    (user.role==='admin' || (!account.archivedAt && lead.assignedUserEmail===user.email));
}

export function assertAccountReadable(user:Actor, account:AccountAccess):void {
  if(account.deletedAt)throw new CrmForbidden('Este negocio está en la papelera. Restauralo antes de consultar o modificar sus datos.');
  if(account.archivedAt && user.role!=='admin')throw new CrmForbidden('Solo un administrador puede consultar negocios archivados.');
}

/**
 * Read-only access for detail views (decision 1C): like assertAccountReadable, but the business's
 * responsible seller keeps viewing her archived / No contactar business. Never use it on a write path:
 * assertAccountReadable stays the strict guard that every mutation relies on.
 */
export function assertAccountViewable(user:Actor, account:AccountAccess):void {
  if(account.archivedAt && !account.deletedAt && user.role!=='admin'){
    if(account.assignedUserEmail!==user.email)throw new CrmForbidden('Este negocio está archivado. Solo su responsable o un administrador puede consultarlo.');
    return;
  }
  assertAccountReadable(user, account);
}

export function assertAccountWritable(user:Actor, account:AccountAccess):void {
  assertAccountReadable(user, account);
  if(!canModifyBusiness(user, account))throw new CrmForbidden('Solo el responsable del negocio o un administrador puede modificarlo.');
}

/** Locks business rows FOR UPDATE in ascending id order so transactions locking several businesses cannot deadlock each other. */
export async function lockAccounts(executor:Executor, ids:readonly unknown[]):Promise<void> {
  const keys=[...new Set(ids.filter(v=>v!=null&&v!=='').map(String))];
  if(keys.length)await sql`SELECT id FROM crm_accounts WHERE id=ANY(${keys}::bigint[]) ORDER BY id FOR UPDATE`.execute(executor);
}

/** Read mode (write=false) uses assertAccountViewable, so the responsible seller passes on her archived business: a mutation calling it without write must reject archived itself. */
export async function assertBusinessAccess(executor:Executor, accountId:string, user:Actor, write=false, lock=write) {
  let query=executor.selectFrom('crmAccounts').selectAll().where('id','=',accountId);
  if(lock)query=query.forUpdate();
  const account=await query.executeTakeFirstOrThrow();
  if(write)assertAccountWritable(user,account);else assertAccountViewable(user,account);
  return account;
}

export async function assertLeadAccess(executor:Executor, leadId:string, user:Actor, write=false) {
  let lead=await executor.selectFrom('leads').selectAll().where('id','=',leadId).executeTakeFirstOrThrow();
  const account=await assertBusinessAccess(executor,String(lead.accountId),user,false,write);
  if(write)lead=await executor.selectFrom('leads').selectAll().where('id','=',leadId).where('accountId','=',account.id).forUpdate().executeTakeFirstOrThrow();
  if(lead.deletedAt && (write || user.role!=='admin'))throw new CrmForbidden('Esta gestión está en la papelera. Solo un administrador puede consultarla; restaurala antes de modificarla.');
  if(write&&!canModifyManagement(user,lead,account))throw new CrmForbidden("Solo el responsable de esta gestión o un administrador puede modificarla.");
  return lead;
}
