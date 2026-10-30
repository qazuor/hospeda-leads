import React from 'react';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {MantineProvider} from '@mantine/core';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {MemoryRouter} from 'react-router-dom';
import {ContactTemplateDialog} from './ContactTemplateDialog';
import {getCommercialDetail} from '../endpoints/commercial.schema';
import {getCommunication,postCommunication} from '../endpoints/communication.schema';

const account={id:'5',nombre:'Hotel Sol',ciudad:'Colón',tipo:'Hotel',subtipo:null,email:'hotel@example.com',telefono:'+5493447111111',whatsapp:null,sitioWeb:null,isClient:false,doNotContact:false,assignedUserEmail:'seller@example.com',perfilInstagram:null};
const contacts=[{id:'21',name:'Ana',phone:'+5493442000002',email:null,isPrimary:true,deletedAt:null},{id:'22',name:'Beto',phone:'+5493442000003',email:null,isPrimary:false,deletedAt:null}];
vi.mock('../endpoints/commercial.schema',()=>({getCommercialDetail:vi.fn()}));
vi.mock('../endpoints/communication.schema',()=>({getCommunication:vi.fn(),postCommunication:vi.fn()}));
vi.mock('../helpers/useAuth',()=>({useAuth:()=>({authState:{type:'authenticated',user:{id:'u',email:'seller@example.com',role:'user'}}})}));
const templates=[{id:'1',name:'Presentación',channel:'whatsapp',purpose:'first_contact',body:'Hola {{contact}}',active:true},{id:'2',name:'Seguimiento',channel:'whatsapp',purpose:'resume',body:'Retomamos',active:true}];
const show=(props:Partial<React.ComponentProps<typeof ContactTemplateDialog>>={})=>render(<MantineProvider><MemoryRouter><QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><ContactTemplateDialog open channel="whatsapp" lead={null} general={{accountId:'5',purpose:'first_contact',otherPurpose:''}} templates={templates as never} onOpenChange={vi.fn()} {...props}/></QueryClientProvider></MemoryRouter></MantineProvider>);
beforeEach(()=>{
 window.matchMedia=vi.fn().mockImplementation(query=>({matches:false,media:query,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}}));
 vi.mocked(getCommercialDetail).mockResolvedValue({account,contacts,opportunities:[],users:[],senderProfiles:[]} as never);
 vi.mocked(getCommunication).mockResolvedValue({restrictions:[],activeRestrictions:[],recentMessages:[],recentContactHours:72,openManagements:[]} as never);
});
afterEach(()=>{cleanup();vi.clearAllMocks();});

describe('ContactTemplateDialog · «Sin gestión» (spec 96 D5)',()=>{
 it('uses the same template list, filtered by the purpose, and prepares a general draft with it',async()=>{
  vi.mocked(postCommunication).mockReturnValue(new Promise(()=>{}));
  show({initialContactId:'21',pickers:<p>pickers here</p>});
  expect(screen.getByText('pickers here')).toBeTruthy();
  const template=await screen.findByRole('button',{name:/Presentación/});
  expect(screen.queryByRole('button',{name:/Seguimiento/})).toBeNull();
  await waitFor(()=>expect((template as HTMLButtonElement).disabled).toBe(false));
  expect(screen.getByText((_,el)=>el?.tagName==='P'&&/^Para: Ana · \+5493442000002/.test(el.textContent??''))).toBeTruthy();
  fireEvent.click(template);
  await waitFor(()=>expect(vi.mocked(postCommunication).mock.calls[0]?.[0]).toMatchObject({action:'prepare_general',accountId:'5',leadId:null,contactId:'21',channel:'whatsapp',purpose:'first_contact',otherPurpose:null,templateId:'1'}));
 });
 it('asks for the person when several have the channel, and offers no business fallback then',async()=>{
  show();
  const select=await screen.findByLabelText('Destinatario') as HTMLSelectElement;
  expect([...select.options].map(o=>o.textContent)).toEqual(['Elegí una persona','Ana · Principal','Beto']);
  expect(screen.getByText('Elegí a quién enviar este mensaje.')).toBeTruthy();
 });
 it('keeps the templates off with the parent reason and shows only the pickers without a scope',async()=>{
  show({blockReason:'Completá la aclaración del propósito.',initialContactId:'21'});
  const template=await screen.findByRole('button',{name:/Presentación/});
  await waitFor(()=>expect(getCommercialDetail).toHaveBeenCalled());
  expect((template as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getAllByText('Completá la aclaración del propósito.').length).toBeGreaterThan(0);
  cleanup();
  show({general:undefined,lead:null,pickers:<p>pickers here</p>,blockReason:'Elegí sobre qué es el contacto.'});
  expect(screen.getByText('Elegí sobre qué es el contacto.')).toBeTruthy();
  expect(screen.queryByRole('button',{name:/Presentación/})).toBeNull();
 });
 it('has no chained «Anotar cómo salió» step',async()=>{
  vi.mocked(postCommunication).mockResolvedValue({id:'m',accountId:'5',leadId:null,contactId:'21',channel:'whatsapp',recipient:'+5493442000002',recipientName:'Ana',subject:'',body:'Hola Ana',htmlBody:null,textBody:'Hola Ana',templateSnapshot:null,ownerEmail:'seller@example.com',activityId:null,outboxId:null,taskId:null,status:'draft',revision:0,lastInteractionAt:null,lastActorEmail:null,createdAt:new Date(),updatedAt:new Date()} as never);
  show({initialContactId:'21'});
  const template=await screen.findByRole('button',{name:/Presentación/});
  await waitFor(()=>expect((template as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(template);
  expect(await screen.findByRole('heading',{name:'Revisá el contenido final'})).toBeTruthy();
  expect(screen.queryByRole('button',{name:'Anotar cómo salió'})).toBeNull();
 });
});
