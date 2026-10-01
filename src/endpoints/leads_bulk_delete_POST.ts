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
    const deleted=await db.transaction().execute(async trx=>{
      if(input.entity==="business")await updateBusinessFields(trx,ids,{},user);
      const leads=await trx.selectFrom("leads").selectAll().where(input.entity==="business"?"accountId":"id","in",ids).where("deletedAt","is",null).orderBy("id").forUpdate().execute();
      if(input.entity==="business"&&ids.some(id=>!leads.some(l=>String(l.accountId)===id)))throw new Error("Un negocio sin oportunidades todavía no tiene elementos que enviar a Papelera.");
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
    return new Response(superjson.stringify({error:error instanceof Error?error.message:"No se pudieron enviar los leads a la papelera"}),{status:400});
  }
}