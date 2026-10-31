import {samePhone} from './phoneIdentity';

/**
 * Message states that are real sends (spec 99 §4, same list as `CONTACT_EVIDENCE_STATUSES` of contactEvidence.ts, which pulls
 * the SQL builder and stays server-side). «Responde a» lists only these: an opened chat or a draft is not a send.
 */
export const REAL_SEND_STATUSES=['manual_sent','accepted','delivery_confirmed','replied','rejected'] as const;
export const isRealSend=(status:string):boolean=>(REAL_SEND_STATUSES as readonly string[]).includes(status);

type Person={readonly id:string|number;readonly phone?:string|null;readonly email?:string|null;readonly deletedAt?:unknown};
type Sent={readonly id:string;readonly channel:string;readonly status:string;readonly recipient:string;readonly contactId:string|null;readonly leadId:string|null;readonly lastInteractionAt:Date|string|null;readonly createdAt:Date|string};
type Inbound={readonly channel:string;readonly fromAddress:string;readonly contactId?:string|null;readonly linkedMessageId:string|null;readonly leadId:string|null;readonly receivedAt:Date|string};

/** Same address on a channel: phones by the identity rule of phoneIdentity.ts (same digits or same last 10), emails ignoring case. */
export function sameAddress({channel,a,b}:{channel:string;a:string|null|undefined;b:string|null|undefined}):boolean{
 if(!a?.trim()||!b?.trim())return false;
 return channel==='email'?a.trim().toLowerCase()===b.trim().toLowerCase():samePhone({a,b});
}

/**
 * «De quién vino» on opening a received message: its stored person when still active; else the only active person of the
 * business whose phone (WhatsApp) or email (email) matches the sender. Zero or several matches: '' («El negocio»), never a guess.
 */
export function inboundPerson({inbound,contacts}:{inbound:Inbound;contacts:readonly Person[]}):string{
 const active=contacts.filter(c=>!c.deletedAt);
 if(inbound.contactId&&active.some(c=>String(c.id)===String(inbound.contactId)))return String(inbound.contactId);
 if(inbound.channel!=='whatsapp'&&inbound.channel!=='email')return '';
 const matches=active.filter(c=>sameAddress({channel:inbound.channel,a:inbound.fromAddress,b:inbound.channel==='email'?c.email:c.phone}));
 return matches.length===1?String(matches[0].id):'';
}

const sentAt=(m:Sent)=>new Date(m.lastInteractionAt??m.createdAt).getTime();

/** «Responde a»: real sends of the chosen management (all when none is chosen), never filtered by person; the chosen person's first, newest first. */
export function replyCandidates<T extends Sent>({messages,leadId,contactId}:{messages:readonly T[];leadId:string;contactId:string}):T[]{
 const mine=(m:Sent)=>!!contactId&&String(m.contactId??'')===contactId?0:1;
 return messages.filter(m=>isRealSend(m.status)&&(!leadId||String(m.leadId??'')===leadId)).sort((a,b)=>mine(a)-mine(b)||sentAt(b)-sentAt(a));
}

/**
 * Send preselected for a received message: its stored link; else the most recent real send on the same channel to the sender's
 * address within `hours` before it was received, only when it is the only one. Otherwise '' («No, es una respuesta nueva»).
 */
export function inboundLinkedSend({inbound,messages,hours}:{inbound:Inbound;messages:readonly Sent[];hours:number}):string{
 if(inbound.linkedMessageId)return inbound.linkedMessageId;
 const received=new Date(inbound.receivedAt).getTime(),from=received-hours*3600_000;
 const near=replyCandidates({messages,leadId:inbound.leadId??'',contactId:''}).filter(m=>m.channel===inbound.channel&&sentAt(m)>=from&&sentAt(m)<=received&&sameAddress({channel:inbound.channel,a:m.recipient,b:inbound.fromAddress}));
 return near.length===1?near[0].id:'';
}

/** First concrete thing missing before «Guardar respuesta» (spec 99 §3.4), or null when it can be saved. */
export function responseSaveBlocker(input:{category:string;recipient:string;summary:string;otherDetail:string;confirmDoNotContact:boolean;reminder:boolean;reminderDate:string}):string|null{
 if(!input.category)return 'Elegí qué respondió.';
 if(!input.recipient.trim())return 'Completá el nombre de quien respondió.';
 if(!input.summary.trim())return 'Completá el resumen de lo que te dijo.';
 if(input.category==='other'&&!input.otherDetail.trim())return 'Contá la aclaración de «Otro».';
 if(input.category==='do_not_contact'&&!input.confirmDoNotContact)return 'Confirmá que no se le va a poder contactar desde el CRM.';
 if(input.category==='later'&&input.reminder&&!input.reminderDate)return 'Elegí la fecha del recordatorio.';
 return null;
}
