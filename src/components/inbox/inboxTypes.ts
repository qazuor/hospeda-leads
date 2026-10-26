import {formatDateShort,relativeAgo} from '../../helpers/crmDates';

/** Response shapes of the `/_api/inbox/*` endpoints as the Bandeja reads them (see `src/helpers/inboxQueries.ts`). */
export type InboxChannel='email'|'whatsapp'|'call'|'social'|'other';
export type InboxBusinessRow={accountId:string;accountName:string;lastActivityAt:string;lastChannel:InboxChannel;lastDirection:'in'|'out';lastPreview:string;pendingCount:number};
export type InboxThreadRow={leadId:string|null;leadTitle:string;channel:InboxChannel;lastActivityAt:string;messageCount:number;pendingCount:number};
export type InboxEvent={kind:'in'|'out';id:string;at:string;channel:InboxChannel;status:string;text:string;summary:string|null;authorEmail:string|null;fromName:string|null;fromAddress:string|null;pending:boolean;dismissed:boolean;isManualLog:boolean;replyAvailable?:boolean;replyRestricted?:boolean};
export type InboxSearchRow={kind:'in'|'out';id:string;accountId:string;accountName:string;leadId:string|null;leadTitle:string|null;channel:InboxChannel;at:string;snippet:string};
export type InboxPage<T>={rows:T[];nextCursor:string|null};

export const INBOX_CHANNELS:readonly InboxChannel[]=['email','whatsapp','call','social','other'];
export const inboxChannelLabel=(channel:InboxChannel)=>({email:'Email',whatsapp:'WhatsApp',call:'Llamada',social:'Redes',other:'Otro'})[channel];
/** Hoy / Ayer / dd/mm for list rows, on the Argentina calendar. */
export const inboxDateLabel=(value:string)=>{const relative=relativeAgo(value);return relative==='hoy'?'Hoy':relative==='ayer'?'Ayer':formatDateShort(value)};
/** The `message` URL param that points the detail at one event: `in:<id>` or `out:<id>`. */
export const inboxMessageKey=(event:{kind:'in'|'out';id:string})=>`${event.kind}:${event.id}`;
