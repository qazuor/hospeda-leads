import {templateCompatibility} from './messageTemplatePolicy';
import {assertAccountReadable,assertAccountWritable,assertLeadAccess} from './crmPermissions';
import {createHash} from 'node:crypto';
import {sql,type Kysely,type Transaction} from 'kysely';
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
type Executor=Kysely<DB>|Transaction<DB>;
export class CommunicationForbidden extends Error{}
export class CommunicationConflict extends Error{}
export const digest=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const json=(v:unknown)=>JSON.stringify(v);
async function templateOwnerName(e:Executor,email:string|null|undefined,user:User){
 if(!email)return user.fullName?.trim()||user.displayName;
 const owner=await e.selectFrom('users').select(['displayName','fullName']).where('email','=',email).executeTakeFirst();
 return owner?.fullName?.trim()||owner?.displayName||user.displayName;
}
export async function lockCommunication(e:Executor){await sql`LOCK TABLE crm_accounts,leads,crm_contact_restrictions,crm_messages IN SHARE ROW EXCLUSIVE MODE`.execute(e);}
export async function communicationConfig(e:Executor){const r=await e.selectFrom('appSettings').select('value').where('key','=','crm_communication').executeTakeFirstOrThrow();return z.object({recentContactHours:z.number().int().min(1).max(720),maxDocumentBytes:z.number().int().min(1).max(2097152)}).parse(JSON.parse(r.value));}
export async function leadFor(e:Executor,id:string,user:User,write=true){const l=await e.selectFrom('leads').selectAll().where('id','=',id).where('deletedAt','is',null).executeTakeFirstOrThrow();const a=await e.selectFrom('crmAccounts').selectAll().where('id','=',l.accountId).where('mergedIntoId','is',null).executeTakeFirstOrThrow();assertAccountReadable(user,a);if(write)await assertLeadAccess(e,String(l.id),user,true);return {lead:l,account:a};}
async function communicationContext(e:Executor,accountId:string,leadId:string|null,user:User,write:boolean){
 const account=await e.selectFrom('crmAccounts').selectAll().where('id','=',accountId).where('mergedIntoId','is',null).executeTakeFirstOrThrow();assertAccountReadable(user,account);
 if(account.deletedAt)throw new CommunicationForbidden('El negocio está en la papelera.');
 if(!leadId){if(write)assertAccountWritable(user,account);return {account,lead:null};}
 const lead=await e.selectFrom('leads').selectAll().where('id','=',leadId).where('accountId','=',accountId).executeTakeFirstOrThrow();
 if(lead.deletedAt)throw new CommunicationForbidden('La gestión está en la papelera.');
 if(write)await assertLeadAccess(e,leadId,user,true);
 return {account,lead};
}
async function communicationJournal(e:Executor,v:{accountId:string;leadId:string|null;entityType:string;entityId:string;action:string;actor:User|null;automatic?:boolean;triggeredBy?:string|null;before?:unknown;after?:unknown;relatedEventId?:string|null}){
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
 const changed=await withAutomaticStateChange(e,'care_contact',()=>sql<{id:string}>`UPDATE crm_accounts SET is_client=true,updated_at=now() WHERE id=${m.accountId} AND is_client=false RETURNING id`.execute(e));
 if(changed.rows.length)await communicationJournal(e,{accountId:String(m.accountId),leadId:m.leadId,entityType:'business',entityId:String(m.accountId),action:'client_marked_by_care_contact',actor:null,automatic:true,triggeredBy:user.email,before:{isClient:false},after:{isClient:true,interactionId:m.id}});
}
async function assertAccountContactAllowed(e:Executor,accountId:string,leadId:string|null,contactId:string|null,channel:string){
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
async function prepare(e:Executor,input:Extract<CommunicationMutation,{action:'prepare'}>,user:User){
 const existing=(await sql<Message>`SELECT * FROM crm_messages WHERE id=${input.id}::uuid`.execute(e)).rows[0];if(existing){await messageFor(e,input.id,user);return existing;}
 const {lead,account}=await leadFor(e,input.leadId,user);
 if(account.status==='new')throw new CommunicationForbidden('En estado Nuevo solo se permite el contacto general de verificación.');
 await assertAccountContactAllowed(e,String(account.id),String(lead.id),input.contactId,input.channel);
 const c=await resolveCommercialContact(e,lead,input.contactId);const recipient=(input.channel==='email'?c.email:c.phone)?.trim();if(!recipient)throw new Error('El contacto no tiene este canal');
 const t=input.templateId?await e.selectFrom('messageTemplates').selectAll().where('id','=',input.templateId).where('active','=',true).executeTakeFirstOrThrow():null;
 const incompatibility=t?templateCompatibility(t,{channel:input.channel,vertical:lead.tipo,commercialProfile:lead.commercialProfile,managementType:lead.managementType}):null;
 if(incompatibility)throw new Error(incompatibility);
 const reusable=(await sql<Message>`SELECT * FROM crm_messages WHERE lead_id=${lead.id} AND contact_id IS NOT DISTINCT FROM ${c.contactId}::bigint AND channel=${input.channel} AND recipient=${recipient} AND owner_email=${user.email} AND status='draft' AND (template_snapshot->>'id') IS NOT DISTINCT FROM ${input.templateId}::text ORDER BY updated_at DESC LIMIT 1 FOR UPDATE`.execute(e)).rows[0];if(reusable)return reusable;
 const ownerName=await templateOwnerName(e,lead.assignedUserEmail,user);const ctx={name:lead.nombre,contact:c.name,contact_name:c.name,city:lead.ciudad,type:lead.tipo,subtype:lead.subtipo,phone:c.phone,email:c.email,website:lead.sitioWeb,sender:ownerName,sender_short:ownerName};
 const rendered=t?renderMessageTemplateHtml(t.body,ctx):'<p></p>';
 const body=input.channel==='whatsapp'?htmlToWhatsApp(rendered).normalize('NFC'):rendered;
 const subject=t?renderMessageTemplate(t.subject??'',ctx):'';
 const snapshot=t?{...t,version:digest({body:t.body,subject:t.subject,updatedAt:t.updatedAt}),context:ctx}:null;
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
 const incompatible=t?templateCompatibility(t,{channel:input.channel,vertical:lead?.tipo??account.tipo,commercialProfile:lead?.commercialProfile??null,managementType:lead?.managementType??null}):null;if(incompatible)throw new Error(incompatible);
 const reusable=(await sql<Message>`SELECT * FROM crm_messages WHERE account_id=${account.id} AND lead_id IS NOT DISTINCT FROM ${input.leadId}::bigint AND contact_id IS NOT DISTINCT FROM ${target.contactId}::bigint AND channel=${input.channel} AND recipient=${target.value} AND owner_email=${user.email} AND status='draft' AND (template_snapshot->>'id') IS NOT DISTINCT FROM ${input.templateId}::text ORDER BY updated_at DESC LIMIT 1 FOR UPDATE`.execute(e)).rows[0];if(reusable)return reusable;
 const ownerName=await templateOwnerName(e,lead?.assignedUserEmail??account.assignedUserEmail,user);const ctx={name:account.nombre,contact:target.name,contact_name:target.name,city:lead?.ciudad??account.ciudad,type:lead?.tipo??account.tipo,subtype:lead?.subtipo??account.subtipo,phone:target.value,email:target.value,website:account.sitioWeb,sender:ownerName,sender_short:ownerName};
 const rendered=t?renderMessageTemplateHtml(t.body,ctx):'<p></p>';const body=input.channel==='whatsapp'?htmlToWhatsApp(rendered).normalize('NFC'):rendered;const subject=t?renderMessageTemplate(t.subject??'',ctx):'';const snapshot=t?{...t,version:digest({body:t.body,subject:t.subject,updatedAt:t.updatedAt}),context:ctx}:null;
 const created=(await sql<Message>`INSERT INTO crm_messages(id,account_id,original_account_id,lead_id,contact_id,channel,recipient,recipient_name,subject,body,template_snapshot,owner_email,purpose,other_purpose) VALUES(${input.id}::uuid,${account.id},${account.id},${input.leadId},${target.contactId},${input.channel},${target.value},${target.name},${subject},${body},${json(snapshot)}::text::jsonb,${user.email},${input.purpose},${input.otherPurpose}) RETURNING *`.execute(e)).rows[0];
 await communicationJournal(e,{accountId:String(account.id),leadId:input.leadId,entityType:'interaction',entityId:created.id,action:'draft_prepared',actor:user,after:{channel:input.channel,purpose:input.purpose,recipient:target.value}});return created;
}
async function closeForDoNotContact(e:Executor,account:any,selectedIds:string[],user:User,responseId:string,leadId:string|null){
 const requested=[...new Set(selectedIds)];
 let closedAny=false;
 if(requested.length){
  const open=(await sql<{id:string;management_type:string|null;estado:string;assigned_user_email:string|null}>`SELECT l.id,l.management_type,l.estado,l.assigned_user_email FROM leads l JOIN crm_stages s ON s.name=l.estado WHERE l.account_id=${account.id} AND l.deleted_at IS NULL AND s.classification='open' AND l.id=ANY(${requested}::bigint[]) FOR UPDATE OF l`.execute(e)).rows;
  if(open.length!==requested.length)throw new CommunicationConflict('Una o más gestiones seleccionadas ya no están abiertas. Actualizá el detalle y volvé a intentarlo.');
  if(open.some(item=>!item.management_type))throw new CommunicationConflict('Una gestión histórica seleccionada requiere un cierre manual desde el pipeline.');
  if(open.some(item=>user.role!=='admin'&&item.assigned_user_email!==user.email))throw new CommunicationForbidden('Solo podés cerrar las gestiones que tenés asignadas.');
  await sql`SELECT set_config('crm.close_related_management','true',true)`.execute(e);
  for(const item of open){
   const type=item.management_type!;
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
  await withAutomaticStateChange(e,'do_not_contact_response',()=>sql`UPDATE crm_accounts SET status='archived',archived_at=coalesce(archived_at,now()),updated_at=now() WHERE id=${account.id}`.execute(e));
  await communicationJournal(e,{accountId:String(account.id),leadId,entityType:'business',entityId:String(account.id),action:'business_archived_by_do_not_contact',actor:null,automatic:true,triggeredBy:user.email,after:{status:'archived',responseId}});
 }
}
async function createResponse(e:Executor,input:Extract<CommunicationMutation,{action:'response_create'}>,user:User){
 const {account,lead}=await communicationContext(e,input.accountId,input.leadId,user,false);
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
  if(input.category!=='later')throw new Error('El recordatorio solo aplica a “Quiere retomar más adelante”.');
  const parsed=new Date(input.reminder.dueDate+'T00:00:00Z');if(Number.isNaN(parsed.valueOf())||parsed.toISOString().slice(0,10)!==input.reminder.dueDate)throw new Error('Fecha de recordatorio inválida.');
  const contextOwner=lead?.assignedUserEmail??account.assignedUserEmail;
  if(user.role!=='admin'&&user.email!==contextOwner)throw new CommunicationForbidden('Solo el responsable del contexto o un administrador puede crear este recordatorio.');
  const assignee=input.reminder.assignedUserEmail??contextOwner??user.email;
  if(user.role!=='admin'&&assignee!==contextOwner)throw new CommunicationForbidden('Solo administración puede reasignar este recordatorio.');
  await e.selectFrom('users').select('email').where('email','=',assignee).executeTakeFirstOrThrow();
  const task=await sql<{id:string}>`INSERT INTO crm_tasks(account_id,lead_id,title,type_id,purpose,due_date,assigned_user_email,priority,communication_response_id) VALUES(${account.id},${input.leadId},'Retomar conversación','followup','reactivation',${input.reminder.dueDate}::date,${assignee},'media',${responseId}::uuid) RETURNING id`.execute(e);
  await communicationJournal(e,{accountId:String(account.id),leadId:input.leadId,entityType:'response',entityId:responseId,action:'response_reminder_created',actor:user,after:{taskId:task.rows[0].id,dueDate:input.reminder.dueDate,assignedUserEmail:assignee}});
 }
 if(input.category==='do_not_contact'){
  if(!account.doNotContact){await withAutomaticStateChange(e,'do_not_contact_response',()=>sql`UPDATE crm_accounts SET do_not_contact=true,updated_at=now() WHERE id=${account.id}`.execute(e));await communicationJournal(e,{accountId:String(account.id),leadId:input.leadId,entityType:'business',entityId:String(account.id),action:'do_not_contact_activated',actor:null,automatic:true,triggeredBy:user.email,after:{doNotContact:true,responseId}});}
  await closeForDoNotContact(e,account,input.closeLeadIds??[],user,responseId,input.leadId);
 }
 return {id:responseId};
}
async function correctResponse(e:Executor,input:Extract<CommunicationMutation,{action:'response_correct'}>,user:User){
 const row=(await sql<any>`SELECT * FROM crm_communication_responses WHERE id=${input.id}::uuid FOR UPDATE`.execute(e)).rows[0];if(!row)throw new Error('Respuesta inexistente');
 if(user.role!=='admin'&&row.actorEmail!==user.email)throw new CommunicationForbidden('Solo quien registró la respuesta o un admin puede corregirla.');
 const {account}=await communicationContext(e,String(row.accountId),row.leadId==null?null:String(row.leadId),user,false);
 if(input.category==='other'&&!input.otherDetail?.trim())throw new Error('Aclaración obligatoria para Otra respuesta.');
 if(row.category==='do_not_contact'&&input.category!=='do_not_contact'&&!input.confirmLiftDoNotContact)throw new CommunicationConflict('Confirmá que querés habilitar nuevamente los contactos.');
 if(row.category!=='do_not_contact'&&input.category==='do_not_contact'&&!input.confirmDoNotContact)throw new CommunicationConflict('Confirmá que querés bloquear todos los contactos del negocio.');
 const before={category:row.category,summary:row.summary,exactText:row.exactText,otherDetail:row.otherDetail};const after={category:input.category,summary:input.summary,exactText:input.exactText,otherDetail:input.otherDetail};
 await sql`INSERT INTO crm_communication_response_corrections(response_id,account_id,lead_id,actor_email,reason,before_value,after_value) VALUES(${input.id}::uuid,${account.id},${row.leadId},${user.email},${input.reason},${json(before)}::text::jsonb,${json(after)}::text::jsonb)`.execute(e);
 await sql`UPDATE crm_communication_responses SET category=${input.category},summary=${input.summary},exact_text=${input.exactText},other_detail=${input.otherDetail},updated_at=now() WHERE id=${input.id}::uuid`.execute(e);
 const correctionJournalId=await communicationJournal(e,{accountId:String(account.id),leadId:row.leadId==null?null:String(row.leadId),entityType:'response',entityId:input.id,action:'response_corrected',actor:user,before,after:{...after,correctionReason:input.reason}});
 if(row.category!==input.category&&((row.category==='do_not_contact')||(input.category==='do_not_contact'))){const value=input.category==='do_not_contact';if(account.doNotContact!==value){await withAutomaticStateChange(e,'response_correction',()=>sql`UPDATE crm_accounts SET do_not_contact=${value},updated_at=now() WHERE id=${account.id}`.execute(e));await communicationJournal(e,{accountId:String(account.id),leadId:row.leadId==null?null:String(row.leadId),entityType:'business',entityId:String(account.id),action:value?'do_not_contact_activated':'do_not_contact_lifted',actor:null,automatic:true,triggeredBy:user.email,relatedEventId:correctionJournalId,before:{doNotContact:!value},after:{doNotContact:value,responseId:input.id}});}}
 if(input.category==='do_not_contact')await closeForDoNotContact(e,account,input.closeLeadIds??[],user,input.id,row.leadId==null?null:String(row.leadId));
 return {id:input.id};
}
async function startManual(e:Executor,input:Extract<CommunicationMutation,{action:'manual_start'}>,user:User){
 const {account,lead}=await communicationContext(e,input.accountId,input.leadId,user,true);
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
 if(template){const mismatch=templateCompatibility(template,{channel:input.channel,vertical:lead?.tipo??account.tipo,commercialProfile:lead?.commercialProfile??null,managementType:lead?.managementType??null});if(mismatch)throw new Error(mismatch);}
 if(input.templateId&&!template)throw new Error('El modelo fue desactivado o no existe.');
 if(template&&unresolvedTemplateVariables(input.body).length)throw new Error('Completá o quitá las variables pendientes antes de copiar el texto.');
 const contentHash=input.body?digest(input.body):null;
 if(input.channel!=='call'){
  const pending=(await sql<Message>`SELECT * FROM crm_messages WHERE account_id=${account.id} AND lead_id IS NOT DISTINCT FROM ${input.leadId}::bigint AND contact_id IS NOT DISTINCT FROM ${input.contactId}::bigint AND channel=${input.channel} AND recipient=${input.recipient} AND destination_detail IS NOT DISTINCT FROM ${dest} AND owner_email=${user.email} AND status='manual_pending' ORDER BY created_at DESC LIMIT 1 FOR UPDATE`.execute(e)).rows[0];
  if(pending){if(pending.contentHash===contentHash)return pending;throw new CommunicationConflict('Ya hay un intento pendiente para este destino. Marcá el anterior como No realizado antes de crear uno corregido.');}
 }
 const status=input.channel==='call'?input.result!:'manual_pending';
 const savedBody=input.channel==='call'||!template?'':input.body;
 const templateSnapshot=template?{...template,version:digest({body:template.body,subject:template.subject}),finalBody:input.body}:null;
 const created=(await sql<Message>`INSERT INTO crm_messages(id,account_id,original_account_id,lead_id,contact_id,channel,recipient,recipient_name,body,template_snapshot,owner_email,purpose,other_purpose,destination_detail,content_hash,summary,status,last_interaction_at,last_actor_email,completed_at,completed_by_email) VALUES(${input.id}::uuid,${account.id},${account.id},${input.leadId},${input.contactId},${input.channel},${input.recipient},${input.recipientName||recipient?.name||account.nombre},${savedBody},${templateSnapshot?json(templateSnapshot):null}::text::jsonb,${user.email},${input.purpose},${input.otherPurpose},${dest},${contentHash},${summary},${status},now(),${user.email},${input.channel==='call'?new Date():null},${input.channel==='call'?user.email:null}) RETURNING *`.execute(e)).rows[0];
 if(input.channel==='call'&&status==='manual_sent')await markClientForCare(e,created,user);
 await communicationJournal(e,{accountId:String(account.id),leadId:input.leadId,entityType:'interaction',entityId:created.id,action:input.channel==='call'?'contact_completed':'contact_started',actor:user,after:{channel:input.channel,status:created.status,purpose:input.purpose,recipient:created.recipient,recipientName:created.recipientName,destination:created.destinationDetail,content:created.templateSnapshot?.finalBody||created.body||null,summary:created.summary}});return created;
}
export async function renderFinal(e:Executor,m:Message,user:User){const {lead,account}=await communicationContext(e,String(m.accountId),m.leadId==null?null:String(m.leadId),user,false);const sender=user.fullName?.trim()||user.displayName;return {htmlBody:buildHospedaEmailHtml({bodyHtml:m.body,senderName:sender,subject:m.subject,vertical:lead?.tipo??account.tipo,commercialProfile:lead?.commercialProfile??null,logoUrl:(process.env.PUBLIC_APP_URL??'http://localhost:3001').replace(/\/$/,'')+'/hospeda-logo.jpg'}),textBody:buildHospedaEmailText({bodyText:htmlToPlainText(m.body),senderName:sender})};}
async function activity(e:Executor,m:Message,user:User,result:string){
 const {lead,account}=await communicationContext(e,String(m.accountId),m.leadId==null?null:String(m.leadId),user,false);
 const current=(await sql<{activityId:string|null;status:string}>`SELECT activity_id,status FROM crm_messages WHERE id=${m.id}::uuid`.execute(e)).rows[0];
 const existingId=current?.activityId??m.activityId;
 if(existingId){const providerResult=result.startsWith('Email aceptado')||result==='Rechazo de Brevo';if(!(providerResult&&['replied','rejected'].includes(current?.status??'')))await e.updateTable('crmActivities').set({result,updatedAt:new Date()}).where('id','=',existingId).execute();return existingId;}
 const a=await e.insertInto('crmActivities').values({accountId:account.id,leadId:lead?.id??null,typeId:m.channel==='whatsapp'?'other':'message',title:m.channel==='whatsapp'?'Comunicación WhatsApp':'Comunicación '+m.channel,channel:m.channel,result,occurredAt:new Date(),contactIds:m.contactId?[m.contactId]:[],participants:m.recipientName,actorEmail:user.email,notes:'Snapshot de mensaje #'+m.id}).returning('id').executeTakeFirstOrThrow();
 await sql`UPDATE crm_messages SET activity_id=${a.id} WHERE id=${m.id}::uuid`.execute(e);
 if(lead)await writeLeadJournal(e as Transaction<DB>,{leadId:String(lead.id),leadName:lead.nombre,actor:user,action:'contact_logged',metadata:{activityId:a.id,messageId:m.id,channel:m.channel,result,template:m.templateSnapshot?.name??null}});return a.id;
}
export async function mutateCommunication(db:Kysely<DB>,input:CommunicationMutation,user:User){
 if(input.action==='dispatch')return dispatch(db,input,user);
 return db.transaction().execute(async e=>{
 await setWorkActor(e,user);
 // Serialize against fusion and concurrent contact restrictions.
 await lockCommunication(e);
 if(input.action==='prepare')return prepare(e,input,user);
 if(input.action==='prepare_general')return prepareGeneral(e,input,user);
 if(input.action==='manual_start')return startManual(e,input,user);
 if(input.action==='response_create')return createResponse(e,input,user);
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
  if(input.action==='cancel_draft'){
  const m=await messageFor(e,input.id,user,true);if(m.status!=='draft'||m.revision!==input.revision)throw new CommunicationConflict('El borrador cambió o ya fue utilizado.');
  const cancelled=(await sql<Message>`UPDATE crm_messages SET status='cancelled',revision=revision+1,updated_at=now() WHERE id=${m.id}::uuid RETURNING *`.execute(e)).rows[0];
  await communicationJournal(e,{accountId:String(m.accountId),leadId:m.leadId,entityType:'interaction',entityId:m.id,action:'draft_cancelled',actor:user,before:{status:m.status},after:{status:'cancelled'}});return cancelled;
 }
 if(input.action==='edit'){
  const m=await messageFor(e,input.id,user,true);if(m.status!=='draft'||m.revision!==input.revision)throw new CommunicationConflict('El borrador cambió o ya fue utilizado.');
  await assertAccountContactAllowed(e,String(m.accountId),m.leadId==null?null:String(m.leadId),m.contactId==null?null:String(m.contactId),m.channel);
  const updated={...m,subject:input.subject.trim(),body:input.body};if(m.channel==='email'&&!updated.subject)throw new Error('Asunto obligatorio');if(!input.body.trim())throw new Error('Mensaje vacío');if(unresolvedTemplateVariables(input.body).length)throw new Error('Completá o quitá las variables pendientes antes de guardar.');
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
  await e.updateTable('crmActivities').set({typeId:'message',notes:input.notes,updatedAt:new Date()}).where('id','=',aid).execute();
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
  await setWorkActor(e,user);await lockCommunication(e);
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
  if(!r.ok){const reason=(await r.text()).slice(0,2000);await database.transaction().execute(async e=>{await lockCommunication(e);await setWorkActor(e,user);await sql`UPDATE email_outbox SET status='error',last_error=${reason},updated_at=now() WHERE id=${out.id}`.execute(e);await sql`UPDATE crm_messages SET status=CASE WHEN status IN ('replied','rejected') THEN status ELSE 'failed' END,updated_at=now() WHERE id=${m.id}::uuid`.execute(e);await activity(e,m,user,'Rechazo de Brevo');await communicationJournal(e,{accountId:String(m.accountId),leadId:m.leadId,entityType:'interaction',entityId:m.id,action:'brevo_rejected',actor:user,before:{status:'submitting'},after:{status:'failed',reason}});});return {message:(await sql<Message>`SELECT * FROM crm_messages WHERE id=${m.id}::uuid`.execute(database)).rows[0],error:'Brevo rechazó el envío'};}
  accepted=true;const data=await r.json() as {messageId?:string};const messageId=data.messageId??null;
  await database.transaction().execute(async e=>{await lockCommunication(e);await setWorkActor(e,user);await sql`UPDATE email_outbox SET status='accepted',message_id=${messageId},sent_at=now(),updated_at=now() WHERE id=${out.id}`.execute(e);await sql`UPDATE crm_messages SET status=CASE WHEN status IN ('replied','rejected') THEN status ELSE 'accepted' END,updated_at=now() WHERE id=${m.id}::uuid`.execute(e);await activity(e,m,user,'Email aceptado por proveedor · entrega no confirmada');await markClientForCare(e,m,user);await communicationJournal(e,{accountId:String(m.accountId),leadId:m.leadId,entityType:'interaction',entityId:m.id,action:'brevo_accepted',actor:user,after:{status:'accepted',deliveryConfirmed:false}});if(m.taskId)await e.updateTable('crmTasks').set({status:'completed',completedAt:new Date(),result:'Aceptado por proveedor',updatedAt:new Date()}).where('id','=',m.taskId).where('status','=','pending').execute();await reconcileEvents(e,out.id);});
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
 if(message?.activityId&&terminal&&!['replied','rejected'].includes(message.status))await e.updateTable('crmActivities').set({result:terminal.event==='delivered'?'Entrega confirmada por Brevo':'Rebote/fallo: '+terminal.event,updatedAt:new Date()}).where('id','=',message.activityId).execute();
}
