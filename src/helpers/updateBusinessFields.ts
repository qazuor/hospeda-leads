import {classificationErrors} from './accountClassification';
import {assertAccountWritable} from './crmPermissions';
import {reassignRecontactTask} from './recontactTask';
import {assertActiveAssignee} from './activeAssignee';
import { sql, type Selectable, type Transaction } from "kysely";
import type { CrmAccounts, DB } from "./schema";
import {expandToSellerGroups} from './accountSellerGroups';

export class BusinessFieldsConflict extends Error {}

export async function updateBusinessResponsibleForLockedAccounts(trx:Transaction<DB>,accounts:readonly Selectable<CrmAccounts>[],assignedUserEmail:string|null,actor:{email:string;displayName:string;role:"admin"|"user"}):Promise<void>{
  for(const before of accounts){const effective=before.referredToLeandro?before.referredOriginalOwnerEmail:before.assignedUserEmail;if(effective===assignedUserEmail)continue;
    assertAccountWritable(actor,before);
    const fields=before.referredToLeandro?{referredOriginalOwnerEmail:assignedUserEmail,assignedUserEmail:before.assignedUserEmail,updatedAt:new Date()}:{assignedUserEmail,updatedAt:new Date()};
    const after=await trx.updateTable("crmAccounts").set(fields).where("id","=",String(before.id)).returningAll().executeTakeFirstOrThrow();
    await trx.insertInto("crmCommercialJournal").values({accountId:before.id,contactId:null,action:"account_updated",actorEmail:actor.email,actorName:actor.displayName,metadata:sql`${JSON.stringify({before,after})}::text::jsonb`}).execute();
    await reassignRecontactTask(trx,{accountId:before.id,fromEmail:effective,toEmail:after.assignedUserEmail});
  }
}

export async function updateBusinessFields(trx:Transaction<DB>,ids:string[],changes:{ciudad?:string|null;assignedUserEmail?:string|null;tipo?:string|null;subtipo?:string|null},actor:{email:string;displayName:string;role:"admin"|"user"},expectedAssignedUserEmail?:string|null){
  const seeds=changes.assignedUserEmail!==undefined?await trx.selectFrom("crmAccounts").selectAll().where("id","in",ids).execute():[];
  const activeSeeds=seeds.filter(a=>!a.deletedAt&&!a.archivedAt&&!a.mergedIntoId).map(a=>String(a.id));
  const expand=changes.assignedUserEmail!==undefined&&activeSeeds.length>0;
  const expanded=expand?[...new Set([...ids,...await expandToSellerGroups({trx,accountIds:activeSeeds})])].sort((a,b)=>BigInt(a)<BigInt(b)?-1:BigInt(a)>BigInt(b)?1:0):ids;
  const accounts=await trx.selectFrom("crmAccounts").selectAll().where("id","in",expanded).orderBy("id").forUpdate().execute();
  if(expand){const fresh=[...new Set([...ids,...await expandToSellerGroups({trx,accountIds:activeSeeds})])].sort((a,b)=>BigInt(a)<BigInt(b)?-1:BigInt(a)>BigInt(b)?1:0);if(fresh.length!==expanded.length||fresh.some((id,index)=>id!==expanded[index]))throw new BusinessFieldsConflict("Los datos cambiaron desde la revisión. Volvé a revisar antes de aplicar.");}
  if(accounts.length!==new Set(expanded).size)throw new Error("Uno de los negocios ya no existe.");
  if(expectedAssignedUserEmail!==undefined){const seed=accounts.find(a=>ids.includes(String(a.id)));const effective=seed?.referredToLeandro?seed.referredOriginalOwnerEmail:seed?.assignedUserEmail;if(effective!==expectedAssignedUserEmail)throw new BusinessFieldsConflict('Este dato cambió mientras lo editabas. Recargá los datos y revisá el nuevo valor.');}
  for(const before of accounts)assertAccountWritable(actor,before);
  if(changes.assignedUserEmail!==undefined)for(const before of accounts)await assertActiveAssignee(trx,{next:changes.assignedUserEmail,previous:before.referredToLeandro?before.referredOriginalOwnerEmail:before.assignedUserEmail});
  for(const before of accounts){
    if(changes.tipo!==undefined||changes.subtipo!==undefined){
      const errors=await classificationErrors(trx,changes.tipo===undefined?before.tipo:changes.tipo,changes.subtipo===undefined?before.subtipo:changes.subtipo,before);
      if(errors.length)throw new Error(errors.join(' '));
    }
    const effective=before.referredToLeandro?before.referredOriginalOwnerEmail:before.assignedUserEmail;
    const changed=Object.keys(changes).some(key=>key==="assignedUserEmail"?effective!==changes.assignedUserEmail:before[key as keyof typeof changes]!==changes[key as keyof typeof changes]);
    if(!changed)continue;
    const fields={...changes,...(before.referredToLeandro&&changes.assignedUserEmail!==undefined?{referredOriginalOwnerEmail:changes.assignedUserEmail,assignedUserEmail:before.assignedUserEmail}:{}),updatedAt:new Date()};
    const after=await trx.updateTable("crmAccounts").set(fields).where("id","=",String(before.id)).returningAll().executeTakeFirstOrThrow();
    await trx.insertInto("crmCommercialJournal").values({accountId:before.id,contactId:null,action:"account_updated",actorEmail:actor.email,actorName:actor.displayName,metadata:sql`${JSON.stringify({before,after})}::text::jsonb`}).execute();
    if(changes.assignedUserEmail!==undefined)await reassignRecontactTask(trx,{accountId:before.id,fromEmail:effective,toEmail:changes.assignedUserEmail});// Decision 7A: the untouched "Volver a contactar" task follows the new responsible.
  }
  return accounts;
}
