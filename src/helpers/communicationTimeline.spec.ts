import {describe,expect,it} from 'vitest';
import type {CommunicationResponse,InboundMessage,Message} from '../endpoints/communication.schema';
import {atListLimit,buildCommunicationTimeline,callResultLabel,sentTone,draftMessages,filterTimeline,managementChip,requiresAction,responseTagLabel,sentStatusLabel,timelineChannelLabel,timelineChips,visibleTimeline,withDaySeparators,type TimelineEntry} from './communicationTimeline';

const at=(day:number,hour=12)=>new Date(`2026-10-${String(day).padStart(2,'0')}T${String(hour).padStart(2,'0')}:00:00-03:00`);
const message=(over:Partial<Message>&{id:string}):Message=>({accountId:'5',leadId:null,contactId:null,channel:'whatsapp',recipient:'+5493442000000',recipientName:'Julia',subject:'',body:'',htmlBody:null,textBody:'Hola',templateSnapshot:null,ownerEmail:'leo@example.com',activityId:null,outboxId:null,taskId:null,status:'manual_sent',revision:1,lastInteractionAt:at(1),lastActorEmail:null,createdAt:at(1),updatedAt:at(1),...over});
const inbound=(over:Partial<InboundMessage>&{id:string}):InboundMessage=>({channel:'whatsapp',receivedAt:at(1),fromAddress:'+5493442000000',fromName:'Julia',subject:'',textBody:'Respuesta',status:'registered',isAutomatic:false,matchMethod:'phone',leadId:null,contextName:'General',linkedMessageId:null,responseId:null,attachments:[],canReply:false,replyAvailable:false,replyRestricted:false,...over});
const response=(over:Partial<CommunicationResponse>&{id:string}):CommunicationResponse=>({leadId:null,channel:'call',category:'interested',summary:'Le interesa',exactText:null,actorEmail:'leo@example.com',occurredAt:at(1),contextName:'General',...over});
const users=[{email:'leo@example.com',displayName:'Leandro'},{email:'sofia@example.com',displayName:'Sofía'}];
const managements=[{id:'7',opportunityName:'Alta en Hospeda',assignedUserEmail:'leo@example.com'}];
const keys=(entries:TimelineEntry[])=>entries.map(e=>e.key);

/** The acceptance business of spec 90: every channel and state in one conversation. */
const acceptance=()=>buildCommunicationTimeline({users,managements,
 messages:[
  message({id:'mail',channel:'email',subject:'Propuesta',textBody:'Te paso la propuesta',status:'accepted',leadId:'7',lastInteractionAt:at(15,10)}),
  message({id:'call',channel:'call',status:'manual_no_contact',summary:'No atendió el fijo',lastInteractionAt:at(18,11)}),
  message({id:'wa',textBody:'¿Pudieron verla?',status:'manual_sent',autoRegistrationId:'reg-1',autoRegistrationUserEmail:'leo@example.com',lastInteractionAt:at(19,10)}),
  message({id:'delegated',channel:'email',subject:'Datos',textBody:'Necesitamos fotos',status:'accepted',ownerEmail:'sofia@example.com',delegatedTaskId:'99',delegatedFromEmail:'leo@example.com',leadId:'7',lastInteractionAt:at(20,9)}),
  message({id:'echo',channel:'social',ownerEmail:'instagram@hospeda',recipient:'@aguas',textBody:'Por mail es mejor',status:'manual_sent',lastInteractionAt:at(22,18)}),
  message({id:'draft',status:'draft',lastInteractionAt:null,createdAt:at(25,16),updatedAt:at(25,16)}),
  message({id:'opened',status:'whatsapp_opened',lastInteractionAt:at(25,17)}),
  message({id:'cancelled',status:'cancelled'}),
 ],
 inbound:[
  inbound({id:'in-mail',channel:'email',subject:'Re: Propuesta',receivedAt:at(16,8),responseId:'r-mail'}),
  inbound({id:'in-wa',receivedAt:at(19,12),responseId:'r-task'}),
  inbound({id:'in-ig',channel:'social',fromAddress:'@aguas',fromName:'',receivedAt:at(22,18),status:'pending_review'}),
  inbound({id:'in-auto',channel:'email',subject:'Fuera de oficina',isAutomatic:true,status:'dismissed',receivedAt:at(23,9)}),
 ],
 responses:[
  response({id:'r-mail',category:'later',occurredAt:at(16,9)}),
  response({id:'r-task',category:'interested',occurredAt:at(19,13),resolvedTaskTitles:['Seguimiento de la propuesta']}),
  response({id:'r-free',category:'information',occurredAt:at(24,10),leadId:'7',contextName:'Alta en Hospeda'}),
 ]});

