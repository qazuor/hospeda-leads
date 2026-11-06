import {assertActiveAssignee} from '../helpers/activeAssignee';
import superjson from 'superjson';
import {z} from 'zod';
import {sql} from 'kysely';
import type {Kysely,Transaction} from 'kysely';
import {db} from '../helpers/db';
import {getServerUserSession} from '../helpers/getServerUserSession';
import {errorResponse} from '../helpers/errorResponse';
import {createBusinessReassignmentPlan,type ReassignmentAccount} from '../helpers/businessReassignment';
import type {DB} from '../helpers/schema';
import {parseBody} from '../helpers/parseBody';

async function loadPlan(executor:Kysely<DB>|Transaction<DB>,lock=false){
 if(lock){await sql`SELECT id FROM crm_accounts WHERE merged_into_id IS NULL ORDER BY id FOR UPDATE`.execute(executor);await sql`SELECT account_id FROM crm_account_seller_group_members ORDER BY account_id FOR SHARE`.execute(executor);}
 const [accounts,users]=await Promise.all([
  sql<{id:string;status:string;assignedUserEmail:string|null;deletedAt:Date|null;archivedAt:Date|null;mergedIntoId:string|null;groupId:string|null;referredToLeandro:boolean;referredOriginalOwnerEmail:string|null}>`SELECT a.id::text AS "id",a.status,a.assigned_user_email AS "assignedUserEmail",a.deleted_at AS "deletedAt",a.archived_at AS "archivedAt",a.merged_into_id::text AS "mergedIntoId",m.group_id::text AS "groupId",a.referred_to_leandro AS "referredToLeandro",a.referred_original_owner_email AS "referredOriginalOwnerEmail" FROM crm_accounts a LEFT JOIN crm_account_seller_group_members m ON m.account_id=a.id WHERE a.merged_into_id IS NULL ORDER BY a.id`.execute(executor),
  executor.selectFrom('users').select(['email','displayName']).where('role','=','user').where('deactivatedAt','is',null).orderBy('displayName').orderBy('email').execute()
 ]);
 const activeUsers=await executor.selectFrom('users').select('email').where('deactivatedAt','is',null).execute();
 return createBusinessReassignmentPlan(users,accounts.rows.map(account=>({...account,effectiveSellerEmail:account.referredToLeandro?account.referredOriginalOwnerEmail:account.assignedUserEmail})) as ReassignmentAccount[],new Set(activeUsers.map(row=>row.email)));
}

const response=(value:unknown,status=200)=>new Response(superjson.stringify(value),{status,headers:{'Content-Type':'application/json'}});

export async function get(request:Request){
 try{
  const {user}=await getServerUserSession(request);
  if(user.role!=='admin')return response({error:'Solo administradores pueden redistribuir negocios.'},403);
  const plan=await loadPlan(db);
  if(!plan.users.length)throw new Error('No hay usuarios vendedores para recibir negocios.');
  return response(plan);
 }catch(error){return errorResponse(error);}
}

export async function post(request:Request){
 try{
  const {user}=await getServerUserSession(request);
  if(user.role!=='admin')return response({error:'Solo administradores pueden redistribuir negocios.'},403);
  const input=z.object({fingerprint:z.string()}).parse(await parseBody(request));
  if(!/^[a-f0-9]{64}$/.test(input.fingerprint))return response({error:'Actualizá la vista previa antes de ejecutar.'},400);
  const result=await db.transaction().execute(async trx=>{
   const plan=await loadPlan(trx,true);
   if(!plan.users.length)throw new Error('No hay usuarios vendedores para recibir negocios.');
   if(plan.fingerprint!==input.fingerprint)throw new Error('Los datos cambiaron desde la vista previa. Actualizala y revisá el nuevo reparto.');
   if(!plan.moves.length)return {ok:true,moved:0,plan};
   for(const recipient of new Set(plan.moves.map(move=>move.toEmail)))await assertActiveAssignee(trx,{next:recipient,previous:null});
   const byId=new Map(plan.moves.map(move=>[move.accountId,move.toEmail]));
   const ids=[...byId.keys()];
   for(let offset=0;offset<ids.length;offset+=250){
    const chunk=ids.slice(offset,offset+250);
    const cases=chunk.map(id=>sql`WHEN ${id}::bigint THEN ${byId.get(id)}`);
    await sql`UPDATE crm_accounts SET assigned_user_email=CASE id ${sql.join(cases,sql` `)} ELSE assigned_user_email END,updated_at=now() WHERE id IN (${sql.join(chunk.map(id=>sql`${id}::bigint`))}) AND status='new' AND deleted_at IS NULL AND archived_at IS NULL AND merged_into_id IS NULL`.execute(trx);
   }
   const actor=await trx.selectFrom('users').select('displayName').where('email','=',user.email).executeTakeFirst();
   for(let offset=0;offset<plan.moves.length;offset+=100){
    const chunk=plan.moves.slice(offset,offset+100);
    await trx.insertInto('crmCommercialJournal').values(chunk.map(move=>({accountId:move.accountId,contactId:null,action:'business_assignment_rebalanced',actorEmail:user.email,actorName:actor?.displayName??user.displayName,metadata:sql`${JSON.stringify({before:{assignedUserEmail:move.fromEmail},after:{assignedUserEmail:move.toEmail},reason:move.groupId?'business_state_new_rebalance_linked':'business_state_new_rebalance',...(move.groupId?{groupId:move.groupId}:{})})}::text::jsonb`}))).execute();
   }
   return {ok:true,moved:plan.moves.length,plan};
  });
  return response(result);
 }catch(error){return errorResponse(error);}
}
