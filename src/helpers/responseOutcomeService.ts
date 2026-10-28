import {sql,type Kysely,type Transaction} from 'kysely';
import type {DB} from './schema';
import type {User} from './User';
import type {Message} from '../endpoints/communication.schema';
import {communicationJournal} from './communicationService';
import {OPENED_UNCONFIRMED_STATUSES,OUTCOME_READY_STATUSES,contactWorkPurpose} from './contactOutcome';
import {canModifyBusiness,canModifyManagement} from './crmPermissions';
import {isInstagramAttempt} from './instagramChat';
import {responseCategoryLabel} from './crmLabels';
import {attributeResponseToSend,responseOutcome,type OpenSend,type ResponseCategory} from './responseOutcome';

type Executor=Kysely<DB>|Transaction<DB>;

/**
 * The business's sends still waiting for «¿Cómo salió?», for any owner: the same rule as `pendingContactOutcomes` (sends since outcome
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
   AND (m.status=ANY(${[...OPENED_UNCONFIRMED_STATUSES,'manual_pending']}::text[]) OR NOT EXISTS(SELECT 1 FROM crm_activities x WHERE x.account_id=m.account_id AND x.lead_id IS NOT DISTINCT FROM m.lead_id AND x.outcome IS NOT NULL AND x.deleted_at IS NULL AND x.created_at>=m.last_interaction_at))
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
 const {outcome}=responseOutcome({category:response.category});
 const result=`Respuesta registrada: ${responseCategoryLabel(response.category)} · ${response.summary}`.slice(0,4000);
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
 }
 await communicationJournal(e,{accountId:String(m.accountId),leadId:m.leadId==null?null:String(m.leadId),entityType:'interaction',entityId:m.id,action:'contact_outcome_from_response',actor:null,automatic:true,triggeredBy:user.email,after:{outcome,responseId:response.id,activityId}});
 return {messageId:m.id};
}
