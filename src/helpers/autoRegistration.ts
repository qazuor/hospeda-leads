import {sql} from 'kysely';
import type {Executor} from './communicationService';
import type {User} from './User';
import {assertBusinessAccess} from './crmPermissions';
import {assertAccountContactAllowed} from './communicationService';
import {communicationJournal,lockCommunication,CommunicationConflict,CommunicationForbidden} from './communicationService';
import {randomUUID} from 'node:crypto';
import {setWorkActor} from './workAudit';
import type {Kysely} from 'kysely';
import type {DB} from './schema';

/**
 * Owner decision (28/10/2026): the global WhatsApp auto-registration switch is on by default. With no saved setting it is enabled; a value an
 * admin saved is respected, and an unreadable one counts as off.
 */
export function globalAutoRegisterEnabled({value}:{value:string|null|undefined}):boolean{
 if(value==null)return true;
 try{return JSON.parse(value).enabled===true;}catch{return false;}
}
export type AutoRegisterEligibility={enabled:boolean;reason?:'global_disabled'|'auto_disabled'|'not_eligible';since:string};
export function autoRegisterReason(input:{global:boolean;preference:boolean;accountExists:boolean;status:string|null;doNotContact:boolean;restricted:boolean;archived:boolean;merged:boolean;writeAccess:boolean}){
 if(!input.global)return 'global_disabled' as const;
 if(!input.preference)return 'auto_disabled' as const;
 if(!input.accountExists||input.status==='new'||input.doNotContact||input.restricted||input.archived||input.merged||!input.writeAccess)return 'not_eligible' as const;
 return null;
}

/** Single eligibility decision shared by the open-chat context and registration endpoint. */
export async function autoRegisterEligibility(e:Executor,accountId:string,user:User):Promise<AutoRegisterEligibility>{
 const [account,preference,setting]=await Promise.all([
  e.selectFrom('crmAccounts').select(['status','doNotContact','archivedAt','mergedIntoId']).where('id','=',accountId).executeTakeFirst(),
  sql<{enabled:boolean;since:Date}>`SELECT userscript_auto_register AS enabled,userscript_auto_register_since AS since FROM users WHERE id=${user.id}`.execute(e),
  e.selectFrom('appSettings').select('value').where('key','=','crm_userscript_auto_register').executeTakeFirst()
 ]);
 const globalEnabled=globalAutoRegisterEnabled({value:setting?.value});
 const pref=preference.rows[0];
 const since=new Date(Math.max(pref?.since.getTime()??Date.now(),Date.now()-24*60*60_000)).toISOString();
 let writeAccess=true,restricted=false;
 try{if(account)await assertBusinessAccess(e,accountId,user,true,false);else writeAccess=false;await assertAccountContactAllowed(e,accountId,null,null,'whatsapp');}
 catch{restricted=true;}
 const reason=autoRegisterReason({global:globalEnabled,preference:pref?.enabled??false,accountExists:!!account,status:account?.status??null,doNotContact:account?.doNotContact??false,restricted,archived:!!account?.archivedAt,merged:!!account?.mergedIntoId,writeAccess});
 return reason?{enabled:false,reason,since}:{enabled:true,since};
}

export function autoEffectsMatch(current:unknown,expected:unknown){return JSON.stringify(current)===JSON.stringify(expected);}
export const USERSCRIPT_CONFIRMATION_RESULTS=['Envío confirmado manualmente','Envío confirmado por el script de WhatsApp'] as const;
export const isUserscriptConfirmedResult=(value:string|null|undefined):boolean=>USERSCRIPT_CONFIRMATION_RESULTS.includes(value as typeof USERSCRIPT_CONFIRMATION_RESULTS[number]);

