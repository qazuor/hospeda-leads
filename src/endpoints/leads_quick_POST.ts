import superjson from "superjson";
import { db } from "../helpers/db";
import { getServerUserSession } from "../helpers/getServerUserSession";
import { schema, type OutputType } from "./leads_quick_POST.schema";
import { writeLeadJournal } from "../helpers/writeLeadJournal";

export async function handle(request: Request) {
  try {
    const {user}=await getServerUserSession(request);
    const input = schema.parse(superjson.parse(await request.text()));
    if(input.field==="assignedUserEmail"&&user.role!=="admin"){
      return new Response(superjson.stringify({error:"Solo un administrador puede modificar el responsable."}),{status:403});
    }
    const dateFields=["fechaCreacion","fechaUltimoContacto","fechaProximaAccion"];
    const normalizedValue=dateFields.includes(input.field)
      ? (input.value ? new Date(input.value+"T12:00:00") : null)
      : input.value;
    const values = input.field==="tipo"
      ? { tipo: input.value, subtipo: null, updatedAt: new Date() }
      : input.field==="assignedUserEmail"
        ? { assignedUserEmail: input.value, asignadoA: null, updatedAt: new Date() }
        : { [input.field]: normalizedValue, updatedAt: new Date() };
    await db.transaction().execute(async trx=>{
      const old=await trx.selectFrom("leads").selectAll().where("id","=",String(input.id)).executeTakeFirstOrThrow();
      if(old.deletedAt)throw new Error("Este lead está en la papelera.");
      await trx.updateTable("leads").set(values).where("id","=",String(input.id)).execute();
      const changes=input.field==="tipo"
        ? [
            {fieldName:"tipo",oldValue:old.tipo,newValue:input.value},
            ...(old.subtipo?[{fieldName:"subtipo",oldValue:old.subtipo,newValue:null}]:[])
          ]
        : [{fieldName:input.field,oldValue:old[input.field],newValue:normalizedValue}];
      await writeLeadJournal(trx,{
        leadId:String(old.id),
        leadName:old.nombre,
        actor:{id:user.id,email:user.email,displayName:user.displayName},
        action:"inline_updated",
        changes
      });
    });
    return new Response(superjson.stringify({ok:true} satisfies OutputType));
  } catch(error) {
    return new Response(superjson.stringify({error:error instanceof Error?error.message:"No se pudo actualizar"}),{status:400});
  }
}