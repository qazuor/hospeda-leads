import type { Kysely, Transaction, Selectable } from "kysely";
import type { DB, Leads } from "./schema";

// A general recipient uses current business channels, without an inferred person. Explicit selection never falls back.
export async function resolveCommercialContact(executor:Kysely<DB>|Transaction<DB>,lead:Selectable<Leads>,contactId?:string|null){
  if(!contactId){const account=await executor.selectFrom("crmAccounts").select(["telefono","email"]).where("id","=",String(lead.accountId)).executeTakeFirstOrThrow();return {contactId:null,name:null,phone:account.telefono,email:account.email};}
  const contact=await executor.selectFrom("crmContacts").selectAll().where("id","=",contactId)
    .where("accountId","=",String(lead.accountId)).where("deletedAt","is",null).executeTakeFirst();
  if(!contact)throw new Error("El contacto no pertenece a esta cuenta o está dado de baja.");
  return {contactId:String(contact.id),name:contact.name,phone:contact.phone,email:contact.email};
}
