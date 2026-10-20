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
