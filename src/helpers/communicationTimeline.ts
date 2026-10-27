import type {CommunicationResponse,InboundMessage,Message} from '../endpoints/communication.schema';
import {formatDay} from './crmDates';
import {responseCategoryLabel,userLabel,type LabelUser} from './crmLabels';
import {messageLabels} from './messageLabels';
import {ECHO_SENDER,ECHO_STATUS,INSTAGRAM_ECHO_OWNER,isInstagramInbound,isInstagramOutbound} from './instagramChannel';

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
/**
 * Honest status line of a sent bubble, from the existing status labels (accepted ≠ delivered, opened WhatsApp ≠ sent).
 * An Instagram echo was sent from the Instagram app and only recorded here.
 */
export const sentStatusLabel=(msg:{channel:string;ownerEmail:string;status:string}):string=>isInstagramEcho(msg)&&msg.status==='manual_sent'?ECHO_STATUS:messageLabels[msg.status]??msg.status;
/** How sure we are that a sent row went out: unconfirmed (opened, pending, uncertain, submitting), not done, failed, or sent. */
export type SentTone='sent'|'unconfirmed'|'not_done'|'failed';
export const sentTone=(status:string):SentTone=>status==='manual_not_done'?'not_done':status==='failed'?'failed':['whatsapp_opened','manual_pending','unknown','submitting'].includes(status)?'unconfirmed':'sent';

/** A management the conversation can name in its chip. */
export type TimelineManagement={id:string|number;opportunityName:string|null;assignedUserEmail?:string|null};
/** «Gestión: <name>» or «Sin gestión». */
export const managementChip=({leadId,name,managements}:{leadId:string|number|null|undefined;name?:string|null;managements:readonly TimelineManagement[]}):string=>{
 if(leadId==null||leadId==='')return 'Sin gestión';
 const found=managements.find(m=>String(m.id)===String(leadId));
 return 'Gestión: '+(found?.opportunityName||(name&&name!=='General'?name:'')||'Gestión #'+leadId);
};
/** Tag under a received message. */
export type TimelineTag={kind:'review'|'response'|'dismissed'|'automatic'|'auto_registered'|'voided';label:string};
/** «Respuesta registrada · <outcome>[ · completó la tarea «X»]». */
export const responseTagLabel=(response:Pick<CommunicationResponse,'category'|'resolvedTaskTitles'>):string=>{
 const tasks=(response.resolvedTaskTitles??[]).filter(Boolean);
 return `Respuesta registrada · ${responseCategoryLabel(response.category)}${tasks.length?` · completó ${tasks.length===1?'la tarea':'las tareas'} ${tasks.map(t=>`«${t}»`).join(', ')}`:''}`;
};

type Base={key:string;at:Date;day:string;channel:TimelineChannel;channelLabel:string;context:string};
export type ReceivedEntry=Base&{kind:'received';inbound:InboundMessage;sender:string;subject:string|null;text:string;response:CommunicationResponse|null;tags:TimelineTag[]};
export type SentEntry=Base&{kind:'sent';message:Message;sender:string;subject:string|null;text:string;status:string;tone:SentTone;label:string;echo:boolean;replyToInbound:boolean;autoRegistered:boolean;voided:boolean};
export type CallEntry=Base&{kind:'call';message:Message;sender:string;result:string;text:string;autoRegistered:boolean;voided:boolean};
export type ResponseEntry=Base&{kind:'response';response:CommunicationResponse;sender:string;text:string};
export type TimelineEntry=ReceivedEntry|SentEntry|CallEntry|ResponseEntry;
export type TimelineInput={messages:readonly Message[];inbound?:readonly InboundMessage[]|null;responses?:readonly CommunicationResponse[]|null;users?:readonly LabelUser[]|null;managements?:readonly TimelineManagement[]|null};

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

/**
 * One chronological list (oldest first) of sent messages, received messages, calls and responses registered without a
 * message. A response linked to a loaded received message is attached to it, never shown twice. Drafts and cancelled
 * rows stay out; voided rows only exist when the admin asked for them and are tagged.
 */
