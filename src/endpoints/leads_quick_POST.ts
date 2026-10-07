import {inlineBadgeFields,isInlineBadgeField} from '../helpers/inlineBadgeFields';
import {CrmForbidden,assertLeadAccess,assertBusinessAccess} from '../helpers/crmPermissions';
import {setWorkActor} from "../helpers/workAudit";
import superjson from "superjson";
import { db } from "../helpers/db";
import { getServerUserSession } from "../helpers/getServerUserSession";
import { schema, type OutputType } from "./leads_quick_POST.schema";
import { updateBusinessFields } from "../helpers/updateBusinessFields";
import { writeLeadJournal } from "../helpers/writeLeadJournal";

class InlineConflict extends Error {}

export async function handle(request: Request) {
  try {
    const {user}=await getServerUserSession(request);
    const input = schema.parse(superjson.parse(await request.text()));
    if(input.field==="assignedUserEmail"&&user.role!=="admin"){
      return new Response(superjson.stringify({error:"Solo un administrador puede modificar el responsable."}),{status:403});
    }
    const dateFields=["fechaCreacion","fechaUltimoContacto","fechaProximaAccion"];
    const normalizedValue=dateFields.includes(input.field)
      ? (input.value ? new Date(input.value+"T12:00:00Z") : null)
      : input.value;
    const values = input.field==="tipo"
      ? { tipo: input.value, subtipo: null, updatedAt: new Date() }
      : input.field==="assignedUserEmail"
        ? { assignedUserEmail: input.value, asignadoA: null, updatedAt: new Date() }
        : { [input.field]: normalizedValue, updatedAt: new Date() };
    await db.transaction().execute(async trx=>{
      await setWorkActor(trx,user);
      if(input.scope==='management'){
        if(!input.accountId||!isInlineBadgeField(input.field)||inlineBadgeFields[input.field].scope!=='management')throw new Error('Elegí un dato de la gestión.');
        const old=await assertLeadAccess(trx,String(input.id),user,true);
        if(String(old.accountId)!==input.accountId)throw new Error('La gestión no pertenece a este negocio.');
        const current=old[input.field];
        if(input.expectedValue!==undefined&&current!==input.expectedValue&&current!==input.value)throw new InlineConflict('Este dato cambió mientras lo editabas. Recargá los datos y revisá el nuevo valor.');
        if(current===input.value)return;
        if(input.field==='commercialProfile'&&input.value&&!['Independiente','Consolidado','Referente'].includes(input.value))throw new Error('Perfil comercial no disponible.');
        await trx.updateTable('leads').set({[input.field]:input.value,updatedAt:new Date()}).where('id','=',String(old.id)).execute();
        await writeLeadJournal(trx,{leadId:String(old.id),leadName:old.nombre,actor:{id:user.id,email:user.email,displayName:user.displayName},action:'inline_updated',changes:[{fieldName:input.field,oldValue:current,newValue:input.value}]});
        return;
      }
      if(input.scope==='business'&&(!input.accountId||!isInlineBadgeField(input.field)||inlineBadgeFields[input.field].scope!=='business'))throw new Error('Elegí un dato del negocio.');
      if(input.accountId){
        const fields=input.field==="ciudad"?{ciudad:input.value}:input.field==="assignedUserEmail"?{assignedUserEmail:input.value}:input.field==="tipo"?{tipo:input.value,subtipo:null}:input.field==="subtipo"?{subtipo:input.value}:{};
        if(Object.keys(fields).length&&(input.expectedValue!==undefined||input.field==="tipo"||input.field==="subtipo")){
          const account=await assertBusinessAccess(trx,input.accountId,user,true);
          const current=account[input.field as 'ciudad'|'assignedUserEmail'|'tipo'|'subtipo'];
          if(input.field==='tipo'||input.field==='subtipo'){
            const expected=input.expectedClassification;
            if(!expected)throw new Error('Recargá la clasificación antes de editarla.');
            const alreadyApplied=input.field==='tipo'?account.tipo===input.value&&account.subtipo===null:account.subtipo===input.value&&account.tipo===expected.tipo;
            if(!alreadyApplied&&(account.tipo!==expected.tipo||account.subtipo!==expected.subtipo))throw new InlineConflict('La clasificación cambió mientras la editabas. Recargá los datos y revisá el nuevo valor.');
          }
          if(input.expectedValue!==undefined&&current!==input.expectedValue&&current!==input.value)throw new InlineConflict("Este dato cambió mientras lo editabas. Recargá los datos y revisá el nuevo valor.");
        }
        await updateBusinessFields(trx,[input.accountId],fields,user);
        if(Object.keys(fields).length)return;
        const opportunities=await trx.selectFrom("leads").select("id").where("accountId","=",input.accountId).where("deletedAt","is",null).execute();
        if(opportunities.length!==1||String(opportunities[0].id)!==String(input.id))throw new Error("Abrí el negocio y elegí la gestión que querés modificar.");
      }
      const old=await assertLeadAccess(trx,String(input.id),user,true);
      if(old.deletedAt)throw new Error("Este lead está en la papelera.");
      if(["nombre","ciudad","telefono","email","sitioWeb","urlGmap","perfilInstagram","perfilFacebook","perfilAirbnb","perfilBooking","perfilTurismoEntreRios"].includes(input.field))await assertBusinessAccess(trx,String(old.accountId),user,true);
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
    return new Response(superjson.stringify({error:error instanceof Error?error.message:"No se pudo actualizar"}),{status:error instanceof CrmForbidden?403:error instanceof InlineConflict?409:400});
  }
}