import {sql,type Kysely,type Transaction} from 'kysely';
import type {DB} from './schema';
import type {User} from './User';
import type {Message} from '../endpoints/communication.schema';
import {communicationJournal,laterOutcomeCoversSend} from './communicationService';
import {OPENED_UNCONFIRMED_STATUSES,OUTCOME_READY_STATUSES,contactWorkPurpose} from './contactOutcome';
import {canModifyBusiness,canModifyManagement} from './crmPermissions';
import {isInstagramAttempt} from './instagramChat';
import {writeLeadJournal} from './writeLeadJournal';
import {attributeResponseToSend,outcomeFromResponse,type OpenSend,type ResponseCategory} from './responseOutcome';

type Executor=Kysely<DB>|Transaction<DB>;

/**
 * The business's sends still waiting for «¿Cómo salió?», for any owner: the same rule as `pendingContactFollowUps` (sends since outcome
 * tracking started, management not trashed, no outcome on their activity, no «No contactar» response linked, and a confirmed contact not
 * already covered by a later outcome of its context). Locked, so two responses never resolve the same send twice.
 */
async function openSends(e:Executor,accountId:string):Promise<OpenSend[]>{
 return (await sql<{id:string;leadId:string|null;lastInteractionAt:Date}>`SELECT m.id::text AS id,m.lead_id::text AS lead_id,m.last_interaction_at FROM crm_messages m LEFT JOIN leads l ON l.id=m.lead_id
  WHERE m.account_id=${accountId}::bigint AND m.status=ANY(${[...OUTCOME_READY_STATUSES]}::text[])
   AND m.last_interaction_at>=(SELECT value::timestamptz FROM app_settings WHERE key='crm_contact_outcome_since')
   AND (m.lead_id IS NULL OR l.deleted_at IS NULL)
   AND NOT EXISTS(SELECT 1 FROM crm_activities x WHERE x.id=m.activity_id AND x.outcome IS NOT NULL AND x.deleted_at IS NULL)
   AND NOT EXISTS(SELECT 1 FROM crm_communication_responses r WHERE r.linked_message_id=m.id AND r.category='do_not_contact')
   AND (m.status=ANY(${[...OPENED_UNCONFIRMED_STATUSES,'manual_pending']}::text[]) OR NOT ${laterOutcomeCoversSend})
  ORDER BY m.last_interaction_at DESC FOR UPDATE OF m`.execute(e)).rows;
}

/** Only someone who could record that outcome herself resolves it: the management's (or, without one, the business's) responsible, or an admin. */
async function canRecordOutcome(e:Executor,m:Message,user:User):Promise<boolean>{
 if(user.role==='admin')return true;
 const account=await e.selectFrom('crmAccounts').selectAll().where('id','=',m.accountId).executeTakeFirst();
 if(!m.leadId)return canModifyBusiness(user,account);
 const lead=await e.selectFrom('leads').selectAll().where('id','=',m.leadId).executeTakeFirst();
 return canModifyManagement(user,lead,account);
}

/**
 * Spec 96 §10.1: a response registered for a business resolves the pending outcome of the send it answers, inside the response's
 * transaction (the caller holds the business lock). The send is chosen by {@link attributeResponseToSend} among the sends made up to
 * `answeredAt` (when the response was received; null means now, a response registered without a message); an ambiguous response, or a
 * user who could not record that outcome, resolves nothing. The message status never changes (an unconfirmed send stays unconfirmed),
 * and the activity keeps `outcome_response_id` so the CRM marks the outcome as automatic until a person corrects it.
 * Only called for a newly inserted response: a replay returns before, so nothing is resolved twice.
 */
