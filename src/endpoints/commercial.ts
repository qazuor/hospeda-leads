import {setWorkActor} from "../helpers/workAudit";
import { z } from "zod";
import superjson from "superjson";
import { getOpportunityStages } from "../helpers/commercialStages";
import { db } from "../helpers/db";
import { getServerUserSession } from "../helpers/getServerUserSession";
import { commercialQuery, commercialMutation } from "./commercial.schema";
import { writeLeadJournal } from "../helpers/writeLeadJournal";
import { NotAuthenticatedError } from "../helpers/getSetServerSession";

class Forbidden extends Error {}
const response=(value:unknown,status=200)=>new Response(superjson.stringify(value),{status,headers:{"Content-Type":"application/json"}});
const nullable=(v:string|null|undefined)=>v?.trim()||null;
const checkEmail=(next:string|null|undefined,previous?:string|null)=>{if(next&&next!==previous&&!z.string().email().safeParse(next).success)throw new Error("Email inválido.");};
const json=(value:unknown)=>JSON.parse(JSON.stringify(value));

export async function get(request:Request){
  try{
    await getServerUserSession(request);
    const input=commercialQuery.parse(Object.fromEntries(new URL(request.url).searchParams));
    let accountId=input.accountId;
    if(input.leadId){
      const lead=await db.selectFrom("leads").select("accountId").where("id","=",input.leadId).executeTakeFirstOrThrow();
      accountId=String(lead.accountId);
    }
    if(accountId){
      const [account,contacts,opportunities,journal,leadJournal,stages]=await Promise.all([
        db.selectFrom("crmAccounts").selectAll().where("id","=",accountId).executeTakeFirstOrThrow(),
        db.selectFrom("crmContacts").selectAll().where("accountId","=",accountId).orderBy("isPrimary","desc").orderBy("name").execute(),
        db.selectFrom("leads").selectAll().where("accountId","=",accountId).orderBy("createdAt","desc").execute(),
        db.selectFrom("crmCommercialJournal").selectAll().where("accountId","=",accountId).orderBy("createdAt","desc").limit(200).execute(),
        db.selectFrom("leadJournal").selectAll().where("accountId","=",accountId).orderBy("createdAt","desc").limit(200).execute(),
        getOpportunityStages(db)
      ]);
      return response({account,contacts,opportunities,journal,leadJournal,stages});
    }
    let query=db.selectFrom("crmAccounts");
    if(input.status)query=query.where("commercialStatus","=",input.status);
    if(input.q)query=query.where(eb=>eb.or([eb("nombre","ilike","%"+input.q+"%"),eb("email","ilike","%"+input.q+"%"),eb("ciudad","ilike","%"+input.q+"%") ]));
    const [count,rows]=await Promise.all([
      query.select(eb=>eb.fn.countAll().as("total")).executeTakeFirstOrThrow(),
      query.selectAll().select(eb=>[
        eb.selectFrom("leads").select(eb=>eb.fn.countAll().as("count")).whereRef("leads.accountId","=","crmAccounts.id").where("deletedAt","is",null).as("opportunityCount"),
        eb.selectFrom("crmContacts").select(eb=>eb.fn.countAll().as("count")).whereRef("crmContacts.accountId","=","crmAccounts.id").where("deletedAt","is",null).as("contactCount")
      ]).orderBy("nombre").limit(50).offset((input.page-1)*50).execute()
    ]);
    return response({rows:rows.map(r=>({...r,opportunityCount:Number(r.opportunityCount),contactCount:Number(r.contactCount)})),total:Number(count.total),page:input.page});
  }catch(e){return response({error:e instanceof Error?e.message:"Error"},e instanceof NotAuthenticatedError?401:400)}
}

