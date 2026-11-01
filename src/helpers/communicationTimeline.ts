import type {CommunicationResponse,InboundMessage,Message} from '../endpoints/communication.schema';
import {formatDay} from './crmDates';
import {responseCategoryLabel,userLabel,type LabelUser} from './crmLabels';
import {messageLabels} from './messageLabels';
import {ECHO_SENDER,ECHO_STATUS,INSTAGRAM_ECHO_OWNER,isInstagramInbound,isInstagramOutbound} from './instagramChannel';
import {phoneNationalKeys} from './dataNormalization';
import {WHATSAPP_SCRIPT_WAIT_MS,isOpenedUnconfirmed} from './contactOutcome';
import {isInstagramAttempt,normalizeInstagramUsername} from './instagramChat';

export {ECHO_STATUS,INSTAGRAM_ECHO_OWNER};

/**
 * Spec 90: the business «Comunicación» tab reads as one conversation. These pure helpers merge sent messages, received
 * messages, calls and responses without a message into one chronological list, and build the «Requiere acción» and
 * «Borradores» blocks from the same GET /_api/communication data. Nothing here infers contact, reply or delivery.
 */

/** Channel groups of the conversation filter. `other` collects non-Instagram social logs and other channels. */
export type TimelineChannel='whatsapp'|'email'|'instagram'|'call'|'other';
/** Chip order and labels («Todo · WhatsApp · Email · Instagram · Llamadas», plus «Otros» only when present). */
export const timelineChannelOrder:readonly TimelineChannel[]=['whatsapp','email','instagram','call','other'];
export const timelineChipLabels:Readonly<Record<TimelineChannel,string>>={whatsapp:'WhatsApp',email:'Email',instagram:'Instagram',call:'Llamadas',other:'Otros'};
/** Most recent items shown before «Ver anteriores». */
export const TIMELINE_PAGE=30;

/** True only for the rows the Instagram webhook stores for Hospeda's own account, never for any other social message. */
export const isInstagramEcho=(msg:{channel:string;ownerEmail:string}):boolean=>msg.channel==='social'&&msg.ownerEmail===INSTAGRAM_ECHO_OWNER;
/** A sent social row is Instagram when it is an echo or its destination names Instagram (same rule as the Bandeja and the history). */
export const isInstagramMessage=(msg:{channel:string;ownerEmail:string;destinationDetail?:string|null}):boolean=>isInstagramOutbound(msg);
/** Filter group of a stored channel. */
export const timelineChannel=({channel,instagram}:{channel:string;instagram:boolean}):TimelineChannel=>channel==='whatsapp'||channel==='email'||channel==='call'?channel:channel==='social'&&instagram?'instagram':'other';
/** Channel name on a bubble: «Instagram» for Instagram, «Red social» for other social logs, «Otro canal» for the rest. */
export const timelineChannelLabel=({channel,instagram}:{channel:string;instagram:boolean}):string=>({whatsapp:'WhatsApp',email:'Email',call:'Llamada'} as Readonly<Record<string,string>>)[channel]??(channel==='social'?(instagram?'Instagram':'Red social'):'Otro canal');

/** Result of a call row in plain words (a call is not an «envío»). */
export const callResultLabel=(status:string):string=>({manual_sent:'Llamada realizada',manual_no_contact:'No atendió',manual_not_done:'No se hizo',manual_pending:'Falta anotar cómo salió',voided:messageLabels.voided} as Readonly<Record<string,string>>)[status]??messageLabels[status]??status;
/** Status line of an Instagram attempt that Meta's echo confirmed or linked (spec 92 §2.5). */
export const INSTAGRAM_CONFIRMED_STATUS='Enviado · confirmado por Instagram';
/** Status line of an opened Instagram attempt still waiting for the echo (spec 92 §2.4). */
export const INSTAGRAM_WAITING_STATUS='Esperando que Instagram confirme el envío…';
export const INSTAGRAM_WAITING_HINT='Si lo enviaste desde la cuenta de Hospeda se confirma solo. Si ya sabés cómo salió, marcalo con «Sí, se envió» o «No se envió».';
/**
 * Honest status line of a sent bubble, from the existing status labels (accepted ≠ delivered, opened WhatsApp ≠ sent).
 * An Instagram echo was sent from the Instagram app and only recorded here; an Instagram attempt carrying the echo `mid`
 * was confirmed by Instagram.
 */
