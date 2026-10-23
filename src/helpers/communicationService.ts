import {cancelRecontactTaskFor} from './recontactTask';
import {templateCompatibility} from './messageTemplatePolicy';
import {assertAccountReadable,assertAccountViewable,assertAccountWritable,assertCanRecordDoNotContact,assertLeadAccess,lockAccounts} from './crmPermissions';
import {DO_NOT_CONTACT_LIFT_DENIED,DO_NOT_CONTACT_READ_ONLY} from './doNotContactPermission';
import {createHash,randomUUID} from 'node:crypto';
import {sql,type Kysely,type RawBuilder,type Transaction} from 'kysely';
import {z} from 'zod';
import type {DB} from './schema';
import type {User} from './User';
import type {Message,CommunicationMutation} from '../endpoints/communication.schema';
import {normalizeField} from './dataNormalization';
import {resolveCommercialContact} from './commercialContact';
import {renderMessageTemplate,renderMessageTemplateHtml,htmlToPlainText,unresolvedTemplateVariables} from './renderMessageTemplate';
import {htmlToWhatsApp} from './templateChannelFormatting';
import {buildHospedaEmailHtml,buildHospedaEmailText} from './hospedaEmailLayout';
import {setWorkActor} from './workAudit';
import {writeLeadJournal} from './writeLeadJournal';
import { withDefaultMessageVariables } from './messageVariables';
import {buildMessageTemplateContext} from './messageTemplateContext';
import {responseCategoryLabel} from './crmLabels';
import {OUTCOME_READY_STATUSES,canLogContactOutcome,needsSentAnswer} from './contactOutcome';
import {sendInboundReply} from './emailReply';
export type Executor=Kysely<DB>|Transaction<DB>;
/** Columns read back to recognise a replayed `response_create` (camelCased by the Kysely plugin). */
type ResponseReplay={id:string;actorEmail:string;accountId:string|number;leadId:string|number|null;category:string;contactId:string|number|null;linkedMessageId:string|null};
export class CommunicationForbidden extends Error{}
export class CommunicationConflict extends Error{}
export const digest=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const json=(v:unknown)=>JSON.stringify(v);
async function templateOwnerName(e:Executor,email:string|null|undefined,user:User){
 if(!email)return user.fullName?.trim()||user.displayName;
 const owner=await e.selectFrom('users').select(['displayName','fullName']).where('email','=',email).executeTakeFirst();
 return owner?.fullName?.trim()||owner?.displayName||user.displayName;
}
async function messageVariables(e:Executor){
 const row=await e.selectFrom('appSettings').select('value').where('key','=','crm_message_variables').executeTakeFirst();
 return withDefaultMessageVariables(row?.value?JSON.parse(row.value):null);
}
/** Account ids whose rows act as the communication mutex for one transaction. */
export type CommunicationLockScope={accountIds:readonly unknown[]};
/**
 * Serializes communication writers per business instead of globally.
 * ROW EXCLUSIVE (what any INSERT/UPDATE takes) never blocks ordinary writers, but it conflicts with the
 * SHARE ROW EXCLUSIVE table lock that merges and imports take on crm_accounts first, so no merge can run or
 * move rows between accounts while this transaction is open. The scope is resolved after that lock, so the
 * account ids are stable; then the affected crm_accounts rows are locked FOR UPDATE. Every writer of an
 * account row (do_not_contact, archive, trash, reassignment, lead stage/trash changes through the account
 * sync triggers) and every INSERT referencing it (FOR KEY SHARE) waits for this transaction.
 */