describe('buildCommunicationTimeline',()=>{
 it('merges sent, received, calls and responses oldest first, without drafts, cancelled rows or attached responses',()=>{
  expect(keys(acceptance())).toEqual(['out:mail','in:in-mail','call:call','out:wa','in:in-wa','out:delegated','in:in-ig','out:echo','in:in-auto','response:r-free','out:opened']);
 });
 it('attaches a response to its received message with the outcome and the resolved task',()=>{
  const entries=acceptance(),wa=entries.find(e=>e.key==='in:in-wa');
  expect(wa?.kind==='received'&&wa.tags.map(t=>t.label)).toEqual(['Respuesta registrada · Respondió, le interesa · completó la tarea «Seguimiento de la propuesta»']);
  expect(entries.filter(e=>e.kind==='response').map(e=>e.key)).toEqual(['response:r-free']);
 });
 it('shows a response without message as an event with its management chip',()=>{
  const free=acceptance().find(e=>e.key==='response:r-free');
  expect(free?.kind==='response'&&free.text).toBe('Respuesta registrada sin mensaje · Pidió información');
  expect(free?.context).toBe('Gestión: Alta en Hospeda');
 });
 it('names delegated senders, the Instagram echo and honest statuses',()=>{
  const entries=acceptance();
  const delegated=entries.find(e=>e.key==='out:delegated'),echo=entries.find(e=>e.key==='out:echo'),mail=entries.find(e=>e.key==='out:mail'),opened=entries.find(e=>e.key==='out:opened');
  expect(delegated?.kind==='sent'&&delegated.sender).toBe('Sofía, por delegación de Leandro');
  expect(echo?.kind==='sent'&&[echo.sender,echo.channelLabel,echo.status]).toEqual(['Instagram de Hospeda','Instagram','Enviado desde la app de Instagram de Hospeda · registrado automáticamente']);
  expect(mail?.kind==='sent'&&mail.status).toBe('Email aceptado por proveedor · entrega no confirmada');
  expect(opened?.kind==='sent'&&opened.status).toBe('WhatsApp abierto · envío no confirmado');
  expect(mail?.context).toBe('Gestión: Alta en Hospeda');
  expect(opened?.context).toBe('Sin gestión');
 });
 it('falls back to the management owner for a delegated send without the journal owner',()=>{
  const [entry]=buildCommunicationTimeline({users,managements,messages:[message({id:'d',ownerEmail:'sofia@example.com',delegatedTaskId:'1',delegatedFromEmail:null,leadId:'7'})]});
  expect(entry.kind==='sent'&&entry.sender).toBe('Sofía, por delegación de Leandro');
 });
 it('turns calls into events with a call result, never «Envío confirmado manualmente»',()=>{
  const call=acceptance().find(e=>e.key==='call:call');
  expect(call?.kind==='call'&&[call.result,call.text,call.channelLabel]).toEqual(['No atendió','No atendió el fijo','Llamada']);
  expect(callResultLabel('manual_sent')).toBe('Llamada realizada');
 });
 it('tags review, automatic replies and auto registrations; subject only for email',()=>{
  const entries=acceptance();
  const ig=entries.find(e=>e.key==='in:in-ig'),auto=entries.find(e=>e.key==='in:in-auto'),wa=entries.find(e=>e.key==='out:wa'),mail=entries.find(e=>e.key==='in:in-mail');
  expect(ig?.kind==='received'&&[ig.tags.map(t=>t.label),ig.subject,ig.sender,ig.channelLabel]).toEqual([['Por revisar'],null,'@aguas','Instagram']);
  expect(auto?.kind==='received'&&auto.tags.map(t=>t.label)).toEqual(['No es una respuesta','Automática · no cuenta como respuesta']);
  expect(wa?.kind==='sent'&&wa.autoRegistered).toBe(true);
  expect(mail?.kind==='received'&&mail.subject).toBe('Re: Propuesta');
  const [registered]=buildCommunicationTimeline({messages:[],inbound:[inbound({id:'x',autoRegistrationId:'r'})]});
  expect(registered.kind==='received'&&registered.tags.map(t=>t.label)).toEqual(['Respuesta registrada','Registrado automáticamente']);
 });
 it('keeps voided rows only when loaded, tagged as voided',()=>{
  const entries=buildCommunicationTimeline({messages:[message({id:'v',status:'voided'})],inbound:[inbound({id:'iv',status:'voided'})]});
  expect(entries.map(e=>e.kind==='sent'?[e.voided,e.status]:e.kind==='received'?e.tags.map(t=>t.label):null)).toEqual([['Registro anulado'],[true,'Registro anulado']]);
 });
 it('uses the interaction time and tolerates missing users or managements',()=>{
  const entries=buildCommunicationTimeline({messages:[message({id:'late',createdAt:at(1),lastInteractionAt:at(3)}),message({id:'early',createdAt:at(2),lastInteractionAt:at(2)})]});
  expect(keys(entries)).toEqual(['out:early','out:late']);
  expect(entries[0].kind==='sent'&&entries[0].sender).toBe('Otra persona del equipo');
 });
});

