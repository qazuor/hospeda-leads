import React from 'react';
import {afterEach,beforeAll,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {MantineProvider} from '@mantine/core';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {MessageComposer} from './MessageComposer';
import {postCommunication,type PreparedMessage} from '../endpoints/communication.schema';

vi.mock('sonner',()=>({toast:{error:vi.fn(),success:vi.fn(),info:vi.fn()}}));
vi.mock('./RichTemplateEditor',()=>({RichTemplateEditor:({ariaLabel}:{ariaLabel:string})=><textarea aria-label={ariaLabel}/>}));
vi.mock('../endpoints/communication.schema',async original=>({...(await original<typeof import('../endpoints/communication.schema')>()),postCommunication:vi.fn()}));
beforeAll(()=>{
 window.matchMedia=window.matchMedia||((query:string)=>({matches:false,media:query,addEventListener:()=>{},removeEventListener:()=>{},addListener:()=>{},removeListener:()=>{},dispatchEvent:()=>false,onchange:null}) as MediaQueryList);
 window.ResizeObserver=window.ResizeObserver||class{observe(){}unobserve(){}disconnect(){}};
});
afterEach(()=>{cleanup();vi.clearAllMocks();});

const message=(over:Partial<PreparedMessage>):PreparedMessage=>({id:'11111111-1111-4111-8111-111111111111',accountId:'5',leadId:'9',contactId:'7',channel:'whatsapp',recipient:'+5493442000002',recipientName:'Ana',subject:'',body:'Texto viejo',htmlBody:null,textBody:'Texto viejo',templateSnapshot:null,ownerEmail:'seller@example.com',activityId:null,outboxId:null,taskId:null,status:'draft',revision:4,lastInteractionAt:null,lastActorEmail:null,createdAt:new Date('2026-10-01T15:30:00Z'),updatedAt:new Date('2026-10-01T15:30:00Z'),purpose:null,otherPurpose:null,...over});
const show=(initial:PreparedMessage,props:Partial<React.ComponentProps<typeof MessageComposer>>={})=>render(<MantineProvider><QueryClientProvider client={new QueryClient()}><MessageComposer initial={initial} {...props}/></QueryClientProvider></MantineProvider>);

describe('MessageComposer reused draft (report item 1.14)',()=>{
 it('asks before reopening an old draft instead of showing its editor',()=>{
  show(message({reusedDraft:true}));
  expect(screen.getByRole('group',{name:'Borrador anterior'}).textContent).toContain('Tenés un borrador del 1 de oct de 2026, 12:30');
  expect(screen.queryByRole('heading',{name:'Personalizá el mensaje'})).toBeNull();
 });
 it('continues with the old draft only when the seller chooses it',async()=>{
  show(message({reusedDraft:true}));
  fireEvent.click(screen.getByRole('button',{name:'Seguir con ese borrador'}));
  expect(await screen.findByRole('heading',{name:'Personalizá el mensaje'})).toBeTruthy();
  expect(screen.queryByRole('group',{name:'Borrador anterior'})).toBeNull();
  expect(postCommunication).not.toHaveBeenCalled();
 });
 it('discards the old draft and prepares a new one from the same context, never appending',async()=>{
  vi.mocked(postCommunication).mockResolvedValue(message({id:'33333333-3333-4333-8333-333333333333',body:'',textBody:null,revision:0}));
  const onChange=vi.fn();
  show(message({reusedDraft:true}),{onChange});
  fireEvent.click(screen.getByRole('button',{name:'Descartarlo y empezar de nuevo'}));
  await waitFor(()=>expect(onChange).toHaveBeenCalled());
  expect(vi.mocked(postCommunication).mock.calls[0][0]).toMatchObject({action:'prepare',leadId:'9',contactId:'7',channel:'whatsapp',templateId:null,discardDraft:{id:'11111111-1111-4111-8111-111111111111',revision:4}});
  expect(onChange.mock.calls[0][0].id).toBe('33333333-3333-4333-8333-333333333333');
  expect(screen.queryByRole('group',{name:'Borrador anterior'})).toBeNull();
 });
 it('opens a fresh draft directly',()=>{
  show(message({}));
  expect(screen.queryByRole('group',{name:'Borrador anterior'})).toBeNull();
  expect(screen.getByRole('heading',{name:'Personalizá el mensaje'})).toBeTruthy();
 });
});

describe('MessageComposer unconfirmed WhatsApp (report item 1.17)',()=>{
 it('asks whether it was sent and records the answer with the outcome action',async()=>{
  vi.mocked(postCommunication).mockResolvedValue({message:message({status:'manual_not_done'})});
  show(message({status:'whatsapp_opened'}));
  expect(screen.getByText('¿Lo enviaste?')).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:'No se envió'}));
  await waitFor(()=>expect(postCommunication).toHaveBeenCalled());
  expect(vi.mocked(postCommunication).mock.calls[0][0]).toEqual({action:'outcome',id:'11111111-1111-4111-8111-111111111111',event:'manual_not_sent',notes:''});
 });
 it('leaves the question to the parent when asked to',()=>{
  show(message({status:'whatsapp_opened'}),{hideWhatsAppResolution:true});
  expect(screen.queryByRole('button',{name:'Sí, se envió'})).toBeNull();
 });
});