export async function voidAutoRegistration(database:Kysely<DB>,input:{id:string;reason:string},user:User){
 return database.transaction().execute(async e=>{
  const registration=(await sql<{id:string;accountId:string;userEmail:string;direction:'in'|'out';messageId:string|null;inboundId:string|null;effects:Record<string,unknown>;externalId:string;voidedAt:Date|null}>`SELECT id::text,account_id::text AS "accountId",user_email AS "userEmail",direction,message_id::text AS "messageId",inbound_id::text AS "inboundId",effects,external_id AS "externalId",voided_at AS "voidedAt" FROM crm_auto_registrations WHERE id=${input.id}::uuid FOR UPDATE`.execute(e)).rows[0];
  if(!registration)throw new Error('No se encontró el registro automático.');
  await lockCommunication(e,async()=>({accountIds:[registration.accountId]}));
  await setWorkActor(e,user);
  const account=await assertBusinessAccess(e,registration.accountId,user,true,false);
  if(user.role!=='admin'&&registration.userEmail!==user.email)throw new CommunicationForbidden('Solo quien registró el mensaje o un administrador puede anularlo.');
  if(account.mergedIntoId)throw new CommunicationForbidden('Este negocio se fusionó con otro.');
  if(registration.voidedAt)throw new CommunicationConflict('Este registro ya fue anulado.');
  const skipped:string[]=[];let before:unknown=null,after:unknown=null;
  if(registration.inboundId){
   const row=(await sql<{status:string;accountId:string}>`SELECT status,account_id::text AS "accountId" FROM crm_inbound_messages WHERE id=${registration.inboundId}::uuid FOR UPDATE`.execute(e)).rows[0];
   if(row&&row.accountId!==registration.accountId)throw new CommunicationConflict('Este mensaje ya pertenece a otro negocio. Anulalo desde ese negocio o pedíselo a un administrador.');
   if(row?.status==='registered')throw new CommunicationConflict('Ya registraste una respuesta con este mensaje. Corregí la respuesta primero.');
   if(row&&['pending_review','dismissed'].includes(row.status)){before={status:row.status,externalId:registration.externalId};await sql`UPDATE crm_inbound_messages SET status='voided',external_id=NULL,updated_at=now() WHERE id=${registration.inboundId}::uuid AND account_id=${registration.accountId}::bigint`.execute(e);after={status:'voided',externalId:null};}else skipped.push('El mensaje recibido no se modificó porque cambió después del registro.');
  }else if(registration.messageId){
   const row=(await sql<{status:string;externalId:string|null;activityId:string|null;body:string|null;textBody:string|null;summary:string|null;completedAt:Date|null;completedByEmail:string|null;lastInteractionAt:Date|null;revision:number;activityResult:string|null;taskId:string|null;taskStatus:string|null;taskResult:string|null;isClient:boolean;accountId:string}>`SELECT m.status,m.external_id AS "externalId",m.activity_id::text AS "activityId",m.body,m.text_body AS "textBody",m.summary,m.completed_at AS "completedAt",m.completed_by_email AS "completedByEmail",m.last_interaction_at AS "lastInteractionAt",m.revision,a.result AS "activityResult",m.task_id::text AS "taskId",t.status AS "taskStatus",t.result AS "taskResult",b.is_client AS "isClient",m.account_id::text AS "accountId" FROM crm_messages m JOIN crm_accounts b ON b.id=m.account_id LEFT JOIN crm_activities a ON a.id=m.activity_id LEFT JOIN crm_tasks t ON t.id=m.task_id WHERE m.id=${registration.messageId}::uuid FOR UPDATE OF m`.execute(e)).rows[0];
   if(row&&row.accountId!==registration.accountId)throw new CommunicationConflict('Este mensaje ya pertenece a otro negocio. Anulalo desde ese negocio o pedíselo a un administrador.');
   const effects=registration.effects;
   if(effects.linkedOnly===true){if(row?.externalId===registration.externalId){before={externalId:row.externalId};await sql`UPDATE crm_messages SET external_id=NULL,updated_at=now() WHERE id=${registration.messageId}::uuid AND account_id=${registration.accountId}::bigint`.execute(e);after={externalId:null};}else skipped.push('El vínculo no se liberó porque cambió después del registro.');}
   else if(effects.created===true){
    if(row?.externalId===registration.externalId&&row.status==='manual_sent'&&row.revision===Number(effects.revision??row.revision)){before={status:row.status,externalId:row.externalId};await sql`UPDATE crm_messages SET status='voided',external_id=NULL,updated_at=now(),revision=revision+1 WHERE id=${registration.messageId}::uuid AND account_id=${registration.accountId}::bigint`.execute(e);after={status:'voided',externalId:null};
     if(row.activityId){const deleted=await e.updateTable('crmActivities').set({deletedAt:new Date(),updatedAt:new Date()}).where('id','=',row.activityId).where('result','in',[...USERSCRIPT_CONFIRMATION_RESULTS]).where('deletedAt','is',null).executeTakeFirst();if(!deleted.numUpdatedRows)skipped.push('La actividad no se anuló porque fue modificada después.');}
    }else skipped.push('El mensaje no se modificó porque cambió después del registro.');
   }else if(row?.externalId===registration.externalId&&row.status==='manual_sent'){
    const old=effects.before as {status:string;body:string|null;textBody:string|null;summary:string|null;completedAt:Date|null;completedByEmail:string|null;lastInteractionAt:Date|null;revision:number};
    if(row.revision===old.revision+1){before={status:row.status,externalId:row.externalId};await sql`UPDATE crm_messages SET status=${old.status},body=${old.body},text_body=${old.textBody},summary=${old.summary},completed_at=${old.completedAt},completed_by_email=${old.completedByEmail},last_interaction_at=${old.lastInteractionAt},external_id=NULL,revision=revision+1,updated_at=now() WHERE id=${registration.messageId}::uuid AND account_id=${registration.accountId}::bigint`.execute(e);after={status:old.status,externalId:null};}
    else{await sql`UPDATE crm_messages SET external_id=NULL,updated_at=now() WHERE id=${registration.messageId}::uuid AND account_id=${registration.accountId}::bigint`.execute(e);skipped.push('El mensaje no se restauró porque fue modificado después; la actividad, la tarea y la marca de cliente quedan como están.');}
    if(row.revision===old.revision+1){
    const activity=effects.activity as {id:string|null;created?:boolean;previousResult?:string|null}|undefined;
    if(activity?.id&&row.activityId===activity.id&&isUserscriptConfirmedResult(row.activityResult)){
     if(activity.created)await e.updateTable('crmActivities').set({deletedAt:new Date(),updatedAt:new Date()}).where('id','=',activity.id).where('deletedAt','is',null).execute();
     else await e.updateTable('crmActivities').set({result:activity.previousResult??null,updatedAt:new Date()}).where('id','=',activity.id).where('result','in',[...USERSCRIPT_CONFIRMATION_RESULTS]).where('deletedAt','is',null).execute();
    }else if(activity?.id)skipped.push('La actividad no se revirtió porque fue modificada después.');
    const taskId=effects.taskId;
    if(typeof taskId==='string'){const restored=await e.updateTable('crmTasks').set({status:'pending',completedAt:null,result:null,updatedAt:new Date()}).where('id','=',taskId).where('status','=','completed').where('result','in',[...USERSCRIPT_CONFIRMATION_RESULTS]).executeTakeFirst();if(!restored.numUpdatedRows)skipped.push('La tarea no se reabrió porque se modificó después.');}
    if(effects.clientMarked===true){const changed=await sql`UPDATE crm_accounts SET is_client=false,updated_at=now() WHERE id=${registration.accountId}::bigint AND is_client=true AND client_since IS NOT DISTINCT FROM ${typeof effects.clientSince==='string'?effects.clientSince:null}::timestamptz`.execute(e);if(!changed.numAffectedRows)skipped.push('El negocio no se desmarcó como cliente porque se modificó después.');}
    }
   }else if(row?.externalId===registration.externalId){await sql`UPDATE crm_messages SET external_id=NULL,updated_at=now() WHERE id=${registration.messageId}::uuid AND account_id=${registration.accountId}::bigint`.execute(e);skipped.push('El mensaje no se restauró porque fue modificado después.');}
   else skipped.push('El mensaje no se modificó porque cambió después del registro.');
  }
  await sql`UPDATE crm_auto_registrations SET voided_at=now(),voided_by_email=${user.email},void_reason=${input.reason} WHERE id=${input.id}::uuid`.execute(e);
  await communicationJournal(e,{accountId:registration.accountId,leadId:null,entityType:'auto_registration',entityId:registration.id,action:'auto_registration_voided',actor:user,before:{effects:registration.effects,before},after:{reason:input.reason,effects:after,skipped}});
  return {voided:true,skipped};
 });
}
