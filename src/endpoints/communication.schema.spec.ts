import {describe,expect,it} from 'vitest';
import {communicationMutation,restartDraftRequest,type PreparedMessage} from './communication.schema';

const draft=(over:Partial<PreparedMessage>):PreparedMessage=>({id:'11111111-1111-4111-8111-111111111111',accountId:'5',leadId:'9',contactId:'7',channel:'whatsapp',recipient:'+5493442000002',recipientName:'Ana',subject:'',body:'Hola',htmlBody:null,textBody:null,templateSnapshot:{id:3},ownerEmail:'seller@example.com',activityId:null,outboxId:null,taskId:null,status:'draft',revision:4,lastInteractionAt:null,lastActorEmail:null,createdAt:new Date('2026-10-01T12:00:00Z'),updatedAt:new Date('2026-10-01T12:00:00Z'),purpose:null,otherPurpose:null,reusedDraft:true,...over});
const newId='22222222-2222-4222-8222-222222222222';

describe('restartDraftRequest',()=>{
 it('rebuilds a management draft as prepare with the same recipient and model, discarding the old revision',()=>{
  expect(restartDraftRequest(draft({}),newId)).toEqual({action:'prepare',id:newId,leadId:'9',contactId:'7',channel:'whatsapp',templateId:'3',discardDraft:{id:draft({}).id,revision:4}});
 });
 it('rebuilds a general draft as prepare_general with its purpose and a free message',()=>{
  const request=restartDraftRequest(draft({leadId:null,contactId:null,channel:'email',purpose:'other',otherPurpose:'Saludo',templateSnapshot:null}),newId);
  expect(request).toEqual({action:'prepare_general',id:newId,accountId:'5',leadId:null,contactId:null,channel:'email',purpose:'other',otherPurpose:'Saludo',templateId:null,discardDraft:{id:draft({}).id,revision:4}});
  expect(communicationMutation.parse(request)).toEqual(request);
 });
});

describe('communicationMutation discardDraft',()=>{
 const base={action:'prepare',id:newId,leadId:'9',contactId:null,channel:'whatsapp',templateId:null} as const;
 it('stays optional for a normal prepare',()=>{
  expect(communicationMutation.parse(base)).toEqual(base);
 });
 it('requires the draft revision so a concurrent change is detected',()=>{
  expect(()=>communicationMutation.parse({...base,discardDraft:{id:draft({}).id}})).toThrow();
  expect(communicationMutation.parse({...base,discardDraft:{id:draft({}).id,revision:4}})).toMatchObject({discardDraft:{revision:4}});
 });
});

describe('communicationMutation sales material actions (spec 89 §8.1)',()=>{
 const id='11111111-1111-4111-8111-111111111111',other='33333333-3333-4333-8333-333333333333';
 it('accepts material_add, material_remove and material_attach on a draft revision',()=>{
  expect(communicationMutation.parse({action:'material_add',id,revision:4,materialId:other,attach:true})).toEqual({action:'material_add',id,revision:4,materialId:other,attach:true});
  expect(communicationMutation.parse({action:'material_remove',id,revision:4,shareId:other,taskId:'8'})).toMatchObject({shareId:other,taskId:'8'});
  expect(communicationMutation.parse({action:'material_attach',id,revision:4,shareId:other,attach:false})).toMatchObject({attach:false});
 });
 it('requires the revision, a uuid material and an explicit attach choice',()=>{
  expect(()=>communicationMutation.parse({action:'material_add',id,materialId:other,attach:false})).toThrow();
  expect(()=>communicationMutation.parse({action:'material_add',id,revision:4,materialId:'7',attach:false})).toThrow();
  expect(()=>communicationMutation.parse({action:'material_add',id,revision:4,materialId:other})).toThrow();
  expect(()=>communicationMutation.parse({action:'material_attach',id,revision:4,shareId:other})).toThrow();
 });
 it('retries without attachments with a new draft id and the refused message',()=>{
  expect(communicationMutation.parse({action:'material_retry_without_attachments',id:other,messageId:id})).toEqual({action:'material_retry_without_attachments',id:other,messageId:id});
  expect(()=>communicationMutation.parse({action:'material_retry_without_attachments',id:other})).toThrow();
 });
});
