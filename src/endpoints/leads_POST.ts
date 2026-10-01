import {setWorkActor} from "../helpers/workAudit";
import { db } from "../helpers/db";
import superjson from "superjson";
import { schema, type OutputType } from "./leads_POST.schema";
import { getServerUserSession } from "../helpers/getServerUserSession";
import { writeLeadJournal } from "../helpers/writeLeadJournal";

// Compatibility endpoint. Legacy names may be resolved only by administrators.
export async function handle(request:Request){
  try{
    const {user}=await getServerUserSession(request);
    const x=schema.parse(superjson.parse(await request.text()));
    if(x.asignadoA!==undefined&&user.role!=="admin")return new Response(superjson.stringify({error:"Solo administradores pueden modificar el responsable."}),{status:403});
    const id=await db.transaction().execute(async trx=>{
      await setWorkActor(trx,user);
      const existing=x.id?await trx.selectFrom("leads").selectAll().where("id","=",x.id).executeTakeFirstOrThrow():null;
      if(existing?.deletedAt)throw new Error("Este lead está en la papelera.");
      let responsible=existing?.assignedUserEmail??null;
      if(x.asignadoA!==undefined){
        responsible=null;
        if(x.asignadoA){
          const candidates=await trx.selectFrom("users").select("email").where(eb=>eb.or([eb("email","=",x.asignadoA!),eb("displayName","=",x.asignadoA!)])).execute();
          if(candidates.length!==1)throw new Error("Responsable ambiguo o no registrado. Usá la edición actual del lead.");
          responsible=candidates[0].email;
        }
      }
      const data={nombre:x.nombre,tipo:x.tipo??null,subtipo:x.subtipo??null,ciudad:x.ciudad??null,estado:x.estado??null,email:x.email??null,telefono:x.telefono??null,origen:x.origen??null,prioridad:x.prioridad??null,assignedUserEmail:responsible,...(x.asignadoA!==undefined?{asignadoA:null}:{}),fechaProximaAccion:x.fechaProximaAccion?new Date(x.fechaProximaAccion):null,notas:x.notas??null,updatedAt:new Date()};
      const row=existing?await trx.updateTable("leads").set(data).where("id","=",x.id!).returningAll().executeTakeFirstOrThrow():await trx.insertInto("leads").values(data).returningAll().executeTakeFirstOrThrow();
      await writeLeadJournal(trx,{leadId:row.id,leadName:row.nombre,actor:{id:user.id,email:user.email,displayName:user.displayName},action:existing?"updated":"created",changes:existing?Object.entries(data).filter(([key,value])=>String(existing[key as keyof typeof existing]??"")!==String(value??"")).map(([fieldName,newValue])=>({fieldName,oldValue:existing[fieldName as keyof typeof existing],newValue})):undefined});
      return String(row.id);
    });
    return new Response(superjson.stringify({ok:true,id} satisfies OutputType));
  }catch(e){return new Response(superjson.stringify({error:e instanceof Error?e.message:"Error"}),{status:400})}
}
