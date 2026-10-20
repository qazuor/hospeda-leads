import {businessHistory} from '../helpers/businessHistoryServer';
import {searchSql} from "../helpers/searchSql";
import {createHash} from "node:crypto";
import {CrmForbidden,assertAccountViewable,assertAccountWritable,assertLeadAccess} from '../helpers/crmPermissions';
import {findNewDncBlocker,DNC_DUPLICATE_MESSAGE} from './business_duplicate_check';
import {accountExtraFields} from '../helpers/dataNormalization';
import {classificationErrors} from '../helpers/accountClassification';
import {parseBody} from '../helpers/parseBody';
import {crmError,fallbackStatus} from '../helpers/crmErrors';
import {accountFamily,resolveAccount} from '../helpers/accountIdentity';
import {setWorkActor} from "../helpers/workAudit";
import { z } from "zod";
import {sql} from "kysely";
import superjson from "superjson";
import { getOpportunityStages } from "../helpers/commercialStages";
import { db } from "../helpers/db";
import { getServerUserSession } from "../helpers/getServerUserSession";
import { commercialQuery, commercialMutation } from "./commercial.schema";
import { writeLeadJournal } from "../helpers/writeLeadJournal";
import { NotAuthenticatedError } from "../helpers/getSetServerSession";
import {managementStageCatalog,type ManagementType} from '../helpers/businessManagement';

class Forbidden extends Error {}
class Conflict extends Error {}
const response=(value:unknown,status=200)=>new Response(superjson.stringify(value),{status,headers:{"Content-Type":"application/json"}});
const nullable=(v:string|null|undefined)=>v?.trim()||null;
const checkEmail=(next:string|null|undefined,previous?:string|null)=>{if(next&&next!==previous&&!z.string().email().safeParse(next).success)throw new Error("Email inválido.");};
const json=(value:unknown)=>JSON.parse(JSON.stringify(value));

export async function get(request:Request){
  try{
    const {user}=await getServerUserSession(request);
    const input=commercialQuery.parse(Object.fromEntries(new URL(request.url).searchParams));
    let accountId=input.accountId;
    if(input.leadId){
      const lead=await assertLeadAccess(db,input.leadId,user);
      accountId=String(lead.accountId);
    }
    if(accountId){
      accountId=await resolveAccount(db,accountId);
      const visibleAccount=await db.selectFrom("crmAccounts").selectAll().where("id","=",accountId).executeTakeFirstOrThrow();
      assertAccountViewable(user,visibleAccount);
      const family=await accountFamily(db,accountId);
      if(input.historyPage)return response(await businessHistory(family,input.historyPage));
      const [account,contacts,opportunities,journal,leadJournal,managementJournal,stages]=await Promise.all([
        db.selectFrom("crmAccounts").selectAll().where("id","=",accountId).executeTakeFirstOrThrow(),
        db.selectFrom("crmContacts").selectAll().where("deletedAt","is",null).where("accountId","=",accountId).orderBy("isPrimary","desc").orderBy("name").execute(),
        db.selectFrom("leads").selectAll().where("deletedAt","is",null).where("accountId","=",accountId).orderBy("createdAt","desc").execute(),
        db.selectFrom("crmCommercialJournal").selectAll().where("accountId","in",family).orderBy("createdAt","desc").limit(200).execute(),
        db.selectFrom("leadJournal").selectAll().where(eb=>eb.or([eb("leadId","is",null),eb.exists(eb.selectFrom("leads").select("id").whereRef("leads.id","=","leadJournal.leadId").where("deletedAt","is",null))])).where("accountId","in",family).orderBy("createdAt","desc").limit(200).execute(),
        sql`SELECT e.id,e.lead_id AS "leadId",e.action,e.actor_email AS "actorEmail",coalesce(u.display_name,e.actor_email,'Sistema') AS "actorName",e.old_stage AS "oldStage",e.new_stage AS "newStage",e.comment,e.metadata,e.created_at AS "createdAt" FROM crm_pipeline_events e LEFT JOIN users u ON u.email=e.actor_email WHERE e.account_id IN (${sql.join(family.map(id=>sql`${id}::bigint`))}) AND e.lead_id IS NOT NULL AND e.action='stage' ORDER BY e.created_at DESC LIMIT 200`.execute(db),
        getOpportunityStages(db)
      ]);
      return response({account,contacts,opportunities,journal,leadJournal,managementJournal:managementJournal.rows,stages,users:await db.selectFrom("users").select(["email","displayName"]).execute()});
    }
    if((input.archived||input.deleted)&&user.role!=="admin")throw new CrmForbidden("Solo un administrador puede consultar negocios archivados o eliminados.");
    let query=db.selectFrom("crmAccounts").where("mergedIntoId","is",null).where("deletedAt",input.deleted?"is not":"is",null);
    if(!input.deleted)query=query.where("archivedAt",input.archived?"is not":"is",null);
    if(input.status)query=query.where("commercialStatus","=",input.status);
    if(input.q)query=query.where(eb=>eb.or([searchSql("nombre",input.q!),searchSql("email",input.q!),searchSql("ciudad",input.q!)]));
    const [count,rows]=await Promise.all([
      query.select(eb=>eb.fn.countAll().as("total")).executeTakeFirstOrThrow(),
      query.selectAll().select(eb=>[
        eb.selectFrom("leads").select(eb=>eb.fn.countAll().as("count")).whereRef("leads.accountId","=","crmAccounts.id").where("deletedAt","is",null).as("opportunityCount"),
        eb.selectFrom("crmContacts").select(eb=>eb.fn.countAll().as("count")).whereRef("crmContacts.accountId","=","crmAccounts.id").where("deletedAt","is",null).as("contactCount")
      ]).orderBy("nombre").limit(50).offset((input.page-1)*50).execute()
    ]);
    return response({rows:rows.map(r=>({...r,opportunityCount:Number(r.opportunityCount),contactCount:Number(r.contactCount)})),total:Number(count.total),page:input.page});
  }catch(e){return response({error:crmError(e)},e instanceof CrmForbidden?403:e instanceof NotAuthenticatedError?401:e instanceof Conflict?409:fallbackStatus(e))}
}

