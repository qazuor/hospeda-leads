import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {MantineProvider} from '@mantine/core';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {postCommunication} from '../endpoints/communication.schema';
import {getCommercialDetail} from '../endpoints/commercial.schema';
import {ContactTemplateDialog} from './ContactTemplateDialog';

vi.mock('../endpoints/commercial.schema',()=>({getCommercialDetail:vi.fn(async()=>({contacts:[],opportunities:[{id:'1',assignedUserEmail:'seller@example.com'}],account:{id:'1',isClient:false,doNotContact:false,assignedUserEmail:'seller@example.com'},senderProfiles:[]}))}));
vi.mock('../endpoints/communication.schema',()=>({getCommunication:vi.fn(async()=>({restrictions:[],activeRestrictions:[],recentMessages:[],recentContactHours:72,openManagements:[]})),postCommunication:vi.fn(async(input:{templateId:string|null})=>({id:'m-'+(input.templateId??'free'),accountId:'1',leadId:'1',contactId:null,channel:'whatsapp',recipient:'+5493442000001',recipientName:null,subject:null,body:'Hola',htmlBody:null,textBody:null,templateSnapshot:input.templateId?{id:input.templateId,name:'Presentación'}:null,ownerEmail:'seller@example.com',activityId:null,outboxId:null,taskId:null,status:'draft',revision:0,lastInteractionAt:null,lastActorEmail:null,createdAt:new Date(),updatedAt:new Date(),purpose:null,otherPurpose:null}))}));
vi.mock('../helpers/useAuth',()=>({useAuth:()=>({authState:{type:'authenticated',user:{id:'u',email:'seller@example.com',role:'admin'}}})}));
// The composer has its own specs; here it only shows which draft is open and with which material.
vi.mock('./MessageComposer',()=>({MessageComposer:({initial,initialMaterialId}:{initial:{id:string};initialMaterialId?:string})=><p>Borrador {initial.id} con {initialMaterialId??'nada'}</p>}));

const templates=[{id:'7',channel:'whatsapp',name:'Presentación',subject:null,body:'Hola {{name}}',vertical:null,managementType:null,commercialProfile:null,active:true}];
const setup=(initialMaterialId?:string)=>render(<MantineProvider><QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><ContactTemplateDialog open presentation="floating" channel="whatsapp" lead={{id:'1',accountId:'1',nombre:'Negocio',tipo:'hotel',telefono:'+5493442000001'}} templates={templates} initialMaterialId={initialMaterialId} onOpenChange={vi.fn()}/></QueryClientProvider></MantineProvider>);

describe('ContactTemplateDialog with «Enviar material» (owner review of spec 96)',()=>{
 beforeEach(()=>{window.matchMedia=vi.fn().mockImplementation(()=>({matches:true,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}}));});
 afterEach(()=>{cleanup();vi.clearAllMocks();});

 it('opens a free draft with the material at once, without the template list',async()=>{
  // Act
  setup('mat-1');
  // Assert
  expect(await screen.findByText('Borrador m-free con mat-1')).toBeTruthy();
  expect(vi.mocked(postCommunication)).toHaveBeenCalledTimes(1);
  expect(vi.mocked(postCommunication).mock.calls[0][0]).toMatchObject({action:'prepare',templateId:null});
  expect(screen.queryByRole('heading',{name:'Elegí un mensaje modelo'})).toBeNull();
  expect((screen.getByLabelText('Mensaje modelo') as HTMLSelectElement).value).toBe('');
 });

 it('switches the draft to the model picked above it, keeping the material',async()=>{
  setup('mat-1');
  await screen.findByText('Borrador m-free con mat-1');
  fireEvent.change(screen.getByLabelText('Mensaje modelo'),{target:{value:'7'}});
  expect(await screen.findByText('Borrador m-7 con mat-1')).toBeTruthy();
  expect(vi.mocked(postCommunication).mock.calls[1][0]).toMatchObject({action:'prepare',templateId:'7'});
  expect((screen.getByLabelText('Mensaje modelo') as HTMLSelectElement).value).toBe('7');
 });

 it('opens the free Instagram draft with the material too (spec 98 decision 2)',async()=>{
  vi.mocked(getCommercialDetail).mockResolvedValueOnce({contacts:[],opportunities:[{id:'1',assignedUserEmail:'seller@example.com'}],account:{id:'1',isClient:false,doNotContact:false,assignedUserEmail:'seller@example.com',perfilInstagram:'hotel.sol'},senderProfiles:[]} as never);
  render(<MantineProvider><QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><ContactTemplateDialog open presentation="floating" channel="instagram" lead={{id:'1',accountId:'1',nombre:'Negocio',tipo:'hotel',telefono:'+5493442000001'}} templates={templates} initialMaterialId="mat-1" onOpenChange={vi.fn()}/></QueryClientProvider></MantineProvider>);
  expect(await screen.findByText('Borrador m-free con mat-1')).toBeTruthy();
  expect(vi.mocked(postCommunication).mock.calls[0][0]).toMatchObject({action:'prepare',channel:'instagram',templateId:null});
 });

 it('keeps the template list first when there is no material',async()=>{
  setup();
  expect(await screen.findByRole('heading',{name:'Elegí un mensaje modelo'})).toBeTruthy();
  await waitFor(()=>expect((screen.getByRole('button',{name:'Escribir un mensaje nuevo'}) as HTMLButtonElement).disabled).toBe(false));
  expect(vi.mocked(postCommunication)).not.toHaveBeenCalled();
 });
});
