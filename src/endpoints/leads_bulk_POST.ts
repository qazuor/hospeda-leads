import superjson from "superjson";
import { db } from "../helpers/db";
import { getServerUserSession } from "../helpers/getServerUserSession";
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
      const leads=await trx.selectFrom("leads").selectAll().where("id","in",ids).where("deletedAt","is",null).execute();
      for(const lead of leads){
        const values:Record<string,unknown>={updatedAt:new Date()};
        const changes:{fieldName:string;oldValue:unknown;newValue:unknown}[]=[];
        const add=(fieldName:string,newValue:unknown)=>{
          const oldValue=(lead as any)[fieldName];
          if(comparable(oldValue)===comparable(newValue))return;
          values[fieldName]=newValue;
          changes.push({fieldName,oldValue,newValue});
        };
        if("estado" in input.changes)add("estado",input.changes.estado??null);
        if("prioridad" in input.changes)add("prioridad",input.changes.prioridad??null);
        if("ciudad" in input.changes)add("ciudad",input.changes.ciudad??null);
        if("commercialProfile" in input.changes)add("commercialProfile",input.changes.commercialProfile??null);
        if("assignedUserEmail" in input.changes){
          add("assignedUserEmail",input.changes.assignedUserEmail??null);
          values.asignadoA=null;
        }
        if("tipo" in input.changes){
          add("tipo",input.changes.tipo??null);
          if(!("subtipo" in input.changes)&&lead.subtipo)add("subtipo",null);
        }
        if("subtipo" in input.changes)add("subtipo",input.changes.subtipo??null);
        if("fechaProximaAccion" in input.changes){
          const next=input.changes.fechaProximaAccion?new Date(input.changes.fechaProximaAccion+"T12:00:00"):null;
          add("fechaProximaAccion",next);
        }
        if(!changes.length)continue;
        await trx.updateTable("leads").set(values as any).where("id","=",String(lead.id)).execute();
        await writeLeadJournal(trx,{
          leadId:String(lead.id),leadName:lead.nombre,leadCity:lead.ciudad,leadType:lead.tipo,
          actor:{id:user.id,email:user.email,displayName:user.displayName},action:"bulk_updated",changes
        });
      }
      return leads.length;
    });
    return new Response(superjson.stringify({ok:true,updated} satisfies OutputType),{headers:{"Content-Type":"application/json"}});
  }catch(error){
    return new Response(superjson.stringify({error:error instanceof Error?error.message:"No se pudieron actualizar los leads"}),{status:400});
  }
}