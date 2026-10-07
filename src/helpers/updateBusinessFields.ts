import {assertAccountWritable} from './crmPermissions';
import { sql, type Transaction } from "kysely";
import type { DB } from "./schema";

export async function updateBusinessFields(trx:Transaction<DB>,ids:string[],changes:{ciudad?:string|null;assignedUserEmail?:string|null},actor:{email:string;displayName:string;role:"admin"|"user"}){
  const accounts=await trx.selectFrom("crmAccounts").selectAll().where("id","in",ids).orderBy("id").forUpdate().execute();
  if(accounts.length!==new Set(ids).size)throw new Error("Uno de los negocios ya no existe.");
  for(const before of accounts)assertAccountWritable(actor,before);
  for(const before of accounts){
    if(!Object.keys(changes).some(key=>before[key as keyof typeof changes]!==changes[key as keyof typeof changes]))continue;
    const after=await trx.updateTable("crmAccounts").set({...changes,updatedAt:new Date()}).where("id","=",String(before.id)).returningAll().executeTakeFirstOrThrow();
    await trx.insertInto("crmCommercialJournal").values({accountId:before.id,contactId:null,action:"account_updated",actorEmail:actor.email,actorName:actor.displayName,metadata:sql`${JSON.stringify({before,after})}::jsonb`}).execute();
  }
  return accounts;
}
