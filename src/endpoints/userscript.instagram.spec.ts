// @vitest-environment node
import {describe,expect,it,vi} from 'vitest';
vi.mock('../helpers/db',()=>({db:{}}));
const {instagramPrepareInput,instagramPrepareMutation,scriptChannelParam,instagramThread,instagramThreadStale,whatsappGeneralInput,whatsappPrepareMutation,preparedResponse,heldMaterials,materialAdd,materialRemove,materials}=await import('./userscript');
const {hashShareToken}=await import('../helpers/salesMaterialShare');

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

describe('free drafts and material from the panels (spec 98 §5.3)',()=>{
 it('an Instagram draft may have no template: a free draft for «Enviar material»',()=>{
  expect(instagramPrepareMutation(instagramPrepareInput.parse({...base,templateId:null,leadId:'12'}))).toMatchObject({action:'prepare',templateId:null,channel:'instagram'});
  expect(instagramPrepareMutation(instagramPrepareInput.parse({...base,templateId:null,leadId:null,purpose:'first_contact'}))).toMatchObject({action:'prepare_general',templateId:null});
 });
 it('a WhatsApp management draft keeps its shape and may be free',()=>{
  expect(whatsappPrepareMutation({id:ID,leadId:'12',contactId:'5',templateId:'3'})).toMatchObject({action:'prepare',leadId:'12',contactId:'5',channel:'whatsapp',templateId:'3'});
  expect(whatsappPrepareMutation({id:ID,leadId:'12',contactId:null,templateId:null})).toMatchObject({action:'prepare',templateId:null});
 });
 it('returns the materials the draft holds as given (shareId for «Quitar»)',()=>{
  const held=[{shareId:'s1',materialId:'m1',title:'Folleto'}];
  const body=preparedResponse({id:ID,revision:2,body:'Hola {{contacto}}',recipient:'@sol',recipientName:'Sol'} as never,held);
  expect(body).toMatchObject({messageId:ID,revision:2,unresolved:['contacto'],materialWarnings:[],materials:held});
 });
 it('a live share whose link was deleted from the text is not held (review item 4)',()=>{
  // Arrange
  const kept='a'.repeat(43),deleted='b'.repeat(43);
  const rows=[{shareId:'s1',materialId:'m1',title:'Folleto',tokenHash:hashShareToken({token:kept})},{shareId:'s2',materialId:'m2',title:'Tarifas',tokenHash:hashShareToken({token:deleted})}];
  // Act
  const held=heldMaterials({rows,inBody:new Set([hashShareToken({token:kept})])});
  // Assert
  expect(held).toEqual([{shareId:'s1',materialId:'m1',title:'Folleto'}]);
 });
 it('material endpoints answer 401 without a token',async()=>{
  expect((await materials(new Request('http://localhost/_api/userscript/materials?accountId=7&channel=instagram'))).status).toBe(401);
  expect((await materialAdd(new Request('http://localhost/_api/userscript/material_add',{method:'POST',body:'{}'}))).status).toBe(401);
  expect((await materialRemove(new Request('http://localhost/_api/userscript/material_remove',{method:'POST',body:'{}'}))).status).toBe(401);
 });
});

describe('WhatsApp «Sin gestión» from the panel (spec 98 decision 4)',()=>{
 const general={id:ID,accountId:'7',leadId:null,contactId:null,templateId:'3',purpose:'first_contact'};
 it('becomes prepare_general for WhatsApp with the purpose and the person, never confirmedClient',()=>{
  const mutation=whatsappPrepareMutation({...general,contactId:'5'});
  expect(mutation).toMatchObject({action:'prepare_general',accountId:'7',leadId:null,contactId:'5',channel:'whatsapp',purpose:'first_contact',otherPurpose:null,templateId:'3'});
  expect(mutation).not.toHaveProperty('confirmedClient');
  expect(whatsappPrepareMutation({...general,templateId:null})).toMatchObject({action:'prepare_general',templateId:null});
 });
 it('needs a purpose, the aclaración for «Otro», and refuses extra keys such as confirmedClient',()=>{
  expect(whatsappGeneralInput.safeParse({...general,purpose:undefined}).success).toBe(false);
  expect(whatsappGeneralInput.safeParse({...general,purpose:'other'}).success).toBe(false);
  expect(whatsappPrepareMutation({...general,purpose:'other',otherPurpose:'Fotos'})).toMatchObject({purpose:'other',otherPurpose:'Fotos'});
  expect(whatsappGeneralInput.safeParse({...general,confirmedClient:true}).success).toBe(false);
  expect(whatsappGeneralInput.safeParse({...general,channel:'instagram'}).success).toBe(false);
  expect(()=>whatsappPrepareMutation({...general,purpose:'nope'})).toThrow();
 });
});
