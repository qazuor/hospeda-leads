import React from 'react';
import {afterEach,beforeAll,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,within} from '@testing-library/react';
import {MantineProvider} from '@mantine/core';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
const mocks=vi.hoisted(()=>({getCommunication:vi.fn(),getCommercialDetail:vi.fn(),getPipeline:vi.fn(),list:vi.fn(),role:'user',email:'seller@example.com'}));
vi.mock('../endpoints/communication.schema',async original=>({...await original<typeof import('../endpoints/communication.schema')>(),getCommunication:mocks.getCommunication,postCommunication:vi.fn()}));
vi.mock('../endpoints/commercial.schema',async original=>({...await original<typeof import('../endpoints/commercial.schema')>(),getCommercialDetail:mocks.getCommercialDetail}));
vi.mock('../endpoints/pipeline.schema',async original=>({...await original<typeof import('../endpoints/pipeline.schema')>(),getPipeline:mocks.getPipeline}));
vi.mock('../endpoints/salesMaterials.schema',async original=>({...await original<typeof import('../endpoints/salesMaterials.schema')>(),getSalesMaterials:mocks.list}));
vi.mock('../helpers/useAuth',()=>({useAuth:()=>({authState:{type:'authenticated',user:{id:1,email:mocks.email,displayName:'Sole',role:mocks.role}}})}));
import {CommunicationPanel} from './CommunicationPanel';

const shared={shareId:'33333333-3333-4333-8333-333333333333',messageId:'m1',materialId:'22222222-2222-4222-8222-222222222222',title:'Folleto 2027',channel:'whatsapp',source:'file',fileName:'folleto.pdf',byteSize:2048,available:true,preparedVersion:1,sentVersion:2,attach:false,attachedVersion:null,attachBlockedReason:null,createdByEmail:'seller@example.com',createdAt:new Date(),revokedAt:null,revokedByEmail:null,revokeReason:null,technicalAccessCount:0,lastTechnicalAccessAt:null};
const sent={id:'m1',accountId:'5',leadId:null,contactId:null,channel:'whatsapp',recipient:'+5493442000002',recipientName:'Ana',subject:'',body:'Folleto 2027: https://crm.example.test/m/x',htmlBody:null,textBody:null,templateSnapshot:null,ownerEmail:'other@example.com',activityId:null,outboxId:null,taskId:null,status:'manual_sent',revision:3,lastInteractionAt:new Date(),lastActorEmail:'other@example.com',createdAt:new Date(),updatedAt:new Date(),materials:[shared]};
function show({doNotContact=false,onSendMaterial,author='seller@example.com',owner='seller@example.com'}:{doNotContact?:boolean;onSendMaterial?:(m:{id:string;title:string})=>void;author?:string;owner?:string}={}){
 mocks.getCommunication.mockResolvedValue({messages:[{...sent,materials:[{...shared,createdByEmail:author}]}],recentMessages:[],restrictions:[],activeRestrictions:[],responses:[],inbound:[],openManagements:[],pendingOutcomes:[],recentContactHours:72,webhookConfigured:false});
 mocks.getCommercialDetail.mockResolvedValue({account:{id:'5',nombre:'Hotel Sol',assignedUserEmail:owner,archivedAt:null,doNotContact},contacts:[],opportunities:[],users:[{email:'other@example.com',displayName:'Otra vendedora'}]});
 mocks.getPipeline.mockResolvedValue({stages:[]});
 render(<MantineProvider><QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><CommunicationPanel accountId="5" onSendMaterial={onSendMaterial}/></QueryClientProvider></MantineProvider>);
}
beforeAll(()=>{window.matchMedia=window.matchMedia||((query:string)=>({matches:false,media:query,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){},dispatchEvent:()=>false,onchange:null}) as MediaQueryList);globalThis.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};});
afterEach(()=>{cleanup();vi.clearAllMocks();mocks.role='user';});

describe('CommunicationPanel sales material (spec 89 §8.2, §8.4)',()=>{
 it('lists the material sent with a message and lets the business owner revoke it',async()=>{
  show();
  fireEvent.click(await screen.findByRole('button',{name:/WhatsApp/}));
  expect(await screen.findByText('Folleto 2027')).toBeTruthy();
  expect(screen.getByText(/Versión enviada: 2 · WhatsApp · Otra vendedora/)).toBeTruthy();
  expect(screen.getByRole('button',{name:'Revocar enlace'})).toBeTruthy();
 });
 it('opens the picker from «Enviar material» and hands the chosen material to the business page',async()=>{
  mocks.list.mockResolvedValue({materials:[{id:'22222222-2222-4222-8222-222222222222',title:'Folleto 2027',description:'',kind:'deliverable',source:'file',status:'active',archivedAt:null,archivedByEmail:null,revision:1,createdByEmail:'a@example.com',createdAt:new Date(),updatedAt:new Date(),hasCover:false,categories:[],currentVersion:{id:'v1',version:1,url:null,fileName:'folleto.pdf',mimeType:'application/pdf',byteSize:2048,actorEmail:'a@example.com',createdAt:new Date()}}],truncated:false,categories:[],limits:{maxUploadBytes:1,maxCoverBytes:1,storageConfigured:true,maxEmailAttachmentBytes:10485760}});
  const onSendMaterial=vi.fn();show({onSendMaterial});
  fireEvent.click(await screen.findByRole('button',{name:'Enviar material'}));
  fireEvent.click(within(await screen.findByRole('list',{name:'Material entregable'})).getByRole('button',{name:'Agregar'}));
  expect(onSendMaterial).toHaveBeenCalledWith({id:'22222222-2222-4222-8222-222222222222',title:'Folleto 2027'});
 });
 it('lets the business owner who did not send it revoke on a No contactar business (regression: hidden behind readOnly)',async()=>{
  show({doNotContact:true,author:'other@example.com'});
  fireEvent.click(await screen.findByRole('button',{name:/WhatsApp/}));
  expect(await screen.findByRole('button',{name:'Revocar enlace'})).toBeTruthy();
 });
 it('hides «Revocar enlace» from a seller who is neither author nor responsible',async()=>{
  show({author:'other@example.com',owner:'boss@example.com'});
  fireEvent.click(await screen.findByRole('button',{name:/WhatsApp/}));
  await screen.findByText('Folleto 2027');
  expect(screen.queryByRole('button',{name:'Revocar enlace'})).toBeNull();
 });
 it('keeps «Enviar material» off on a No contactar business',async()=>{
  show({doNotContact:true,onSendMaterial:vi.fn()});
  expect(((await screen.findByRole('button',{name:'Enviar material'})) as HTMLButtonElement).disabled).toBe(true);
 });
 it('has no «Enviar material» where the page cannot open Contactar',async()=>{
  show();
  await screen.findByRole('button',{name:/WhatsApp/});
  expect(screen.queryByRole('button',{name:'Enviar material'})).toBeNull();
 });
});
