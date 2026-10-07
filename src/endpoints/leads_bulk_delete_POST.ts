import {CrmForbidden,assertBusinessAccess,assertLeadAccess} from '../helpers/crmPermissions';
import superjson from "superjson";
import { db } from "../helpers/db";
import { getServerUserSession } from "../helpers/getServerUserSession";
import { updateBusinessFields } from "../helpers/updateBusinessFields";
import { writeLeadJournal } from "../helpers/writeLeadJournal";
import { schema, type OutputType } from "./leads_bulk_delete_POST.schema";

export async function handle(request:Request){
  try{
    const {user}=await getServerUserSession(request);
    const input=schema.parse(superjson.parse(await request.text()));
    const ids=input.ids.map(String);
    // Authorize every target before making any change: mixed batches roll back.
    const deleted=await db.transaction().execute(async trx=>{
      if(input.entity==="business")await updateBusinessFields(trx,ids,{},user);
      else {
        const contexts=await trx.selectFrom("leads").select("accountId").where("id","in",ids).execute();
        const accountIds=[...new Set(contexts.map(row=>String(row.accountId)))];
        if(accountIds.length)await trx.selectFrom("crmAccounts").select("id").where("id","in",accountIds).orderBy("id").forUpdate().execute();
      }
      const leads=await trx.selectFrom("leads").selectAll().where(input.entity==="business"?"accountId":"id","in",ids).where("deletedAt","is",null).orderBy("id").forUpdate().execute();
      if(input.entity==="business"){for(const id of ids)await assertBusinessAccess(trx,id,user,true);}
      else {for(const id of ids)await assertLeadAccess(trx,id,user,true);}
      if(input.entity==="business"&&ids.some(id=>!leads.some(l=>String(l.accountId)===id)))throw new Error("Un negocio sin gestiones todavía no tiene elementos que enviar a Papelera.");
      for(const lead of leads)await assertLeadAccess(trx,String(lead.id),user,true);
      const now=new Date();
      for(const lead of leads){
        await writeLeadJournal(trx,{
          leadId:String(lead.id),leadName:lead.nombre,leadCity:lead.ciudad,leadType:lead.tipo,
          actor:{id:user.id,email:user.email,displayName:user.displayName},action:"soft_deleted",
          metadata:{bulk:true}
        });
      }
      if(leads.length){
        await trx.updateTable("leads").set({
          deletedAt:now,deletedByUserId:user.id,deletedByEmail:user.email,deletedByName:user.displayName,updatedAt:now
        }).where("id","in",leads.map(lead=>String(lead.id))).execute();
      }
      return leads.length;
    });
    return new Response(superjson.stringify({ok:true,deleted} satisfies OutputType),{headers:{"Content-Type":"application/json"}});
  }catch(error){
    return new Response(superjson.stringify({error:error instanceof Error?error.message:"No se pudieron enviar los leads a la papelera"}),{status:error instanceof CrmForbidden?403:400});
  }
}