export const sentStatusLabel=(msg:{channel:string;ownerEmail:string;status:string;destinationDetail?:string|null;externalId?:string|null;confirmationSource?:'userscript'|'instagram'|'manual'}):string=>isInstagramEcho(msg)&&msg.status==='manual_sent'?ECHO_STATUS:msg.confirmationSource==='instagram'&&msg.status==='manual_sent'?INSTAGRAM_CONFIRMED_STATUS:msg.channel==='whatsapp'&&msg.status==='manual_sent'&&msg.confirmationSource==='userscript'?'Enviado · confirmado por el script de WhatsApp':messageLabels[msg.status]??msg.status;
/** How sure we are that a sent row went out: unconfirmed (opened, pending, uncertain, submitting), not done, failed, or sent. */
export type SentTone='sent'|'unconfirmed'|'not_done'|'failed';
export const sentTone=(status:string):SentTone=>status==='manual_not_done'?'not_done':status==='failed'?'failed':isOpenedUnconfirmed(status)||['manual_pending','unknown','submitting'].includes(status)?'unconfirmed':'sent';

/** A management the conversation can name in its chip. */
export type TimelineManagement={id:string|number;opportunityName:string|null;assignedUserEmail?:string|null};
/** Name of the management of an item, or null without management. */
export const managementName=({leadId,name,managements}:{leadId:string|number|null|undefined;name?:string|null;managements:readonly TimelineManagement[]}):string|null=>{
 if(leadId==null||leadId==='')return null;
 const found=managements.find(m=>String(m.id)===String(leadId));
 return found?.opportunityName||(name&&name!=='General'?name:'')||'Gestión #'+leadId;
};
/** «Gestión: <name>» or «Sin gestión». */
export const managementChip=(input:{leadId:string|number|null|undefined;name?:string|null;managements:readonly TimelineManagement[]}):string=>{
 const name=managementName(input);
 return name==null?'Sin gestión':'Gestión: '+name;
};
/** The `context`, `managementId` and `managementName` of an entry (spec 91: the chip shows only when there is a management). */
const managementOf=(input:{leadId:string|number|null|undefined;name?:string|null;managements:readonly TimelineManagement[]})=>{
 const name=managementName(input);
 return {context:name==null?'Sin gestión':'Gestión: '+name,managementId:name==null?null:String(input.leadId),managementName:name};
};
/** Tag under a received message. */
export type TimelineTag={kind:'review'|'replied'|'response'|'dismissed'|'automatic'|'auto_registered'|'voided';label:string};
/** Spec 99 §3.5: «Por revisar» is `pending_review` without a CRM reply with evidence of sending (`repliedAt`, same rule as inboundReview.ts). */
export const awaitingReview=(item:{status:string;repliedAt?:Date|string|null}):boolean=>item.status==='pending_review'&&!item.repliedAt;
/** «Respuesta registrada · <outcome>[ · completó la tarea «X»]». */
export const responseTagLabel=(response:Pick<CommunicationResponse,'category'|'resolvedTaskTitles'>):string=>{
 const tasks=(response.resolvedTaskTitles??[]).filter(Boolean);
 return `Respuesta registrada · ${responseCategoryLabel(response.category)}${tasks.length?` · completó ${tasks.length===1?'la tarea':'las tareas'} ${tasks.map(t=>`«${t}»`).join(', ')}`:''}`;
};

type Base={key:string;at:Date;day:string;channel:TimelineChannel;channelLabel:string;context:string;managementId:string|null;managementName:string|null};
export type ReceivedEntry=Base&{kind:'received';inbound:InboundMessage;sender:string;subject:string|null;text:string;response:CommunicationResponse|null;tags:TimelineTag[]};
export type SentEntry=Base&{kind:'sent';message:Message;sender:string;subject:string|null;text:string;status:string;tone:SentTone;label:string;echo:boolean;replyToInbound:boolean;autoRegistered:boolean;voided:boolean};
export type CallEntry=Base&{kind:'call';message:Message;sender:string;result:string;text:string;autoRegistered:boolean;voided:boolean};
export type ResponseEntry=Base&{kind:'response';response:CommunicationResponse;sender:string;text:string};
export type TimelineEntry=ReceivedEntry|SentEntry|CallEntry|ResponseEntry;
export type TimelineInput={messages:readonly Message[];inbound?:readonly InboundMessage[]|null;responses?:readonly CommunicationResponse[]|null;users?:readonly LabelUser[]|null;managements?:readonly TimelineManagement[]|null;/** «Mostrar anulados» is on: also list the sends answered «No se envió». */showVoided?:boolean};

