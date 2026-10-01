import {setWorkActor} from "../helpers/workAudit";
import superjson from "superjson";
import { db } from "../helpers/db";
import { getServerUserSession } from "../helpers/getServerUserSession";
import { updateBusinessFields } from "../helpers/updateBusinessFields";
import { writeLeadJournal } from "../helpers/writeLeadJournal";
import { schema, type OutputType } from "./leads_bulk_POST.schema";

const comparable=(value:unknown)=>{
  if(value===null||value===undefined)return null;
  if(value instanceof Date)return value.toISOString();
  return String(value);
};

export async function handle(request:Request){
  try{
    const {user}=await getServerUserSession(request);
    const input=schema.parse(superjson.parse(await request.text()));
    if(Object.prototype.hasOwnProperty.call(input.changes,"assignedUserEmail")&&user.role!=="admin"){
      return new Response(superjson.stringify({error:"Solo un administrador puede modificar el responsable."}),{status:403});
    }
    const ids=input.ids.map(String);
    const updated=await db.transaction().execute(async trx=>{
      await setWorkActor(trx,user);
      const changesInput={...input.changes};
      if(input.entity==="business"){
        const shared:{ciudad?:string|null;assignedUserEmail?:string|null}={};
        if("ciudad" in changesInput){shared.ciudad=changesInput.ciudad??null;delete changesInput.ciudad}
        if("assignedUserEmail" in changesInput){shared.assignedUserEmail=changesInput.assignedUserEmail??null;delete changesInput.assignedUserEmail}
        await updateBusinessFields(trx,ids,shared,user);
      }
      const leads=await trx.selectFrom("leads").selectAll().where(input.entity==="business"?"accountId":"id","in",ids).where("deletedAt","is",null).orderBy("id").forUpdate().execute();
      for(const lead of leads){
        const values:Record<string,unknown>={updatedAt:new Date()};
        const changes:{fieldName:string;oldValue:unknown;newValue:unknown}[]=[];
        const add=(fieldName:string,newValue:unknown)=>{
          const oldValue=(lead as any)[fieldName];
          if(comparable(oldValue)===comparable(newValue))return;
          values[fieldName]=newValue;
          changes.push({fieldName,oldValue,newValue});
        };
        if("estado" in changesInput)add("estado",changesInput.estado??null);
        if("prioridad" in changesInput)add("prioridad",changesInput.prioridad??null);
        if("ciudad" in changesInput)add("ciudad",changesInput.ciudad??null);
        if("commercialProfile" in changesInput)add("commercialProfile",changesInput.commercialProfile??null);
        if("assignedUserEmail" in changesInput){
          add("assignedUserEmail",changesInput.assignedUserEmail??null);
          values.asignadoA=null;
        }
        if("tipo" in changesInput){
          add("tipo",changesInput.tipo??null);
          if(!("subtipo" in changesInput)&&lead.subtipo)add("subtipo",null);
        }
        if("subtipo" in changesInput)add("subtipo",changesInput.subtipo??null);
        if("fechaProximaAccion" in changesInput){
          const next=changesInput.fechaProximaAccion?new Date(changesInput.fechaProximaAccion+"T12:00:00Z"):null;
          add("fechaProximaAccion",next);
        }
        if(!changes.length)continue;
        await trx.updateTable("leads").set(values as any).where("id","=",String(lead.id)).execute();
        await writeLeadJournal(trx,{
          leadId:String(lead.id),leadName:lead.nombre,leadCity:lead.ciudad,leadType:lead.tipo,
          actor:{id:user.id,email:user.email,displayName:user.displayName},action:"bulk_updated",changes
        });
      }
      return input.entity==="business"?ids.length:leads.length;
    });
    return new Response(superjson.stringify({ok:true,updated} satisfies OutputType),{headers:{"Content-Type":"application/json"}});
  }catch(error){
    return new Response(superjson.stringify({error:error instanceof Error?error.message:"No se pudieron actualizar los leads"}),{status:400});
  }
}