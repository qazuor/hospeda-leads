import superjson from "superjson";
import { db } from "../helpers/db";
import { getServerUserSession } from "../helpers/getServerUserSession";
import { writeLeadJournal } from "../helpers/writeLeadJournal";
import { schema, type OutputType } from "./leads_restore_POST.schema";

export async function handle(request:Request){
  try{
    const {user}=await getServerUserSession(request);
    if(user.role!=="admin")return new Response(superjson.stringify({error:"Solo administradores pueden restaurar leads."}),{status:403});
    const input=schema.parse(superjson.parse(await request.text()));
    await db.transaction().execute(async trx=>{
      const lead=await trx.selectFrom("leads").selectAll().where("id","=",String(input.id)).executeTakeFirstOrThrow();
      if(!lead.deletedAt)return;
      await writeLeadJournal(trx,{
        leadId:String(lead.id),leadName:lead.nombre,leadCity:lead.ciudad,leadType:lead.tipo,
        actor:{id:user.id,email:user.email,displayName:user.displayName},
        action:"restored"
      });
      await trx.updateTable("leads").set({
        deletedAt:null,deletedByUserId:null,deletedByEmail:null,deletedByName:null,updatedAt:new Date()
      }).where("id","=",String(input.id)).execute();
    });
    return new Response(superjson.stringify({ok:true} satisfies OutputType));
  }catch(error){
    return new Response(superjson.stringify({error:error instanceof Error?error.message:"No se pudo restaurar el lead"}),{status:400});
  }
}