const time=(value:Date|string|null|undefined)=>{const t=value?new Date(value).getTime():NaN;return Number.isNaN(t)?0:t};
/** Sender of a sent message: «X, por delegación de Y», «Instagram de Hospeda» for echoes, otherwise the owner's name. */
export const sentSender=({message,users,managements}:{message:Message;users:readonly LabelUser[];managements:readonly TimelineManagement[]}):string=>{
 if(isInstagramEcho(message))return ECHO_SENDER;
 const owner=userLabel(users,message.ownerEmail);
 if(!message.delegatedTaskId)return owner;
 const from=message.delegatedFromEmail??managements.find(m=>String(m.id)===String(message.leadId))?.assignedUserEmail;
 return `${owner}, por delegación de ${userLabel(users,from)}`;
};
/** Messages that belong to «Borradores», not to the conversation. */
export const isDraft=(msg:{status:string}):boolean=>msg.status==='draft';
/** A send answered «No se envió» (or a manual attempt resolved as not done). A call «No se hizo» is not a send and stays listed. */
export const isNotSentAttempt=(msg:{channel:string;status:string}):boolean=>msg.channel!=='call'&&msg.status==='manual_not_done';
/**
 * Spec 92 owner decision: an opened WhatsApp or Instagram that nobody confirmed yet is not part of the conversation; it lives
 * only in «Requiere acción» until it is confirmed (by hand, by the user script or by Instagram's echo). A send answered
 * «No se envió» only shows with «Mostrar anulados».
 */
export const isHiddenFromConversation=(msg:{channel:string;status:string},showVoided=false):boolean=>isOpenedUnconfirmed(msg.status)||(!showVoided&&isNotSentAttempt(msg));

/**
 * One chronological list (oldest first) of sent messages, received messages, calls and responses registered without a
 * message. A response linked to a loaded received message is attached to it, never shown twice. Drafts, cancelled rows and
 * unconfirmed opens stay out (`isHiddenFromConversation`); voided and «No se envió» rows only show when the admin asked
 * for them (`showVoided`) and are tagged.
 */