describe('chips, filter, days and paging',()=>{
 it('counts each channel group and shows only the present ones',()=>{
  expect(timelineChips(acceptance()).map(c=>`${c.label} · ${c.count}`)).toEqual(['Todo · 11','WhatsApp · 3','Email · 4','Instagram · 2','Llamadas · 2']);
  expect(timelineChips([]).map(c=>c.label)).toEqual(['Todo']);
 });
 it('filters on the client by channel group',()=>{
  expect(keys(filterTimeline(acceptance(),'instagram'))).toEqual(['in:in-ig','out:echo']);
  expect(keys(filterTimeline(acceptance(),'call'))).toEqual(['call:call','response:r-free']);
  expect(filterTimeline(acceptance(),'all')).toHaveLength(11);
 });
 it('puts other social networks and other channels under «Otros», named honestly',()=>{
  const entries=buildCommunicationTimeline({messages:[message({id:'fb',channel:'social',destinationDetail:'facebook.com/x'}),message({id:'ig',channel:'social',destinationDetail:'instagram.com/x'}),message({id:'tg',channel:'other'})]});
  expect(entries.map(e=>[e.channel,e.channelLabel])).toEqual([['other','Red social'],['instagram','Instagram'],['other','Otro canal']]);
  expect(timelineChips(entries).map(c=>c.label)).toEqual(['Todo','Instagram','Otros']);
  expect(timelineChannelLabel({channel:'call',instagram:false})).toBe('Llamada');
 });
 it('adds a day separator on the first item and on each Argentina day change',()=>{
  const entries=buildCommunicationTimeline({messages:[message({id:'a',lastInteractionAt:new Date('2026-10-20T23:30:00-03:00')}),message({id:'b',lastInteractionAt:new Date('2026-10-21T01:00:00Z')}),message({id:'c',lastInteractionAt:new Date('2026-10-21T09:00:00-03:00')})]});
  expect(withDaySeparators(entries).map(x=>x.separator===null?null:'day')).toEqual(['day',null,'day']);
 });
 it('shows the latest 30 and reveals the older ones on demand',()=>{
  const many=buildCommunicationTimeline({messages:Array.from({length:35},(_,i)=>message({id:'m'+String(i).padStart(2,'0'),lastInteractionAt:new Date(at(1).getTime()+i*60000)}))});
  const first=visibleTimeline(many,{showOlder:false});
  expect([first.items.length,first.hidden,first.items[0].key,first.items.at(-1)?.key]).toEqual([30,5,'out:m05','out:m34']);
  expect(visibleTimeline(many,{showOlder:true}).items).toHaveLength(35);
 });
});

