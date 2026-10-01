import type { Kysely, Transaction, Selectable } from "kysely";
import type { DB, Leads } from "./schema";

// Undefined/null preserves legacy generic communication. Explicit selection never falls back.
export async function resolveCommercialContact(executor:Kysely<DB>|Transaction<DB>,lead:Selectable<Leads>,contactId?:string|null){
  if(!contactId)return {contactId:null,name:lead.contactName,phone:lead.telefono,email:lead.email};
  const contact=await executor.selectFrom("crmContacts").selectAll().where("id","=",contactId)
    .where("accountId","=",String(lead.accountId)).where("deletedAt","is",null).executeTakeFirst();
  if(!contact)throw new Error("El contacto no pertenece a esta cuenta o está dado de baja.");
  return {contactId:String(contact.id),name:contact.name,phone:contact.phone,email:contact.email};
}