export function buildCommunicationTimeline({messages,inbound,responses,users,managements}:TimelineInput):TimelineEntry[]{
 const people=users??[],mgmt=managements??[],answers=responses??[],received=inbound??[];
 const byId=new Map(answers.map(r=>[String(r.id),r]));
 const attached=new Set(received.filter(i=>!!i.responseId&&byId.has(String(i.responseId))).map(i=>String(i.responseId)));
 const entries:TimelineEntry[]=[];
 for(const message of messages){
  if(isDraft(message)||message.status==='cancelled')continue;
  const at=new Date(message.lastInteractionAt??message.createdAt),instagram=isInstagramMessage(message),voided=message.status==='voided';
  const base={at,day:formatDay(at),channel:timelineChannel({channel:message.channel,instagram}),channelLabel:timelineChannelLabel({channel:message.channel,instagram}),context:managementChip({leadId:message.leadId,managements:mgmt})};
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
  if(item.status==='pending_review')tags.push({kind:'review',label:'Por revisar'});
  if(response)tags.push({kind:'response',label:responseTagLabel(response)});
  else if(item.status==='registered')tags.push({kind:'response',label:'Respuesta registrada'});
  if(item.status==='dismissed')tags.push({kind:'dismissed',label:'No es una respuesta'});
  if(item.isAutomatic)tags.push({kind:'automatic',label:'Automática · no cuenta como respuesta'});
  if(item.autoRegistrationId)tags.push({kind:'auto_registered',label:'Registrado automáticamente'});
  entries.push({kind:'received',key:'in:'+item.id,at,day:formatDay(at),channel:timelineChannel({channel:item.channel,instagram}),channelLabel:timelineChannelLabel({channel:item.channel,instagram}),context:managementChip({leadId:item.leadId,name:item.contextName,managements:mgmt}),inbound:item,sender:(item.fromName||item.fromAddress||'Remitente sin identificar').trim(),subject:item.channel==='email'?item.subject||'(sin asunto)':null,text:item.textBody??'',response,tags});
 }
 for(const response of answers){
  if(attached.has(String(response.id)))continue;
  // A response registered by hand cannot tell Instagram from another network, so a social one stays «Red social».
  // «sin mensaje» only when no received message is linked; a linked one may sit outside the loaded window (`hasInbound`).
  const at=new Date(response.occurredAt);
  entries.push({kind:'response',key:'response:'+response.id,at,day:formatDay(at),channel:timelineChannel({channel:response.channel,instagram:false}),channelLabel:timelineChannelLabel({channel:response.channel,instagram:false}),context:managementChip({leadId:response.leadId,name:response.contextName,managements:mgmt}),response,sender:userLabel(people,response.actorEmail),text:`${response.hasInbound?'Respuesta registrada':'Respuesta registrada sin mensaje'} · ${responseCategoryLabel(response.category)}`});
 }
 return entries.sort((a,b)=>time(a.at)-time(b.at)||a.key.localeCompare(b.key));
}

/** Chips with counts: «Todo» first, then only the channel groups present. */
export function timelineChips(entries:readonly TimelineEntry[]):{channel:TimelineChannel|'all';label:string;count:number}[]{
 return [{channel:'all' as const,label:'Todo',count:entries.length},...timelineChannelOrder.map(channel=>({channel,label:timelineChipLabels[channel],count:entries.filter(e=>e.channel===channel).length})).filter(chip=>chip.count>0)];
}
/** Client-side channel filter. */
export const filterTimeline=(entries:readonly TimelineEntry[],channel:TimelineChannel|'all'):TimelineEntry[]=>channel==='all'?[...entries]:entries.filter(e=>e.channel===channel);
/** The latest `limit` items unless the user asked for the older ones too. */
export const visibleTimeline=(entries:readonly TimelineEntry[],{showOlder,limit=TIMELINE_PAGE}:{showOlder:boolean;limit?:number}):{items:TimelineEntry[];hidden:number}=>showOlder||entries.length<=limit?{items:[...entries],hidden:0}:{items:entries.slice(-limit),hidden:entries.length-limit};
/** Items with the day separator each one needs (the first item and every day change). */
export const withDaySeparators=(entries:readonly TimelineEntry[]):{entry:TimelineEntry;separator:string|null}[]=>entries.map((entry,index)=>({entry,separator:index===0||entries[index-1].day!==entry.day?entry.day:null}));

/** One «Requiere acción» row: a received message to review or an opened-but-unconfirmed WhatsApp send. */
export type ActionItem={kind:'review';key:string;at:Date;inbound:InboundMessage}|{kind:'confirm_send';key:string;at:Date;message:Message};
/**
 * «Requiere acción», newest first: every received message «Por revisar» (its buttons follow the usual permissions) and the
 * «¿Lo enviaste?» prompts the viewer can answer (own WhatsApp opens, or any for an admin, on a writable view).
 */
export function requiresAction({inbound,messages,userEmail,admin,readOnly}:{inbound?:readonly InboundMessage[]|null;messages:readonly Message[];userEmail:string;admin:boolean;readOnly:boolean}):ActionItem[]{
 const review=(inbound??[]).filter(i=>i.status==='pending_review').map(i=>({kind:'review' as const,key:'in:'+i.id,at:new Date(i.receivedAt),inbound:i}));
 const confirm=readOnly?[]:messages.filter(m=>m.channel==='whatsapp'&&m.status==='whatsapp_opened'&&(admin||m.ownerEmail===userEmail)).map(m=>({kind:'confirm_send' as const,key:'out:'+m.id,at:new Date(m.lastInteractionAt??m.updatedAt),message:m}));
 return [...review,...confirm].sort((a,b)=>time(b.at)-time(a.at)||a.key.localeCompare(b.key));
}
/** Drafts (not sent, not opened), newest first. */
export const draftMessages=(messages:readonly Message[]):Message[]=>messages.filter(isDraft).sort((a,b)=>time(b.updatedAt)-time(a.updatedAt));
/** True when any list of GET /_api/communication came back full, so older items may be missing («Mostrando lo más reciente»). */
export const atListLimit=({messages,inbound,responses,limit}:{messages:readonly unknown[];inbound?:readonly unknown[]|null;responses?:readonly unknown[]|null;limit:number}):boolean=>[messages,inbound??[],responses??[]].some(list=>list.length>=limit);