export async function lockCommunication(e:Executor,scope:(e:Executor)=>Promise<CommunicationLockScope>){await sql`LOCK TABLE crm_accounts,leads,crm_contact_restrictions,crm_messages IN ROW EXCLUSIVE MODE`.execute(e);await lockAccounts(e,(await scope(e)).accountIds);}
const accountsOf=async(e:Executor,query:RawBuilder<{accountId:string}>)=>({accountIds:(await query.execute(e)).rows.map(r=>r.accountId)});
const messageScope=(id:string)=>(e:Executor)=>accountsOf(e,sql<{accountId:string}>`SELECT account_id FROM crm_messages WHERE id=${id}::uuid`);
/** Resolves the business(es) a communication mutation reads or writes; unknown ids resolve to no rows and fail later with the usual error. */
function communicationScope(input:Exclude<CommunicationMutation,{action:'dispatch'}>){return async(e:Executor):Promise<CommunicationLockScope>=>{
 if(input.action==='prepare')return accountsOf(e,sql<{accountId:string}>`SELECT account_id FROM leads WHERE id=${input.leadId}`);
 if(input.action==='prepare_general'||input.action==='manual_start'||input.action==='response_create')return {accountIds:[input.accountId]};
 if(input.action==='inbound_register'||input.action==='inbound_dismiss'||input.action==='inbound_reply')return accountsOf(e,sql<{accountId:string}>`SELECT account_id FROM crm_inbound_messages WHERE id=${input.inboundId}::uuid AND account_id IS NOT NULL`);
 if(input.action==='response_correct')return accountsOf(e,sql<{accountId:string}>`SELECT account_id FROM crm_communication_responses WHERE id=${input.id}::uuid`);
 if(input.action==='restrict')return input.accountId?{accountIds:[input.accountId]}:input.leadId?accountsOf(e,sql<{accountId:string}>`SELECT account_id FROM leads WHERE id=${input.leadId}`):{accountIds:[]};
 if(input.action==='lift')return accountsOf(e,sql<{accountId:string}>`SELECT account_id FROM crm_contact_restrictions WHERE id=${input.id}`);
 return messageScope(input.id)(e);
};}
export async function communicationConfig(e:Executor){const r=await e.selectFrom('appSettings').select('value').where('key','=','crm_communication').executeTakeFirstOrThrow();return z.object({recentContactHours:z.number().int().min(1).max(720),maxDocumentBytes:z.number().int().min(1).max(2097152)}).parse(JSON.parse(r.value));}
/** Read mode (write=false) uses assertAccountViewable, so the responsible seller reads the communication of her archived business (decision 1C); write mode keeps the strict assertAccountReadable guard. */
export async function leadFor(e:Executor,id:string,user:User,write=true){const l=await e.selectFrom('leads').selectAll().where('id','=',id).where('deletedAt','is',null).executeTakeFirstOrThrow();const a=await e.selectFrom('crmAccounts').selectAll().where('id','=',l.accountId).where('mergedIntoId','is',null).executeTakeFirstOrThrow();if(write)assertAccountReadable(user,a);else assertAccountViewable(user,a);if(write)await assertLeadAccess(e,String(l.id),user,true);return {lead:l,account:a};}
export async function communicationContext(e:Executor,accountId:string,leadId:string|null,user:User,write:boolean){
 const account=await e.selectFrom('crmAccounts').selectAll().where('id','=',accountId).where('mergedIntoId','is',null).executeTakeFirstOrThrow();assertAccountReadable(user,account);
 if(account.deletedAt)throw new CommunicationForbidden('El negocio está en la papelera.');
 if(!leadId){if(write)assertAccountWritable(user,account);return {account,lead:null};}
 const lead=await e.selectFrom('leads').selectAll().where('id','=',leadId).where('accountId','=',accountId).executeTakeFirstOrThrow();
 if(lead.deletedAt)throw new CommunicationForbidden('La gestión está en la papelera.');
 if(write)await assertLeadAccess(e,leadId,user,true);
 return {account,lead};
}
export async function communicationJournal(e:Executor,v:{accountId:string;leadId:string|null;entityType:string;entityId:string;action:string;actor:User|null;automatic?:boolean;triggeredBy?:string|null;before?:unknown;after?:unknown;relatedEventId?:string|null}){
 const row=await sql<{id:string}>`INSERT INTO crm_communication_journal(account_id,original_account_id,lead_id,entity_type,entity_id,action,actor_email,actor_name,is_automatic,triggered_by_email,related_event_id,before_value,after_value) VALUES(${v.accountId},${v.accountId},${v.leadId},${v.entityType},${v.entityId},${v.action},${v.actor?.email??null},${v.actor?.displayName??null},${v.automatic??false},${v.triggeredBy??null},${v.relatedEventId??null},${v.before===undefined?null:json(v.before)}::text::jsonb,${v.after===undefined?null:json(v.after)}::text::jsonb) RETURNING id`.execute(e);
 return row.rows[0].id;
}
async function withAutomaticStateChange<T>(e:Executor,cause:string,action:()=>Promise<T>):Promise<T>{
 const previous=(await sql<{origin:string|null;cause:string|null}>`SELECT current_setting('crm.state_change_origin',true) AS origin,current_setting('crm.state_change_cause',true) AS cause`.execute(e)).rows[0];
 await sql`SELECT set_config('crm.state_change_origin','automatic',true),set_config('crm.state_change_cause',${cause},true)`.execute(e);
 try{return await action();}finally{await sql`SELECT set_config('crm.state_change_origin',${previous?.origin??''},true),set_config('crm.state_change_cause',${previous?.cause??''},true)`.execute(e);}
}
async function markClientForCare(e:Executor,m:Message,user:User){
 if(m.purpose!=='care')return;
 // Decision D4: a past care send recorded on a No contactar business stays recorded, but only an admin's record marks it as client.
 const changed=await withAutomaticStateChange(e,'care_contact',()=>sql<{id:string}>`UPDATE crm_accounts SET is_client=true,updated_at=now() WHERE id=${m.accountId} AND is_client=false AND (${user.role==='admin'} OR NOT do_not_contact) RETURNING id`.execute(e));
 if(changed.rows.length)await communicationJournal(e,{accountId:String(m.accountId),leadId:m.leadId,entityType:'business',entityId:String(m.accountId),action:'client_marked_by_care_contact',actor:null,automatic:true,triggeredBy:user.email,before:{isClient:false},after:{isClient:true,interactionId:m.id}});
}
export async function assertAccountContactAllowed(e:Executor,accountId:string,leadId:string|null,contactId:string|null,channel:string){
 const account=await e.selectFrom('crmAccounts').selectAll().where('id','=',accountId).where('mergedIntoId','is',null).executeTakeFirstOrThrow();const lead=leadId?await e.selectFrom('leads').selectAll().where('id','=',leadId).where('accountId','=',accountId).where('deletedAt','is',null).executeTakeFirstOrThrow():null;
 if(account.deletedAt)throw new CommunicationForbidden('El negocio está en la papelera.');if(account.doNotContact)throw new CommunicationForbidden('El negocio tiene una restricción de no contactar.');if(account.archivedAt)throw new CommunicationForbidden('El negocio está archivado.');
 if(lead){const stage=(await sql<{classification:string}>`SELECT classification FROM crm_stages WHERE name=${lead.estado}`.execute(e)).rows[0];if(!stage||stage.classification!=='open')throw new CommunicationForbidden('Una gestión cerrada solo permite registrar respuestas recibidas.');}
 const restriction=await sql<{reason:string}>`SELECT reason FROM crm_contact_restrictions WHERE account_id=${accountId} AND lifted_at IS NULL AND channel IN (${channel},'all') AND ((contact_id=${contactId}::bigint AND ${contactId}::bigint IS NOT NULL) OR (contact_id IS NULL AND lead_id IS NULL) OR (contact_id IS NULL AND lead_id IS NOT DISTINCT FROM ${leadId}::bigint)) LIMIT 1`.execute(e);
 if(restriction.rows[0])throw new CommunicationForbidden('No contactar: '+restriction.rows[0].reason);
}
async function channelTarget(e:Executor,account:any,lead:any|null,contactId:string|null,channel:'email'|'whatsapp'){
 const contacts=await e.selectFrom('crmContacts').selectAll().where('accountId','=',account.id).where('deletedAt','is',null).execute();
 const field=channel==='email'?'email':'phone';
 if(contactId){const contact=contacts.find(c=>String(c.id)===contactId);if(!contact)throw new Error('La persona no pertenece a este negocio.');const value=String(contact[field]??'').trim();if(!value)throw new Error('La persona no tiene un destino para este canal.');return {contactId:String(contact.id),name:contact.name,value};}
 if(contacts.some(c=>String(c[field]??'').trim()))throw new CommunicationConflict('Elegí la persona de contacto para este canal.');
 const value=String(channel==='email'?account.email:(account.whatsapp||account.telefono)??'').trim();if(!value)throw new Error('No hay un dato general para este canal.');return {contactId:null,name:account.nombre,value};
}
export async function messageFor(e:Executor,id:string,user:User,lock=false){const r=await sql<Message>`SELECT * FROM crm_messages WHERE id=${id}::uuid ${lock?sql`FOR UPDATE`:sql``}`.execute(e);const m=r.rows[0];if(!m)throw new Error('Mensaje inexistente');if(user.role!=='admin'&&m.ownerEmail!==user.email)throw new CommunicationForbidden('Interacción de otro usuario.');await communicationContext(e,String(m.accountId),m.leadId==null?null:String(m.leadId),user,false);return m;}
/** Cancels a draft after checking ownership, its business and its revision; journaled like an explicit cancellation. */
async function cancelDraft(e:Executor,draft:{id:string;revision:number},user:User,accountId?:string){
 const m=await messageFor(e,draft.id,user,true);if(accountId&&String(m.accountId)!==accountId)throw new Error('El borrador no pertenece a este negocio.');
 if(m.status!=='draft'||m.revision!==draft.revision)throw new CommunicationConflict('El borrador cambió o ya fue utilizado.');
 const cancelled=(await sql<Message>`UPDATE crm_messages SET status='cancelled',revision=revision+1,updated_at=now() WHERE id=${m.id}::uuid RETURNING *`.execute(e)).rows[0];
 await communicationJournal(e,{accountId:String(m.accountId),leadId:m.leadId,entityType:'interaction',entityId:m.id,action:'draft_cancelled',actor:user,before:{status:m.status},after:{status:'cancelled'}});return cancelled;
}
async function prepare(e:Executor,input:Extract<CommunicationMutation,{action:'prepare'}>,user:User){
 const existing=(await sql<Message>`SELECT * FROM crm_messages WHERE id=${input.id}::uuid`.execute(e)).rows[0];if(existing){await messageFor(e,input.id,user);return existing;}
 const {lead,account}=await leadFor(e,input.leadId,user);
 if(account.status==='new')throw new CommunicationForbidden('En estado Nuevo solo se permite el contacto general de verificación.');
 await assertAccountContactAllowed(e,String(account.id),String(lead.id),input.contactId,input.channel);
 const c=await resolveCommercialContact(e,lead,input.contactId);const recipient=(input.channel==='email'?c.email:c.phone)?.trim();if(!recipient)throw new Error('El contacto no tiene este canal');
 const t=input.templateId?await e.selectFrom('messageTemplates').selectAll().where('id','=',input.templateId).where('active','=',true).executeTakeFirstOrThrow():null;
 const incompatibility=t?templateCompatibility(t,{channel:input.channel,vertical:lead.tipo,commercialProfile:lead.commercialProfile,managementType:lead.managementType,purpose:null}):null;
 if(incompatibility)throw new Error(incompatibility);
 if(input.discardDraft)await cancelDraft(e,input.discardDraft,user,String(account.id));
 const reusable=(await sql<Message>`SELECT * FROM crm_messages WHERE lead_id=${lead.id} AND contact_id IS NOT DISTINCT FROM ${c.contactId}::bigint AND channel=${input.channel} AND recipient=${recipient} AND owner_email=${user.email} AND status='draft' AND (template_snapshot->>'id') IS NOT DISTINCT FROM ${input.templateId}::text AND coalesce((template_snapshot->>'variation')::int,0)=${input.variation??0} ORDER BY updated_at DESC LIMIT 1 FOR UPDATE`.execute(e)).rows[0];if(reusable)return {...reusable,reusedDraft:true};
 const ownerName=await templateOwnerName(e,lead.assignedUserEmail,user);const shortName=await e.selectFrom('users').select('displayName').where('email','=',lead.assignedUserEmail??user.email).executeTakeFirst();const previous=t?(await sql<{picks:any}>`SELECT template_snapshot->'variantPicks' AS picks FROM crm_messages WHERE account_id=${account.id} AND template_snapshot->>'id'=${String(t.id)} AND template_snapshot ? 'variantPicks' ORDER BY created_at DESC LIMIT 1`.execute(e)).rows[0]?.picks??{}:{};const ctx=buildMessageTemplateContext({accountId:account.id,contactId:c.contactId,name:lead.nombre,contact:c.name,city:lead.ciudad,type:lead.tipo,subtype:lead.subtipo,phone:c.phone,email:c.email,website:lead.sitioWeb,sender:ownerName,senderShort:shortName?.displayName??user.displayName,senderEmail:lead.assignedUserEmail??user.email,managementType:lead.managementType,commercialProfile:lead.commercialProfile,isClient:account.commercialStatus==='client',channel:input.channel,variation:input.variation,previousPicks:previous});
 const variableDefinitions=await messageVariables(e);
 const rendered=t?renderMessageTemplateHtml(t.body,ctx,variableDefinitions):'<p></p>';
 const body=input.channel==='whatsapp'?htmlToWhatsApp(rendered).normalize('NFC'):rendered;
 const subject=t?renderMessageTemplate(t.subject??'',ctx,variableDefinitions):'';
 const snapshot=t?{...t,version:digest({body:t.body,subject:t.subject,updatedAt:t.updatedAt}),context:ctx,variables:variableDefinitions,variantPicks:ctx.__chosenPicks,variation:input.variation??0}:null;
 return (await sql<Message>`INSERT INTO crm_messages(id,account_id,original_account_id,lead_id,contact_id,channel,recipient,recipient_name,subject,body,template_snapshot,owner_email,task_id) VALUES(${input.id}::uuid,${lead.accountId},${lead.accountId},${lead.id},${c.contactId},${input.channel},${recipient},${c.name??''},${subject},${body},${json(snapshot)}::text::jsonb,${user.email},NULL) RETURNING *`.execute(e)).rows[0];
}
async function prepareGeneral(e:Executor,input:Extract<CommunicationMutation,{action:'prepare_general'}>,user:User){
 const existing=(await sql<Message>`SELECT * FROM crm_messages WHERE id=${input.id}::uuid`.execute(e)).rows[0];if(existing){await messageFor(e,input.id,user);return existing;}
 const {account,lead}=await communicationContext(e,input.accountId,input.leadId,user,true);
 if(!lead&&!input.purpose)throw new Error('Elegí el propósito del contacto general.');
 if(lead&&input.purpose)throw new Error('Una gestión abierta ya aporta el contexto del contacto.');
 if(input.leadId&&lead){const stage=(await sql<{classification:string}>`SELECT classification FROM crm_stages WHERE name=${lead.estado}`.execute(e)).rows[0];if(!stage||stage.classification!=='open')throw new CommunicationForbidden('Las gestiones cerradas no admiten contactos salientes.');}
 if(account.status==='new'&&input.purpose!=='verification')throw new CommunicationForbidden('En estado Nuevo solo se permite verificar los datos.');
 if(account.status!=='new'&&input.purpose==='verification')throw new CommunicationForbidden('La verificación solo está disponible en estado Nuevo.');
 if(input.purpose==='other'&&!input.otherPurpose?.trim())throw new Error('Aclaración obligatoria para Otro propósito.');
 await assertAccountContactAllowed(e,input.accountId,input.leadId,input.contactId,input.channel);
 const target=await channelTarget(e,account,lead,input.contactId,input.channel);
 const t=input.templateId?await e.selectFrom('messageTemplates').selectAll().where('id','=',input.templateId).where('active','=',true).executeTakeFirstOrThrow():null;
 const incompatible=t?templateCompatibility(t,{channel:input.channel,vertical:lead?.tipo??account.tipo,commercialProfile:lead?.commercialProfile??null,managementType:lead?.managementType??null,purpose:input.purpose}):null;if(incompatible)throw new Error(incompatible);
 if(input.discardDraft)await cancelDraft(e,input.discardDraft,user,String(account.id));
 const reusable=(await sql<Message>`SELECT * FROM crm_messages WHERE account_id=${account.id} AND lead_id IS NOT DISTINCT FROM ${input.leadId}::bigint AND contact_id IS NOT DISTINCT FROM ${target.contactId}::bigint AND channel=${input.channel} AND recipient=${target.value} AND owner_email=${user.email} AND status='draft' AND (template_snapshot->>'id') IS NOT DISTINCT FROM ${input.templateId}::text AND coalesce((template_snapshot->>'variation')::int,0)=${input.variation??0} ORDER BY updated_at DESC LIMIT 1 FOR UPDATE`.execute(e)).rows[0];if(reusable)return {...reusable,reusedDraft:true};
 const ownerName=await templateOwnerName(e,lead?.assignedUserEmail??account.assignedUserEmail,user);const shortName=await e.selectFrom('users').select('displayName').where('email','=',lead?.assignedUserEmail??account.assignedUserEmail??user.email).executeTakeFirst();const previous=t?(await sql<{picks:any}>`SELECT template_snapshot->'variantPicks' AS picks FROM crm_messages WHERE account_id=${account.id} AND template_snapshot->>'id'=${String(t.id)} AND template_snapshot ? 'variantPicks' ORDER BY created_at DESC LIMIT 1`.execute(e)).rows[0]?.picks??{}:{};const ctx=buildMessageTemplateContext({accountId:account.id,contactId:target.contactId,name:account.nombre,contact:target.name,city:lead?.ciudad??account.ciudad,type:lead?.tipo??account.tipo,subtype:lead?.subtipo??account.subtipo,phone:target.value,email:target.value,website:account.sitioWeb,sender:ownerName,senderShort:shortName?.displayName??user.displayName,senderEmail:lead?.assignedUserEmail??account.assignedUserEmail??user.email,managementType:lead?.managementType,commercialProfile:lead?.commercialProfile,isClient:account.commercialStatus==='client',channel:input.channel,purpose:input.purpose,variation:input.variation,previousPicks:previous});
 const variableDefinitions=await messageVariables(e);
 const rendered=t?renderMessageTemplateHtml(t.body,ctx,variableDefinitions):'<p></p>';const body=input.channel==='whatsapp'?htmlToWhatsApp(rendered).normalize('NFC'):rendered;const subject=t?renderMessageTemplate(t.subject??'',ctx,variableDefinitions):'';const snapshot=t?{...t,version:digest({body:t.body,subject:t.subject,updatedAt:t.updatedAt}),context:ctx,variables:variableDefinitions,variantPicks:ctx.__chosenPicks,variation:input.variation??0}:null;
 const created=(await sql<Message>`INSERT INTO crm_messages(id,account_id,original_account_id,lead_id,contact_id,channel,recipient,recipient_name,subject,body,template_snapshot,owner_email,purpose,other_purpose) VALUES(${input.id}::uuid,${account.id},${account.id},${input.leadId},${target.contactId},${input.channel},${target.value},${target.name},${subject},${body},${json(snapshot)}::text::jsonb,${user.email},${input.purpose},${input.otherPurpose}) RETURNING *`.execute(e)).rows[0];
 await communicationJournal(e,{accountId:String(account.id),leadId:input.leadId,entityType:'interaction',entityId:created.id,action:'draft_prepared',actor:user,after:{channel:input.channel,purpose:input.purpose,recipient:target.value}});return created;
}
async function closeForDoNotContact(e:Executor,account:any,selectedIds:string[],user:User,responseId:string,leadId:string|null){
 const requested=[...new Set(selectedIds)];
 let closedAny=false;
 if(requested.length){
  const open=(await sql<{id:string;managementType:string|null;estado:string;assignedUserEmail:string|null}>`SELECT l.id,l.management_type,l.estado,l.assigned_user_email FROM leads l JOIN crm_stages s ON s.name=l.estado WHERE l.account_id=${account.id} AND l.deleted_at IS NULL AND s.classification='open' AND l.id=ANY(${requested}::bigint[]) FOR UPDATE OF l`.execute(e)).rows;
  if(open.length!==requested.length)throw new CommunicationConflict('Una o más gestiones seleccionadas ya no están abiertas. Actualizá el detalle y volvé a intentarlo.');
  if(open.some(item=>!item.managementType))throw new CommunicationConflict('Una gestión histórica seleccionada requiere un cierre manual desde el tablero.');
  if(open.some(item=>user.role!=='admin'&&item.assignedUserEmail!==user.email))throw new CommunicationForbidden('Solo podés cerrar las gestiones que tenés asignadas.');
  await sql`SELECT set_config('crm.close_related_management','true',true)`.execute(e);
  for(const item of open){
   const type=item.managementType!;
   const outcome=type==='provider'?'not_participating':type==='accompaniment'?'not_completed':type==='editor'?(item.estado.includes('proposal')?'proposal_lost':'not_collaborating'):'lost';
   const stage=type==='provider'?'provider:not_participating':type==='accompaniment'?'accompaniment:not_completed':type==='editor'?(outcome==='proposal_lost'?'editor:proposal_lost':'editor:not_collaborating'):`${type}:lost`;
   const reason=(await sql<{id:string}>`SELECT id FROM crm_management_reasons WHERE management_type=${type} AND outcome_key=${outcome} AND reason_key='do_not_contact' AND active`.execute(e)).rows[0];
   if(!reason)throw new Error('No se encontró el motivo “Pidió no ser contactado” para una gestión.');
   await sql`SELECT set_config('crm.management_reason_id',${reason.id},true),set_config('crm.management_note','',true)`.execute(e);
   await sql`UPDATE leads SET estado=${stage},updated_at=now() WHERE id=${item.id}`.execute(e);
  }
  closedAny=open.length>0;
  await sql`SELECT set_config('crm.close_related_management','false',true)`.execute(e);
 }
 const remaining=(await sql<{n:string}>`SELECT count(*) n FROM leads l JOIN crm_stages s ON s.name=l.estado WHERE l.account_id=${account.id} AND l.deleted_at IS NULL AND s.classification='open'`.execute(e)).rows[0];
 if(closedAny&&Number(remaining?.n)===0&&!account.archivedAt){
  await cancelRecontactTaskFor(e,{accountId:account.id,cause:'dnc'});
  await withAutomaticStateChange(e,'do_not_contact_response',()=>sql`UPDATE crm_accounts SET status='archived',archived_at=coalesce(archived_at,now()),updated_at=now() WHERE id=${account.id}`.execute(e));
  await communicationJournal(e,{accountId:String(account.id),leadId,entityType:'business',entityId:String(account.id),action:'business_archived_by_do_not_contact',actor:null,automatic:true,triggeredBy:user.email,after:{status:'archived',responseId}});
 }
}
async function createResponse(e:Executor,input:Extract<CommunicationMutation,{action:'response_create'}>,user:User){
 const {account,lead}=await communicationContext(e,input.accountId,input.leadId,user,false);
 // Replay: a retry whose answer was lost returns the same response (the first save already blocked the business and closed the chosen managements). Only the same user, business, management, category, person and linked contact; anything else is a conflict that reveals nothing.
 const replay=(await sql<ResponseReplay>`SELECT id,actor_email,account_id,lead_id,category,contact_id,linked_message_id FROM crm_communication_responses WHERE id=${input.id}::uuid`.execute(e)).rows[0];
 if(replay){if(replay.actorEmail!==user.email||String(replay.accountId)!==String(account.id)||String(replay.leadId??'')!==String(input.leadId??'')||replay.category!==input.category||String(replay.contactId??'')!==String(input.contactId??'')||String(replay.linkedMessageId??'')!==String(input.linkedMessageId??''))throw new CommunicationConflict('Ese registro ya existe para otro contacto. Reintentá desde cero.');return {id:String(replay.id)};}
 // Decision D1: reading the business is not enough to block all its contact; recording incoming responses of any other category keeps the read-level rule.
 if(input.category==='do_not_contact')await assertCanRecordDoNotContact(e,user,account);
 if(input.category==='do_not_contact'&&!input.confirmDoNotContact)throw new CommunicationConflict('Confirmá que se bloquearán todos los contactos del negocio.');
 if(input.leadId&&!lead)throw new Error('Contexto de gestión inválido');
 if(input.contactId){const contact=await e.selectFrom('crmContacts').select(['id','accountId','name','deletedAt']).where('id','=',input.contactId).where('accountId','=',input.accountId).executeTakeFirst();if(!contact||contact.deletedAt)throw new Error('La persona no pertenece a este negocio.');}
 if(input.category==='do_not_contact'&&input.otherDetail)throw new Error('No contactar no admite una aclaración de Otra categoría.');
 if(input.category==='other'&&!input.otherDetail?.trim())throw new Error('Aclaración obligatoria para Otra respuesta.');
 if(input.linkedMessageId){const linked=(await sql`SELECT id FROM crm_messages WHERE id=${input.linkedMessageId}::uuid AND account_id=${input.accountId} AND contact_id IS NOT DISTINCT FROM ${input.contactId}::bigint`.execute(e)).rows[0];if(!linked)throw new Error('El contacto previo no coincide con el destinatario.');}
 const inserted=await sql<{id:string}>`INSERT INTO crm_communication_responses(id,account_id,original_account_id,lead_id,contact_id,channel,recipient,recipient_name,destination_detail,linked_message_id,category,summary,exact_text,other_detail,actor_email) VALUES(${input.id}::uuid,${account.id},${account.id},${input.leadId},${input.contactId},${input.channel},${input.recipient},${input.recipientName},${input.destination},${input.linkedMessageId}::uuid,${input.category},${input.summary},${input.exactText},${input.otherDetail},${user.email}) RETURNING id`.execute(e);
 const responseId=inserted.rows[0].id;
 await communicationJournal(e,{accountId:String(account.id),leadId:input.leadId,entityType:'response',entityId:responseId,action:'response_registered',actor:user,after:{category:input.category,summary:input.summary,exactText:input.exactText,channel:input.channel,recipient:input.recipient,recipientName:input.recipientName,destination:input.destination}});
 if(input.reminder){
  if(input.category!=='later')throw new Error(`El recordatorio solo aplica a “${responseCategoryLabel('later')}”.`);
  const parsed=new Date(input.reminder.dueDate+'T00:00:00Z');if(Number.isNaN(parsed.valueOf())||parsed.toISOString().slice(0,10)!==input.reminder.dueDate)throw new Error('Fecha de recordatorio inválida.');
  if(account.doNotContact&&user.role!=='admin')throw new CommunicationForbidden(DO_NOT_CONTACT_READ_ONLY);// Decision 1C: tasks of a No contactar business are admin-only; the response itself is still recorded without a reminder.
  const contextOwner=lead?.assignedUserEmail??account.assignedUserEmail;
  if(user.role!=='admin'&&user.email!==contextOwner)throw new CommunicationForbidden('Solo el responsable del contexto o un administrador puede crear este recordatorio.');
  const assignee=input.reminder.assignedUserEmail??contextOwner??user.email;
  if(user.role!=='admin'&&assignee!==contextOwner)throw new CommunicationForbidden('Solo administración puede reasignar este recordatorio.');
  await e.selectFrom('users').select('email').where('email','=',assignee).executeTakeFirstOrThrow();
  const task=await sql<{id:string}>`INSERT INTO crm_tasks(account_id,lead_id,title,type_id,purpose,due_date,assigned_user_email,priority,communication_response_id) VALUES(${account.id},${input.leadId},'Retomar conversación','followup','reactivation',${input.reminder.dueDate}::date,${assignee},'media',${responseId}::uuid) RETURNING id`.execute(e);
  await communicationJournal(e,{accountId:String(account.id),leadId:input.leadId,entityType:'response',entityId:responseId,action:'response_reminder_created',actor:user,after:{taskId:task.rows[0].id,dueDate:input.reminder.dueDate,assignedUserEmail:assignee}});
 }
 if(input.category==='do_not_contact'){
  if(!account.doNotContact){await cancelRecontactTaskFor(e,{accountId:account.id,cause:'dnc'});await withAutomaticStateChange(e,'do_not_contact_response',()=>sql`UPDATE crm_accounts SET do_not_contact=true,updated_at=now() WHERE id=${account.id}`.execute(e));await communicationJournal(e,{accountId:String(account.id),leadId:input.leadId,entityType:'business',entityId:String(account.id),action:'do_not_contact_activated',actor:null,automatic:true,triggeredBy:user.email,after:{doNotContact:true,responseId}});}
  await closeForDoNotContact(e,account,input.closeLeadIds??[],user,responseId,input.leadId);
 }
 return {id:responseId};
}
async function correctResponse(e:Executor,input:Extract<CommunicationMutation,{action:'response_correct'}>,user:User){
 const row=(await sql<any>`SELECT * FROM crm_communication_responses WHERE id=${input.id}::uuid FOR UPDATE`.execute(e)).rows[0];if(!row)throw new Error('Respuesta inexistente');
 if(user.role!=='admin'&&row.actorEmail!==user.email)throw new CommunicationForbidden('Solo quien registró la respuesta o un admin puede corregirla.');
 const {account}=await communicationContext(e,String(row.accountId),row.leadId==null?null:String(row.leadId),user,false);
 // Decision D1: changing a category TO do_not_contact needs the same standing as recording it. Decision 1C: only an admin changes it away (lifts the block).
 if(row.category!=='do_not_contact'&&input.category==='do_not_contact')await assertCanRecordDoNotContact(e,user,account);
 if(input.category==='other'&&!input.otherDetail?.trim())throw new Error('Aclaración obligatoria para Otra respuesta.');
 if(row.category==='do_not_contact'&&input.category!=='do_not_contact'&&user.role!=='admin')throw new CommunicationForbidden(DO_NOT_CONTACT_LIFT_DENIED);
 if(row.category==='do_not_contact'&&input.category!=='do_not_contact'&&!input.confirmLiftDoNotContact)throw new CommunicationConflict('Confirmá que querés habilitar nuevamente los contactos.');
 if(row.category!=='do_not_contact'&&input.category==='do_not_contact'&&!input.confirmDoNotContact)throw new CommunicationConflict('Confirmá que querés bloquear todos los contactos del negocio.');
 const before={category:row.category,summary:row.summary,exactText:row.exactText,otherDetail:row.otherDetail};const after={category:input.category,summary:input.summary,exactText:input.exactText,otherDetail:input.otherDetail};
 await sql`INSERT INTO crm_communication_response_corrections(response_id,account_id,lead_id,actor_email,reason,before_value,after_value) VALUES(${input.id}::uuid,${account.id},${row.leadId},${user.email},${input.reason},${json(before)}::text::jsonb,${json(after)}::text::jsonb)`.execute(e);
 await sql`UPDATE crm_communication_responses SET category=${input.category},summary=${input.summary},exact_text=${input.exactText},other_detail=${input.otherDetail},updated_at=now() WHERE id=${input.id}::uuid`.execute(e);
 const correctionJournalId=await communicationJournal(e,{accountId:String(account.id),leadId:row.leadId==null?null:String(row.leadId),entityType:'response',entityId:input.id,action:'response_corrected',actor:user,before,after:{...after,correctionReason:input.reason}});
 if(row.category!==input.category&&((row.category==='do_not_contact')||(input.category==='do_not_contact'))){const value=input.category==='do_not_contact';if(account.doNotContact!==value){if(value)await cancelRecontactTaskFor(e,{accountId:account.id,cause:'dnc'});await withAutomaticStateChange(e,'response_correction',()=>sql`UPDATE crm_accounts SET do_not_contact=${value},updated_at=now() WHERE id=${account.id}`.execute(e));await communicationJournal(e,{accountId:String(account.id),leadId:row.leadId==null?null:String(row.leadId),entityType:'business',entityId:String(account.id),action:value?'do_not_contact_activated':'do_not_contact_lifted',actor:null,automatic:true,triggeredBy:user.email,relatedEventId:correctionJournalId,before:{doNotContact:!value},after:{doNotContact:value,responseId:input.id}});}}
 if(input.category==='do_not_contact')await closeForDoNotContact(e,account,input.closeLeadIds??[],user,input.id,row.leadId==null?null:String(row.leadId));
 return {id:input.id};
}
async function startManual(e:Executor,input:Extract<CommunicationMutation,{action:'manual_start'}>,user:User){
 const {account,lead}=await communicationContext(e,input.accountId,input.leadId,user,true);
 // Replay: a retry of a save whose answer was lost returns the same record. Only the same user, business, management and channel; anything else is a conflict that reveals nothing.
 const replay=(await sql<Message>`SELECT * FROM crm_messages WHERE id=${input.id}::uuid`.execute(e)).rows[0];
 if(replay){if(replay.ownerEmail!==user.email||String(replay.accountId)!==String(account.id)||String(replay.leadId??'')!==String(input.leadId??'')||replay.channel!==input.channel)throw new CommunicationConflict('Ese registro ya existe para otro contacto. Reintentá desde cero.');return replay;}
 if(account.archivedAt)throw new CommunicationForbidden('Desarchivá el negocio antes de iniciar un contacto.');
 if(account.doNotContact)throw new CommunicationForbidden('El negocio tiene No contactar activo.');
 const activeRestriction=await sql<{reason:string}>`SELECT reason FROM crm_contact_restrictions WHERE account_id=${account.id} AND lifted_at IS NULL AND channel IN (${input.channel},'all') AND ((contact_id=${input.contactId}::bigint AND ${input.contactId}::bigint IS NOT NULL) OR (contact_id IS NULL AND lead_id IS NULL) OR (contact_id IS NULL AND lead_id IS NOT DISTINCT FROM ${input.leadId}::bigint)) LIMIT 1`.execute(e);
 if(activeRestriction.rows[0])throw new CommunicationForbidden('Este canal tiene una restricción activa: '+activeRestriction.rows[0].reason);
 if(input.leadId){const stage=(await sql<{classification:string}>`SELECT classification FROM crm_stages WHERE name=${lead!.estado}`.execute(e)).rows[0];if(!stage||stage.classification!=='open')throw new CommunicationForbidden('Una gestión cerrada solo permite registrar respuestas recibidas.');}
 if(account.status==='new'&&input.purpose!=='verification')throw new CommunicationForbidden('En estado Nuevo solo se permite verificar los datos.');
 if(account.status!=='new'&&input.purpose==='verification')throw new CommunicationForbidden('La verificación solo está disponible en estado Nuevo.');
 if(!lead&&!input.purpose)throw new Error('Elegí el propósito del contacto general.');
 if(lead&&input.purpose)throw new Error('Una gestión abierta ya aporta el contexto del contacto.');
 if(input.purpose==='other'&&!input.otherPurpose?.trim())throw new Error('Aclaración obligatoria para Otro propósito.');
 const dest=input.destination?.trim()??'';
 const summary=input.channel==='call'?input.body.trim():null;
 if(input.channel==='call'&&!summary)throw new Error('El resumen de la llamada es obligatorio.');
 if(input.channel==='call'&&!input.result)throw new Error('Elegí si la llamada se realizó o no hubo contacto.');
 if(input.channel!=='call'&&input.result)throw new Error('Los intentos de redes y Otros se completan al finalizar.');
 if((input.channel==='social'||input.channel==='other')&&!dest)throw new Error('Indicá el perfil o destino utilizado.');
 const recipient=input.contactId?(await e.selectFrom('crmContacts').selectAll().where('id','=',input.contactId).where('accountId','=',input.accountId).where('deletedAt','is',null).executeTakeFirstOrThrow()):null;
 const template=input.templateId?await e.selectFrom('messageTemplates').selectAll().where('id','=',input.templateId).where('active','=',true).executeTakeFirstOrThrow():null;
 if(input.templateId&&input.channel==='call')throw new Error('Las llamadas no usan modelos.');
 if(template&&template.channel!==input.channel)throw new Error('El modelo no corresponde a este canal.');
 if(template){const mismatch=templateCompatibility(template,{channel:input.channel,vertical:lead?.tipo??account.tipo,commercialProfile:lead?.commercialProfile??null,managementType:lead?.managementType??null,purpose:input.purpose});if(mismatch)throw new Error(mismatch);}
 if(input.templateId&&!template)throw new Error('El modelo fue desactivado o no existe.');
 if(template&&unresolvedTemplateVariables(input.body).length)throw new Error('Completá o quitá las variables pendientes antes de copiar el texto.');
 const contentHash=input.body?digest(input.body):null;
 if(input.channel!=='call'){
  const pending=(await sql<Message>`SELECT * FROM crm_messages WHERE account_id=${account.id} AND lead_id IS NOT DISTINCT FROM ${input.leadId}::bigint AND contact_id IS NOT DISTINCT FROM ${input.contactId}::bigint AND channel=${input.channel} AND recipient=${input.recipient} AND destination_detail IS NOT DISTINCT FROM ${dest} AND owner_email=${user.email} AND status='manual_pending' ORDER BY created_at DESC LIMIT 1 FOR UPDATE`.execute(e)).rows[0];
  if(pending){if(pending.contentHash===contentHash)return pending;throw new CommunicationConflict('Ya hay un intento pendiente para este destino. Marcá el anterior como No realizado antes de crear uno corregido.');}
 }
 const status=input.channel==='call'?input.result!:'manual_pending';
 const savedBody=input.channel==='call'||!template?'':input.body;
 let variantPicks:Record<string,string>={};
 if(template){const ownerName=await templateOwnerName(e,lead?.assignedUserEmail??account.assignedUserEmail,user);const shortName=await e.selectFrom('users').select('displayName').where('email','=',lead?.assignedUserEmail??account.assignedUserEmail??user.email).executeTakeFirst();const previous=(await sql<{picks:any}>`SELECT template_snapshot->'variantPicks' AS picks FROM crm_messages WHERE account_id=${account.id} AND template_snapshot->>'id'=${String(template.id)} AND template_snapshot ? 'variantPicks' ORDER BY created_at DESC LIMIT 1`.execute(e)).rows[0]?.picks??{};const ctx=buildMessageTemplateContext({accountId:account.id,contactId:input.contactId,name:account.nombre,contact:recipient?.name??input.recipientName,city:lead?.ciudad??account.ciudad,type:lead?.tipo??account.tipo,subtype:lead?.subtipo??account.subtipo,phone:recipient?.phone??input.recipient,email:recipient?.email,website:account.sitioWeb,sender:ownerName,senderShort:shortName?.displayName??user.displayName,senderEmail:lead?.assignedUserEmail??account.assignedUserEmail??user.email,managementType:lead?.managementType,commercialProfile:lead?.commercialProfile,isClient:account.commercialStatus==='client',channel:input.channel,purpose:input.purpose,variation:input.variation,previousPicks:previous});renderMessageTemplate(template.body,ctx,await messageVariables(e));variantPicks=ctx.__chosenPicks;}
 const templateSnapshot=template?{...template,version:digest({body:template.body,subject:template.subject}),finalBody:input.body,variantPicks}:null;
 const created=(await sql<Message>`INSERT INTO crm_messages(id,account_id,original_account_id,lead_id,contact_id,channel,recipient,recipient_name,body,template_snapshot,owner_email,purpose,other_purpose,destination_detail,content_hash,summary,status,last_interaction_at,last_actor_email,completed_at,completed_by_email) VALUES(${input.id}::uuid,${account.id},${account.id},${input.leadId},${input.contactId},${input.channel},${input.recipient},${input.recipientName||recipient?.name||account.nombre},${savedBody},${templateSnapshot?json(templateSnapshot):null}::text::jsonb,${user.email},${input.purpose},${input.otherPurpose},${dest},${contentHash},${summary},${status},now(),${user.email},${input.channel==='call'?new Date():null},${input.channel==='call'?user.email:null}) RETURNING *`.execute(e)).rows[0];
 if(input.channel==='call'&&status==='manual_sent')await markClientForCare(e,created,user);
 await communicationJournal(e,{accountId:String(account.id),leadId:input.leadId,entityType:'interaction',entityId:created.id,action:input.channel==='call'?'contact_completed':'contact_started',actor:user,after:{channel:input.channel,status:created.status,purpose:input.purpose,recipient:created.recipient,recipientName:created.recipientName,destination:created.destinationDetail,content:created.templateSnapshot?.finalBody||created.body||null,summary:created.summary}});return created;
}
export async function renderFinal(e:Executor,m:Message,user:User){const {lead,account}=await communicationContext(e,String(m.accountId),m.leadId==null?null:String(m.leadId),user,false);const sender=user.fullName?.trim()||user.displayName;return {htmlBody:buildHospedaEmailHtml({bodyHtml:m.body,senderName:sender,senderEmail:user.email,subject:m.subject,vertical:lead?.tipo??account.tipo,commercialProfile:lead?.commercialProfile??null,logoUrl:(process.env.PUBLIC_APP_URL??'http://localhost:3001').replace(/\/$/,'')+'/hospeda-logo.jpg'}),textBody:buildHospedaEmailText({bodyText:htmlToPlainText(m.body),senderName:sender,senderEmail:user.email})};}
async function activity(e:Executor,m:Message,user:User,result:string){
 const {lead,account}=await communicationContext(e,String(m.accountId),m.leadId==null?null:String(m.leadId),user,false);
 const current=(await sql<{activityId:string|null;status:string}>`SELECT activity_id,status FROM crm_messages WHERE id=${m.id}::uuid`.execute(e)).rows[0];
 const existingId=current?.activityId??m.activityId;
 if(existingId){const providerResult=result.startsWith('Email aceptado')||result==='Rechazo de Brevo';if(!(providerResult&&['replied','rejected'].includes(current?.status??'')))await e.updateTable('crmActivities').set({result,updatedAt:new Date()}).where('id','=',existingId).where('outcome','is',null).execute();return existingId;}
 const a=await e.insertInto('crmActivities').values({accountId:account.id,leadId:lead?.id??null,typeId:m.channel==='whatsapp'?'other':'message',title:m.channel==='whatsapp'?'Comunicación WhatsApp':'Comunicación '+m.channel,channel:m.channel,result,occurredAt:new Date(),contactIds:m.contactId?[m.contactId]:[],participants:m.recipientName,actorEmail:user.email,notes:'Snapshot de mensaje #'+m.id}).returning('id').executeTakeFirstOrThrow();
 await sql`UPDATE crm_messages SET activity_id=${a.id} WHERE id=${m.id}::uuid`.execute(e);
 if(lead)await writeLeadJournal(e as Transaction<DB>,{leadId:String(lead.id),leadName:lead.nombre,actor:user,action:'contact_logged',metadata:{activityId:a.id,messageId:m.id,channel:m.channel,result,template:m.templateSnapshot?.name??null}});return a.id;
}
/** Completes a WhatsApp manual attempt that the user script observed as sent, reusing CRM completion rules and journal effects. */
export async function completeUserscriptManual(e:Executor,id:string,externalId:string,text:string,user:User){
 const m=await messageFor(e,id,user,true);if(m.channel!=='whatsapp'||m.status!=='manual_pending')throw new CommunicationConflict('Este intento ya fue completado.');
 await assertAccountContactAllowed(e,String(m.accountId),m.leadId==null?null:String(m.leadId),m.contactId==null?null:String(m.contactId),'whatsapp');
 await sql`UPDATE crm_messages SET status='manual_sent',external_id=${externalId},body=${text},text_body=${text},summary=${text},completed_at=now(),completed_by_email=${user.email},last_interaction_at=now(),last_actor_email=${user.email},revision=revision+1,updated_at=now() WHERE id=${m.id}::uuid`.execute(e);
 await activity(e,m,user,'Envío confirmado manualmente');
 if(m.taskId)await e.updateTable('crmTasks').set({status:'completed',completedAt:new Date(),result:'Envío confirmado manualmente',updatedAt:new Date()}).where('id','=',m.taskId).where('status','=','pending').execute();
 await markClientForCare(e,m,user);
 await communicationJournal(e,{accountId:String(m.accountId),leadId:m.leadId,entityType:'interaction',entityId:m.id,action:'contact_completed',actor:user,triggeredBy:'userscript',before:{status:m.status},after:{status:'manual_sent',externalId}});
 return m.id;
}
/** Records an already-sent WhatsApp message when no CRM manual attempt exists for it. */
export async function registerUserscriptSent(e:Executor,v:{accountId:string;externalId:string;phone:string;title:string;text:string;sentAt:Date},user:User){
 await assertAccountContactAllowed(e,v.accountId,null,null,'whatsapp');
 const account=await e.selectFrom('crmAccounts').select('status').where('id','=',v.accountId).executeTakeFirstOrThrow();if(account.status==='new')throw new CommunicationForbidden('En estado Nuevo solo se permite verificar los datos.');
 const created=(await sql<Message>`INSERT INTO crm_messages(id,account_id,original_account_id,channel,recipient,recipient_name,body,text_body,owner_email,status,external_id,created_at,updated_at,last_interaction_at,last_actor_email) VALUES(${randomUUID()}::uuid,${v.accountId}::bigint,${v.accountId}::bigint,'whatsapp',${v.phone},${v.title},${v.text},${v.text},${user.email},'manual_sent',${v.externalId},${v.sentAt},now(),now(),${user.email}) ON CONFLICT(channel,external_id) WHERE external_id IS NOT NULL DO NOTHING RETURNING *`.execute(e)).rows[0];
 if(!created)return (await sql<{id:string}>`SELECT id::text AS id FROM crm_messages WHERE channel='whatsapp' AND external_id=${v.externalId}`.execute(e)).rows[0]?.id;
 await activity(e,created,user,'Envío confirmado manualmente');await markClientForCare(e,created,user);await communicationJournal(e,{accountId:v.accountId,leadId:null,entityType:'interaction',entityId:created.id,action:'contact_completed',actor:user,triggeredBy:'userscript',after:{status:'manual_sent',externalId:v.externalId,channel:'whatsapp'}});return created.id;
}
/**
 * Links the outcome a seller writes after a contact (work.ts, decision 2B) to its message, inside the caller's transaction.
 * The caller locks the business and the management first, so the lock order stays account → lead → message.
 * Only the message owner or an admin may do it. A pending attempt (WhatsApp opened, manual attempt started) needs the seller's
 * explicit `sent` confirmation to become manual_sent (opening a channel never counts as a send); "not sent" is recorded through
 * the communication flow, never here. A completed manual attempt keeps its summary or takes the outcome's `result`.
 * Returns the activity the communication service already created for this message, so the caller updates it instead of
 * adding a second one; `null` means the caller inserts the activity and links it with {@link linkMessageActivity}.
 */