export function buildCommunicationTimeline({messages,inbound,responses,users,managements,showVoided=false}:TimelineInput):TimelineEntry[]{
 const people=users??[],mgmt=managements??[],answers=responses??[],received=inbound??[];
 const byId=new Map(answers.map(r=>[String(r.id),r]));
 const attached=new Set(received.filter(i=>!!i.responseId&&byId.has(String(i.responseId))).map(i=>String(i.responseId)));
 const entries:TimelineEntry[]=[];
 for(const message of messages){
  if(isDraft(message)||message.status==='cancelled'||isHiddenFromConversation(message,showVoided))continue;
  const at=new Date(message.lastInteractionAt??message.createdAt),instagram=isInstagramMessage(message),voided=message.status==='voided';
  const base={at,day:formatDay(at),channel:timelineChannel({channel:message.channel,instagram}),channelLabel:timelineChannelLabel({channel:message.channel,instagram}),...managementOf({leadId:message.leadId,managements:mgmt})};
  if(message.channel==='call')entries.push({...base,kind:'call',key:'call:'+message.id,message,sender:userLabel(people,message.ownerEmail),result:callResultLabel(message.status),text:(message.summary||'').trim(),autoRegistered:!!message.autoRegistrationId,voided});
  else{
   const sender=sentSender({message,users:people,managements:mgmt}),status=sentStatusLabel(message),echo=isInstagramEcho(message);
   // Neutral name: «WhatsApp de Ana · WhatsApp abierto · envío no confirmado» never claims that something was sent.
   entries.push({...base,kind:'sent',key:'out:'+message.id,message,sender,subject:message.channel==='email'?message.subject||null:null,text:(message.textBody||message.body||message.summary||'').trim(),status,tone:voided?'not_done':sentTone(message.status),label:`${echo?sender:`${base.channelLabel} de ${sender}`} · ${status}`,echo,replyToInbound:!!message.templateSnapshot?.inboundId,autoRegistered:!!message.autoRegistrationId,voided});
  }
 }
 for(const item of received){
  const at=new Date(item.receivedAt),instagram=isInstagramInbound(item);
  const response=item.responseId?byId.get(String(item.responseId))??null:null;
  const tags:TimelineTag[]=[];
  if(item.status==='voided')tags.push({kind:'voided',label:messageLabels.voided});
  if(awaitingReview(item))tags.push({kind:'review',label:'Por revisar'});
  else if(item.status==='pending_review')tags.push({kind:'replied',label:'Respondido desde el CRM'});
  if(response)tags.push({kind:'response',label:responseTagLabel(response)});
  else if(item.status==='registered')tags.push({kind:'response',label:'Respuesta registrada'});
  if(item.status==='dismissed')tags.push({kind:'dismissed',label:'No es una respuesta'});
  if(item.isAutomatic)tags.push({kind:'automatic',label:'Automática · no cuenta como respuesta'});
  if(item.autoRegistrationId)tags.push({kind:'auto_registered',label:'Registrado automáticamente'});
  entries.push({kind:'received',key:'in:'+item.id,at,day:formatDay(at),channel:timelineChannel({channel:item.channel,instagram}),channelLabel:timelineChannelLabel({channel:item.channel,instagram}),...managementOf({leadId:item.leadId,name:item.contextName,managements:mgmt}),inbound:item,sender:(item.fromName||item.fromAddress||'Remitente sin identificar').trim(),subject:item.channel==='email'?item.subject||'(sin asunto)':null,text:item.textBody??'',response,tags});
 }
 for(const response of answers){
  if(attached.has(String(response.id)))continue;
  // A response registered by hand cannot tell Instagram from another network, so a social one stays «Red social».
  // «sin mensaje» only when no received message is linked; a linked one may sit outside the loaded window (`hasInbound`).
  const at=new Date(response.occurredAt);
  entries.push({kind:'response',key:'response:'+response.id,at,day:formatDay(at),channel:timelineChannel({channel:response.channel,instagram:false}),channelLabel:timelineChannelLabel({channel:response.channel,instagram:false}),...managementOf({leadId:response.leadId,name:response.contextName,managements:mgmt}),response,sender:userLabel(people,response.actorEmail),text:`${response.hasInbound?'Respuesta registrada':'Respuesta registrada sin mensaje'} · ${responseCategoryLabel(response.category)}`});
 }
 return entries.sort((a,b)=>time(a.at)-time(b.at)||a.key.localeCompare(b.key));
}

/** Chips with counts: «Todo» first, then only the channel groups present. */
export function timelineChips(entries:readonly TimelineEntry[]):{channel:TimelineChannel|'all';label:string;count:number}[]{
 return [{channel:'all' as const,label:'Todo',count:entries.length},...timelineChannelOrder.map(channel=>({channel,label:timelineChipLabels[channel],count:entries.filter(e=>e.channel===channel).length})).filter(chip=>chip.count>0)];
}
/** Management filter value: every item, items without management, or one management id. */
export type ManagementFilter='all'|'none'|`lead:${string}`;
/**
 * Spec 91 §11: «Todas las gestiones · <each management present> · Sin gestión», only when the items belong to two or more
 * distinct values (counting «Sin gestión» as one). Empty when the selector is not needed.
 */
export function managementOptions(entries:readonly TimelineEntry[]):{value:ManagementFilter;label:string}[]{
 const named=new Map<string,string>();let none=false;
 for(const e of entries){if(e.managementId==null)none=true;else if(!named.has(e.managementId))named.set(e.managementId,e.managementName??'Gestión #'+e.managementId);}
 if(named.size+(none?1:0)<2)return [];
 return [{value:'all',label:'Todas las gestiones'},...[...named].sort((a,b)=>a[1].localeCompare(b[1],'es')).map(([id,label])=>({value:`lead:${id}` as const,label})),...(none?[{value:'none' as const,label:'Sin gestión'}]:[])];
}
/** Client-side channel and management filter (they combine). */
export const filterTimeline=(entries:readonly TimelineEntry[],channel:TimelineChannel|'all',management:ManagementFilter='all'):TimelineEntry[]=>entries.filter(e=>(channel==='all'||e.channel===channel)&&(management==='all'||(management==='none'?e.managementId==null:'lead:'+e.managementId===management)));
/** The latest `limit` items unless the user asked for the older ones too. */
export const visibleTimeline=(entries:readonly TimelineEntry[],{showOlder,limit=TIMELINE_PAGE}:{showOlder:boolean;limit?:number}):{items:TimelineEntry[];hidden:number}=>showOlder||entries.length<=limit?{items:[...entries],hidden:0}:{items:entries.slice(-limit),hidden:entries.length-limit};
/** Items with the day separator each one needs (the first item and every day change). */
export const withDaySeparators=(entries:readonly TimelineEntry[]):{entry:TimelineEntry;separator:string|null}[]=>entries.map((entry,index)=>({entry,separator:index===0||entries[index-1].day!==entry.day?entry.day:null}));

