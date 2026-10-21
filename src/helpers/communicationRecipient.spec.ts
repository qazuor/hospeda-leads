import {describe,expect,it} from 'vitest';
import {channelRecipientChoice,confirmSendBlockReason,initialCommunicationRecipient,reachableRecipientIds} from './communicationRecipient';

describe('initialCommunicationRecipient',()=>{
 it('preserves a destination explicitly chosen earlier in the flow',()=>{
  expect(initialCommunicationRecipient(['1','2'],'2')).toBe('2');
 });
 it('preselects the only available person',()=>{
  expect(initialCommunicationRecipient(['1'])).toBe('1');
 });
 it('requires an explicit choice when multiple people are available',()=>{
  expect(initialCommunicationRecipient(['1','2'])).toBe('');
 });
 it('uses the business destination for legacy contacts when automatic selection is disabled',()=>{
  expect(initialCommunicationRecipient(['1'],null,false)).toBe('');
 });
 it('ignores a stale requested contact and applies the single-person rule',()=>{
  expect(initialCommunicationRecipient(['1'],'deleted')).toBe('1');
 });
});

describe('channelRecipientChoice',()=>{
 const tomas={id:'7',phone:'+5493428461674',email:null},ana={id:'8',phone:'  ',email:'ana@example.com'},luis={id:'9',phone:'5493442000002',email:'luis@example.com'};
 it('preselects the only person with a phone for WhatsApp even when the business has no general phone',()=>{
  expect(channelRecipientChoice({contacts:[ana,tomas],channel:'whatsapp',generalValue:null})).toEqual({recipientId:'7',mustChoose:false});
 });
 it('preselects the only person with an email for email',()=>{
  expect(channelRecipientChoice({contacts:[tomas,ana],channel:'email'})).toEqual({recipientId:'8',mustChoose:false});
 });
 it('requires a choice when several people have data for the channel',()=>{
  expect(channelRecipientChoice({contacts:[tomas,luis],channel:'whatsapp'})).toEqual({recipientId:'',mustChoose:true});
 });
 it('keeps an explicit request for a person with data for the channel',()=>{
  expect(channelRecipientChoice({contacts:[tomas,luis],channel:'whatsapp',requestedId:'9'})).toEqual({recipientId:'9',mustChoose:false});
 });
 it('respects an explicit request for a person without data for the channel',()=>{
  expect(channelRecipientChoice({contacts:[tomas,ana],channel:'whatsapp',requestedId:'8'})).toEqual({recipientId:'8',mustChoose:false});
 });
 it('treats an empty request as an explicit choice of the business general channel',()=>{
  expect(channelRecipientChoice({contacts:[tomas,luis],channel:'whatsapp',requestedId:'',generalValue:'5493442000003'})).toEqual({recipientId:'',mustChoose:false});
  expect(channelRecipientChoice({contacts:[tomas],channel:'whatsapp',requestedId:''})).toEqual({recipientId:'',mustChoose:false});
 });
 it('applies the rule when there is no request or the requested person is gone',()=>{
  expect(channelRecipientChoice({contacts:[ana,tomas],channel:'whatsapp',requestedId:null})).toEqual({recipientId:'7',mustChoose:false});
  expect(channelRecipientChoice({contacts:[ana,tomas],channel:'whatsapp',requestedId:'deleted'})).toEqual({recipientId:'7',mustChoose:false});
 });
 it('uses the business general channel only when no person has the data',()=>{
  expect(channelRecipientChoice({contacts:[ana],channel:'whatsapp',generalValue:'5493442000003'})).toEqual({recipientId:'',mustChoose:false});
  expect(channelRecipientChoice({contacts:[],channel:'email',generalValue:'business@example.com'})).toEqual({recipientId:'',mustChoose:false});
 });
 it('keeps the general channel for a legacy contact only while the business has that data',()=>{
  expect(channelRecipientChoice({contacts:[tomas],channel:'whatsapp',legacy:true,generalValue:'5493442000003'})).toEqual({recipientId:'',mustChoose:false});
  expect(channelRecipientChoice({contacts:[tomas],channel:'whatsapp',legacy:true,generalValue:''})).toEqual({recipientId:'7',mustChoose:false});
 });
 it('lists only people with non-blank data for the channel',()=>{
  expect(reachableRecipientIds([tomas,ana,luis],'whatsapp')).toEqual(['7','9']);
  expect(reachableRecipientIds([tomas,ana,luis],'email')).toEqual(['8','9']);
 });
});

describe('confirmSendBlockReason',()=>{
 const message={channel:'whatsapp',leadId:'9',contactId:'7'},ok={account:{doNotContact:false,archivedAt:null,status:'reviewed'},message,restrictions:[],openManagementIds:['9']};
 it('allows confirming when nothing blocks the contact',()=>{
  expect(confirmSendBlockReason(ok)).toBe('');
 });
 it('blocks while the business is loading and when it is in the trash',()=>{
  expect(confirmSendBlockReason({...ok,account:undefined})).toBe('Cargando los datos del negocio…');
  expect(confirmSendBlockReason({...ok,account:null})).toBe('Cargando los datos del negocio…');
  expect(confirmSendBlockReason({...ok,account:{deletedAt:new Date()}})).toBe('El negocio está en la papelera.');
 });
 it('blocks a No contactar or archived business',()=>{
  expect(confirmSendBlockReason({...ok,account:{doNotContact:true}})).toContain('No contactar');
  expect(confirmSendBlockReason({...ok,account:{archivedAt:new Date()}})).toContain('archivado');
  expect(confirmSendBlockReason({...ok,account:{status:'archived'}})).toContain('archivado');
 });
 it('blocks a closed management only when the open list is known',()=>{
  expect(confirmSendBlockReason({...ok,openManagementIds:['10']})).toContain('cerrada');
  expect(confirmSendBlockReason({...ok,openManagementIds:undefined})).toBe('');
 });
 it('blocks active restrictions on the person, the management or the business for this channel',()=>{
  expect(confirmSendBlockReason({...ok,restrictions:[{channel:'whatsapp',contactId:'7',leadId:null,liftedAt:null}]})).toContain('restricción');
  expect(confirmSendBlockReason({...ok,restrictions:[{channel:'all',contactId:null,leadId:'9',liftedAt:null}]})).toContain('restricción');
  expect(confirmSendBlockReason({...ok,restrictions:[{channel:'whatsapp',contactId:null,leadId:null,liftedAt:null}]})).toContain('restricción');
 });
 it('ignores lifted restrictions, other channels, other people and other managements',()=>{
  expect(confirmSendBlockReason({...ok,restrictions:[{channel:'whatsapp',contactId:'7',liftedAt:new Date()},{channel:'email',contactId:'7'},{channel:'whatsapp',contactId:'8'},{channel:'whatsapp',contactId:null,leadId:'10'}]})).toBe('');
 });
});
