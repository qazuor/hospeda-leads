import {attributeResponseToSend,contactLogBlocked,responseOutcome,type OpenSend} from './responseOutcome';

const send=(id:string,leadId:string|null,iso:string):OpenSend=>({id,leadId,lastInteractionAt:new Date(iso)});

describe('attributeResponseToSend',()=>{
 it('resolves the linked message when it is still open',()=>{
  const sends=[send('a','1','2026-10-27T10:00:00Z'),send('b','1','2026-10-28T10:00:00Z')];
  expect(attributeResponseToSend({sends,linkedMessageId:'a',leadId:'1'})).toEqual({messageId:'a'});
 });
 it('never falls back to another send when the linked one is no longer open',()=>{
  const sends=[send('b','1','2026-10-28T10:00:00Z')];
  expect(attributeResponseToSend({sends,linkedMessageId:'a',leadId:'1'})).toEqual({messageId:null});
 });
 it('resolves the most recent open send of the response management',()=>{
  const sends=[send('old','1','2026-10-20T10:00:00Z'),send('other','2','2026-10-28T12:00:00Z'),send('new','1','2026-10-27T10:00:00Z')];
  expect(attributeResponseToSend({sends,linkedMessageId:null,leadId:'1'})).toEqual({messageId:'new'});
 });
 it('resolves nothing when the response management has no open send',()=>{
  const sends=[send('other','2','2026-10-28T12:00:00Z'),send('general',null,'2026-10-28T13:00:00Z')];
  expect(attributeResponseToSend({sends,linkedMessageId:null,leadId:'1'})).toEqual({messageId:null});
 });
 it('resolves the most recent send for a general response when every open send shares one context',()=>{
  expect(attributeResponseToSend({sends:[send('a',null,'2026-10-27T10:00:00Z'),send('b',null,'2026-10-28T10:00:00Z')],linkedMessageId:null,leadId:null})).toEqual({messageId:'b'});
  expect(attributeResponseToSend({sends:[send('a','3','2026-10-27T10:00:00Z')],linkedMessageId:null,leadId:null})).toEqual({messageId:'a'});
 });
 it('leaves everything pending when a general response cannot single out one context',()=>{
  const sends=[send('a','1','2026-10-27T10:00:00Z'),send('b','2','2026-10-28T10:00:00Z')];
  expect(attributeResponseToSend({sends,linkedMessageId:null,leadId:null})).toEqual({messageId:null});
  expect(attributeResponseToSend({sends:[send('a','1','2026-10-27T10:00:00Z'),send('b',null,'2026-10-28T10:00:00Z')],linkedMessageId:null,leadId:null})).toEqual({messageId:null});
 });
 it('resolves nothing without open sends',()=>{
  expect(attributeResponseToSend({sends:[],linkedMessageId:null,leadId:null})).toEqual({messageId:null});
  expect(attributeResponseToSend({sends:[],linkedMessageId:null,leadId:'1'})).toEqual({messageId:null});
 });
});

describe('responseOutcome',()=>{
 it('maps each category to a canonical outcome without inferring interest',()=>{
  expect(responseOutcome({category:'interested'}).outcome).toBe('interested');
  expect(responseOutcome({category:'information'}).outcome).toBe('other');
  expect(responseOutcome({category:'later'}).outcome).toBe('later');
  expect(responseOutcome({category:'not_now'}).outcome).toBe('later');
  expect(responseOutcome({category:'rejected'}).outcome).toBe('not_interested');
  expect(responseOutcome({category:'operational'}).outcome).toBe('other');
  expect(responseOutcome({category:'do_not_contact'}).outcome).toBe('do_not_contact');
  expect(responseOutcome({category:'other'}).outcome).toBe('other');
 });
});

describe('contactLogBlocked',()=>{
 it('lets a person log over an outcome a response set automatically (a correction)',()=>{
  expect(contactLogBlocked({outcome:'interested',outcomeResponseId:'r1'})).toBe(false);
 });
 it('refuses a second log over an outcome a person recorded',()=>{
  expect(contactLogBlocked({outcome:'no_answer',outcomeResponseId:null})).toBe(true);
 });
 it('lets the first log through when there is no outcome yet',()=>{
  expect(contactLogBlocked({outcome:null,outcomeResponseId:null})).toBe(false);
 });
});