/** True for an opened send the viewer may answer «¿Lo enviaste?» for: a WhatsApp, or an Instagram attempt (spec 92). */
/** Spec 100 §9 (D7): what an opened WhatsApp shows while the user script can still confirm it. */
export const WHATSAPP_WAITING_STATUS='Esperando que el script de WhatsApp confirme el envío';
export const WHATSAPP_WAITING_HINT='Si lo enviaste desde la computadora con el script se confirma solo. Si ya sabés cómo salió, marcalo con «Sí, se envió» o «No se envió».';
type WaitLike={channel:string;status:string;lastInteractionAt?:Date|string|null};
/**
 * An opened WhatsApp younger than 5 minutes: the server leaves it out of «¿Lo enviaste?» (not counted) while the user script can
 * confirm it, and the panel still lists it, answerable. Like the Instagram wait, `now` is the client clock: only a display delay.
 */
export function isWaitingForScript({message,now=Date.now()}:{message:WaitLike;now?:number}):boolean{
 if(message.status!=='whatsapp_opened'||message.channel!=='whatsapp')return false;
 const at=message.lastInteractionAt?new Date(message.lastInteractionAt).getTime():NaN;
 return !Number.isNaN(at)&&now-at<WHATSAPP_SCRIPT_WAIT_MS;
}
/** Milliseconds until a waiting WhatsApp open starts counting as «¿Lo enviaste?», or null when it is not waiting. */
export function scriptWaitRemainingMs({message,now=Date.now()}:{message:WaitLike;now?:number}):number|null{
 return isWaitingForScript({message,now})?WHATSAPP_SCRIPT_WAIT_MS-(now-new Date(message.lastInteractionAt!).getTime()):null;
}
export const isConfirmableOpen=(m:{channel:string;status:string;ownerEmail?:string|null;destinationDetail?:string|null}):boolean=>isOpenedUnconfirmed(m.status)&&(m.status==='whatsapp_opened'?m.channel==='whatsapp':isInstagramAttempt(m));
/** One «Requiere acción» row: a received message to review or an opened-but-unconfirmed WhatsApp or Instagram send (not in the conversation). */
export type ActionItem={kind:'review';key:string;at:Date;inbound:InboundMessage}|{kind:'confirm_send';key:string;at:Date;message:Message};
/**
 * «Requiere acción», newest first: every received message «Por revisar» (its buttons follow the usual permissions) and every
 * opened send the viewer can answer (own WhatsApp or Instagram opens, or any for an admin, on a writable view). An Instagram
 * attempt still waiting for its echo is listed too: the entry says it is waiting and already offers «Sí» / «No».
 */
export function requiresAction({inbound,messages,userEmail,admin,readOnly}:{inbound?:readonly InboundMessage[]|null;messages:readonly Message[];userEmail:string;admin:boolean;readOnly:boolean}):ActionItem[]{
 const review=(inbound??[]).filter(awaitingReview).map(i=>({kind:'review' as const,key:'in:'+i.id,at:new Date(i.receivedAt),inbound:i}));
 const confirm=readOnly?[]:messages.filter(m=>isConfirmableOpen(m)&&(admin||m.ownerEmail===userEmail)).map(m=>({kind:'confirm_send' as const,key:'out:'+m.id,at:new Date(m.lastInteractionAt??m.updatedAt),message:m}));
 return [...review,...confirm].sort((a,b)=>time(b.at)-time(a.at)||a.key.localeCompare(b.key));
}
/** Drafts (not sent, not opened), newest first. */
export const draftMessages=(messages:readonly Message[]):Message[]=>messages.filter(isDraft).sort((a,b)=>time(b.updatedAt)-time(a.updatedAt));
/** True when any list of GET /_api/communication came back full, so older items may be missing («Mostrando lo más reciente»). */
export const atListLimit=({messages,inbound,responses,limit}:{messages:readonly unknown[];inbound?:readonly unknown[]|null;responses?:readonly unknown[]|null;limit:number}):boolean=>[messages,inbound??[],responses??[]].some(list=>list.length>=limit);

