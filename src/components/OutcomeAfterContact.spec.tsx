import React from 'react';
import {afterEach,beforeAll,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {MantineProvider} from '@mantine/core';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';

const postCommunication=vi.fn(async(_input:unknown)=>({}));
vi.mock('../endpoints/communication.schema',async importOriginal=>({...await importOriginal<object>(),postCommunication:(input:unknown)=>postCommunication(input)}));
vi.mock('../endpoints/work.schema',async importOriginal=>({...await importOriginal<object>(),getWork:async()=>({tasks:[],activities:[],types:[{id:'message',name:'Mensaje',agenda:false,active:true}],accounts:[{id:'1',nombre:'Hotel',ciudad:null,assignedUserEmail:'a@example.com'}],opportunities:[],contacts:[],users:[],attention:[],journal:[],followupStages:[],newAssignmentDays:7,totalTasks:0,totalActivities:0,page:1})}));
vi.mock('../helpers/useAuth',()=>({useAuth:()=>({authState:{type:'authenticated',user:{id:1,email:'a@example.com',displayName:'A',role:'user'}}})}));
import {OutcomeAfterContact,leaveWithoutOutcome} from './OutcomeAfterContact';
import {CrmApiError} from '../helpers/apiClient';

beforeAll(()=>{
 window.matchMedia=vi.fn().mockImplementation(query=>({matches:false,media:query,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}}));
 globalThis.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};
});
afterEach(()=>{cleanup();postCommunication.mockClear();});

const renderOutcome=(status:string,onDone=vi.fn())=>{render(<MantineProvider><QueryClientProvider client={new QueryClient()}><OutcomeAfterContact contact={{accountId:'1',leadId:'2',channel:'whatsapp',messageId:'m1',messageStatus:status}} onDone={onDone}/></QueryClientProvider></MantineProvider>);return onDone;};

describe('OutcomeAfterContact',()=>{
 it('asks "¿Lo enviaste?" first for an opened WhatsApp and records "No" as not sent, without logging a contact',async()=>{
  const onDone=renderOutcome('whatsapp_opened');
  expect(await screen.findByText('¿Lo enviaste?')).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:'No, no lo envié'}));
  await waitFor(()=>expect(onDone).toHaveBeenCalledWith('not_sent'));
  expect(postCommunication).toHaveBeenCalledWith({action:'outcome',id:'m1',event:'manual_not_sent',notes:''});
 });
 it('shows «Este envío ya estaba confirmado.» as information, refreshes and closes when the script confirmed it first (spec 100 §9.4)',async()=>{
  const {toast}=await import('sonner');const info=vi.spyOn(toast,'info');const qc=new QueryClient(),refresh=vi.spyOn(qc,'invalidateQueries');
  postCommunication.mockRejectedValueOnce(new CrmApiError('Este envío ya estaba confirmado.',409));
  const onDone=vi.fn();render(<MantineProvider><QueryClientProvider client={qc}><OutcomeAfterContact contact={{accountId:'1',leadId:'2',channel:'whatsapp',messageId:'m1',messageStatus:'whatsapp_opened'}} onDone={onDone}/></QueryClientProvider></MantineProvider>);
  fireEvent.click(await screen.findByRole('button',{name:'No, no lo envié'}));
  await waitFor(()=>expect(onDone).toHaveBeenCalledWith('left'));
  expect(info).toHaveBeenCalledWith('Este envío ya estaba confirmado.');expect(refresh).toHaveBeenCalledWith({queryKey:['communication']});
  expect(screen.queryByRole('alert')).toBeNull();
 });
 it('closes a pending manual attempt as not done',async()=>{
  const onDone=renderOutcome('manual_pending');
  fireEvent.click(await screen.findByRole('button',{name:'No, no lo envié'}));
  await waitFor(()=>expect(onDone).toHaveBeenCalledWith('not_sent'));
  expect(postCommunication).toHaveBeenCalledWith({action:'manual_complete',id:'m1',result:'manual_not_done',summary:'No se envió'});
 });
 it('never leaves silently: "Todavía no sé" asks first and says the send is not confirmed',async()=>{
  const onDone=renderOutcome('whatsapp_opened');
  fireEvent.click(await screen.findByRole('button',{name:'Todavía no sé, lo anoto después'}));
  expect(await screen.findByText('¿Salir sin anotar cómo salió?')).toBeTruthy();
  expect(screen.getByText(/El envío todavía no está confirmado/)).toBeTruthy();
  expect(onDone).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'Salir sin anotar'}));
  expect(onDone).toHaveBeenCalledWith('left');
  expect(postCommunication).not.toHaveBeenCalled();
 });
 it('skips the send question when the contact is already confirmed',async()=>{
  renderOutcome('manual_sent');
  expect(await screen.findByLabelText('Título')).toBeTruthy();
  expect(screen.queryByText('¿Lo enviaste?')).toBeNull();
 });
});

describe('leaveWithoutOutcome',()=>{
 it('never claims an unconfirmed send was registered',()=>{
  expect(leaveWithoutOutcome('whatsapp_opened').description).toMatch(/^El envío todavía no está confirmado/);
  expect(leaveWithoutOutcome('manual_pending').description).not.toMatch(/quedó registrado/);
  expect(leaveWithoutOutcome('manual_sent').description).toMatch(/^El contacto ya quedó registrado/);
 });
});
