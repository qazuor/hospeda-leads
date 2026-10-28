import type {TemplateMaterialWarning} from '../helpers/templateMaterials';
import {z} from 'zod';
import {composerChannelOf} from '../helpers/instagramChat';
import {apiJson,postJson,LONG_TIMEOUT_MS} from '../helpers/apiClient';
import type {MessageMaterial} from './salesMaterials.schema';
import type {EmailEngagement} from '../helpers/emailEngagement';
const id=z.string().regex(/^[1-9]\d*$/),uuid=z.string().uuid(),channel=z.enum(['email','whatsapp','call','social','other']);
const context={accountId:id,leadId:id.nullable()};
/** Channels the composer prepares. `instagram` is stored as `social` with `destination_detail='instagram'` (spec 92). */
const composerChannel=z.enum(['email','whatsapp','instagram']);
export type ComposerChannel=z.infer<typeof composerChannel>;
/** A stale draft the seller chose to discard before starting again; the revision guards against a concurrent edit or use. */
/** Longest message body a draft can hold (`edit` and the material actions use the same cap). */
export const MESSAGE_BODY_MAX_LENGTH=50000;
/** Conflict text of a stale draft revision; the composer treats it as a concurrent edit and reloads. */
export const DRAFT_CHANGED_MESSAGE='El borrador cambió o ya fue utilizado.';
const discardDraft=z.object({id:uuid,revision:z.number().int()}).optional();
export const communicationMutation=z.discriminatedUnion('action',[
 z.object({action:z.literal('prepare'),id:uuid,leadId:id,contactId:id.nullable(),channel:composerChannel,templateId:id.nullable(),taskId:id.optional(),variation:z.number().int().min(0).max(1000).optional(),discardDraft}),
 z.object({action:z.literal('prepare_general'),id:uuid,...context,contactId:id.nullable(),channel:composerChannel,purpose:z.enum(['verification','first_contact','resume','relationship','care','operations','other']).nullable(),otherPurpose:z.string().trim().max(300).nullable(),templateId:id.nullable(),variation:z.number().int().min(0).max(1000).optional(),discardDraft}),
 z.object({action:z.literal('manual_start'),id:uuid,...context,contactId:id.nullable(),channel:z.enum(['call','social','other']),purpose:z.enum(['verification','first_contact','resume','relationship','care','operations','other']).nullable(),otherPurpose:z.string().trim().max(300).nullable(),recipient:z.string().trim().min(1).max(500),recipientName:z.string().trim().max(300),destination:z.string().trim().max(500).nullable(),body:z.string().max(50000),result:z.enum(['manual_sent','manual_no_contact']).nullable(),templateId:id.nullable(),variation:z.number().int().min(0).max(1000).optional()}),
 z.object({action:z.literal('manual_complete'),id:uuid,result:z.enum(['manual_sent','manual_no_contact','manual_not_done']),summary:z.string().trim().min(1).max(4000)}),
 z.object({action:z.literal('response_create'),id:uuid,...context,contactId:id.nullable(),channel,recipient:z.string().trim().max(500),recipientName:z.string().max(300),destination:z.string().max(500).nullable(),linkedMessageId:uuid.nullable(),category:z.enum(['interested','information','later','rejected','not_now','operational','do_not_contact','other']),summary:z.string().trim().min(1).max(4000),exactText:z.string().max(50000).nullable(),otherDetail:z.string().trim().max(500).nullable(),confirmDoNotContact:z.boolean().optional(),closeLeadIds:z.array(id).max(100).optional(),resolveTaskIds:z.array(id).max(20).refine(ids=>new Set(ids).size===ids.length,'No repitas una misma tarea.').optional(),reminder:z.object({dueDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),assignedUserEmail:z.string().email().nullable()}).nullable().optional()}),
 z.object({action:z.literal('inbound_register'),id:uuid,inboundId:uuid,category:z.enum(['interested','information','later','rejected','not_now','operational','do_not_contact','other']),summary:z.string().trim().min(1).max(4000),otherDetail:z.string().trim().max(500).nullable(),confirmDoNotContact:z.boolean().optional()}),
 z.object({action:z.literal('inbound_dismiss'),id:uuid,inboundId:uuid,reason:z.string().trim().min(3).max(500)}),
 z.object({action:z.literal('email_resolve_uncertain'),id:uuid,messageId:uuid,outcome:z.enum(['sent','not_sent']),reason:z.string().trim().min(10).max(500)}),
 z.object({action:z.literal('inbound_reply'),id:uuid,inboundId:uuid,bodyHtml:z.string().max(50000),recipient:z.string().email().max(320).optional()}),
 z.object({action:z.literal('response_correct'),id:uuid,category:z.enum(['interested','information','later','rejected','not_now','operational','do_not_contact','other']),summary:z.string().trim().min(1).max(4000),exactText:z.string().max(20000).nullable(),otherDetail:z.string().trim().max(500).nullable(),reason:z.string().trim().min(3).max(1000),confirmDoNotContact:z.literal(true).optional(),confirmLiftDoNotContact:z.literal(true).optional(),closeLeadIds:z.array(id).max(100).optional()}),
 z.object({action:z.literal('interaction_correct'),id:uuid,result:z.enum(['manual_sent','manual_no_contact','manual_not_done']),summary:z.string().trim().max(4000),reason:z.string().trim().min(3).max(1000)}),
 z.object({action:z.literal('auto_registration_void'),id:uuid,reason:z.string().trim().min(3).max(500)}),
 z.object({action:z.literal('cancel_draft'),id:uuid,revision:z.number().int(),taskId:id.optional()}),
 z.object({action:z.literal('edit'),id:uuid,revision:z.number().int(),taskId:id.optional(),subject:z.string().max(500),body:z.string().max(MESSAGE_BODY_MAX_LENGTH)}),
 z.object({action:z.literal('dispatch'),id:uuid,revision:z.number().int(),confirm:z.literal(true),taskId:id.optional()}),
 z.object({action:z.literal('outcome'),id:uuid,taskId:id.optional(),event:z.enum(['manual_sent','manual_not_sent','replied','rejected']),notes:z.string().max(4000)}),
 z.object({action:z.literal('material_add'),id:uuid,revision:z.number().int(),materialId:uuid,attach:z.boolean(),taskId:id.optional()}),
 z.object({action:z.literal('material_remove'),id:uuid,revision:z.number().int(),shareId:uuid,taskId:id.optional()}),
 z.object({action:z.literal('material_attach'),id:uuid,revision:z.number().int(),shareId:uuid,attach:z.boolean(),taskId:id.optional()}),
 /** «Reintentar sin adjuntos»: `id` is the new draft (idempotency key), `messageId` the email Brevo refused. */
 z.object({action:z.literal('material_retry_without_attachments'),id:uuid,messageId:uuid,taskId:id.optional()}),
 z.object({action:z.literal('restrict'),accountId:id.optional(),leadId:id.nullable().optional(),contactId:id.nullable(),channel:z.enum(['email','whatsapp','call','social','other']),reason:z.string().trim().min(3).max(1000)}),
 z.object({action:z.literal('lift'),id,reason:z.string().trim().min(3).max(1000)}),
]);
export type CommunicationMutation=z.infer<typeof communicationMutation>;
export type Message={/** Spec 93, read-only: Brevo delivery, opens, clicks and spam of a sent email (null without linked events; only on GET). */emailEngagement?:EmailEngagement|null;id:string;accountId:string;leadId:string|null;contactId:string|null;channel:'email'|'whatsapp'|'call'|'social'|'other';recipient:string;recipientName:string;subject:string;body:string;htmlBody:string|null;textBody:string|null;templateSnapshot:any;ownerEmail:string;activityId:string|null;outboxId:string|null;taskId:string|null;delegatedTaskId?:string|null;delegatedFromEmail?:string|null;status:string;revision:number;lastInteractionAt:Date|null;lastActorEmail:string|null;createdAt:Date;updatedAt:Date;autoRegistrationId?:string|null;autoRegistrationUserEmail?:string|null;purpose?:string|null;otherPurpose?:string|null;destinationDetail?:string|null;/** Provider id (Brevo, WhatsApp or the Instagram echo `mid`); read-only. */externalId?:string|null;contentHash?:string|null;summary?:string|null;completedAt?:Date|null;completedByEmail?:string|null;/** Sales material links of the message (spec 89 §8.4). */materials?:MessageMaterial[];/** Outcome recorded on the message's activity (only on GET). */activityOutcome?:string|null;/** Spec 96 §10.1: the response that set that outcome automatically; null once a person corrected it (only on GET). */autoOutcomeResponseId?:string|null};
/** `reusedDraft` is set when prepare returns an earlier draft of the same seller, recipient and model instead of a new one (report item 1.14). */
/** A contact left without "¿Cómo salió?" (decision 2B); it stays pending until an outcome is recorded. */
export type PendingOutcome={id:string;accountId:string;accountName:string;leadId:string|null;opportunityName:string|null;contactId:string|null;channel:string;status:string;purpose:string|null;recipientName:string;lastInteractionAt:Date};
/** `materialWarnings`: template materials that `prepare` left out (archived, internal, missing) or could only link (spec 89 §9). */
/**
 * `instagramAutoConfirm` / `instagramShared` (spec 92 §2.6) come with an Instagram prepare: whether Meta's echo can confirm the send and whether
 * another business has the same username. Only booleans; older responses and reloads omit them.
 */