export async function resolveSendOutcomeFromResponse(e:Executor,{response,user,answeredAt}:{response:{id:string;accountId:string;leadId:string|null;linkedMessageId:string|null;category:ResponseCategory;summary:string};user:User;answeredAt:Date|null}):Promise<{messageId:string|null}>{
 const at=answeredAt??(await sql<{now:Date}>`SELECT now() AS now`.execute(e)).rows[0].now;
 const {messageId}=attributeResponseToSend({sends:await openSends(e,response.accountId),linkedMessageId:response.linkedMessageId,leadId:response.leadId,answeredAt:at});
 if(!messageId)return {messageId:null};
 const m=(await sql<Message>`SELECT * FROM crm_messages WHERE id=${messageId}::uuid`.execute(e)).rows[0];
 if(!m||!await canRecordOutcome(e,m,user))return {messageId:null};
 const {outcome,result}=outcomeFromResponse(response);
 const existing=m.activityId?await e.selectFrom('crmActivities').select(['id','outcome']).where('id','=',m.activityId).where('deletedAt','is',null).forUpdate().executeTakeFirst():undefined;
 if(existing?.outcome)return {messageId:null};
 let activityId:string;
 if(existing){
  await e.updateTable('crmActivities').set({outcome,outcomeResponseId:response.id,result,updatedAt:new Date()}).where('id','=',existing.id).where('outcome','is',null).execute();
  activityId=String(existing.id);
 }else{
  const instagram=isInstagramAttempt(m);
  const created=await e.insertInto('crmActivities').values({accountId:m.accountId,leadId:m.leadId,typeId:m.channel==='whatsapp'?'other':'message',title:m.channel==='whatsapp'?'Comunicación WhatsApp':instagram?'Comunicación Instagram':'Comunicación '+m.channel,channel:m.channel,purpose:contactWorkPurpose(m.purpose),outcome,outcomeResponseId:response.id,result,occurredAt:m.lastInteractionAt??new Date(),contactIds:m.contactId?[m.contactId]:[],participants:m.recipientName,actorEmail:user.email,notes:'Snapshot de mensaje #'+m.id}).returning('id').executeTakeFirstOrThrow();
  await sql`UPDATE crm_messages SET activity_id=${created.id} WHERE id=${m.id}::uuid`.execute(e);
  activityId=String(created.id);
  // Same management history as an activity the communication flow creates (communicationService `activity`).
  if(m.leadId){const lead=await e.selectFrom('leads').select(['id','nombre']).where('id','=',m.leadId).executeTakeFirst();if(lead)await writeLeadJournal(e,{leadId:String(lead.id),leadName:lead.nombre,actor:user,action:'contact_logged',metadata:{activityId:created.id,messageId:m.id,channel:m.channel,result,template:m.templateSnapshot?.name??null}});}
 }
 await communicationJournal(e,{accountId:String(m.accountId),leadId:m.leadId==null?null:String(m.leadId),entityType:'interaction',entityId:m.id,action:'contact_outcome_from_response',actor:null,automatic:true,triggeredBy:user.email,after:{outcome,responseId:response.id,activityId}});
 return {messageId:m.id};
}

/**
 * Spec 96 §10.1: «the automatic outcome comes from the registered response», so correcting the response updates the outcome and result
 * it set, in the correction's transaction. Only activities whose outcome is still automatic (`outcome_response_id` = the response) change:
 * a person's correction cleared that mark and is never overwritten. Each change is journaled as automatic, linked to the correction.
 */
export async function refreshAutoOutcomesFromResponse(e:Executor,{response,user,relatedEventId}:{response:{id:string;category:ResponseCategory;summary:string};user:User;relatedEventId:string|null}):Promise<{activityIds:string[]}>{
 const {outcome,result}=outcomeFromResponse(response);
 const rows=(await sql<{id:string;accountId:string;leadId:string|null;beforeOutcome:string|null;beforeResult:string|null;messageId:string|null}>`UPDATE crm_activities x SET outcome=${outcome},result=${result},updated_at=now()
  FROM (SELECT id,outcome,result FROM crm_activities WHERE outcome_response_id=${response.id}::uuid AND deleted_at IS NULL) old
  WHERE x.id=old.id AND x.outcome_response_id=${response.id}::uuid
  RETURNING x.id::text AS id,x.account_id::text AS account_id,x.lead_id::text AS lead_id,old.outcome AS before_outcome,old.result AS before_result,(SELECT m.id::text FROM crm_messages m WHERE m.activity_id=x.id LIMIT 1) AS message_id`.execute(e)).rows;
 for(const r of rows)await communicationJournal(e,{accountId:r.accountId,leadId:r.leadId,entityType:r.messageId?'interaction':'response',entityId:r.messageId??response.id,action:'contact_outcome_from_response_corrected',actor:null,automatic:true,triggeredBy:user.email,relatedEventId,before:{outcome:r.beforeOutcome,result:r.beforeResult},after:{outcome,result,responseId:response.id,activityId:r.id}});
 return {activityIds:rows.map(r=>r.id)};
}
