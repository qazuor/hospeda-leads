import {describe,expect,it} from 'vitest';
import type {CommunicationResponse,InboundMessage,Message} from '../endpoints/communication.schema';
import {actionSummary,buildCommunicationTimeline,clampLinesFor,estimatedLines,filterTimeline,lastReceived,managementOptions,newSinceKey,newestAt,replyTarget,timelineDomId} from './communicationTimeline';

// Spec 91: management filter, «Nuevo desde tu última visita», clamping, the «Requiere acción» summary and «Responder».
const at=(day:number,hour=12)=>new Date(`2026-10-${String(day).padStart(2,'0')}T${String(hour).padStart(2,'0')}:00:00-03:00`);
const message=(over:Partial<Message>&{id:string}):Message=>({accountId:'5',leadId:null,contactId:null,channel:'whatsapp',recipient:'+5493442000000',recipientName:'Julia',subject:'',body:'',htmlBody:null,textBody:'Hola',templateSnapshot:null,ownerEmail:'leo@example.com',activityId:null,outboxId:null,taskId:null,status:'manual_sent',revision:1,lastInteractionAt:at(1),lastActorEmail:null,createdAt:at(1),updatedAt:at(1),...over});
const inbound=(over:Partial<InboundMessage>&{id:string}):InboundMessage=>({channel:'whatsapp',receivedAt:at(1),fromAddress:'+54 9 3442 000000',fromName:'Julia',subject:'',textBody:'Respuesta',status:'registered',isAutomatic:false,matchMethod:'phone',leadId:null,contextName:'General',linkedMessageId:null,responseId:null,attachments:[],canReply:false,replyAvailable:false,replyRestricted:false,...over});
const response=(over:Partial<CommunicationResponse>&{id:string}):CommunicationResponse=>({leadId:null,channel:'call',category:'interested',summary:'Le interesa',exactText:null,actorEmail:'leo@example.com',occurredAt:at(1),contextName:'General',...over});
const managements=[{id:'7',opportunityName:'Alta en Hospeda'},{id:'8',opportunityName:'Renovación'}];

describe('management filter (spec 91 §11)',()=>{
 const entries=buildCommunicationTimeline({managements,messages:[message({id:'a',leadId:'7'}),message({id:'b',leadId:'8',channel:'email',lastInteractionAt:at(2)})],inbound:[inbound({id:'c',receivedAt:at(3)})]});
 it('offers «Todas las gestiones», each management present and «Sin gestión», sorted by name',()=>{
  expect(managementOptions(entries)).toEqual([{value:'all',label:'Todas las gestiones'},{value:'lead:7',label:'Alta en Hospeda'},{value:'lead:8',label:'Renovación'},{value:'none',label:'Sin gestión'}]);
 });
 it('is not needed with a single distinct value, counting «Sin gestión» as one',()=>{
  expect(managementOptions(buildCommunicationTimeline({managements,messages:[message({id:'a',leadId:'7'}),message({id:'b',leadId:'7'})]}))).toEqual([]);
  expect(managementOptions(buildCommunicationTimeline({managements,messages:[message({id:'a'})],inbound:[inbound({id:'b'})]}))).toEqual([]);
  expect(managementOptions(buildCommunicationTimeline({managements,messages:[message({id:'a',leadId:'7'})],inbound:[inbound({id:'b'})]})).map(o=>o.value)).toEqual(['all','lead:7','none']);
 });
 it('combines with the channel filter',()=>{
  expect(filterTimeline(entries,'all','lead:7').map(e=>e.key)).toEqual(['out:a']);
  expect(filterTimeline(entries,'all','none').map(e=>e.key)).toEqual(['in:c']);
  expect(filterTimeline(entries,'whatsapp','none').map(e=>e.key)).toEqual(['in:c']);
  expect(filterTimeline(entries,'email','lead:7')).toEqual([]);
  expect(filterTimeline(entries,'whatsapp').map(e=>e.key)).toEqual(['out:a','in:c']);
 });
 it('keeps the chip text and exposes the management only when there is one',()=>{
  const [a,,c]=entries;
  expect([a.managementId,a.managementName,a.context]).toEqual(['7','Alta en Hospeda','Gestión: Alta en Hospeda']);
  expect([c.managementId,c.managementName,c.context]).toEqual([null,null,'Sin gestión']);
 });
});

