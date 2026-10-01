import superjson from "superjson";
import { db } from "../helpers/db";
import { getServerUserSession } from "../helpers/getServerUserSession";
import { writeLeadJournal } from "../helpers/writeLeadJournal";
import { schema, type OutputType } from "./lead_contact_POST.schema";

export async function handle(request:Request){
  try{
    const {user}=await getServerUserSession(request);
    const input=schema.parse(superjson.parse(await request.text()));
    await db.transaction().execute(async trx=>{
      const lead=await trx.selectFrom("leads").selectAll().where("id","=",String(input.leadId)).where("deletedAt","is",null).executeTakeFirstOrThrow();
      const contactedAt=new Date();
      const values:Record<string,unknown>={
        fechaUltimoContacto:contactedAt,
        resultadoUltimoContacto:input.result,
        updatedAt:new Date()
      };
      const changes:{fieldName:string;oldValue:unknown;newValue:unknown}[]=[
        {fieldName:"fechaUltimoContacto",oldValue:lead.fechaUltimoContacto,newValue:contactedAt},
        {fieldName:"resultadoUltimoContacto",oldValue:lead.resultadoUltimoContacto,newValue:input.result}
      ];
      if(input.nextAction!==undefined){
        const next=input.nextAction?new Date(input.nextAction+"T12:00:00"):null;
        values.fechaProximaAccion=next;
        changes.push({fieldName:"fechaProximaAccion",oldValue:lead.fechaProximaAccion,newValue:next});
      }
      await trx.updateTable("leads").set(values as any).where("id","=",String(lead.id)).execute();
      await writeLeadJournal(trx,{
        leadId:String(lead.id),leadName:lead.nombre,leadCity:lead.ciudad,leadType:lead.tipo,
        actor:{id:user.id,email:user.email,displayName:user.displayName},
        action:"contact_logged",changes,metadata:{channel:input.channel,result:input.result}
      });
    });
    return new Response(superjson.stringify({ok:true} satisfies OutputType));
  }catch(error){
    return new Response(superjson.stringify({error:error instanceof Error?error.message:"No se pudo registrar el contacto"}),{status:400});
  }
}