/** Lines after which a bubble is clamped with «Ver más» (spec 91 §7): about 6 for email, about 12 for the other channels. */
export const clampLinesFor=(channel:TimelineChannel):number=>channel==='email'?6:12;
/** Rough number of rendered lines of a text (each paragraph wraps every `perLine` characters), used when layout cannot be measured. */
export const estimatedLines=(text:string,perLine=90):number=>text.split('\n').reduce((sum,line)=>sum+Math.max(1,Math.ceil(line.length/perLine)),0);
/** DOM id of a conversation item, for scrolling to it from «Requiere acción». */
export const timelineDomId=(key:string):string=>'comm-item-'+key.replace(/[^a-zA-Z0-9_-]/g,'-');

/** True when the viewer authored the item (sent it, made the call or registered the response): it is never «nuevo» for them. */
export const authoredBy=(entry:TimelineEntry,userEmail:string):boolean=>entry.kind==='sent'||entry.kind==='call'?entry.message.ownerEmail===userEmail:entry.kind==='response'?entry.response.actorEmail===userEmail:false;
/** True for a voided or «No se envió» row (only listed when an admin turns on «Mostrar anulados»): it is never new nor marks a visit. */
export const isVoidedEntry=(entry:TimelineEntry):boolean=>entry.kind==='received'?entry.inbound.status==='voided':entry.kind==='response'?false:entry.voided||(entry.kind==='sent'&&isNotSentAttempt(entry.message));
/**
 * Spec 91 §12: key of the first item newer than the viewer's previous visit, ignoring what the viewer authored and voided rows.
 * Null on the first visit (no previous visit) or when nothing is new. `entries` are in chronological order.
 * Known limit: the comparison uses each item's own time (`at`), so an item registered after the visit but dated before it
 * (a call or response logged late, a message confirmed by hand) never shows as new.
 */
export function newSinceKey({entries,lastSeenAt,userEmail}:{entries:readonly TimelineEntry[];lastSeenAt:Date|string|null|undefined;userEmail:string}):string|null{
 if(!lastSeenAt)return null;
 const seen=time(lastSeenAt);
 return entries.find(e=>time(e.at)>seen&&!authoredBy(e,userEmail)&&!isVoidedEntry(e))?.key??null;
}
/** Time of the newest loaded item that is not voided, sent to POST /_api/communication/seen (never the client clock). */
export const newestAt=(entries:readonly TimelineEntry[]):Date|null=>{const times=entries.filter(e=>!isVoidedEntry(e)).map(e=>time(e.at));return times.length?new Date(Math.max(...times)):null;};

/** Spec 91 §9: «N mensajes por revisar · M envíos sin confirmar · K gestiones sin resultado» (only the non-zero parts; spec 100 §5.1: `outcomes` counts management groups). */
export function actionSummary({review,unconfirmed,outcomes}:{review:number;unconfirmed:number;outcomes:number}):string{
 return [review?`${review} ${review===1?'mensaje por revisar':'mensajes por revisar'}`:'',unconfirmed?`${unconfirmed} ${unconfirmed===1?'envío sin confirmar':'envíos sin confirmar'}`:'',outcomes?`${outcomes} ${outcomes===1?'gestión sin resultado':'gestiones sin resultado'}`:''].filter(Boolean).join(' · ');
}

/** Who can receive a reply from the composer: the business people and its own email and phones. */
export type ReplyRecipients={account:{email?:string|null;telefono?:string|null;whatsapp?:string|null;perfilInstagram?:string|null};contacts:readonly {id:string|number;email?:string|null;phone?:string|null;deletedAt?:unknown}[]};
/** What «Preparar respuesta» opens: the channel and recipient to preselect (`contactId` '' is the business own channel), or why it falls back to the defaults. */
export type ReplyTarget={channel?:'email'|'whatsapp'|'instagram';contactId?:string;reason:string};
/** The last received message «Preparar respuesta» answers: the newest one that is not voided, preferring one that is not automatic. */
export function lastReceived(inbound:readonly InboundMessage[]|null|undefined):InboundMessage|null{
 const list=(inbound??[]).filter(i=>i.status!=='voided').sort((a,b)=>time(b.receivedAt)-time(a.receivedAt));
 return list.find(i=>!i.isAutomatic)??list[0]??null;
}
const samePhone=(a:string|null|undefined,b:string|null|undefined)=>{const keys=phoneNationalKeys(a);return !!keys.length&&phoneNationalKeys(b).some(k=>keys.includes(k));};
/**
 * Spec 92 §2.1: an Instagram reply goes to the business username, the only Instagram destination. It is prepared only when the
 * sender is that same username and no business-level `social` or `all` restriction is active; otherwise «Contactar» opens
 * with its defaults and the reason.
 */