export async function post(request:Request){
  try{
    const {user}=await getServerUserSession(request);
    const input=commercialMutation.parse(superjson.parse(await request.text()));
    const actor={id:user.id,email:user.email,displayName:user.displayName};
    const id=await db.transaction().execute(async trx=>{
      await setWorkActor(trx,user);
      const audit=async(accountId:string,action:string,before:unknown,after:unknown,contactId:string|null=null)=>{
        await trx.insertInto("crmCommercialJournal").values({accountId,contactId,action,actorEmail:user.email,actorName:user.displayName,metadata:json({before,after})}).execute();
      };
      const checkResponsible=(next:string|null|undefined,previous:string|null)=>{
        if(next!==undefined&&nullable(next)!==previous&&user.role!=="admin")throw new Forbidden("Solo un administrador puede modificar el responsable.");
      };
      if(input.action==="account_save"){
        const existing=input.id?await trx.selectFrom("crmAccounts").selectAll().where("id","=",input.id).forUpdate().executeTakeFirstOrThrow():null;
        checkResponsible(input.assignedUserEmail,existing?.assignedUserEmail??null);
        checkEmail(input.email,existing?.email);
        const fields={nombre:input.nombre,ciudad:nullable(input.ciudad),telefono:nullable(input.telefono),email:nullable(input.email),sitioWeb:nullable(input.sitioWeb),urlGmap:nullable(input.urlGmap),perfilInstagram:nullable(input.perfilInstagram),perfilFacebook:nullable(input.perfilFacebook),perfilAirbnb:nullable(input.perfilAirbnb),perfilBooking:nullable(input.perfilBooking),perfilTurismoEntreRios:nullable(input.perfilTurismoEntreRios),assignedUserEmail:input.assignedUserEmail===undefined?(existing?.assignedUserEmail??null):nullable(input.assignedUserEmail),updatedAt:new Date()};
        const row=existing?await trx.updateTable("crmAccounts").set(fields).where("id","=",input.id!).returningAll().executeTakeFirstOrThrow():await trx.insertInto("crmAccounts").values(fields).returningAll().executeTakeFirstOrThrow();
        await audit(String(row.id),existing?"account_updated":"account_created",existing,row);
        return String(row.id);
      }
      // One account lock for all related mutations: prevents competing primary selections.
      const account=await trx.selectFrom("crmAccounts").selectAll().where("id","=",input.accountId).forUpdate().executeTakeFirstOrThrow();
      if(input.action==="convert_client"){
        if(account.commercialStatus==="client")return String(account.id);
        const after=await trx.updateTable("crmAccounts").set({commercialStatus:"client",clientSince:new Date(),updatedAt:new Date()}).where("id","=",input.accountId).returningAll().executeTakeFirstOrThrow();
        await audit(input.accountId,"converted_to_client",account,{...after,reason:input.reason,paymentVerified:false});
        return input.accountId;
      }
      if(input.action==="contact_delete"){
        const old=await trx.selectFrom("crmContacts").selectAll().where("id","=",input.id).where("accountId","=",input.accountId).where("deletedAt","is",null).executeTakeFirstOrThrow();
        const affected=await trx.selectFrom("leads").selectAll().where("accountId","=",input.accountId).where("primaryContactId","=",input.id).execute();
        await trx.updateTable("leads").set({primaryContactId:null,updatedAt:new Date()}).where("accountId","=",input.accountId).where("primaryContactId","=",input.id).execute();
        for(const lead of affected)await writeLeadJournal(trx,{leadId:lead.id,leadName:lead.nombre,actor,action:"updated",changes:[{fieldName:"primaryContactId",oldValue:input.id,newValue:null}]});
        const after=await trx.updateTable("crmContacts").set({deletedAt:new Date(),isPrimary:false,updatedAt:new Date()}).where("id","=",input.id).returningAll().executeTakeFirstOrThrow();
        await audit(input.accountId,"contact_deleted",old,after,input.id);
        return input.id;
      }
      if(input.action==="contact_save"){
        const old=input.id?await trx.selectFrom("crmContacts").selectAll().where("id","=",input.id).where("accountId","=",input.accountId).where("deletedAt","is",null).executeTakeFirstOrThrow():null;
        checkEmail(input.email,old?.email);
        if(input.isPrimary){
          const previous=await trx.selectFrom("crmContacts").selectAll().where("accountId","=",input.accountId).where("isPrimary","=",true).where("deletedAt","is",null).execute();
          await trx.updateTable("crmContacts").set({isPrimary:false,updatedAt:new Date()}).where("accountId","=",input.accountId).where("isPrimary","=",true).execute();
          for(const c of previous)if(String(c.id)!==input.id)await audit(input.accountId,"contact_primary_changed",c,{...c,isPrimary:false},String(c.id));
        }
        const fields={accountId:input.accountId,name:input.name,position:nullable(input.position),phone:nullable(input.phone),email:nullable(input.email),preferredChannel:nullable(input.preferredChannel),isPrimary:input.isPrimary,notes:nullable(input.notes),updatedAt:new Date()};
        const row=old?await trx.updateTable("crmContacts").set(fields).where("id","=",input.id!).returningAll().executeTakeFirstOrThrow():await trx.insertInto("crmContacts").values(fields).returningAll().executeTakeFirstOrThrow();
        await audit(input.accountId,old?"contact_updated":"contact_created",old,row,String(row.id));
        return String(row.id);
      }
      const old=input.id?await trx.selectFrom("leads").selectAll().where("id","=",input.id).where("accountId","=",input.accountId).where("deletedAt","is",null).forUpdate().executeTakeFirstOrThrow():null;
      checkResponsible(input.assignedUserEmail,old?.assignedUserEmail??null);
      if(input.primaryContactId)await trx.selectFrom("crmContacts").select("id").where("id","=",input.primaryContactId).where("accountId","=",input.accountId).where("deletedAt","is",null).executeTakeFirstOrThrow();
      if(input.tipo&&input.tipo!==old?.tipo){
        const vertical=await trx.selectFrom("crmVerticals").select("id").where("name","=",input.tipo).where("active","=",true).executeTakeFirst();
        if(!vertical)throw new Error("Vertical no disponible en Configuración.");
      }
      if(input.estado&&input.estado!==old?.estado){
        if(!(await getOpportunityStages(trx)).includes(input.estado))throw new Error("Etapa no disponible.");
      }
      const fields={opportunityName:input.opportunityName,tipo:nullable(input.tipo),estado:nullable(input.estado),assignedUserEmail:input.assignedUserEmail===undefined?(old?.assignedUserEmail??null):nullable(input.assignedUserEmail),primaryContactId:input.primaryContactId??null,serviceInterest:nullable(input.serviceInterest),estimatedCloseDate:input.estimatedCloseDate?new Date(input.estimatedCloseDate+"T12:00:00Z"):null,updatedAt:new Date()};
      const row=old?await trx.updateTable("leads").set({...fields,...(old.tipo!==fields.tipo?{subtipo:null}:{})}).where("id","=",input.id!).returningAll().executeTakeFirstOrThrow():await trx.insertInto("leads").values({...fields,accountId:input.accountId,nombre:account.nombre,creadoPor:user.displayName,quienCargo:user.displayName,fechaCreacion:new Date()}).returningAll().executeTakeFirstOrThrow();
      await writeLeadJournal(trx,{leadId:row.id,leadName:row.nombre,actor,action:old?"updated":"created",changes:old?Object.entries(fields).filter(([key,value])=>String(old[key as keyof typeof old]??"")!==String(value??"")).map(([fieldName,newValue])=>({fieldName,oldValue:old[fieldName as keyof typeof old],newValue})):undefined,metadata:{accountId:input.accountId,opportunityName:input.opportunityName}});
      return String(row.id);
    });
    return response({id});
  }catch(e){return response({error:e instanceof Error?e.message:"Error"},e instanceof Forbidden?403:e instanceof NotAuthenticatedError?401:400)}
}
