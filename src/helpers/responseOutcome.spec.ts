import {attributeResponseToSend,contactLogBlocked,outcomeFromResponse,responseOutcome,type OpenSend} from './responseOutcome';

const now=new Date('2026-10-29T00:00:00Z');
const send=(id:string,leadId:string|null,iso:string):OpenSend=>({id,leadId,lastInteractionAt:new Date(iso)});

describe('attributeResponseToSend',()=>{
 it('resolves the linked message when it is still open',()=>{
  const sends=[send('a','1','2026-10-27T10:00:00Z'),send('b','1','2026-10-28T10:00:00Z')];
  expect(attributeResponseToSend({sends,linkedMessageId:'a',leadId:'1',answeredAt:now})).toEqual({messageId:'a'});
 });
 it('never falls back to another send when the linked one is no longer open',()=>{
  const sends=[send('b','1','2026-10-28T10:00:00Z')];
  expect(attributeResponseToSend({sends,linkedMessageId:'a',leadId:'1',answeredAt:now})).toEqual({messageId:null});
 });
 it('resolves the most recent open send of the response management',()=>{
  const sends=[send('old','1','2026-10-20T10:00:00Z'),send('other','2','2026-10-28T12:00:00Z'),send('new','1','2026-10-27T10:00:00Z')];
  expect(attributeResponseToSend({sends,linkedMessageId:null,leadId:'1',answeredAt:now})).toEqual({messageId:'new'});
 });
 it('resolves nothing when the response management has no open send',()=>{
  const sends=[send('other','2','2026-10-28T12:00:00Z'),send('general',null,'2026-10-28T13:00:00Z')];
  expect(attributeResponseToSend({sends,linkedMessageId:null,leadId:'1',answeredAt:now})).toEqual({messageId:null});
 });
 it('resolves the most recent send for a general response when every open send shares one context',()=>{
  expect(attributeResponseToSend({sends:[send('a',null,'2026-10-27T10:00:00Z'),send('b',null,'2026-10-28T10:00:00Z')],linkedMessageId:null,leadId:null,answeredAt:now})).toEqual({messageId:'b'});
  expect(attributeResponseToSend({sends:[send('a','3','2026-10-27T10:00:00Z')],linkedMessageId:null,leadId:null,answeredAt:now})).toEqual({messageId:'a'});
 });
 it('leaves everything pending when a general response cannot single out one context',()=>{
  const sends=[send('a','1','2026-10-27T10:00:00Z'),send('b','2','2026-10-28T10:00:00Z')];
  expect(attributeResponseToSend({sends,linkedMessageId:null,leadId:null,answeredAt:now})).toEqual({messageId:null});
  expect(attributeResponseToSend({sends:[send('a','1','2026-10-27T10:00:00Z'),send('b',null,'2026-10-28T10:00:00Z')],linkedMessageId:null,leadId:null,answeredAt:now})).toEqual({messageId:null});
 });
 it('ignores sends made after the response was received (Monday email, Tuesday WhatsApp, Wednesday register)',()=>{
  const sends=[send('monday-email','1','2026-10-26T10:00:00Z'),send('tuesday-whatsapp','1','2026-10-27T10:00:00Z')];
  // The reply to Monday's email arrived Monday afternoon and is registered on Wednesday: it answers Monday's email, not Tuesday's WhatsApp.
  expect(attributeResponseToSend({sends,linkedMessageId:null,leadId:'1',answeredAt:new Date('2026-10-26T15:00:00Z')})).toEqual({messageId:'monday-email'});
  // A response received before every send answers none of them.
  expect(attributeResponseToSend({sends,linkedMessageId:null,leadId:'1',answeredAt:new Date('2026-10-25T15:00:00Z')})).toEqual({messageId:null});
  // A linked message sent after the response is not resolved either.
  expect(attributeResponseToSend({sends,linkedMessageId:'tuesday-whatsapp',leadId:'1',answeredAt:new Date('2026-10-26T15:00:00Z')})).toEqual({messageId:null});
  // A general response only weighs the sends before it: a later send in another management does not make it ambiguous.
  expect(attributeResponseToSend({sends:[send('a','1','2026-10-26T10:00:00Z'),send('b','2','2026-10-27T10:00:00Z')],linkedMessageId:null,leadId:null,answeredAt:new Date('2026-10-26T15:00:00Z')})).toEqual({messageId:'a'});
 });
 it('counts a send made exactly when the response was registered',()=>{
  expect(attributeResponseToSend({sends:[send('a','1','2026-10-27T10:00:00Z')],linkedMessageId:null,leadId:'1',answeredAt:new Date('2026-10-27T10:00:00Z')})).toEqual({messageId:'a'});
 });
 it('resolves nothing without open sends',()=>{
  expect(attributeResponseToSend({sends:[],linkedMessageId:null,leadId:null,answeredAt:now})).toEqual({messageId:null});
  expect(attributeResponseToSend({sends:[],linkedMessageId:null,leadId:'1',answeredAt:now})).toEqual({messageId:null});
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

describe('outcomeFromResponse',()=>{
 it('records the canonical outcome with the category and summary as the result',()=>{
  expect(outcomeFromResponse({category:'rejected',summary:'Ya trabaja con otra plataforma'})).toEqual({outcome:'not_interested',result:'Respuesta registrada: No le interesa · Ya trabaja con otra plataforma'});
 });
 it('follows a corrected category (the automatic outcome comes from the response)',()=>{
  expect(outcomeFromResponse({category:'interested',summary:'Quiere la propuesta'}).outcome).toBe('interested');
  expect(outcomeFromResponse({category:'later',summary:'Quiere la propuesta'}).outcome).toBe('later');
 });
 it('caps the result at 4000 characters',()=>{
  expect(outcomeFromResponse({category:'other',summary:'x'.repeat(5000)}).result).toHaveLength(4000);
 });
});
