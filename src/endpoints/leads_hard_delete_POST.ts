import {assertBusinessAccess} from '../helpers/crmPermissions';
import superjson from "superjson";
import { db } from "../helpers/db";
import { getServerUserSession } from "../helpers/getServerUserSession";
import { writeLeadJournal } from "../helpers/writeLeadJournal";
import { schema, type OutputType } from "./leads_hard_delete_POST.schema";

export async function handle(request:Request){
  try{
    const {user}=await getServerUserSession(request);
    if(user.role!=="admin")return new Response(superjson.stringify({error:"Solo administradores pueden eliminar definitivamente."}),{status:403});
    const input=schema.parse(superjson.parse(await request.text()));
    await db.transaction().execute(async trx=>{
      const lead=await trx.selectFrom("leads").selectAll().where("id","=",String(input.id)).executeTakeFirstOrThrow();
      await assertBusinessAccess(trx,String(lead.accountId),user,false,true);
      if(!lead.deletedAt)throw new Error("El lead debe estar en la papelera antes de eliminarlo definitivamente.");
      await writeLeadJournal(trx,{
        leadId:String(lead.id),leadName:lead.nombre,leadCity:lead.ciudad,leadType:lead.tipo,
        actor:{id:user.id,email:user.email,displayName:user.displayName},
        action:"hard_deleted"
      });
      await trx.deleteFrom("leads").where("id","=",String(input.id)).execute();
    });
    return new Response(superjson.stringify({ok:true} satisfies OutputType));
  }catch(error){
    return new Response(superjson.stringify({error:error instanceof Error?error.message:"No se pudo eliminar definitivamente"}),{status:400});
  }
}