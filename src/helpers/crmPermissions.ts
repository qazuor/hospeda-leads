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

const archivedWriteMessage='Este negocio está archivado. Solo un administrador puede modificarlo.';

export function assertAccountWritable(user:Actor, account:AccountAccess):void {
  if(account.archivedAt && !account.deletedAt && user.role!=='admin')throw new CrmForbidden(archivedWriteMessage);
  assertAccountReadable(user, account);
  if(!canModifyBusiness(user, account))throw new CrmForbidden('Solo el responsable del negocio o un administrador puede modificarlo.');
}

/** Decision 8A: owner/admin, or a seller with an open management on a live (not archived, deleted or merged) business. Only phone, email, WhatsApp and persons are editable that way; callers enforce the whitelist. */
export function canEditBusinessContactData(user:Actor|undefined, account:AccountAccess|undefined, hasOpenManagement:boolean):boolean {
  return canModifyBusiness(user,account) || (!!user && !!account && hasOpenManagement && !account.archivedAt && !account.deletedAt && !account.mergedIntoId);
}

/** Ids of the not deleted, open-stage managements of a business assigned to this seller (the "responsible seller" of a management is leads.assigned_user_email). */
export async function openManagementLeadIds(executor:Executor, accountId:string, email:string):Promise<string[]> {
  const rows=(await sql<{id:string}>`SELECT l.id FROM leads l JOIN crm_stages s ON s.name=l.estado WHERE l.account_id=${accountId} AND l.assigned_user_email=${email} AND l.deleted_at IS NULL AND s.classification='open' ORDER BY l.id`.execute(executor)).rows;
  return rows.map(r=>String(r.id));
}

export async function hasOpenManagement(executor:Executor, accountId:string, email:string):Promise<boolean> {
  return (await openManagementLeadIds(executor,accountId,email)).length>0;
}

/**
 * Write guard for the contact data of a business (decision 8A). Returns scope `full` for owner/admin and `open_management` (with the
 * management ids, for the audit) for a seller who only has an open management. Everything else throws exactly like assertAccountWritable,
 * so archived, trashed and merged businesses and sellers without an open management stay rejected. Never widens any other guard.
 */
export async function assertContactDataWritable(executor:Executor, user:Actor, account:AccountAccess&{id:unknown}):Promise<{scope:'full'|'open_management';leadIds:string[]}> {
  if(canModifyBusiness(user,account)){assertAccountWritable(user,account);return {scope:'full',leadIds:[]};}
  const leadIds=account.archivedAt||account.deletedAt||account.mergedIntoId?[]:await openManagementLeadIds(executor,String(account.id),user.email);
  if(!canEditBusinessContactData(user,account,leadIds.length>0)){assertAccountWritable(user,account);throw new CrmForbidden('Solo el responsable del negocio o un administrador puede modificarlo.');}
  return {scope:'open_management',leadIds};
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
  if(write && account.archivedAt && user.role!=='admin')throw new CrmForbidden(archivedWriteMessage);
  if(lead.deletedAt && (write || user.role!=='admin'))throw new CrmForbidden('Esta gestión está en la papelera. Solo un administrador puede consultarla; restaurala antes de modificarla.');
  if(write&&!canModifyManagement(user,lead,account))throw new CrmForbidden("Solo el responsable de esta gestión o un administrador puede modificarla.");
  return lead;
}
