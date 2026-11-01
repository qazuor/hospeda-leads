import {describe,expect,it} from 'vitest';
import type {InboundMessage,Message} from '../endpoints/communication.schema';
import {INSTAGRAM_CONFIRMED_STATUS,buildCommunicationTimeline,replyTarget,requiresAction,sentStatusLabel,sentTone} from './communicationTimeline';
import {ECHO_STATUS} from './instagramChannel';

// Spec 92: Instagram chats opened from the composer.
const now=new Date('2026-10-27T15:00:00Z').getTime();
const message=(over:Partial<Message>&{id:string}):Message=>({accountId:'5',leadId:null,contactId:null,channel:'social',destinationDetail:'instagram',recipient:'@hotel.sol',recipientName:'Hotel Sol',subject:'',body:'Hola',htmlBody:null,textBody:'Hola',templateSnapshot:null,ownerEmail:'ana@example.com',activityId:null,outboxId:null,taskId:null,status:'instagram_opened',revision:1,lastInteractionAt:new Date(now-60_000),lastActorEmail:null,createdAt:new Date(now-120_000),updatedAt:new Date(now-60_000),...over});
const inbound=(over:Partial<InboundMessage>={}):InboundMessage=>({id:'in1',channel:'social',channelDetail:'instagram',receivedAt:new Date(now),fromAddress:'@hotel.sol',fromName:'Hotel Sol',subject:'',textBody:'Hola',status:'pending_review',isAutomatic:false,matchMethod:'instagram_handle',leadId:null,contextName:'General',linkedMessageId:null,responseId:null,attachments:[],canReply:false,replyAvailable:false,replyRestricted:false,...over});
const recipients=(perfilInstagram:string|null)=>({account:{email:null,telefono:null,whatsapp:null,perfilInstagram},contacts:[]});

describe('instagram_opened is an unconfirmed send',()=>{
 it('is unconfirmed like an opened WhatsApp',()=>{
  expect(sentTone('instagram_opened')).toBe('unconfirmed');
  expect(sentTone('whatsapp_opened')).toBe('unconfirmed');
 });
 it('stays out of the conversation until it is confirmed, waiting or not (owner decision)',()=>{
  const waiting=message({id:'w',lastInteractionAt:new Date(now)}),late=message({id:'l',lastInteractionAt:new Date(now-16*60_000)});
  expect(buildCommunicationTimeline({messages:[waiting,late]})).toEqual([]);
  expect(buildCommunicationTimeline({messages:[waiting,late],showVoided:true})).toEqual([]);
  expect(buildCommunicationTimeline({messages:[message({id:'c',status:'manual_sent',externalId:'mid.1'})]}).map(e=>e.key)).toEqual(['out:c']);
 });
 it('labels a resolved attempt «Enviado · confirmado por Instagram», never an echo or an unlinked one',()=>{
  expect(sentStatusLabel(message({id:'a',status:'manual_sent',externalId:'mid.1',confirmationSource:'instagram'}))).toBe(INSTAGRAM_CONFIRMED_STATUS);
  expect(sentStatusLabel(message({id:'a',status:'manual_sent',externalId:null}))).toBe('Envío confirmado manualmente');
  expect(sentStatusLabel(message({id:'a',status:'manual_sent',externalId:'mid.1',ownerEmail:'instagram@hospeda'}))).toBe(ECHO_STATUS);
  expect(sentStatusLabel(message({id:'a'}))).toBe('Instagram abierto · envío no confirmado');
 });
 it('keeps the reply or rejection label of a source-confirmed send marked later',()=>{
  for(const status of ['replied','rejected']){
   const label=status==='replied'?'Respuesta registrada manualmente':'Rechazo registrado manualmente';
   expect(sentStatusLabel(message({id:'a',status,externalId:'mid.1',confirmationSource:'instagram'}))).toBe(label);
   expect(sentStatusLabel(message({id:'w',channel:'whatsapp',destinationDetail:null,status,externalId:'wamid.1',confirmationSource:'userscript'}))).toBe(label);
  }
 });
 it('keeps the seller as the sender of a resolved attempt and shows the text that went out',()=>{
  const [entry]=buildCommunicationTimeline({users:[{email:'ana@example.com',displayName:'Ana'}],messages:[message({id:'a',status:'manual_sent',externalId:'mid.1',body:'Hola preparado',textBody:'Hola enviado'})]});
  expect(entry.kind==='sent'&&[entry.sender,entry.text,entry.echo,entry.channel]).toEqual(['Ana','Hola enviado',false,'instagram']);
 });
});

describe('requiresAction with Instagram (spec 92 §2.4)',()=>{
 const base={userEmail:'ana@example.com',admin:false,readOnly:false};
 it('lists an attempt during the 15-minute echo wait and afterwards (it is not in the conversation)',()=>{
  expect(requiresAction({...base,messages:[message({id:'a',lastInteractionAt:new Date()})]}).map(i=>i.key)).toEqual(['out:a']);
  expect(requiresAction({...base,messages:[message({id:'a',lastInteractionAt:new Date(now-16*60_000)})]}).map(i=>i.key)).toEqual(['out:a']);
 });
 it('follows the WhatsApp rules: own attempts, or any for an admin, never on a read-only view',()=>{
  const late=message({id:'a',ownerEmail:'sofia@example.com',lastInteractionAt:new Date(now-20*60_000)});
  expect(requiresAction({...base,messages:[late]})).toEqual([]);
  expect(requiresAction({...base,admin:true,messages:[late]}).length).toBe(1);
  expect(requiresAction({...base,admin:true,readOnly:true,messages:[late]})).toEqual([]);
 });
 it('never prompts for an echo or a «Red social» row',()=>{
  const old=new Date(now-60*60_000);
  expect(requiresAction({...base,messages:[message({id:'e',ownerEmail:'instagram@hospeda',lastInteractionAt:old}),message({id:'r',destinationDetail:'@hotel',lastInteractionAt:old})]})).toEqual([]);
 });
});

describe('replyTarget for Instagram (spec 92 §2.1)',()=>{
 it('prepares Instagram when the sender is the business username',()=>{
  expect(replyTarget({item:inbound({fromAddress:'@Hotel.Sol'}),recipients:recipients('https://instagram.com/hotel.sol'),restrictions:[]})).toEqual({channel:'instagram',contactId:'',reason:''});
 });
 it('falls back with the reason for another sender',()=>{
  expect(replyTarget({item:inbound({fromAddress:'@otra.cuenta'}),recipients:recipients('hotel.sol'),restrictions:[]})).toEqual({reason:'@otra.cuenta no es el Instagram cargado en el negocio (@hotel.sol): elegí el canal en «Contactar».'});
 });
 it('falls back when the business has no username',()=>{
  expect(replyTarget({item:inbound(),recipients:recipients(null),restrictions:[]})).toEqual({reason:'El negocio no tiene usuario de Instagram cargado: elegí el canal en «Contactar».'});
 });
 it('falls back with the restriction text for a business-level social or all restriction',()=>{
  for(const channel of ['social','all'])expect(replyTarget({item:inbound(),recipients:recipients('hotel.sol'),restrictions:[{channel,contactId:null,leadId:null,liftedAt:null}]}).reason).toMatch(/restricción activa de Instagram/);
  // A lifted restriction, or one on a person or management, does not block the business username.
  expect(replyTarget({item:inbound(),recipients:recipients('hotel.sol'),restrictions:[{channel:'social',contactId:null,leadId:null,liftedAt:new Date()},{channel:'social',contactId:'7',leadId:null},{channel:'whatsapp',contactId:null,leadId:null}]}).channel).toBe('instagram');
 });
});
