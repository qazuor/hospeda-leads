import {CrmForbidden,assertBusinessAccess,assertLeadAccess} from '../helpers/crmPermissions';
import {setWorkActor} from "../helpers/workAudit";
import {createHash} from "node:crypto";
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
    // Authorize every target before making any change: mixed batches roll back.
    const updated=await db.transaction().execute(async trx=>{
      await setWorkActor(trx,user);
      const matched=await trx.selectFrom("leads").select("accountId").where(input.entity==="business"?"accountId":"id","in",ids).where("deletedAt","is",null).execute();
      const accountIds=input.entity==="business"?ids:[...new Set(matched.map(l=>String(l.accountId)))];
      const businesses=accountIds.length?await trx.selectFrom("crmAccounts").selectAll().where("id","in",accountIds).orderBy("id").forUpdate().execute():[];
      const leads=await trx.selectFrom("leads").selectAll().where(input.entity==="business"?"accountId":"id","in",ids).where("deletedAt","is",null).orderBy("id").forUpdate().execute();
      if(input.entity==="business"){for(const id of ids)await assertBusinessAccess(trx,id,user,true);}
      else {for(const id of ids)await assertLeadAccess(trx,id,user,true);}
      if(input.entity!=="business"&&"ciudad" in input.changes){for(const id of accountIds)await assertBusinessAccess(trx,id,user,true);}
      if(Object.keys(input.changes).some(key=>input.entity!=="business"||!["ciudad","assignedUserEmail"].includes(key))){for(const lead of leads)await assertLeadAccess(trx,String(lead.id),user,true);}
      const fingerprint=createHash('sha256').update(superjson.stringify({entity:input.entity,ids:[...ids].sort(),changes:input.changes,leads,businesses})).digest('hex');
      if(input.expectedFingerprint&&input.expectedFingerprint!==fingerprint)throw new Error('Los datos cambiaron desde la revisión. Volvé a revisar antes de aplicar.');
      if(input.preview)return {fingerprint,rows:leads.map(l=>({id:String(l.id),accountId:l.accountId,nombre:l.nombre,opportunityName:l.opportunityName,estado:l.estado,assignedUserEmail:l.assignedUserEmail})),businesses:businesses.map(a=>({id:String(a.id),nombre:a.nombre,ciudad:a.ciudad,assignedUserEmail:a.assignedUserEmail}))};
      const changesInput={...input.changes};
      if(input.entity==="business"){
        const shared:{ciudad?:string|null;assignedUserEmail?:string|null}={};
        if("ciudad" in changesInput){shared.ciudad=changesInput.ciudad??null;delete changesInput.ciudad}
        if("assignedUserEmail" in changesInput){shared.assignedUserEmail=changesInput.assignedUserEmail??null;delete changesInput.assignedUserEmail}
        await updateBusinessFields(trx,ids,shared,user);
      }
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
    return new Response(superjson.stringify({ok:true,updated:typeof updated==="number"?updated:0,...(typeof updated!=="number"?{preview:updated}:{})} satisfies OutputType),{headers:{"Content-Type":"application/json"}});
  }catch(error){
    return new Response(superjson.stringify({error:error instanceof Error?error.message:"No se pudieron actualizar los leads"}),{status:error instanceof CrmForbidden?403:400});
  }
}