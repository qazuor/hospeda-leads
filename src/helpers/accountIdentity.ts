import {sql,type Kysely} from 'kysely';
import type {DB} from './schema';
export async function resolveAccount(database:Kysely<DB>,id:string){
 const seen=new Set<string>();
 while(!seen.has(id)){
  seen.add(id);const row=await database.selectFrom('crmAccounts').select(['id','mergedIntoId']).where('id','=',id).executeTakeFirstOrThrow();
  if(!row.mergedIntoId)return String(row.id);id=String(row.mergedIntoId);
 }
 throw new Error('Cadena de fusión inválida');
}
export async function accountFamily(database:Kysely<DB>,id:string){const result=await sql<{id:string}>`SELECT crm_account_family(${id}::bigint) AS id`.execute(database);return result.rows.map(r=>String(r.id));}
