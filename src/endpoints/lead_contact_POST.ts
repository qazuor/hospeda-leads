import {CrmForbidden} from '../helpers/crmPermissions';
import {sql} from 'kysely';
import {leadFor,CommunicationForbidden} from '../helpers/communicationService';
import {setWorkActor} from "../helpers/workAudit";
import { resolveCommercialContact } from "../helpers/commercialContact";
import superjson from "superjson";
import { db } from "../helpers/db";
import { getServerUserSession } from "../helpers/getServerUserSession";
import { writeLeadJournal } from "../helpers/writeLeadJournal";
import { schema, type OutputType } from "./lead_contact_POST.schema";
import {errorResponse} from '../helpers/errorResponse';
import {parseBody} from '../helpers/parseBody';

export async function handle(request:Request){
  try{
    const {user}=await getServerUserSession(request);
    const input=schema.parse(await parseBody(request));
    await db.transaction().execute(async trx=>{
      await setWorkActor(trx,user);
      await leadFor(trx,String(input.leadId),user);
      const lead=await trx.selectFrom("leads").selectAll().where("id","=",String(input.leadId)).where("deletedAt","is",null).executeTakeFirstOrThrow();
      const contact=await resolveCommercialContact(trx,lead,input.contactId);
      const contactedAt=new Date();
      const values:Record<string,unknown>={
        updatedAt:new Date()
      };
      const changes:{fieldName:string;oldValue:unknown;newValue:unknown}[]=[
        {fieldName:"fechaUltimoContacto",oldValue:lead.fechaUltimoContacto,newValue:contactedAt},
        {fieldName:"resultadoUltimoContacto",oldValue:lead.resultadoUltimoContacto,newValue:input.result}
      ];
      if(input.nextAction!==undefined){
        const next=input.nextAction?new Date(input.nextAction+"T12:00:00Z"):null;
        values.fechaProximaAccion=next;
        changes.push({fieldName:"fechaProximaAccion",oldValue:lead.fechaProximaAccion,newValue:next});
      }
      await trx.updateTable("leads").set(values as any).where("id","=",String(lead.id)).execute();
      const activity=await trx.insertInto("crmActivities").values({accountId:lead.accountId,leadId:lead.id,typeId:input.channel==="phone"?"call":"message",title:"Contacto registrado",occurredAt:contactedAt,channel:input.channel,result:input.result,participants:contact.name||"",contactIds:contact.contactId?[String(contact.contactId)]:[],actorEmail:user.email}).returning("id").executeTakeFirstOrThrow();
      await writeLeadJournal(trx,{
        leadId:String(lead.id),leadName:lead.nombre,leadCity:lead.ciudad,leadType:lead.tipo,
        actor:{id:user.id,email:user.email,displayName:user.displayName},
        action:"contact_logged",changes,metadata:{activityId:activity.id,contactId:contact.contactId,contactName:contact.name,channel:input.channel,result:input.result}
      });
    });
    return new Response(superjson.stringify({ok:true} satisfies OutputType));
  }catch(error){
    return errorResponse(error,error instanceof CommunicationForbidden||error instanceof CrmForbidden?403:400);
  }
}