export async function resolveMessageForWork(e:Executor,user:User,v:{messageId:string;sent?:boolean;result?:string|null;accountId:string;leadId:string|null}):Promise<{activityId:string|null}>{
 const m=await messageFor(e,v.messageId,user,true);
 if(String(m.accountId)!==String(v.accountId)||String(m.leadId??'')!==String(v.leadId??''))throw new Error('El mensaje no corresponde a este negocio o gestión.');
 if(!canLogContactOutcome(m.status))throw new CommunicationConflict('Este mensaje no registra un contacto realizado; no se puede anotar cómo salió.');
 const existing=m.activityId?await e.selectFrom('crmActivities').select(['id','outcome']).where('id','=',m.activityId).where('deletedAt','is',null).forUpdate().executeTakeFirst():undefined;
 if(existing?.outcome)throw new CommunicationConflict('Ya anotaste cómo salió este contacto.');
 if(needsSentAnswer(m.status)){
  if(!v.sent)throw new Error('Contá si el mensaje se envió.');
  await assertAccountContactAllowed(e,String(m.accountId),m.leadId==null?null:String(m.leadId),m.contactId==null?null:String(m.contactId),m.channel);
  const status='manual_sent';
  await sql`UPDATE crm_messages SET status=${status},summary=CASE WHEN status='manual_pending' THEN COALESCE(summary,${v.result?.trim()||null}) ELSE summary END,completed_at=CASE WHEN status='manual_pending' THEN now() ELSE completed_at END,completed_by_email=CASE WHEN status='manual_pending' THEN ${user.email} ELSE completed_by_email END,last_interaction_at=now(),last_actor_email=${user.email},revision=revision+1,updated_at=now() WHERE id=${m.id}::uuid`.execute(e);
  if(m.taskId)await e.updateTable('crmTasks').set({status:'completed',completedAt:new Date(),result:'Envío confirmado manualmente',updatedAt:new Date()}).where('id','=',m.taskId).where('status','=','pending').execute();
  await markClientForCare(e,m,user);
  await communicationJournal(e,{accountId:String(m.accountId),leadId:m.leadId,entityType:'interaction',entityId:m.id,action:'contact_resolved',actor:user,before:{status:m.status},after:{status,source:'outcome'}});
 }
 return {activityId:existing?String(existing.id):null};
}
/** A contact the seller left without "¿Cómo salió?" (decision 2B): it stays in Hoy until an outcome is recorded. */
export type PendingContactOutcome={id:string;accountId:string;accountName:string;leadId:string|null;opportunityName:string|null;contactId:string|null;channel:string;status:string;purpose:string|null;recipientName:string;lastInteractionAt:Date};
/**
 * The seller's own contacts since outcome tracking started (migration 028) that she can still resolve: she is the management's
 * (or, without one, the business's) responsible or an admin, and the message's activity has no outcome. A confirmed contact is
 * also resolved by any later outcome activity of the same business and management; an unconfirmed send (WhatsApp opened, manual
 * attempt started) is not, and it is left out when No contactar or a closed management blocks confirming it (the communication
 * panel keeps it with its reason). Archived, merged or trashed businesses, trashed managements, drafts, not-sent and uncertain
 * sends never appear.
 */
