import {describe,it,expect} from 'vitest';
import {attachmentNames,clipCommunicationText} from './agendaTools';
import {inboundEmailSchema} from '../../helpers/inboundEmailPure';

describe('communication text mapper',()=>{
 it('keeps text through the limit and marks longer text as truncated',()=>{
  expect(clipCommunicationText('x'.repeat(4000))).toEqual({text:'x'.repeat(4000),truncated:false});
  expect(clipCommunicationText('x'.repeat(4001))).toEqual({text:'x'.repeat(4000),truncated:true});
 });
 it('treats missing stored text as an empty string',()=>expect(clipCommunicationText(null)).toEqual({text:'',truncated:false}));
 it('maps the inbound writer attachment shape and legacy contentType',()=>{
  const writer=inboundEmailSchema.parse({messageId:'mcp-test',inReplyTo:null,references:[],from:{email:'client@example.com',name:'Client'},to:[],cc:[],subject:'x',date:'2026-11-07T10:00:00Z',text:'x',html:null,headers:{},attachments:[{filename:'real.jpg',mimeType:'image/jpeg',size:12}]});
  expect(attachmentNames(JSON.stringify(writer.attachments))).toEqual([{name:'real.jpg',type:'image/jpeg'}]);
  expect(attachmentNames([{filename:'old.jpg',contentType:'image/png'}])).toEqual([{name:'old.jpg',type:'image/png'}]);
 });
});
