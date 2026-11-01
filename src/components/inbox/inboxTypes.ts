import {formatDateShort,relativeAgo} from '../../helpers/crmDates';
import type {InboundMessage} from '../../endpoints/communication.schema';

/** Response shapes of the `/_api/inbox/*` endpoints as the Bandeja reads them (see `src/helpers/inboxQueries.ts`). */
export type InboxChannel='email'|'whatsapp'|'call'|'social'|'other';
export type InboxBusinessRow={accountId:string;accountName:string;lastActivityAt:string;lastChannel:InboxChannel;lastDirection:'in'|'out';lastPreview:string;pendingCount:number};
export type InboxThreadRow={leadId:string|null;leadTitle:string;channel:InboxChannel;lastActivityAt:string;messageCount:number;pendingCount:number};
export type InboxEvent={kind:'in'|'out';id:string;at:string;channel:InboxChannel;status:string;text:string;summary:string|null;authorEmail:string|null;fromName:string|null;fromAddress:string|null;pending:boolean;dismissed:boolean;isManualLog:boolean;replyAvailable?:boolean;replyRestricted?:boolean;subject?:string;isAutomatic?:boolean;linkedMessageId?:string|null;voided?:boolean;autoRegistrationId?:string|null;autoRegistrationUserEmail?:string|null;externalId?:string|null;destinationDetail?:string|null;ownerEmail?:string|null;confirmationSource?:'userscript'|'instagram'|'manual'|null;/** Social rows only meaningful: Instagram vs another network (spec 90). */isInstagram?:boolean};
/** `inbox_threads` response: the conversations plus the business name, so the header never depends on the loaded list page. */
export type InboxThreadsResponse={rows:InboxThreadRow[];accountName?:string};
export type InboxSearchRow={kind:'in'|'out';id:string;accountId:string;accountName:string;leadId:string|null;leadTitle:string|null;channel:InboxChannel;isInstagram?:boolean;at:string;snippet:string};
export type InboxPage<T>={rows:T[];nextCursor:string|null};

export const INBOX_CHANNELS:readonly InboxChannel[]=['email','whatsapp','call','social','other'];
/**
 * Channel names shared with the business page (spec 90). A `social` row says «Instagram» or «Red social» from its own
 * `isInstagram` (same rule everywhere, see `instagramChannel.ts`); with no row to decide (filters, a mixed conversation)
 * it reads «Instagram / Red social».
 */
export const inboxChannelLabel=(channel:InboxChannel,instagram?:boolean|null)=>channel==='social'?(instagram===true?'Instagram':instagram===false?'Red social':'Instagram / Red social'):({email:'Email',whatsapp:'WhatsApp',call:'Llamada',other:'Otro'} as const)[channel];
/** Whether every loaded row of a social conversation is Instagram (true), none is (false), or it is mixed / unknown (null). */
export const inboxRowsInstagram=(rows:readonly {isInstagram?:boolean}[]):boolean|null=>!rows.length?null:rows.every(r=>r.isInstagram===true)?true:rows.every(r=>r.isInstagram===false)?false:null;
/** Hoy / Ayer / dd/mm for list rows, on the Argentina calendar. */
export const inboxDateLabel=(value:string)=>{const relative=relativeAgo(value);return relative==='hoy'?'Hoy':relative==='ayer'?'Ayer':formatDateShort(value)};
/** The `message` URL param that points the detail at one event: `in:<id>` or `out:<id>`. */
export const inboxMessageKey=(event:{kind:'in'|'out';id:string})=>`${event.kind}:${event.id}`;
/**
 * The inbound row the shared inbound actions read, built from a thread event (which carries every field they need), so the
 * Bandeja does not depend on the capped list of GET /_api/communication.
 */
export function inboxEventInbound({event,leadId}:{event:InboxEvent;leadId:string|null}):InboundMessage{
 return {id:event.id,channel:event.channel,receivedAt:new Date(event.at),fromAddress:event.fromAddress??'',fromName:event.fromName??'',subject:event.subject??'',textBody:event.text??'',status:event.status,isAutomatic:!!event.isAutomatic,autoRegistrationId:event.autoRegistrationId??null,autoRegistrationUserEmail:event.autoRegistrationUserEmail??null,matchMethod:'',leadId,contextName:'',linkedMessageId:event.linkedMessageId??null,responseId:null,attachments:[],canReply:!!event.replyAvailable,replyAvailable:!!event.replyAvailable,replyRestricted:!!event.replyRestricted};
}