describe('«Nuevo desde tu última visita» (spec 91 §12)',()=>{
 const entries=buildCommunicationTimeline({messages:[message({id:'old',lastInteractionAt:at(1)}),message({id:'mine',lastInteractionAt:at(3)}),message({id:'theirs',ownerEmail:'sofia@example.com',lastInteractionAt:at(5)})],inbound:[inbound({id:'in',receivedAt:at(4)})],responses:[response({id:'r',occurredAt:at(3,15)})]});
 it('marks the first item newer than the previous visit that the viewer did not author',()=>{
  expect(newSinceKey({entries,lastSeenAt:at(2),userEmail:'leo@example.com'})).toBe('in:in');
  expect(newSinceKey({entries,lastSeenAt:at(2),userEmail:'sofia@example.com'})).toBe('out:mine');
  expect(newSinceKey({entries,lastSeenAt:at(4,18),userEmail:'leo@example.com'})).toBe('out:theirs');
 });
 it('shows nothing on the first visit or when nothing is new',()=>{
  expect(newSinceKey({entries,lastSeenAt:null,userEmail:'leo@example.com'})).toBeNull();
  expect(newSinceKey({entries,lastSeenAt:at(6),userEmail:'leo@example.com'})).toBeNull();
  expect(newSinceKey({entries:entries.filter(e=>e.key!=='in:in'&&e.key!=='out:theirs'),lastSeenAt:at(2),userEmail:'leo@example.com'})).toBeNull();
 });
 it('marks the visit with the newest loaded item, not the clock',()=>{
  expect(newestAt(entries)?.getTime()).toBe(at(5).getTime());
  expect(newestAt([])).toBeNull();
 });
});

describe('clamping and summary',()=>{
 it('clamps email at about 6 lines and other channels at about 12',()=>{
  expect(clampLinesFor('email')).toBe(6);expect(clampLinesFor('whatsapp')).toBe(12);expect(clampLinesFor('call')).toBe(12);
  expect(estimatedLines('corto')).toBe(1);expect(estimatedLines('a\nb\n\nc')).toBe(4);expect(estimatedLines('x'.repeat(181))).toBe(3);
 });
 it('names the pending work with only its non-zero parts',()=>{
  expect(actionSummary({review:2,unconfirmed:1,outcomes:0})).toBe('2 mensajes por revisar · 1 envío sin confirmar');
  expect(actionSummary({review:1,unconfirmed:0,outcomes:2})).toBe('1 mensaje por revisar · 2 contactos sin resultado');
  expect(actionSummary({review:0,unconfirmed:3,outcomes:0})).toBe('3 envíos sin confirmar');
 });
 it('builds a safe DOM id for every key',()=>{expect(timelineDomId('in:1b2c-3')).toBe('comm-item-in-1b2c-3');});
});

describe('«Responder» (spec 91 §10)',()=>{
 const recipients={account:{email:'hotel@example.com',telefono:'03442 15-111111',whatsapp:null},contacts:[{id:'7',email:'julia@example.com',phone:'+5493442000000'},{id:'9',email:'baja@example.com',phone:null,deletedAt:new Date()}]};
 it('answers the newest received message that is not voided, preferring one that is not automatic',()=>{
  expect(lastReceived([inbound({id:'a',receivedAt:at(1)}),inbound({id:'b',receivedAt:at(3),isAutomatic:true}),inbound({id:'c',receivedAt:at(4),status:'voided'})])?.id).toBe('a');
  expect(lastReceived([inbound({id:'b',receivedAt:at(3),isAutomatic:true})])?.id).toBe('b');
  expect(lastReceived([inbound({id:'c',status:'voided'})])).toBeNull();expect(lastReceived(undefined)).toBeNull();
 });
 it('preselects the person whose phone or email sent it, or the business own channel',()=>{
  expect(replyTarget({item:inbound({id:'a'}),recipients,restrictions:[]})).toEqual({channel:'whatsapp',contactId:'7',reason:''});
  expect(replyTarget({item:inbound({id:'a',channel:'email',fromAddress:'Julia@Example.com '}),recipients,restrictions:[]})).toEqual({channel:'email',contactId:'7',reason:''});
  expect(replyTarget({item:inbound({id:'a',channel:'email',fromAddress:'hotel@example.com'}),recipients,restrictions:[]})).toEqual({channel:'email',contactId:'',reason:''});
  expect(replyTarget({item:inbound({id:'a',fromAddress:'5493442111111'}),recipients,restrictions:[]})).toEqual({channel:'whatsapp',contactId:'',reason:''});
 });
 it('falls back to the composer defaults and says why',()=>{
  const unknown=replyTarget({item:inbound({id:'a',channel:'email',fromAddress:'baja@example.com'}),recipients,restrictions:[]});
  expect(unknown.channel).toBe('email');expect(unknown.contactId).toBeUndefined();expect(unknown.reason).toMatch(/^baja@example\.com no está cargado/);
  const social=replyTarget({item:inbound({id:'a',channel:'social',fromAddress:'@hotel'}),recipients,restrictions:[]});
  expect(social).toEqual({reason:'«Responder» no prepara mensajes por Instagram: elegí el canal en «Contactar».'});
  const restricted=replyTarget({item:inbound({id:'a'}),recipients,restrictions:[{channel:'whatsapp',contactId:'7',liftedAt:null}]});
  expect(restricted.channel).toBeUndefined();expect(restricted.reason).toMatch(/restricción activa/);
  expect(replyTarget({item:inbound({id:'a'}),recipients,restrictions:[{channel:'whatsapp',contactId:null,liftedAt:new Date()},{channel:'email',contactId:null}]})).toEqual({channel:'whatsapp',contactId:'7',reason:''});
 });
});