export type PreparedMessage=Message&{channel:'email'|'whatsapp'|'social';reusedDraft?:boolean;materialWarnings?:TemplateMaterialWarning[];instagramAutoConfirm?:boolean;instagramShared?:boolean};
/**
 * The prepare request that discards `draft` and starts again from the same context, recipient and model.
 * Every input of prepare/prepare_general is stored on the draft, so the request is rebuilt exactly; `id` is the new idempotency key.
 */
export function restartDraftRequest(draft:PreparedMessage,id:string):CommunicationMutation{
 const templateId=draft.templateSnapshot?.id==null?null:String(draft.templateSnapshot.id),discard={id:draft.id,revision:draft.revision};
 if(draft.leadId&&!draft.purpose)return {action:'prepare',id,leadId:String(draft.leadId),contactId:draft.contactId==null?null:String(draft.contactId),channel:composerChannelOf(draft),templateId,...(draft.delegatedTaskId?{taskId:String(draft.delegatedTaskId)}:{}),discardDraft:discard};
 return {action:'prepare_general',id,accountId:String(draft.accountId),leadId:draft.leadId==null?null:String(draft.leadId),contactId:draft.contactId==null?null:String(draft.contactId),channel:composerChannelOf(draft),purpose:(draft.purpose??null) as Extract<CommunicationMutation,{action:'prepare_general'}>['purpose'],otherPurpose:draft.otherPurpose??null,templateId,discardDraft:discard};
}
/** Rows per list (messages, received messages, responses) that GET /_api/communication returns, newest first. */
export const COMMUNICATION_LIST_LIMIT=200;
export type InboundMessage={id:string;channel:string;channelDetail?:string|null;receivedAt:Date;fromAddress:string;fromName:string;subject:string;textBody:string;status:string;isAutomatic:boolean;autoRegistrationId?:string|null;autoRegistrationUserEmail?:string|null;matchMethod:string;leadId:string|null;contextName:string;linkedMessageId:string|null;responseId:string|null;attachments:unknown[];canReply:boolean;replyAvailable:boolean;replyRestricted:boolean};
/** A registered response as GET /_api/communication returns it. `resolvedTaskTitles` (spec 90) lists the tasks it completed and `hasInbound` whether a received message is linked; older servers omit them. */
export type CommunicationResponse={id:string;accountId?:string;leadId:string|null;contactId?:string|null;channel:string;recipient?:string;recipientName?:string;linkedMessageId?:string|null;category:string;summary:string;exactText:string|null;otherDetail?:string|null;actorEmail:string;occurredAt:Date;contextName:string;resolvedTaskTitles?:string[]|null;/** True when a received message is linked to this response (spec 90); older servers omit it. */hasInbound?:boolean};
export type InboundReview={id:string;channel:string;accountId:string;accountName:string;leadId:string|null;fromAddress:string;fromName:string;subject:string;textBody:string;receivedAt:Date};
export type CommunicationDetail={/** Spec 91 §12: the caller's previous visit to this business «Comunicación» tab (null on the first one); older servers omit it. */lastSeenAt?:Date|null;/** The viewer's own contacts still waiting for "¿Cómo salió?" (decision 2B). */pendingOutcomes?:PendingOutcome[];templatePicks?:Record<string,Record<string,string>>;messages:Message[];recentMessages:Message[];restrictions:any[];/** Every active restriction of the business (no cap), for blocking checks. */activeRestrictions?:any[];responses:CommunicationResponse[];inbound?:InboundMessage[];replyAvailable?:boolean;openManagements:{id:string|number;opportunityName:string|null;managementType:string|null;estado:string|null;assignedUserEmail:string|null;classification:string;canClose:boolean}[];recentContactHours:number;webhookConfigured:boolean};
export async function postCommunication(body:CommunicationMutation):Promise<any>{return postJson<any>('/_api/communication',communicationMutation.parse(body),{timeoutMs:LONG_TIMEOUT_MS});}
export async function getCommunication(leadId:string,accountId?:string,includeVoided=false):Promise<CommunicationDetail>{return apiJson<any>('/_api/communication?'+(accountId?'accountId='+accountId:'leadId='+leadId)+(includeVoided?'&includeVoided=1':''));}
export async function getInboundReview():Promise<{rows:InboundReview[]}>{return apiJson('/_api/inbound/review');}
/** Spec 91 §12: input of POST /_api/communication/seen. `seenAt` is the newest loaded item's time, never the client clock. */
export const communicationSeenInput=z.object({accountId:id,seenAt:z.date()});
export type CommunicationSeenInput=z.infer<typeof communicationSeenInput>;
/** Marks the caller's visit to a business «Comunicación» tab. It writes only the caller's own read state: not contact, not history. */
export async function markCommunicationSeen(input:CommunicationSeenInput):Promise<{lastSeenAt:Date}>{return postJson('/_api/communication/seen',communicationSeenInput.parse(input));}