export async function post(request:Request){
  try{
    const {user}=await getServerUserSession(request);
    const input=commercialMutation.parse(await parseBody(request));
    const actor={id:user.id,email:user.email,displayName:user.displayName};
    const id=await db.transaction().execute(async trx=>{
      await setWorkActor(trx,user);
      const audit=async(accountId:string,action:string,before:unknown,after:unknown,contactId:string|null=null)=>{
        await trx.insertInto("crmCommercialJournal").values({accountId,contactId,action,actorEmail:user.email,actorName:user.displayName,metadata:json({before,after})}).execute();
      };
      const checkResponsible=(next:string|null|undefined,previous:string|null)=>{
        if(next!==undefined&&nullable(next)!==previous&&user.role!=="admin")throw new Forbidden("Solo un administrador puede modificar el responsable.");
      };
      if(input.action==="account_trash"){
        const ids=[...new Set(input.accountIds)];
        const accounts=await trx.selectFrom("crmAccounts").selectAll().where("id","in",ids).orderBy("id").forUpdate().execute();
        if(accounts.length!==ids.length)throw new Error("Algún negocio ya no existe. Actualizá la selección.");
        for(const account of accounts){
          if(account.mergedIntoId)throw new Error("No se puede eliminar un negocio fusionado.");
          if(input.deleted)assertAccountWritable(user,account);
          else if(user.role!=="admin")throw new CrmForbidden("Solo un administrador puede restaurar negocios.");
          if(Boolean(account.deletedAt)===input.deleted)continue;
          const after=await trx.updateTable("crmAccounts").set({deletedAt:input.deleted?new Date():null,deletedByEmail:input.deleted?user.email:null,deletionReason:input.deleted?input.reason:null,updatedAt:new Date()}).where("id","=",account.id).returningAll().executeTakeFirstOrThrow();
          await audit(String(account.id),input.deleted?"account_deleted":"account_restored",account,{...after,reason:input.reason});
        }
        return ids[0];
      }
      if(input.action==="account_save"){
        const existing=input.id?await trx.selectFrom("crmAccounts").selectAll().where("id","=",input.id).forUpdate().executeTakeFirstOrThrow():null;
        if(existing)assertAccountWritable(user,existing);
        if(existing&&input.primaryContact)throw new Error("Las personas de un negocio existente se agregan desde su ficha.");
        checkEmail(input.primaryContact?.email);
        checkResponsible(input.assignedUserEmail,existing?.assignedUserEmail??null);
        checkEmail(input.email,existing?.email);
        const extra=Object.fromEntries(accountExtraFields.filter(f=>input[f]!==undefined).map(f=>[f,nullable(input[f])]));
        const tipo=input.tipo===undefined?existing?.tipo??null:nullable(input.tipo);
        const subtipo=input.subtipo===undefined?(tipo===existing?.tipo?existing?.subtipo??null:null):nullable(input.subtipo);
        const classification=await classificationErrors(trx,tipo,subtipo,existing??undefined);
        if(classification.length)throw new Error(classification.join(' '));
        if(input.verifiedOn&&input.verifiedOn>new Date().toISOString().slice(0,10))throw new Error('Fecha de verificación futura.');
        const fields={...extra,tipo,subtipo,nombre:input.nombre,ciudad:nullable(input.ciudad),telefono:nullable(input.telefono),email:nullable(input.email),sitioWeb:nullable(input.sitioWeb),urlGmap:nullable(input.urlGmap),perfilInstagram:nullable(input.perfilInstagram),perfilFacebook:nullable(input.perfilFacebook),perfilAirbnb:nullable(input.perfilAirbnb),perfilBooking:nullable(input.perfilBooking),perfilTurismoEntreRios:nullable(input.perfilTurismoEntreRios),assignedUserEmail:input.assignedUserEmail===undefined?(existing?existing.assignedUserEmail:user.email):nullable(input.assignedUserEmail),updatedAt:new Date()};
        {
          const after={nombre:input.nombre,ciudad:fields.ciudad,telefono:fields.telefono,email:fields.email,whatsapp:input.whatsapp===undefined?existing?.whatsapp:nullable(input.whatsapp)};
          if(await findNewDncBlocker(trx,{after,before:existing??undefined,excludeId:existing?String(existing.id):undefined}))throw new Conflict(DNC_DUPLICATE_MESSAGE);
        }
        const row=existing?await trx.updateTable("crmAccounts").set(fields).where("id","=",input.id!).returningAll().executeTakeFirstOrThrow():await trx.insertInto("crmAccounts").values(fields).returningAll().executeTakeFirstOrThrow();
        await audit(String(row.id),existing?"account_updated":"account_created",existing,row);
        if(input.primaryContact){// One-step creation: the person becomes Principal in the same transaction (a new business has no previous Principal).
          const contact=await trx.insertInto("crmContacts").values({accountId:String(row.id),name:input.primaryContact.name,phone:nullable(input.primaryContact.phone),email:nullable(input.primaryContact.email),isPrimary:true,updatedAt:new Date()}).returningAll().executeTakeFirstOrThrow();
          await audit(String(row.id),"contact_created",null,contact,String(contact.id));
        }
        return String(row.id);
      }
      // One account lock for all related mutations: prevents competing primary selections.
      const account=await trx.selectFrom("crmAccounts").selectAll().where("id","=",input.accountId).forUpdate().executeTakeFirstOrThrow();
      const stateAccount=account as typeof account&{status:string|null;isClient:boolean;recontactAt:Date|string|null;referredToLeandro:boolean};
      if(input.action!=="opportunity_save"||!input.id)assertAccountWritable(user,account);
      else await assertLeadAccess(trx,input.id,user,true);
      if(input.action==="account_archive"){
        if(input.archived&&user.role!=="admin"&&account.assignedUserEmail!==user.email)throw new Forbidden("Solo el responsable o un administrador puede archivar este negocio.");
        if(!input.archived&&user.role!=="admin")throw new CrmForbidden("Solo un administrador puede desarchivar negocios.");
        const restoredStatus=account.status==='reviewed'||stateAccount.isClient?'reviewed':'new';
        const after=await trx.updateTable("crmAccounts").set({archivedAt:input.archived?new Date():null,status:input.archived?'archived':restoredStatus,updatedAt:new Date()}).where("id","=",input.accountId).returningAll().executeTakeFirstOrThrow();
        await audit(input.accountId,input.archived?"account_archived":"account_unarchived",account,{...after,reason:input.reason});return input.accountId;
      }
      if(input.action==='business_status'){
        if(['new','in_management','archived'].includes(input.status))throw new Error('Este estado se define por revisión, gestión o archivo; no se modifica directamente.');
        if(account.deletedAt)throw new Error('Restaurá el negocio de Papelera antes de modificarlo.');
        if(account.archivedAt||stateAccount.status==='archived')throw new Error('Desarchivá el negocio antes de cambiar su estado.');
        if(account.doNotContact&&input.status!=='archived')throw new Error('Este negocio está marcado como No contactar.');
        if(stateAccount.status==='new'&&input.status!=='reviewed')throw new Error('Un negocio Nuevo debe pasar por Revisado antes de elegir seguimiento o iniciar una gestión.');
        const active=(await sql<{n:string}>`SELECT count(*) n FROM leads l JOIN crm_stages s ON s.name=l.estado WHERE l.account_id=${account.id} AND l.deleted_at IS NULL AND s.classification='open'`.execute(trx)).rows[0];
        if(Number(active?.n)>0)throw new Error('El negocio tiene gestiones abiertas; su estado es En gestión.');
        if(!['reviewed','recontact','no_follow_up_scheduled'].includes(input.status))throw new Error('Estado de negocio no disponible.');
        await sql`UPDATE crm_accounts SET status=${input.status},recontact_at=${input.status==='recontact'?input.recontactAt??null:null},updated_at=now() WHERE id=${account.id}`.execute(trx);
        return String(account.id);
      }
      if(input.action==="convert_client"){
        if(account.commercialStatus==="client")return String(account.id);
        await trx.updateTable("crmAccounts").set({commercialStatus:"client",clientSince:new Date(),updatedAt:new Date()}).where("id","=",input.accountId).execute();
        const event=await trx.selectFrom("crmCommercialJournal").select(["id","metadata"]).where("accountId","=",input.accountId).where("action","=","converted_to_client").where("actorEmail","=",user.email).orderBy("id","desc").executeTakeFirst();
        if(!event)throw new Error("No se pudo registrar el cambio en el historial. No se marcó el negocio como Cliente.");
        const previous=event.metadata&&typeof event.metadata==="object"&&!Array.isArray(event.metadata)?event.metadata as Record<string,unknown>:{};
        await trx.updateTable("crmCommercialJournal").set({metadata:json({...previous,reason:input.reason,reasonType:"preexisting_client"})}).where("id","=",event.id).execute();
        return input.accountId;
      }
      if(input.action==='set_client'){
        if(!input.isClient&&user.role!=='admin')throw new CrmForbidden('Solo un administrador puede quitar la marca Cliente.');
        await sql`UPDATE crm_accounts SET is_client=${input.isClient},updated_at=now() WHERE id=${account.id}`.execute(trx);
        return String(account.id);
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
      const creationHash=input.creationRequestKey?createHash("sha256").update(JSON.stringify({...input,actorEmail:user.email})).digest("hex"):null;
      if(!input.id&&input.creationRequestKey){
        const previous=await trx.selectFrom("leads").selectAll().where("creationRequestKey","=",input.creationRequestKey).executeTakeFirst();
        if(previous){
          if(previous.creationRequestHash!==creationHash)throw new Conflict("Este intento ya guardó otra versión. Abrí la gestión antes de cambiar sus datos; no se creó otra.");
          if(previous.deletedAt)throw new Conflict("La gestión guardada con este intento está en Papelera. No se creará otra al reintentar.");
          return String(previous.id);
        }
      }
      const old=input.id?await trx.selectFrom("leads").selectAll().where("id","=",input.id).where("accountId","=",input.accountId).where("deletedAt","is",null).forUpdate().executeTakeFirstOrThrow():null;
      checkResponsible(input.assignedUserEmail,old?.assignedUserEmail??null);
      if(input.primaryContactId)await trx.selectFrom("crmContacts").select("id").where("id","=",input.primaryContactId).where("accountId","=",input.accountId).where("deletedAt","is",null).executeTakeFirstOrThrow();
      if(input.tipo&&input.tipo!==old?.tipo){
        const vertical=await trx.selectFrom("crmVerticals").select("id").where("name","=",input.tipo).where("active","=",true).executeTakeFirst();
        if(!vertical)throw new Error("Vertical no disponible en Configuración.");
      }
      const requestedManagementType=input.managementType??null;
      const managementType=(old as (typeof old&{managementType?:ManagementType|null})|null)?.managementType??requestedManagementType;
      if(old&&managementType&&input.estado&&input.estado!==old.estado)throw new Error('Cambiá la etapa desde la gestión.');
      let initialStage=input.estado;
      if(!old){
        if(account.archivedAt||stateAccount.status==='archived')throw new Error('Desarchivá el negocio antes de iniciar una gestión.');
        if(stateAccount.status==='new'){
          if(!input.confirmReviewed)throw new Error('Confirmá que el negocio existe y es válido para marcarlo Revisado e iniciar la gestión.');
          await trx.updateTable('crmAccounts').set({status:'reviewed',updatedAt:new Date()}).where('id','=',account.id).execute();
        }
        if(managementType==='accompaniment'&&!stateAccount.isClient)throw new Error('El acompañamiento de ficha se inicia después de marcar al negocio como Cliente.');
      }
      if(!old&&managementType){
        const first=managementStageCatalog(managementType).find(stage=>stage.classification==='open'&&stage.key!==`${managementType}:leandro`);
        if(!first)throw new Error('No hay etapa inicial configurada para este tipo de gestión.');
        initialStage=first.key;
      }
      if(initialStage&&initialStage!==old?.estado){
        if(managementType){if(!managementStageCatalog(managementType).some(stage=>stage.key===initialStage))throw new Error('Etapa no disponible para este tipo de gestión.');}
        else if(!(await getOpportunityStages(trx)).includes(initialStage))throw new Error("Etapa no disponible.");
      }
      const fields={opportunityName:input.opportunityName,tipo:nullable(input.tipo),estado:nullable(initialStage),assignedUserEmail:input.assignedUserEmail===undefined?(old?old.assignedUserEmail:account.assignedUserEmail??user.email):nullable(input.assignedUserEmail),primaryContactId:input.primaryContactId??null,serviceInterest:nullable(input.serviceInterest),estimatedCloseDate:input.estimatedCloseDate?new Date(input.estimatedCloseDate+"T12:00:00Z"):null,updatedAt:new Date()};
      const row=old?await trx.updateTable("leads").set({...fields,...(old.tipo!==fields.tipo?{subtipo:null}:{})}).where("id","=",input.id!).returningAll().executeTakeFirstOrThrow():await trx.insertInto("leads").values({...fields,creationRequestKey:input.creationRequestKey??null,creationRequestHash:creationHash,accountId:input.accountId,nombre:account.nombre,creadoPor:user.displayName,quienCargo:user.displayName,fechaCreacion:new Date(),...(managementType?{managementType}: {})} as any).returningAll().executeTakeFirstOrThrow();
      await writeLeadJournal(trx,{leadId:row.id,leadName:row.nombre,actor,action:old?"updated":"created",changes:old?Object.entries(fields).filter(([key,value])=>String(old[key as keyof typeof old]??"")!==String(value??"")).map(([fieldName,newValue])=>({fieldName,oldValue:old[fieldName as keyof typeof old],newValue})):undefined,metadata:{accountId:input.accountId,opportunityName:input.opportunityName}});
      return String(row.id);
    });
    return response({id});
  }catch(e){return response({error:crmError(e)},e instanceof Forbidden||e instanceof CrmForbidden?403:e instanceof NotAuthenticatedError?401:e instanceof Conflict?409:fallbackStatus(e))}
}
