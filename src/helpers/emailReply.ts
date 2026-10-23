import {sql,type Kysely} from 'kysely';
import {setWorkActor} from './workAudit';
import {buildHospedaEmailHtml,buildHospedaEmailText} from './hospedaEmailLayout';
import {classifySmtpOutcome,newMessageId,quotedHistory,replySubject,threadHeaders,type SmtpErrorShape} from './emailReplyPure';
import {smtpConfigured,sendSmtpMail} from './smtpTransport';
import {CommunicationConflict,CommunicationForbidden,communicationContext,communicationJournal,lockCommunication,sanitizeEmail} from './communicationService';
import {htmlToPlainText} from './renderMessageTemplate';
import type {CommunicationMutation,Message} from '../endpoints/communication.schema';
import type {DB} from './schema';
import type {User} from './User';

type ReplyInput=Extract<CommunicationMutation,{action:'inbound_reply'}>;
const json=(v:unknown)=>JSON.stringify(v);
export async function sendInboundReply(db:Kysely<DB>,input:ReplyInput,user:User){
 if(!smtpConfigured())throw new CommunicationConflict('Responder por email no está disponible: falta configurar el SMTP de Brevo.');
 const claim=await db.transaction().execute(async e=>{
  await setWorkActor(e,user);
  await lockCommunication(e,async e=>({accountIds:(await sql<{accountId:string}>`SELECT account_id AS "accountId" FROM crm_inbound_messages WHERE id=${input.inboundId}::uuid AND account_id IS NOT NULL`.execute(e)).rows.map(r=>r.accountId)}));
  const prior=(await sql<Message>`SELECT m.* FROM crm_messages m WHERE m.id=${input.id}::uuid`.execute(e)).rows[0];
  const inbound=(await sql<{id:string;channel:string;accountId:string|number|null;leadId:string|number|null;contactId:string|number|null;status:string;isAutomatic:boolean;receivedAt:Date;fromAddress:string;fromName:string;subject:string;textBody:string;externalId:string;headers:{references?:string}|null}>`SELECT id,channel,account_id AS "accountId",lead_id AS "leadId",contact_id AS "contactId",status,is_automatic AS "isAutomatic",received_at AS "receivedAt",from_address AS "fromAddress",from_name AS "fromName",subject,text_body AS "textBody",external_id AS "externalId",headers FROM crm_inbound_messages WHERE id=${input.inboundId}::uuid FOR UPDATE`.execute(e)).rows[0];
  if(prior){if(String(prior.ownerEmail)!==user.email||prior.channel!=='email'||String(prior.templateSnapshot?.inboundId??'')!==input.inboundId)throw new CommunicationConflict('Ese intento ya existe para otro email.');return {message:prior,replay:true};}
  if(!inbound||inbound.channel!=='email'||!inbound.accountId)throw new Error('Email entrante inexistente o sin negocio asociado.');
  if(inbound.isAutomatic)throw new CommunicationConflict('No se puede responder a una respuesta automática.');
  if(!['pending_review','registered'].includes(inbound.status))throw new CommunicationConflict('Este email ya no está disponible para responder.');
  // The inbound row lock serializes replies: a new attempt (another client id, a reopened dialog) never races an in-flight or uncertain one.
  const inFlight=(await sql<{id:string}>`SELECT id FROM email_outbox WHERE inbound_message_id=${input.inboundId}::uuid AND status IN ('submitting','unknown') LIMIT 1`.execute(e)).rows[0];
  if(inFlight)throw new CommunicationConflict('Ya hay una respuesta a este email en curso o con resultado incierto. No se reenvía: revisá la actividad antes de responder de nuevo.');
  const {account,lead}=await communicationContext(e,String(inbound.accountId),inbound.leadId==null?null:String(inbound.leadId),user,false);
  if(user.role!=='admin'&&(lead?lead.assignedUserEmail!==user.email:account.assignedUserEmail!==user.email))throw new CommunicationForbidden('Solo la persona responsable del contexto o un administrador puede responder este email.');
  const recipient=input.recipient?.trim()??String(inbound.fromAddress).trim();if(user.role!=='admin'&&recipient.toLowerCase()!==String(inbound.fromAddress).toLowerCase())throw new CommunicationForbidden('Solo administración puede cambiar el destinatario.');
  if(!zEmail(recipient))throw new Error('Email destinatario inválido.');
  const restrictions=(await sql<{createdAt:Date;channel:string;contactId:string|null;leadId:string|null}>`SELECT created_at AS "createdAt",channel,contact_id AS "contactId",lead_id AS "leadId" FROM crm_contact_restrictions WHERE account_id=${account.id} AND lifted_at IS NULL AND channel IN ('email','all') AND ((contact_id=${inbound.contactId}::bigint AND ${inbound.contactId}::bigint IS NOT NULL) OR (contact_id IS NULL AND lead_id IS NULL) OR (contact_id IS NULL AND lead_id IS NOT DISTINCT FROM ${inbound.leadId}::bigint))`.execute(e)).rows;
  const restrictionActive=!!account.doNotContact||restrictions.length>0;
  const restrictionDate=restrictions.reduce<Date|null>((old,r)=>!old||r.createdAt>old?r.createdAt:old,null),businessRestrictionDate=account.doNotContact?(await sql<{at:Date|null}>`SELECT max(created_at) AS at FROM crm_communication_journal WHERE entity_type='business' AND entity_id=${String(account.id)} AND action='do_not_contact_activated'`.execute(e)).rows[0]?.at??account.updatedAt:null;
  const restrictionStart=restrictionDate&&businessRestrictionDate?new Date(Math.max(restrictionDate.getTime(),new Date(businessRestrictionDate).getTime())):restrictionDate??businessRestrictionDate;
  const underRestriction=restrictionActive&&!!restrictionStart&&new Date(inbound.receivedAt)>=new Date(restrictionStart)&&recipient.toLowerCase()===String(inbound.fromAddress).toLowerCase();
  if(restrictionActive&&!underRestriction)throw new CommunicationForbidden(account.doNotContact?'El negocio tiene una restricción de no contactar.':'No contactar: hay una restricción activa para este destinatario.');
  if(account.archivedAt)throw new CommunicationForbidden('El negocio está archivado.');
  if(lead){const stage=(await sql<{classification:string}>`SELECT classification FROM crm_stages WHERE name=${lead.estado}`.execute(e)).rows[0];if(!stage||stage.classification!=='open')throw new CommunicationForbidden('Una gestión cerrada solo permite registrar respuestas recibidas.');}
  const clean=sanitizeEmail(input.bodyHtml);if(!clean.replace(/<[^>]*>/g,'').trim())throw new Error('Escribí una respuesta antes de enviar.');
  const quote=quotedHistory({receivedAt:inbound.receivedAt,fromName:inbound.fromName||inbound.fromAddress,fromAddress:inbound.fromAddress,textBody:inbound.textBody||''});
  const body=clean+quote.html,subject=replySubject(String(inbound.subject||'')),headers=threadHeaders({inboundMessageId:String(inbound.externalId),inboundReferences:String(inbound.headers?.references??'')});
  const msgId=newMessageId(),settings=await e.selectFrom('appSettings').selectAll().where('key','in',['brevo_sender_name','brevo_sender_email','brevo_reply_to_email']).execute(),cfg=Object.fromEntries(settings.map(s=>[s.key,s.value]));
  const su=await e.selectFrom('users').select('senderEmail').where('id','=',user.id).executeTakeFirstOrThrow(),senderEmail=su.senderEmail?.trim()||cfg.brevo_sender_email;if(!senderEmail)throw new Error('Remitente Brevo no configurado.');
  const senderName=su.senderEmail?user.displayName:cfg.brevo_sender_name||'Hospeda',replyTo=su.senderEmail||cfg.brevo_reply_to_email||null;
  const rendered={htmlBody:buildHospedaEmailHtml({bodyHtml:body,senderName:user.fullName?.trim()||user.displayName,senderEmail:user.email,subject,vertical:lead?.tipo??account.tipo,commercialProfile:lead?.commercialProfile??null,variant:'reply'}),textBody:buildHospedaEmailText({bodyText:htmlToPlainText(body),senderName:user.fullName?.trim()||user.displayName,senderEmail:user.email,variant:'reply'})};
  const message=(await sql<Message>`INSERT INTO crm_messages(id,account_id,original_account_id,lead_id,contact_id,channel,recipient,recipient_name,subject,body,html_body,text_body,template_snapshot,owner_email,status,last_interaction_at,last_actor_email) VALUES(${input.id}::uuid,${account.id},${account.id},${inbound.leadId},${inbound.contactId},'email',${recipient},${inbound.fromName||recipient},${subject},${body},${rendered.htmlBody},${rendered.textBody},${json({inboundId:input.inboundId})}::text::jsonb,${user.email},'submitting',now(),${user.email}) RETURNING *`.execute(e)).rows[0];
  const out=await e.insertInto('emailOutbox').values({leadId:inbound.leadId,templateId:null,recipientEmail:recipient,recipientName:inbound.fromName||null,senderEmail,senderName,replyToEmail:replyTo,subject,htmlBody:rendered.htmlBody,textBody:rendered.textBody,status:'submitting',attempts:1,requestedByUserId:user.id,requestedByEmail:user.email,requestedByName:user.displayName,messageId:msgId,transport:'smtp',inReplyTo:headers.inReplyTo,referencesHeader:headers.references,inboundMessageId:input.inboundId}).returningAll().executeTakeFirstOrThrow();
  await sql`UPDATE crm_messages SET outbox_id=${out.id} WHERE id=${input.id}::uuid`.execute(e);
  await communicationJournal(e,{accountId:String(account.id),leadId:inbound.leadId==null?null:String(inbound.leadId),entityType:'interaction',entityId:input.id,action:'email_submission_started',actor:user,after:{status:'submitting',outboxId:out.id,recipient,subject,transport:'smtp',inboundMessageId:input.inboundId}});
  if(underRestriction)await communicationJournal(e,{accountId:String(account.id),leadId:inbound.leadId==null?null:String(inbound.leadId),entityType:'inbound',entityId:input.inboundId,action:'email_reply_under_restriction',actor:user,after:{recipient,inboundMessageId:input.inboundId}});
  return {message,outbox:out,senderName,senderEmail,replyTo,headers,body,rendered,replay:false,underRestriction};
 });
 if(claim.replay)return {message:claim.message,replay:true};
 if(!claim.outbox||!claim.headers||!claim.rendered)throw new CommunicationConflict('No se pudo preparar el envío.');
 try{
  await sendSmtpMail({from:{name:claim.senderName,address:claim.senderEmail},replyTo:claim.replyTo??undefined,to:claim.message.recipient,subject:claim.message.subject,html:claim.rendered.htmlBody,text:claim.rendered.textBody,messageId:claim.outbox.messageId!,inReplyTo:claim.headers.inReplyTo,references:claim.headers.references,headers:{'X-Mailin-custom':'hospeda_outbox:'+claim.outbox.id,'X-Mailin-Tag':'hospeda-'+input.id}});
  await db.transaction().execute(async e=>{await setWorkActor(e,user);await sql`UPDATE email_outbox SET status='accepted',sent_at=now(),updated_at=now() WHERE id=${claim.outbox.id}`.execute(e);await sql`UPDATE crm_messages SET status='accepted',updated_at=now() WHERE id=${input.id}::uuid AND status='submitting'`.execute(e);await e.insertInto('crmActivities').values({accountId:claim.message.accountId,leadId:claim.message.leadId,title:'Email aceptado por proveedor · entrega no confirmada',typeId:'message',channel:'email',result:'Aceptado por proveedor',occurredAt:new Date(),contactIds:claim.message.contactId?[claim.message.contactId]:[],participants:claim.message.recipientName,actorEmail:user.email,notes:'Respuesta al email entrante '+input.inboundId}).execute();await communicationJournal(e,{accountId:String(claim.message.accountId),leadId:claim.message.leadId,entityType:'interaction',entityId:input.id,action:'smtp_accepted',actor:user,after:{status:'accepted',deliveryConfirmed:false}});});
 }catch(error){const status=classifySmtpOutcome(error as SmtpErrorShape);await db.transaction().execute(async e=>{await setWorkActor(e,user);await sql`UPDATE email_outbox SET status=${status==='failed'?'error':'unknown'},last_error=${String(error).slice(0,1000)},updated_at=now() WHERE id=${claim.outbox.id}`.execute(e);await sql`UPDATE crm_messages SET status=${status},updated_at=now() WHERE id=${input.id}::uuid AND status='submitting'`.execute(e);await communicationJournal(e,{accountId:String(claim.message.accountId),leadId:claim.message.leadId,entityType:'interaction',entityId:input.id,action:status==='failed'?'smtp_rejected':'email_result_uncertain',actor:user,before:{status:'submitting'},after:{status,reason:String(error).slice(0,500)}});});return {message:(await sql<Message>`SELECT * FROM crm_messages WHERE id=${input.id}::uuid`.execute(db)).rows[0],error:status==='failed'?'El servidor SMTP rechazó el envío.':'No se pudo confirmar el resultado del envío. No lo reenvíes; revisá la actividad antes de intentar de nuevo.'};}
 return {message:(await sql<Message>`SELECT * FROM crm_messages WHERE id=${input.id}::uuid`.execute(db)).rows[0]};
}
const zEmail=(value:string)=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
