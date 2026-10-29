// @vitest-environment node
import {describe,expect,it,vi} from 'vitest';
vi.mock('../helpers/db',()=>({db:{}}));
const {instagramPrepareInput,instagramPrepareMutation,scriptChannelParam,instagramThread,instagramThreadStale}=await import('./userscript');

const ID='00000000-0000-4000-8000-000000000001';
const base={id:ID,channel:'instagram' as const,accountId:'7',templateId:'3'};

describe('Instagram prepare input (spec 97 §5.2)',()=>{
 it('with a management: prepare for that lead, no purpose allowed',()=>{
  const value=instagramPrepareInput.parse({...base,leadId:'12'});
  expect(instagramPrepareMutation(value)).toMatchObject({action:'prepare',id:ID,leadId:'12',contactId:null,channel:'instagram',templateId:'3'});
  expect(instagramPrepareInput.safeParse({...base,leadId:'12',purpose:'first_contact'}).success).toBe(false);
 });
 it('without a management: prepare_general with the purpose; «Otro» needs its aclaración',()=>{
  const value=instagramPrepareInput.parse({...base,leadId:null,purpose:'first_contact'});
  expect(instagramPrepareMutation(value)).toMatchObject({action:'prepare_general',accountId:'7',leadId:null,contactId:null,channel:'instagram',purpose:'first_contact',otherPurpose:null});
  expect(instagramPrepareInput.safeParse({...base,leadId:null}).success).toBe(false);
  expect(instagramPrepareInput.safeParse({...base,leadId:null,purpose:'other'}).success).toBe(false);
  expect(instagramPrepareMutation(instagramPrepareInput.parse({...base,leadId:null,purpose:'other',otherPurpose:'Consulta'}))).toMatchObject({purpose:'other',otherPurpose:'Consulta'});
 });
 it('never targets a person, rejects other channels and extra keys',()=>{
  expect(instagramPrepareInput.safeParse({...base,leadId:'12',contactId:'5'}).success).toBe(false);
  expect(instagramPrepareInput.safeParse({...base,channel:'whatsapp',leadId:'12'}).success).toBe(false);
  expect(instagramPrepareInput.safeParse({...base,leadId:'12',recipient:'@x'}).success).toBe(false);
  expect(instagramPrepareInput.safeParse({...base,id:'nope',leadId:'12'}).success).toBe(false);
 });
 it('templates default to WhatsApp and accept only the two script channels',()=>{
  expect(scriptChannelParam.parse(undefined)).toBe('whatsapp');expect(scriptChannelParam.parse('instagram')).toBe('instagram');
  expect(scriptChannelParam.safeParse('email').success).toBe(false);
 });
});

describe('Instagram thread endpoints without a token',()=>{
 it('answer 401 before reading the body',async()=>{
  for(const handle of [instagramThread,instagramThreadStale]){
   const response=await handle(new Request('http://localhost/_api/userscript/instagram/thread',{method:'POST',body:'{}'}));
   expect(response.status).toBe(401);
  }
 });
});
