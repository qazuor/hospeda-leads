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
 const selected=['id','status','assignedUserEmail','deletedAt','archivedAt','mergedIntoId'] as const;
 const [accounts,users]=await Promise.all([
  lock?executor.selectFrom('crmAccounts').select(selected).where('mergedIntoId','is',null).orderBy('id').forUpdate().execute():executor.selectFrom('crmAccounts').select(selected).where('mergedIntoId','is',null).orderBy('id').execute(),
  executor.selectFrom('users').select(['email','displayName']).where('role','=','user').orderBy('displayName').orderBy('email').execute()
 ]);
 return createBusinessReassignmentPlan(users,accounts.map(account=>({...account,id:String(account.id),mergedIntoId:account.mergedIntoId===null?null:String(account.mergedIntoId)})) as ReassignmentAccount[]);
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
   if(plan.fingerprint!==input.fingerprint)throw new Error('Los datos cambiaron desde la vista previa. Actualizala y revisá el nuevo reparto.');
   if(!plan.moves.length)return {ok:true,moved:0,plan};
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
    await trx.insertInto('crmCommercialJournal').values(chunk.map(move=>({accountId:move.accountId,contactId:null,action:'business_assignment_rebalanced',actorEmail:user.email,actorName:actor?.displayName??user.displayName,metadata:sql`${JSON.stringify({before:{assignedUserEmail:move.fromEmail},after:{assignedUserEmail:move.toEmail},reason:'business_state_new_rebalance'})}::text::jsonb`}))).execute();
   }
   return {ok:true,moved:plan.moves.length,plan};
  });
  return response(result);
 }catch(error){return errorResponse(error);}
}
