import {describe,expect,it} from 'vitest';
import type {ContactFollowUps,PendingOutcome} from '../endpoints/communication.schema';
import {businessPendingHref,groupOutcomeFollowUps,outcomeGroupKey,pendingCount} from './contactFollowUpGroups';

const at=(minutes:number)=>new Date(Date.UTC(2026,9,30,12,0)-minutes*60_000);
const item=(id:string,over:Partial<PendingOutcome>={}):PendingOutcome=>({id,accountId:'5',accountName:'Hotel Sol',leadId:'7',opportunityName:'Alta',contactId:null,channel:'whatsapp',status:'manual_sent',purpose:null,recipientName:'Julia',lastInteractionAt:at(10),delegatedTaskId:null,...over});
const list=(items:PendingOutcome[],count=items.length,groupCount=count)=>({items,count,groupCount});
const followUps=(over:Partial<ContactFollowUps>={}):ContactFollowUps=>({unconfirmed:list([]),outcomes:list([]),expired:{unconfirmed:list([]),outcomes:list([])},...over});

describe('groupOutcomeFollowUps (spec 100 §6)',()=>{
 it('groups by business, management and delegated task, newest group first, items newest first',()=>{
  const items=[item('a',{lastInteractionAt:at(30)}),item('b',{leadId:null,opportunityName:null,lastInteractionAt:at(5)}),item('c',{lastInteractionAt:at(1)}),item('d',{delegatedTaskId:'99',lastInteractionAt:at(2)}),item('e',{accountId:'6',lastInteractionAt:at(3)})];
  const groups=groupOutcomeFollowUps({items});
  expect(groups.map(g=>g.items.map(i=>i.id))).toEqual([['c','a'],['d'],['e'],['b']]);
  expect(groups[0]).toMatchObject({key:outcomeGroupKey(items[0]),accountId:'5',leadId:'7',opportunityName:'Alta',delegatedTaskId:null});
  expect(groups[0].newest.id).toBe('c');
  expect(groups[3]).toMatchObject({leadId:null,opportunityName:null});
 });
 it('breaks ties between groups and between items by id, newest id first (same order as the server)',()=>{
  const same=at(4),groups=groupOutcomeFollowUps({items:[item('a1',{leadId:'1',lastInteractionAt:same}),item('b1',{leadId:'2',lastInteractionAt:same}),item('a2',{leadId:'1',lastInteractionAt:same})]});
  expect(groups.map(g=>g.items.map(i=>i.id))).toEqual([['b1'],['a2','a1']]);
 });
 it('keeps one «Sin gestión» group per business and returns nothing for no items',()=>{
  expect(groupOutcomeFollowUps({items:[item('x',{leadId:null}),item('y',{leadId:null,accountId:'6'})]}).length).toBe(2);
  expect(groupOutcomeFollowUps({items:[]})).toEqual([]);
 });
});

describe('pendingCount (spec 100 §5.1)',()=>{
 it('adds the messages to review, the unconfirmed sends and the outcome groups, never the expired ones',()=>{
  expect(pendingCount({review:1,followUps:followUps({unconfirmed:list([],4),outcomes:list([],3,2),expired:{unconfirmed:list([],5),outcomes:list([],6,6)}})})).toBe(7);
 });
 it('counts only the messages to review without follow-ups (read-only views, older servers)',()=>{expect(pendingCount({review:2,followUps:undefined})).toBe(2);});
});

describe('businessPendingHref (spec 100 §5.4)',()=>{
 it('opens the business «Comunicación» with «Requiere acción» expanded',()=>{expect(businessPendingHref('42')).toBe('/accounts/42?section=communication&pending=open');});
});