function instagramReplyTarget({item,recipients,restrictions}:{item:InboundMessage;recipients:ReplyRecipients;restrictions:readonly {channel:string;contactId?:string|number|null;leadId?:string|number|null;liftedAt?:unknown;reason?:string|null}[]}):ReplyTarget{
 const own=normalizeInstagramUsername(recipients.account.perfilInstagram);
 if(!own)return {reason:'El negocio no tiene usuario de Instagram cargado: elegí el canal en «Contactar».'};
 const sender=normalizeInstagramUsername(item.fromAddress);
 if(sender!==own)return {reason:`${(item.fromAddress||'El remitente').trim()} no es el Instagram cargado en el negocio (@${own}): elegí el canal en «Contactar».`};
 const blocked=restrictions.some(r=>!r.liftedAt&&(r.channel==='all'||r.channel==='social')&&r.contactId==null&&r.leadId==null);
 if(blocked)return {reason:'Hay una restricción activa de Instagram para ese destinatario: «Contactar» se abre sin preseleccionarlo.'};
 return {channel:'instagram',contactId:'',reason:''};
}
/**
 * Spec 91 §10: the channel and recipient of the last received message, as the composer would get them by hand. Only email and
 * WhatsApp can be prepared from the composer; a sender that is not a person of the business nor its own email or phone, or a
 * channel with an active restriction, falls back to the composer's defaults with the reason. It only prepares a message.
 */
export function replyTarget({item,recipients,restrictions}:{item:InboundMessage;recipients:ReplyRecipients;restrictions:readonly {channel:string;contactId?:string|number|null;leadId?:string|number|null;liftedAt?:unknown;reason?:string|null}[]}):ReplyTarget{
 const label=timelineChannelLabel({channel:item.channel,instagram:isInstagramInbound(item)});
 if(item.channel==='social'&&isInstagramInbound(item))return instagramReplyTarget({item,recipients,restrictions});
 if(item.channel!=='email'&&item.channel!=='whatsapp')return {reason:`«Preparar respuesta» no prepara mensajes por ${label}: elegí el canal en «Contactar».`};
 const channel=item.channel,from=(item.fromAddress||'').trim();
 const people=recipients.contacts.filter(c=>!c.deletedAt);
 const person=people.find(c=>channel==='email'?!!c.email&&c.email.trim().toLowerCase()===from.toLowerCase():samePhone(c.phone,from));
 const {email,telefono,whatsapp}=recipients.account;
 const own=!person&&(channel==='email'?!!email&&email.trim().toLowerCase()===from.toLowerCase():samePhone(whatsapp,from)||samePhone(telefono,from));
 const contactId=person?String(person.id):own?'':undefined;
 const blocked=restrictions.some(r=>!r.liftedAt&&(r.channel==='all'||r.channel===channel)&&(r.contactId==null||String(r.contactId)===contactId));
 if(blocked)return {reason:`Hay una restricción activa de ${label} para ese destinatario: «Contactar» se abre sin preseleccionarlo.`};
 if(contactId===undefined)return {channel,reason:`${from||'El remitente'} no está cargado como persona ni como canal del negocio: elegí el destinatario en «Contactar».`};
 if(contactId===''){
  // The composers only use the business own channel when no person can receive on it, and they resolve it to `email` or, for
  // WhatsApp, to `telefono` (the management composer) or `whatsapp||telefono` (the general one). Anything else would
  // preselect a different recipient than the sender, so only the channel is prepared and the user picks.
  const reachable=people.some(c=>String(channel==='email'?c.email??'':c.phone??'').trim());
  const exact=channel==='email'||(samePhone(telefono,from)&&(!String(whatsapp??'').trim()||samePhone(whatsapp,from)));
  if(reachable||!exact)return {channel,reason:`«Contactar» no puede preseleccionar ${from||'el canal del negocio'}: elegí el destinatario.`};
 }
 return {channel,contactId,reason:''};
}