describe('requiresAction and drafts',()=>{
 const messages=[message({id:'mine',status:'whatsapp_opened',lastInteractionAt:at(5)}),message({id:'other',status:'whatsapp_opened',ownerEmail:'sofia@example.com',lastInteractionAt:at(6)}),message({id:'mail-opened',channel:'email',status:'whatsapp_opened'}),message({id:'d1',status:'draft',updatedAt:at(2)}),message({id:'d2',channel:'email',status:'draft',updatedAt:at(3)})];
 const received=[inbound({id:'p',status:'pending_review',receivedAt:at(4)}),inbound({id:'done',status:'registered'})];
 it('lists received messages to review and the viewer’s unconfirmed WhatsApp sends, newest first',()=>{
  expect(requiresAction({inbound:received,messages,userEmail:'leo@example.com',admin:false,readOnly:false}).map(i=>i.key)).toEqual(['out:mine','in:p']);
  expect(requiresAction({inbound:received,messages,userEmail:'leo@example.com',admin:true,readOnly:false}).map(i=>i.key)).toEqual(['out:other','out:mine','in:p']);
 });
 it('never offers «¿Lo enviaste?» on a read-only view but keeps the review item',()=>{
  expect(requiresAction({inbound:received,messages,userEmail:'leo@example.com',admin:true,readOnly:true}).map(i=>i.key)).toEqual(['in:p']);
  expect(requiresAction({inbound:undefined,messages:[],userEmail:'',admin:false,readOnly:false})).toEqual([]);
 });
 it('keeps drafts apart, newest first',()=>{
  expect(draftMessages(messages).map(m=>m.id)).toEqual(['d2','d1']);
 });
});

describe('labels',()=>{
 it('words the response tag, management chip and sent status',()=>{
  expect(responseTagLabel({category:'later',resolvedTaskTitles:['A','B']})).toBe('Respuesta registrada · Pidió que lo contacte más adelante · completó las tareas «A», «B»');
  expect(responseTagLabel({category:'rejected'})).toBe('Respuesta registrada · No le interesa');
  expect(managementChip({leadId:'9',name:'General',managements:[]})).toBe('Gestión: Gestión #9');
  expect(managementChip({leadId:null,managements})).toBe('Sin gestión');
  expect(sentStatusLabel({channel:'social',ownerEmail:'leo@example.com',status:'manual_sent'})).toBe('Envío confirmado manualmente');
 });
});

describe('spec 90 review fixes',()=>{
 it('names a sent row neutrally with its status and marks unconfirmed, not done and failed rows (M2)',()=>{
  const entries=buildCommunicationTimeline({users,messages:[message({id:'o',status:'whatsapp_opened',lastInteractionAt:at(1)}),message({id:'n',status:'manual_not_done',lastInteractionAt:at(2)}),message({id:'f',channel:'email',status:'failed',lastInteractionAt:at(3)}),message({id:'s',status:'manual_sent',lastInteractionAt:at(4)}),message({id:'e',channel:'social',ownerEmail:'instagram@hospeda',status:'manual_sent',lastInteractionAt:at(5)})]});
  expect(entries.map(e=>e.kind==='sent'&&[e.tone,e.label])).toEqual([
   ['unconfirmed','WhatsApp de Leandro · WhatsApp abierto · envío no confirmado'],
   ['not_done','WhatsApp de Leandro · No enviado / no realizado'],
   ['failed','Email de Leandro · Rebote/fallo'],
   ['sent','WhatsApp de Leandro · Envío confirmado manualmente'],
   ['sent','Instagram de Hospeda · Enviado desde la app de Instagram de Hospeda · registrado automáticamente'],
  ]);
  expect(['manual_pending','unknown','submitting'].map(sentTone)).toEqual(['unconfirmed','unconfirmed','unconfirmed']);
  expect(entries.some(e=>e.kind==='sent'&&/enviado por/.test(e.label))).toBe(false);
 });
 it('says «sin mensaje» only when no received message is linked to the response (L1)',()=>{
  const entries=buildCommunicationTimeline({messages:[],responses:[response({id:'linked',hasInbound:true}),response({id:'free',hasInbound:false,occurredAt:at(2)})]});
  expect(entries.map(e=>e.kind==='response'&&e.text)).toEqual(['Respuesta registrada · Respondió, le interesa','Respuesta registrada sin mensaje · Respondió, le interesa']);
 });
 it('flags when any list came back full (L1)',()=>{
  expect(atListLimit({messages:[1,2],inbound:[1],responses:[],limit:2})).toBe(true);
  expect(atListLimit({messages:[1],inbound:null,responses:[1],limit:2})).toBe(false);
 });
 it('names a received social row from another network «Red social» under «Otros» (L2)',()=>{
  const entries=buildCommunicationTimeline({messages:[],inbound:[inbound({id:'fb',channel:'social',channelDetail:'facebook'}),inbound({id:'ig',channel:'social',channelDetail:'instagram',receivedAt:at(2)}),inbound({id:'legacy',channel:'social',channelDetail:null,receivedAt:at(3)})]});
  expect(entries.map(e=>[e.channel,e.channelLabel])).toEqual([['other','Red social'],['instagram','Instagram'],['instagram','Instagram']]);
 });
});