export async function pendingContactOutcomes(e:Executor,{ownerEmail,isAdmin,accountId=null,leadId=null,limit=20}:{ownerEmail:string;isAdmin:boolean;accountId?:string|null;leadId?:string|null;limit?:number}):Promise<PendingContactOutcome[]>{
 return (await sql<PendingContactOutcome>`SELECT m.id,m.account_id,a.nombre AS account_name,m.lead_id,l.opportunity_name,m.contact_id,m.channel,m.status,m.purpose,m.recipient_name,m.last_interaction_at
  FROM crm_messages m JOIN crm_accounts a ON a.id=m.account_id LEFT JOIN leads l ON l.id=m.lead_id
  WHERE m.owner_email=${ownerEmail} AND (${accountId}::bigint IS NULL OR m.account_id=${accountId}::bigint) AND (${leadId}::bigint IS NULL OR m.lead_id=${leadId}::bigint) AND m.status=ANY(${[...OUTCOME_READY_STATUSES]}::text[])
   AND m.last_interaction_at>=(SELECT value::timestamptz FROM app_settings WHERE key='crm_contact_outcome_since')
   AND a.deleted_at IS NULL AND a.archived_at IS NULL AND a.merged_into_id IS NULL AND (m.lead_id IS NULL OR l.deleted_at IS NULL)
   AND (${isAdmin} OR coalesce(l.assigned_user_email,a.assigned_user_email)=${ownerEmail})
   AND (m.status NOT IN ('whatsapp_opened','manual_pending') OR (NOT a.do_not_contact AND (m.lead_id IS NULL OR coalesce((SELECT classification FROM crm_stages WHERE name=l.estado),'')='open')))
   AND NOT EXISTS(SELECT 1 FROM crm_activities x WHERE x.id=m.activity_id AND x.outcome IS NOT NULL AND x.deleted_at IS NULL)
   AND NOT EXISTS(SELECT 1 FROM crm_communication_responses r WHERE r.linked_message_id=m.id AND r.category='do_not_contact')
   AND (m.status IN ('whatsapp_opened','manual_pending') OR NOT EXISTS(SELECT 1 FROM crm_activities x WHERE x.account_id=m.account_id AND x.lead_id IS NOT DISTINCT FROM m.lead_id AND x.outcome IS NOT NULL AND x.deleted_at IS NULL AND x.created_at>=m.last_interaction_at))
  ORDER BY m.last_interaction_at DESC LIMIT ${limit}`.execute(e)).rows.map(r=>({...r,id:String(r.id),accountId:String(r.accountId),leadId:r.leadId==null?null:String(r.leadId),contactId:r.contactId==null?null:String(r.contactId)}));
}
/** Points a message at the activity that records its outcome (see {@link resolveMessageForWork}). */
export async function linkMessageActivity(e:Executor,messageId:string,activityId:string){await sql`UPDATE crm_messages SET activity_id=${activityId} WHERE id=${messageId}::uuid`.execute(e);}
export async function mutateCommunication(db:Kysely<DB>,input:CommunicationMutation,user:User){
 if(input.action==='inbound_reply')return sendInboundReply(db,input,user);
 if(input.action==='dispatch')return dispatch(db,input,user);
 return db.transaction().execute(async e=>{
 await setWorkActor(e,user);
 // Serialize against fusion and concurrent contact restrictions: merges are excluded, and the affected business row is the mutex.
 await lockCommunication(e,communicationScope(input));
 if(input.action==='prepare')return prepare(e,input,user);
 if(input.action==='prepare_general')return prepareGeneral(e,input,user);
 if(input.action==='manual_start')return startManual(e,input,user);
 if(input.action==='response_create')return createResponse(e,input,user);
 if(input.action==='inbound_register'){
  const row=(await sql<any>`SELECT * FROM crm_inbound_messages WHERE id=${input.inboundId}::uuid FOR UPDATE`.execute(e)).rows[0];if(!row||!row.accountId)throw new Error('Email entrante inexistente');
  if(row.status==='registered'&&row.responseId){await communicationContext(e,String(row.accountId),row.leadId==null?null:String(row.leadId),user,false);return {id:String(row.responseId),duplicate:true};}
  if(row.status!=='pending_review')throw new CommunicationConflict('Este email ya no está pendiente de revisión.');
  const created=await createResponse(e,{action:'response_create',id:input.id,accountId:String(row.accountId),leadId:row.leadId==null?null:String(row.leadId),contactId:row.contactId==null?null:String(row.contactId),channel:row.channel==='whatsapp'?'whatsapp':'email',recipient:String(row.fromAddress),recipientName:String(row.fromName||row.fromAddress),destination:String(row.fromAddress),linkedMessageId:row.linkedMessageId??null,category:input.category,summary:input.summary,exactText:String(row.textBody||'').slice(0,50000),otherDetail:input.otherDetail,confirmDoNotContact:input.confirmDoNotContact,closeLeadIds:[],reminder:null},user);
  await sql`UPDATE crm_inbound_messages SET status='registered',response_id=${created.id}::uuid,updated_at=now() WHERE id=${input.inboundId}::uuid`.execute(e);
  await communicationJournal(e,{accountId:String(row.accountId),leadId:row.leadId==null?null:String(row.leadId),entityType:'inbound',entityId:input.inboundId,action:'inbound_registered',actor:user,after:{status:'registered',responseId:created.id}});return created;
 }
 if(input.action==='inbound_dismiss'){
  const row=(await sql<any>`SELECT * FROM crm_inbound_messages WHERE id=${input.inboundId}::uuid FOR UPDATE`.execute(e)).rows[0];if(!row||!row.accountId)throw new Error('Email entrante inexistente');
  if(row.status!=='pending_review')throw new CommunicationConflict('Este email ya no está pendiente de revisión.');
  await communicationContext(e,String(row.accountId),row.leadId==null?null:String(row.leadId),user,true);
  await sql`UPDATE crm_inbound_messages SET status='dismissed',updated_at=now() WHERE id=${input.inboundId}::uuid`.execute(e);
  await communicationJournal(e,{accountId:String(row.accountId),leadId:row.leadId==null?null:String(row.leadId),entityType:'inbound',entityId:input.inboundId,action:'inbound_dismissed',actor:user,after:{status:'dismissed',reason:input.reason}});return {ok:true};
 }
 if(input.action==='response_correct')return correctResponse(e,input,user);
 if(input.action==='manual_complete'){
  const m=await messageFor(e,input.id,user,true);if(m.status!=='manual_pending')throw new CommunicationConflict('Este intento ya fue completado.');
  if(!input.summary.trim())throw new Error('El resumen es obligatorio.');
  await sql`UPDATE crm_messages SET status=${input.result},summary=${input.summary},completed_at=now(),completed_by_email=${user.email},revision=revision+1,updated_at=now() WHERE id=${m.id}::uuid`.execute(e);
  if(input.result==='manual_sent')await markClientForCare(e,m,user);
  await communicationJournal(e,{accountId:String(m.accountId),leadId:m.leadId,entityType:'interaction',entityId:m.id,action:'contact_completed',actor:user,before:{status:m.status},after:{status:input.result,summary:input.summary}});
  return (await sql<Message>`SELECT * FROM crm_messages WHERE id=${m.id}::uuid`.execute(e)).rows[0];
 }
 if(input.action==='interaction_correct'){
  const m=await messageFor(e,input.id,user,true);
  const validStatuses=m.channel==='whatsapp'?['manual_sent','manual_not_done']:['manual_sent','manual_no_contact','manual_not_done'];
  if(!validStatuses.includes(m.status))throw new CommunicationConflict('Solo se pueden corregir intentos manuales ya completados.');
  if(m.channel==='email')throw new CommunicationConflict('El estado del Email se determina con la evidencia de Brevo.');
  const {account}=await communicationContext(e,String(m.accountId),m.leadId==null?null:String(m.leadId),user,false);
  const before={status:m.status,summary:m.summary};const summary=input.summary.trim()||m.summary||'';const after={status:input.result,summary};
  await sql`INSERT INTO crm_communication_interaction_corrections(message_id,account_id,lead_id,actor_email,reason,before_value,after_value) VALUES(${m.id}::uuid,${account.id},${m.leadId},${user.email},${input.reason},${json(before)}::text::jsonb,${json(after)}::text::jsonb)`.execute(e);
  await sql`UPDATE crm_messages SET status=${input.result},summary=${summary},last_interaction_at=now(),last_actor_email=${user.email},revision=revision+1,updated_at=now() WHERE id=${m.id}::uuid`.execute(e);
  if(input.result==='manual_sent')await markClientForCare(e,m,user);
  await communicationJournal(e,{accountId:String(m.accountId),leadId:m.leadId,entityType:'interaction',entityId:m.id,action:'interaction_corrected',actor:user,before,after:{...after,correctionReason:input.reason}});
  return (await sql<Message>`SELECT * FROM crm_messages WHERE id=${m.id}::uuid`.execute(e)).rows[0];
 }
  if(input.action==='cancel_draft')return cancelDraft(e,input,user);
 if(input.action==='edit'){
  const m=await messageFor(e,input.id,user,true);if(m.status!=='draft'||m.revision!==input.revision)throw new CommunicationConflict('El borrador cambió o ya fue utilizado.');
  await assertAccountContactAllowed(e,String(m.accountId),m.leadId==null?null:String(m.leadId),m.contactId==null?null:String(m.contactId),m.channel);
  const updated={...m,subject:input.subject.trim(),body:input.body};if(m.channel==='email'&&!updated.subject)throw new Error('Asunto obligatorio');if(!input.body.trim())throw new Error('Mensaje vacío');if([...unresolvedTemplateVariables(updated.subject),...unresolvedTemplateVariables(input.body)].length)throw new Error('Completá o quitá las variables pendientes del asunto y del mensaje antes de guardar.');
  // Content is sanitized separately before preview and sending.
  const body=m.channel==='email'?sanitizeEmail(input.body):input.body;
  const final=await renderFinal(e,{...updated,body},user);
  return (await sql<Message>`UPDATE crm_messages SET subject=${updated.subject},body=${body},html_body=${m.channel==='email'?final.htmlBody:null},text_body=${m.channel==='email'?final.textBody:body},revision=revision+1,updated_at=now() WHERE id=${m.id}::uuid RETURNING *`.execute(e)).rows[0];
 }
 if(input.action==='outcome'){
  const m=await messageFor(e,input.id,user,true);
  if(['manual_sent','manual_not_sent'].includes(input.event)&&(m.channel!=='whatsapp'||m.status!=='whatsapp_opened'))throw new Error('Solo podés resolver un intento de WhatsApp No confirmado.');
  if(input.event!=='manual_sent'&&['draft','cancelled'].includes(m.status))throw new Error('El mensaje todavía no fue utilizado');
  if(input.event==='manual_sent')await assertAccountContactAllowed(e,String(m.accountId),m.leadId==null?null:String(m.leadId),m.contactId==null?null:String(m.contactId),m.channel);
  const status=input.event==='replied'?'replied':input.event==='rejected'?'rejected':input.event==='manual_not_sent'?'manual_not_done':'manual_sent';
  await sql`UPDATE crm_messages SET status=${status},last_interaction_at=now(),last_actor_email=${user.email},revision=revision+1,updated_at=now() WHERE id=${m.id}::uuid`.execute(e);
  const aid=await activity(e,m,user,input.event==='replied'?'Respuesta registrada manualmente':input.event==='rejected'?'Rechazo registrado manualmente':input.event==='manual_not_sent'?'WhatsApp marcado como no enviado':'Envío confirmado manualmente');
  await e.updateTable('crmActivities').set({typeId:'message',notes:input.notes,updatedAt:new Date()}).where('id','=',aid).where('outcome','is',null).execute();
  if(m.taskId&&input.event==='manual_sent')await e.updateTable('crmTasks').set({status:'completed',completedAt:new Date(),result:'Envío confirmado manualmente',updatedAt:new Date()}).where('id','=',m.taskId).where('status','=','pending').execute();
  if(input.event==='manual_sent')await markClientForCare(e,m,user);
  await communicationJournal(e,{accountId:String(m.accountId),leadId:m.leadId,entityType:'interaction',entityId:m.id,action:'contact_resolved',actor:user,before:{status:m.status},after:{status,notes:input.notes}});
  return {message:(await sql<Message>`SELECT * FROM crm_messages WHERE id=${m.id}::uuid`.execute(e)).rows[0]};
 }
 if(input.action==='restrict'){
  if(user.role!=='admin')throw new CommunicationForbidden('Solo un administrador puede registrar restricciones técnicas manuales.');
  let accountId=input.accountId??null;let leadId=input.leadId??null;
  if(leadId){const {account}=await communicationContext(e,String(accountId??(await leadFor(e,leadId,user,false)).lead.accountId),leadId,user,false);accountId=String(account.id);}
  if(!accountId)throw new Error('Elegí el negocio de la restricción.');
  const {account}=await communicationContext(e,accountId,null,user,false);
  if(input.contactId)await e.selectFrom('crmContacts').select('id').where('id','=',input.contactId).where('accountId','=',account.id).where('deletedAt','is',null).executeTakeFirstOrThrow();
  const created=await sql<{id:string}>`INSERT INTO crm_contact_restrictions(account_id,lead_id,contact_id,channel,reason,actor_email,source,evidence) VALUES(${account.id},NULL,${input.contactId},${input.channel},${input.reason},${user.email},'manual',${input.reason}) RETURNING id`.execute(e);
  await communicationJournal(e,{accountId:String(account.id),leadId:null,entityType:'restriction',entityId:created.rows[0].id,action:'technical_restriction_added',actor:user,after:{channel:input.channel,contactId:input.contactId,reason:input.reason,source:'manual',evidence:input.reason}});
  return {ok:true};
 }
 if(input.action==='lift'){
  if(user.role!=='admin')throw new CommunicationForbidden('Solo admin puede levantar una restricción');
  const row=(await sql<any>`UPDATE crm_contact_restrictions SET lifted_at=now(),lifted_by=${user.email},lift_reason=${input.reason} WHERE id=${input.id} AND lifted_at IS NULL RETURNING *`.execute(e)).rows[0];if(row)await communicationJournal(e,{accountId:String(row.accountId),leadId:row.leadId==null?null:String(row.leadId),entityType:'restriction',entityId:String(row.id),action:'technical_restriction_lifted',actor:user,before:{channel:row.channel,reason:row.reason},after:{liftReason:input.reason}});return {ok:true};
 }

 });
}
// Allow only formatting supported by the editor; strip all other attributes/tags.
export function sanitizeEmail(source:string){return source.replace(/<(script|style|iframe|object)[\s\S]*?<\/\1\s*>/gi,'').replace(/<\/?([a-z0-9]+)\b[^>]*>/gi,(tag,name)=>{const n=String(name).toLowerCase();if(!['p','br','strong','b','em','i','s','u','ul','ol','li','blockquote','h1','h2','h3','hr','a'].includes(n))return '';if(tag.startsWith('</'))return '</'+n+'>';if(n==='a'){const match=tag.match(/href\s*=\s*["']([^"']*)["']/i);let href='';try{const u=new URL(match?.[1]??'');if(['https:','http:','mailto:'].includes(u.protocol))href=u.href.replaceAll('"','&quot;');}catch{}return href?'<a href="'+href+'">':'<a>'; }return '<'+n+'>';});}
async function dispatch(database:Kysely<DB>,input:Extract<CommunicationMutation,{action:'dispatch'}>,user:User){
 const claimed=await database.transaction().execute(async e=>{
  await setWorkActor(e,user);await lockCommunication(e,messageScope(input.id));
  const m=await messageFor(e,input.id,user,true);
  if(m.status!=='draft'){if(['submitting','unknown'].includes(m.status))throw new CommunicationConflict('Envío en curso o resultado incierto. No se reenvía: reconciliá con Brevo.');return {message:m,replay:true};}
  if(m.revision!==input.revision||!m.body.trim()||(m.channel==='email'&&(!m.htmlBody||!m.subject)))throw new CommunicationConflict('Guardá y revisá la vista previa final antes de enviar');
  await assertAccountContactAllowed(e,String(m.accountId),m.leadId==null?null:String(m.leadId),m.contactId==null?null:String(m.contactId),m.channel);
  const {account,lead}=await communicationContext(e,String(m.accountId),m.leadId==null?null:String(m.leadId),user,false);let currentValue:string;if(lead){const target=await resolveCommercialContact(e,lead,m.contactId);currentValue=String(m.channel==='email'?target.email:target.phone??'').trim();}else currentValue=(await channelTarget(e,account,null,m.contactId==null?null:String(m.contactId),m.channel as 'email'|'whatsapp')).value.trim();if(currentValue!==m.recipient)throw new CommunicationConflict('Cambió el canal del contacto. Prepará un nuevo borrador.');
  if(m.channel==='email'&&!z.string().email().safeParse(m.recipient).success)throw new Error('Email inválido');

  if(m.channel==='whatsapp'){
   const normalized=normalizeField('telefono',m.recipient);const phone=normalized.normalized?.replace(/\D/g,'')??'';if(normalized.validity!=='valid'||phone.length<10||phone.length>15)throw new Error('Revisá el teléfono con código de país');
   await sql`UPDATE crm_messages SET status='whatsapp_opened',last_interaction_at=now(),last_actor_email=${user.email},revision=revision+1,updated_at=now() WHERE id=${m.id}::uuid`.execute(e);await activity(e,m,user,'WhatsApp abierto · envío no confirmado');await communicationJournal(e,{accountId:String(m.accountId),leadId:m.leadId,entityType:'interaction',entityId:m.id,action:'whatsapp_opened_unconfirmed',actor:user,before:{status:m.status},after:{status:'whatsapp_opened',recipient:m.recipient,recipientName:m.recipientName,content:m.body}});return {message:{...m,status:'whatsapp_opened'},replay:false};
  }
  if(!process.env.BREVO_API_KEY)throw new Error('BREVO_API_KEY no configurada');
  const settings=await e.selectFrom('appSettings').selectAll().where('key','in',['brevo_sender_name','brevo_sender_email','brevo_reply_to_email']).execute();const cfg=Object.fromEntries(settings.map(s=>[s.key,s.value]));const su=await e.selectFrom('users').select('senderEmail').where('id','=',user.id).executeTakeFirstOrThrow();const senderEmail=su.senderEmail?.trim()||cfg.brevo_sender_email;if(!senderEmail)throw new Error('Remitente Brevo no configurado');
  const out=await e.insertInto('emailOutbox').values({leadId:m.leadId,templateId:m.templateSnapshot?.id??null,recipientEmail:m.recipient,recipientName:m.recipientName||null,senderEmail,senderName:su.senderEmail?user.displayName:cfg.brevo_sender_name||'Hospeda',replyToEmail:su.senderEmail||cfg.brevo_reply_to_email||null,subject:m.subject,htmlBody:m.htmlBody!,textBody:m.textBody!,status:'submitting',attempts:1,requestedByUserId:user.id,requestedByEmail:user.email,requestedByName:user.displayName}).returningAll().executeTakeFirstOrThrow();
  await sql`UPDATE email_outbox SET request_key=${m.id}::uuid WHERE id=${out.id}`.execute(e);
  await sql`UPDATE crm_messages SET status='submitting',outbox_id=${out.id},last_interaction_at=now(),last_actor_email=${user.email},revision=revision+1,updated_at=now() WHERE id=${m.id}::uuid`.execute(e);
  await communicationJournal(e,{accountId:String(m.accountId),leadId:m.leadId,entityType:'interaction',entityId:m.id,action:'email_submission_started',actor:user,before:{status:m.status},after:{status:'submitting',outboxId:out.id,recipient:m.recipient,recipientName:m.recipientName,subject:m.subject,content:m.textBody||m.body}});
  return {message:{...m,outboxId:out.id},outbox:out,replay:false};
 });
 const m=claimed.message;
 if(claimed.replay)return {message:m};
 if(m.channel==='whatsapp'){const url=new URL('https://wa.me/'+normalizeField('telefono',m.recipient).normalized!.replace(/\D/g,''));url.searchParams.set('text',m.body);return {message:m,url:url.toString()};}
 const out=claimed.outbox!;let accepted=false;
 try{
  const r=await fetch('https://api.brevo.com/v3/smtp/email',{method:'POST',signal:AbortSignal.timeout(20000),headers:{'api-key':process.env.BREVO_API_KEY!,'Content-Type':'application/json',accept:'application/json'},body:JSON.stringify({sender:{email:out.senderEmail,name:out.senderName},to:[{email:m.recipient,...(m.recipientName?{name:m.recipientName}:{})}],...(out.replyToEmail?{replyTo:{email:out.replyToEmail}}:{}),subject:m.subject,htmlContent:m.htmlBody,textContent:m.textBody,tags:['hospeda-'+m.id],headers:{'X-Mailin-custom':'hospeda_outbox:'+out.id}})});
  if(!r.ok){const reason=(await r.text()).slice(0,2000);await database.transaction().execute(async e=>{await lockCommunication(e,messageScope(m.id));await setWorkActor(e,user);await sql`UPDATE email_outbox SET status='error',last_error=${reason},updated_at=now() WHERE id=${out.id}`.execute(e);await sql`UPDATE crm_messages SET status=CASE WHEN status IN ('replied','rejected') THEN status ELSE 'failed' END,updated_at=now() WHERE id=${m.id}::uuid`.execute(e);await activity(e,m,user,'Rechazo de Brevo');await communicationJournal(e,{accountId:String(m.accountId),leadId:m.leadId,entityType:'interaction',entityId:m.id,action:'brevo_rejected',actor:user,before:{status:'submitting'},after:{status:'failed',reason}});});return {message:(await sql<Message>`SELECT * FROM crm_messages WHERE id=${m.id}::uuid`.execute(database)).rows[0],error:'Brevo rechazó el envío'};}
  accepted=true;const data=await r.json() as {messageId?:string};const messageId=data.messageId??null;
  await database.transaction().execute(async e=>{await lockCommunication(e,messageScope(m.id));await setWorkActor(e,user);await sql`UPDATE email_outbox SET status='accepted',message_id=${messageId},sent_at=now(),updated_at=now() WHERE id=${out.id}`.execute(e);await sql`UPDATE crm_messages SET status=CASE WHEN status IN ('replied','rejected') THEN status ELSE 'accepted' END,updated_at=now() WHERE id=${m.id}::uuid`.execute(e);await activity(e,m,user,'Email aceptado por proveedor · entrega no confirmada');await markClientForCare(e,m,user);await communicationJournal(e,{accountId:String(m.accountId),leadId:m.leadId,entityType:'interaction',entityId:m.id,action:'brevo_accepted',actor:user,after:{status:'accepted',deliveryConfirmed:false}});if(m.taskId)await e.updateTable('crmTasks').set({status:'completed',completedAt:new Date(),result:'Aceptado por proveedor',updatedAt:new Date()}).where('id','=',m.taskId).where('status','=','pending').execute();await reconcileEvents(e,out.id);});
  return {message:(await sql<Message>`SELECT * FROM crm_messages WHERE id=${m.id}::uuid`.execute(database)).rows[0]};
 }catch(error){
  // Never turn a post-acceptance error into permission to resend. A crashed process also leaves submitting.
  try{await database.transaction().execute(async e=>{await setWorkActor(e,user);const updated=await sql<{id:string}>`UPDATE crm_messages SET status='unknown',updated_at=now() WHERE id=${m.id}::uuid AND status='submitting' RETURNING id`.execute(e);await sql`UPDATE email_outbox SET status='unknown',last_error=${accepted?'Proveedor aceptó; reconciliar resultado':String(error).slice(0,1000)},updated_at=now() WHERE id=${out.id} AND status='submitting'`.execute(e);if(updated.rows[0])await communicationJournal(e,{accountId:String(m.accountId),leadId:m.leadId,entityType:'interaction',entityId:m.id,action:'email_result_uncertain',actor:user,before:{status:'submitting'},after:{status:'unknown',providerMayHaveAccepted:accepted}});});}catch{}
  throw new CommunicationConflict('Resultado incierto. No se reenvía este mensaje: revisar los logs y eventos de Brevo.');
 }
}
export async function reconcileEvents(e:Executor,outboxId:string){
 const out=await e.selectFrom('emailOutbox').selectAll().where('id','=',outboxId).executeTakeFirstOrThrow();
 await sql`UPDATE crm_email_events SET outbox_id=${outboxId} WHERE outbox_id IS NULL AND trim(both '<>' from message_id)=trim(both '<>' from ${out.messageId??''}) AND lower(recipient)=lower(${out.recipientEmail})`.execute(e);
 const events=(await sql<{event:string;occurredAt:Date}>`SELECT event,occurred_at FROM crm_email_events WHERE outbox_id=${outboxId} ORDER BY occurred_at,event`.execute(e)).rows;
 const terminal=events.filter(v=>['delivered','hard_bounce','soft_bounce','blocked','invalid_email','error'].includes(v.event)).at(-1);
 const beforeMessage=(await sql<Message>`SELECT * FROM crm_messages WHERE outbox_id=${outboxId}`.execute(e)).rows[0];
 if(terminal){const status=terminal.event==='delivered'?'delivery_confirmed':'failed';await sql`UPDATE email_outbox SET status=${status},updated_at=now() WHERE id=${outboxId}`.execute(e);await sql`UPDATE crm_messages SET status=${status},updated_at=now() WHERE outbox_id=${outboxId} AND status NOT IN ('replied','rejected')`.execute(e);if(beforeMessage&&!['replied','rejected'].includes(beforeMessage.status)&&beforeMessage.status!==status)await communicationJournal(e,{accountId:String(beforeMessage.accountId),leadId:beforeMessage.leadId,entityType:'interaction',entityId:beforeMessage.id,action:'brevo_event_'+terminal.event,actor:null,automatic:true,triggeredBy:'brevo-webhook',before:{status:beforeMessage.status},after:{status,evidence:terminal.event}});}
 const message=(await sql<Message>`SELECT * FROM crm_messages WHERE outbox_id=${outboxId}`.execute(e)).rows[0];
 if(message&&terminal&&['hard_bounce','invalid_email'].includes(terminal.event)){
  const inserted=await sql<{id:string}>`INSERT INTO crm_contact_restrictions(account_id,lead_id,contact_id,channel,reason,actor_email,source,evidence) SELECT ${message.accountId},${message.leadId},${message.contactId},'email',${'Falla permanente confirmada por Brevo: '+terminal.event},'brevo-webhook','automatic',${JSON.stringify({event:terminal.event,outboxId,occurredAt:terminal.occurredAt})} WHERE NOT EXISTS(SELECT 1 FROM crm_contact_restrictions WHERE account_id=${message.accountId} AND lead_id IS NOT DISTINCT FROM ${message.leadId}::bigint AND contact_id IS NOT DISTINCT FROM ${message.contactId}::bigint AND channel='email' AND lifted_at IS NULL) RETURNING id`.execute(e);
  if(inserted.rows[0])await communicationJournal(e,{accountId:String(message.accountId),leadId:message.leadId,entityType:'restriction',entityId:inserted.rows[0].id,action:'technical_restriction_added',actor:null,automatic:true,triggeredBy:'brevo-webhook',after:{channel:'email',contactId:message.contactId,reason:terminal.event,source:'automatic',evidence:outboxId}});
 }
 if(message&&terminal?.event==='delivered'){
  const lifted=await sql<{id:string;reason:string}>`UPDATE crm_contact_restrictions SET lifted_at=now(),lifted_by='brevo-webhook',lift_reason='Recuperación confirmada por entrega de Brevo' WHERE account_id=${message.accountId} AND lead_id IS NOT DISTINCT FROM ${message.leadId}::bigint AND contact_id IS NOT DISTINCT FROM ${message.contactId}::bigint AND channel='email' AND source='automatic' AND lifted_at IS NULL RETURNING id,reason`.execute(e);
  for(const restriction of lifted.rows)await communicationJournal(e,{accountId:String(message.accountId),leadId:message.leadId,entityType:'restriction',entityId:restriction.id,action:'technical_restriction_lifted',actor:null,automatic:true,triggeredBy:'brevo-webhook',before:{reason:restriction.reason},after:{evidence:'delivery_confirmed'}});
 }
 if(message&&!message.activityId&&terminal&&message.leadId){const lead=await e.selectFrom('leads').selectAll().where('id','=',message.leadId).where('deletedAt','is',null).executeTakeFirst();if(lead){const a=await e.insertInto('crmActivities').values({accountId:lead.accountId,leadId:lead.id,typeId:'message',title:'Evento email reconciliado',channel:'email',result:terminal.event==='delivered'?'Entrega confirmada por Brevo':'Rebote/fallo: '+terminal.event,occurredAt:terminal.occurredAt,contactIds:message.contactId?[message.contactId]:[],participants:message.recipientName,actorEmail:'brevo-webhook',notes:'Snapshot de mensaje #'+message.id}).returning('id').executeTakeFirstOrThrow();await sql`UPDATE crm_messages SET activity_id=${a.id} WHERE id=${message.id}::uuid`.execute(e);}}
 if(message?.activityId&&terminal&&!['replied','rejected'].includes(message.status))await e.updateTable('crmActivities').set({result:terminal.event==='delivered'?'Entrega confirmada por Brevo':'Rebote/fallo: '+terminal.event,updatedAt:new Date()}).where('id','=',message.activityId).where('outcome','is',null).execute();
}
