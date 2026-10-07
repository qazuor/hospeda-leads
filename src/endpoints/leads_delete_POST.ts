import {CrmForbidden,assertLeadAccess} from '../helpers/crmPermissions';
import superjson from "superjson";
import { db } from "../helpers/db";
import { getServerUserSession } from "../helpers/getServerUserSession";
import { schema, type OutputType } from "./leads_delete_POST.schema";
import { writeLeadJournal } from "../helpers/writeLeadJournal";
export async function handle(request: Request) {
  try {
    const {user}=await getServerUserSession(request);
    const input=schema.parse(superjson.parse(await request.text()));
    await db.transaction().execute(async trx=>{
      const lead=await assertLeadAccess(trx,String(input.id),user,true);
      if(lead.deletedAt) return;
      await writeLeadJournal(trx,{
        leadId:String(lead.id),leadName:lead.nombre,leadCity:lead.ciudad,leadType:lead.tipo,
        actor:{id:user.id,email:user.email,displayName:user.displayName},
        action:"soft_deleted"
      });
      await trx.updateTable("leads").set({
        deletedAt:new Date(),
        deletedByUserId:user.id,
        deletedByEmail:user.email,
        deletedByName:user.displayName,
        updatedAt:new Date()
      }).where("id","=",String(input.id)).execute();
    });
    return new Response(superjson.stringify({ok:true} satisfies OutputType));
  } catch(error) {
    return new Response(superjson.stringify({error:error instanceof Error?error.message:"No se pudo enviar el lead a la papelera"}),{status:error instanceof CrmForbidden?403:400});
  }
}