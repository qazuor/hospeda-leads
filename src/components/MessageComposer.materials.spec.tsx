import React from 'react';
import {afterEach,beforeAll,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {MantineProvider} from '@mantine/core';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {MessageComposer} from './MessageComposer';
import {SentMaterials,canRevokeMaterialLink} from './MessageMaterials';
import {postCommunication,type PreparedMessage} from '../endpoints/communication.schema';
import type {MessageMaterial,SalesMaterial} from '../endpoints/salesMaterials.schema';
import {CrmApiError} from '../helpers/apiClient';

const api=vi.hoisted(()=>({list:vi.fn(),revoke:vi.fn()}));
vi.mock('sonner',()=>({toast:{error:vi.fn(),success:vi.fn(),info:vi.fn()}}));
vi.mock('./RichTemplateEditor',()=>({RichTemplateEditor:({ariaLabel,value}:{ariaLabel:string;value:string})=><textarea aria-label={ariaLabel} value={value} readOnly/>}));
vi.mock('../endpoints/communication.schema',async original=>({...(await original<typeof import('../endpoints/communication.schema')>()),postCommunication:vi.fn()}));
vi.mock('../endpoints/salesMaterials.schema',async original=>({...(await original<typeof import('../endpoints/salesMaterials.schema')>()),getSalesMaterials:api.list,revokeSalesMaterialShare:api.revoke}));
beforeAll(()=>{
 window.matchMedia=window.matchMedia||((query:string)=>({matches:false,media:query,addEventListener:()=>{},removeEventListener:()=>{},addListener:()=>{},removeListener:()=>{},dispatchEvent:()=>false,onchange:null}) as MediaQueryList);
 window.ResizeObserver=window.ResizeObserver||class{observe(){}unobserve(){}disconnect(){}};
});
afterEach(()=>{cleanup();vi.clearAllMocks();});

const id='11111111-1111-4111-8111-111111111111',materialId='22222222-2222-4222-8222-222222222222',shareId='33333333-3333-4333-8333-333333333333';
const message=(over:Partial<PreparedMessage>={}):PreparedMessage=>({id,accountId:'5',leadId:'9',contactId:'7',channel:'whatsapp',recipient:'+5493442000002',recipientName:'Ana',subject:'',body:'Hola',htmlBody:null,textBody:null,templateSnapshot:null,ownerEmail:'seller@example.com',activityId:null,outboxId:null,taskId:null,status:'draft',revision:4,lastInteractionAt:null,lastActorEmail:null,createdAt:new Date('2026-10-01T15:30:00Z'),updatedAt:new Date('2026-10-01T15:30:00Z'),purpose:null,otherPurpose:null,...over});
const item=(over:Partial<MessageMaterial>={}):MessageMaterial=>({shareId,messageId:id,materialId,title:'Folleto 2027',channel:'whatsapp',source:'file',fileName:'folleto.pdf',byteSize:2048,available:true,preparedVersion:1,sentVersion:null,attach:false,attachedVersion:null,attachBlockedReason:null,createdByEmail:'seller@example.com',createdAt:new Date('2026-10-01T15:31:00Z'),revokedAt:null,revokedByEmail:null,revokeReason:null,technicalAccessCount:0,lastTechnicalAccessAt:null,...over});
const catalog=(title:string,mid:string):SalesMaterial=>({id:mid,title,description:'',kind:'deliverable',source:'file',status:'active',archivedAt:null,archivedByEmail:null,revision:1,createdByEmail:'admin@example.com',createdAt:new Date(),updatedAt:new Date(),hasCover:false,categories:[{id:'1',name:'Folletos',active:true}],currentVersion:{id:'v1',version:1,url:null,fileName:'folleto.pdf',mimeType:'application/pdf',byteSize:2048,actorEmail:'admin@example.com',createdAt:new Date()}});
const sent=()=>vi.mocked(postCommunication).mock.calls.at(-1)?.[0];
const show=(initial:PreparedMessage,props:Partial<React.ComponentProps<typeof MessageComposer>>={})=>render(<MantineProvider><QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><MessageComposer initial={initial} {...props}/></QueryClientProvider></MantineProvider>);

describe('MessageComposer sales material (spec 89 §8.2)',()=>{
 it('adds a deliverable from the picker and shows the updated text and list',async()=>{
  api.list.mockResolvedValue({materials:[catalog('Folleto 2027',materialId)],truncated:false,categories:[{id:'1',name:'Folletos',active:true}],limits:{maxUploadBytes:1,maxCoverBytes:1,storageConfigured:true,maxEmailAttachmentBytes:10485760}});
  vi.mocked(postCommunication).mockResolvedValue({message:message({body:'Hola\n\nFolleto 2027: https://crm.example.test/m/x',revision:5}),materials:[item()]});
  show(message());
  fireEvent.click(screen.getByRole('button',{name:'Agregar material de venta'}));
  const list=await screen.findByRole('list',{name:'Material entregable'});
  expect(api.list).toHaveBeenCalledWith(expect.objectContaining({kind:'deliverable'}));
  fireEvent.click(within(list).getByRole('button',{name:'Agregar'}));
  await waitFor(()=>expect(sent()).toEqual({action:'material_add',id,revision:4,materialId,attach:false}));
  const included=await screen.findByRole('list',{name:'Material incluido'});
  expect(within(included).getByText('Folleto 2027')).toBeTruthy();
  expect((screen.getByRole('textbox',{name:'Mensaje final'}) as HTMLTextAreaElement).value).toContain('Folleto 2027: https://crm.example.test/m/x');
  expect(within(included).queryByLabelText('Adjuntar el archivo')).toBeNull();
 });
 it('keeps the picker open with the error when the server refuses, so the seller can retry',async()=>{
  api.list.mockResolvedValue({materials:[catalog('Folleto 2027',materialId)],truncated:false,categories:[],limits:{maxUploadBytes:1,maxCoverBytes:1,storageConfigured:true,maxEmailAttachmentBytes:10485760}});
  vi.mocked(postCommunication).mockRejectedValue(new CrmApiError('No contactar: Pidió solo email',403));
  show(message());
  fireEvent.click(screen.getByRole('button',{name:'Agregar material de venta'}));
  fireEvent.click(within(await screen.findByRole('list',{name:'Material entregable'})).getByRole('button',{name:'Agregar'}));
  expect((await screen.findAllByText('No contactar: Pidió solo email')).length).toBeGreaterThan(0);
  expect(screen.getByRole('list',{name:'Material entregable'})).toBeTruthy();
  expect((screen.getByRole('textbox',{name:'Mensaje final'}) as HTMLTextAreaElement).value).toBe('<p>Hola</p>');
 });
 it('removes a material with the draft revision',async()=>{
  vi.mocked(postCommunication).mockResolvedValue({message:message({body:'Hola',revision:5}),materials:[]});
  show(message({materials:[item()]}));
  fireEvent.click(within(screen.getByRole('list',{name:'Material incluido'})).getByRole('button',{name:'Quitar'}));
  await waitFor(()=>expect(sent()).toEqual({action:'material_remove',id,revision:4,shareId}));
  await waitFor(()=>expect(screen.queryByRole('list',{name:'Material incluido'})).toBeNull());
 });
 it('offers «Adjuntar el archivo» in email and keeps it off with the reason when the file cannot be attached',async()=>{
  vi.mocked(postCommunication).mockResolvedValue({message:message({channel:'email',subject:'Hola',revision:5}),materials:[item({channel:'email',attach:true}),item({shareId:'44444444-4444-4444-8444-444444444444',title:'Video',channel:'email',attachBlockedReason:'Supera el límite de adjuntos de email (10 MB).'})]});
  show(message({channel:'email',subject:'Hola',body:'<p>Hola</p>',materials:[item({channel:'email'}),item({shareId:'44444444-4444-4444-8444-444444444444',title:'Video',channel:'email',attachBlockedReason:'Supera el límite de adjuntos de email (10 MB).'})]}));
  const boxes=screen.getAllByLabelText('Adjuntar el archivo') as HTMLInputElement[];
  expect(boxes[1]!.disabled).toBe(true);expect(screen.getByText('Supera el límite de adjuntos de email (10 MB).')).toBeTruthy();
  fireEvent.click(boxes[0]!);
  await waitFor(()=>expect(sent()).toEqual({action:'material_attach',id,revision:4,shareId,attach:true}));
  await waitFor(()=>expect((screen.getAllByLabelText('Adjuntar el archivo')[0] as HTMLInputElement).checked).toBe(true));
 });
 it('blocks material changes while the subject or text has unsaved edits',()=>{
  show(message({channel:'email',subject:'Hola',body:'<p>Hola</p>',materials:[item({channel:'email'})]}));
  fireEvent.change(screen.getByRole('textbox',{name:'Asunto final'}),{target:{value:'Hola de nuevo'}});
  expect((screen.getByRole('button',{name:'Agregar material de venta'}) as HTMLButtonElement).disabled).toBe(true);
  expect((within(screen.getByRole('list',{name:'Material incluido'})).getByRole('button',{name:'Quitar'}) as HTMLButtonElement).disabled).toBe(true);
 });
 it('adds the material chosen with «Enviar material» once, as soon as the draft is ready',async()=>{
  vi.mocked(postCommunication).mockResolvedValue({message:message({revision:5}),materials:[item()]});
  show(message(),{initialMaterialId:materialId});
  await waitFor(()=>expect(sent()).toEqual({action:'material_add',id,revision:4,materialId,attach:false}));
  await screen.findByRole('list',{name:'Material incluido'});
  expect(postCommunication).toHaveBeenCalledTimes(1);
 });
 it('offers «Reintentar sin adjuntos» on an email Brevo refused, with a stable new draft id',async()=>{
  vi.mocked(postCommunication).mockResolvedValue({message:message({id:'55555555-5555-4555-8555-555555555555',channel:'email',subject:'Hola',revision:1}),materials:[item({channel:'email'})]});
  show(message({channel:'email',status:'failed',subject:'Hola',body:'<p>Hola</p>',textBody:'Hola',htmlBody:'<p>Hola</p>',materials:[item({channel:'email',attach:true,sentVersion:1})]}));
  fireEvent.click(screen.getByRole('button',{name:'Reintentar sin adjuntos'}));
  await waitFor(()=>expect(sent()).toEqual({action:'material_retry_without_attachments',id:expect.stringMatching(/^[0-9a-f-]{36}$/),messageId:id}));
  expect(await screen.findByRole('heading',{name:'Personalizá el mensaje'})).toBeTruthy();
 });
 it('retries from the delegated task with its task id',async()=>{
  vi.mocked(postCommunication).mockResolvedValue({message:message({id:'55555555-5555-4555-8555-555555555555',channel:'email',subject:'Hola',revision:1}),materials:[]});
  show(message({channel:'email',status:'failed',subject:'Hola',body:'<p>Hola</p>',textBody:'Hola',htmlBody:'<p>Hola</p>',materials:[item({channel:'email',attach:true,sentVersion:1})]}),{taskId:'77'});
  fireEvent.click(screen.getByRole('button',{name:'Reintentar sin adjuntos'}));
  await waitFor(()=>expect(sent()).toEqual(expect.objectContaining({action:'material_retry_without_attachments',messageId:id,taskId:'77'})));
 });
 it('treats a stale revision on a material action like a concurrent edit (regression: the stale draft stayed editable)',async()=>{
  vi.mocked(postCommunication).mockRejectedValue(new CrmApiError('El borrador cambió o ya fue utilizado.',409));
  show(message({body:'Hola\n\nFolleto 2027: https://crm.example.test/m/x',materials:[item()]}));
  fireEvent.click(within(screen.getByRole('list',{name:'Material incluido'})).getByRole('button',{name:'Quitar'}));
  expect(await screen.findByText('Este borrador cambió en otra ventana. Revisalo antes de seguir.')).toBeTruthy();
  expect(screen.queryByRole('heading',{name:'Personalizá el mensaje'})).toBeNull();
 });
 it('keeps the draft editable when a material action fails for another reason',async()=>{
  vi.mocked(postCommunication).mockRejectedValue(new CrmApiError('«Folleto 2027» ya está en el mensaje.',409));
  show(message({body:'Hola\n\nFolleto 2027: https://crm.example.test/m/x',materials:[item()]}));
  fireEvent.click(within(screen.getByRole('list',{name:'Material incluido'})).getByRole('button',{name:'Quitar'}));
  expect(await screen.findByText('«Folleto 2027» ya está en el mensaje.')).toBeTruthy();
  expect(screen.getByRole('heading',{name:'Personalizá el mensaje'})).toBeTruthy();
 });
});

describe('SentMaterials (spec 89 §8.4)',()=>{
 const sent=item({sentVersion:2,technicalAccessCount:3,lastTechnicalAccessAt:new Date('2026-10-02T12:00:00Z')});
 const view=(canRevoke=true,status='manual_sent')=>render(<MantineProvider><QueryClientProvider client={new QueryClient()}><SentMaterials materials={[sent]} message={{status,ownerEmail:'seller@example.com',lastInteractionAt:new Date('2026-10-01T16:00:00Z'),createdAt:new Date('2026-10-01T15:30:00Z')}} users={[{email:'seller@example.com',displayName:'Sole'}]} canRevoke={()=>canRevoke}/></QueryClientProvider></MantineProvider>);
 it('records version, author, channel and the technical access, never as proof the client saw it',()=>{
  view();
  expect(screen.getByText(/Versión enviada: 2 · WhatsApp · Sole/)).toBeTruthy();
  expect(screen.getByText('Enlace activo')).toBeTruthy();
  expect(screen.getByText(/Registro técnico de acceso: 3.*No confirma que el cliente lo haya visto\./)).toBeTruthy();
 });
 it('revokes with a mandatory reason',async()=>{
  api.revoke.mockResolvedValue({ok:true});
  view();
  fireEvent.click(screen.getByRole('button',{name:'Revocar enlace'}));
  const dialog=await screen.findByRole('dialog');
  const confirm=within(dialog).getByRole('button',{name:'Revocar enlace'}) as HTMLButtonElement;expect(confirm.disabled).toBe(true);
  fireEvent.change(within(dialog).getByRole('textbox'),{target:{value:'Le mandé la versión nueva'}});
  fireEvent.click(confirm);
  await waitFor(()=>expect(api.revoke.mock.calls[0]?.[0]).toEqual({shareId,reason:'Le mandé la versión nueva'}));
 });
 it('never labels a message that was not confirmed as sent as delivered (regression: whatsapp_opened and failed read «Versión enviada»)',()=>{
  for(const status of ['whatsapp_opened','failed','manual_not_done','unknown']){
   view(true,status);
   expect(screen.queryByText(/Versión enviada/)).toBeNull();
   expect(screen.getByText(/Versión incluida en el mensaje: 2/)).toBeTruthy();
   expect(screen.getByText(/Envío no confirmado: el mensaje figura como/)).toBeTruthy();
   cleanup();
  }
 });
 it('lets the author, the business or management owner and an admin revoke, also on a No contactar business',()=>{
  expect(canRevokeMaterialLink({admin:false,userEmail:'owner@example.com',authorEmail:'other@example.com',businessOwnerEmail:'owner@example.com'})).toBe(true);
  expect(canRevokeMaterialLink({admin:false,userEmail:'lead@example.com',authorEmail:'other@example.com',businessOwnerEmail:'owner@example.com',managementOwnerEmail:'lead@example.com'})).toBe(true);
  expect(canRevokeMaterialLink({admin:false,userEmail:'other@example.com',authorEmail:'other@example.com'})).toBe(true);
  expect(canRevokeMaterialLink({admin:true,userEmail:'a@example.com',authorEmail:'x@example.com'})).toBe(true);
  expect(canRevokeMaterialLink({admin:false,userEmail:'stranger@example.com',authorEmail:'x@example.com',businessOwnerEmail:'owner@example.com',managementOwnerEmail:'lead@example.com'})).toBe(false);
 });
 it('hides «Revocar enlace» from whoever may not revoke',()=>{
  view(false);
  expect(screen.queryByRole('button',{name:'Revocar enlace'})).toBeNull();
 });
});
