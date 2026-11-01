import {describe,expect,it} from 'vitest';
import {inboundLinkedSend,inboundPerson,sameAddress} from './responseRecord';

const received=new Date('2026-10-20T12:00:00Z');
const hoursBefore=(h:number)=>new Date(received.getTime()-h*3600_000);
const send=(id:string,at:Date,over:Record<string,unknown>={})=>({id,channel:'whatsapp',status:'manual_sent',recipient:'+54 9 3442 555111',contactId:null,leadId:'9',lastInteractionAt:at,createdAt:at,...over});
const inbound=(over:Record<string,unknown>={})=>({channel:'whatsapp',fromAddress:'5493442555111',contactId:null,linkedMessageId:null,leadId:'9',receivedAt:received,...over});
const person=(id:string,over:Record<string,unknown>={})=>({id,phone:null,email:null,deletedAt:null,...over});

describe('inboundLinkedSend (spec 99 §3.4)',()=>{
 it('preselects nothing when two sends to that address fall within the window',()=>{
  expect(inboundLinkedSend({inbound:inbound(),messages:[send('a',hoursBefore(2)),send('b',hoursBefore(30))],hours:72})).toBe('');
 });
 it('includes a send exactly at the 72 h boundary and excludes one just before it',()=>{
  expect(inboundLinkedSend({inbound:inbound(),messages:[send('edge',hoursBefore(72))],hours:72})).toBe('edge');
  expect(inboundLinkedSend({inbound:inbound(),messages:[send('late',new Date(hoursBefore(72).getTime()-1))],hours:72})).toBe('');
 });
 it('matches an email send ignoring case and spaces',()=>{
  expect(inboundLinkedSend({inbound:inbound({channel:'email',fromAddress:' Ana@Example.com'}),messages:[send('mail',hoursBefore(1),{channel:'email',recipient:'ana@example.COM'})],hours:72})).toBe('mail');
  expect(sameAddress({channel:'email',a:'ANA@example.com',b:'ana@example.com '})).toBe(true);
 });
 it('keeps the stored link and never picks a send to another area code',()=>{
  expect(inboundLinkedSend({inbound:inbound({linkedMessageId:'stored'}),messages:[send('a',hoursBefore(1))],hours:72})).toBe('stored');
  expect(inboundLinkedSend({inbound:inbound({fromAddress:'+5493514123456'}),messages:[send('a',hoursBefore(1),{recipient:'+54 9 341 4123456'})],hours:72})).toBe('');
 });
});

describe('inboundPerson (spec 99 §3.4)',()=>{
 it('matches an email person ignoring case',()=>{
  expect(inboundPerson({inbound:inbound({channel:'email',fromAddress:'Ana@Example.com'}),contacts:[person('20',{email:'bea@example.com'}),person('21',{email:'ana@example.com'})]})).toBe('21');
 });
 it('a stored but deleted person falls back to the only other match',()=>{
  expect(inboundPerson({inbound:inbound({contactId:'21'}),contacts:[person('21',{phone:'03442 555111',deletedAt:new Date()}),person('20',{phone:'+54 9 3442 555111'})]})).toBe('20');
 });
 it('a stored but deleted person without another match is «El negocio»',()=>{
  expect(inboundPerson({inbound:inbound({contactId:'21'}),contacts:[person('21',{phone:'03442 555111',deletedAt:new Date()}),person('20',{phone:'0343 4111222'})]})).toBe('');
 });
 it('never matches 341-4123456 against 351-4123456',()=>{
  expect(inboundPerson({inbound:inbound({fromAddress:'+5493414123456'}),contacts:[person('20',{phone:'351-4123456'})]})).toBe('');
  expect(inboundPerson({inbound:inbound({fromAddress:'+5493414123456'}),contacts:[person('20',{phone:'0341 4123456'})]})).toBe('20');
 });
});
