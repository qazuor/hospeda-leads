import React from 'react';
import {afterEach,beforeAll,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,within} from '@testing-library/react';
import {MantineProvider} from '@mantine/core';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
// Spec 93: delivery, opens, clicks and spam badges on the email item, and the «Cómo leer el chat» entry.
const mocks=vi.hoisted(()=>({getCommunication:vi.fn(),postCommunication:vi.fn(),markCommunicationSeen:vi.fn(),getCommercialDetail:vi.fn(),getPipeline:vi.fn(),getWork:vi.fn()}));
vi.mock('sonner',()=>({toast:{success:vi.fn(),warning:vi.fn(),error:vi.fn(),info:vi.fn()}}));
vi.mock('../endpoints/communication.schema',async original=>({...await original<typeof import('../endpoints/communication.schema')>(),getCommunication:mocks.getCommunication,postCommunication:mocks.postCommunication,markCommunicationSeen:mocks.markCommunicationSeen}));
vi.mock('../endpoints/commercial.schema',async original=>({...await original<typeof import('../endpoints/commercial.schema')>(),getCommercialDetail:mocks.getCommercialDetail}));
vi.mock('../endpoints/pipeline.schema',async original=>({...await original<typeof import('../endpoints/pipeline.schema')>(),getPipeline:mocks.getPipeline}));
vi.mock('../endpoints/work.schema',async original=>({...await original<typeof import('../endpoints/work.schema')>(),getWork:mocks.getWork}));
vi.mock('../helpers/useAuth',()=>({useAuth:()=>({authState:{type:'authenticated',user:{id:1,email:'seller@example.com',displayName:'Seller',role:'user'}}})}));
import {CommunicationPanel} from './CommunicationPanel';
import {OPEN_APPROXIMATE_NOTE,SPAM_NOTE,engagementTime} from '../helpers/emailEngagement';

const day=(d:number,h=12)=>new Date(`2026-10-${String(d).padStart(2,'0')}T${String(h).padStart(2,'0')}:00:00-03:00`);
const none={deliveredAt:null,firstOpenedAt:null,openCount:0,firstProxyOpenedAt:null,proxyOpenCount:0,firstClickedAt:null,clickCount:0,clickedLinks:[],spamAt:null,lastEventAt:null};
const email=(id:string,over:Record<string,unknown>={})=>({id,accountId:'5',leadId:null,contactId:null,channel:'email',recipient:'hotel@example.com',recipientName:'Hotel Sol',subject:'Propuesta '+id,body:'Hola',htmlBody:null,textBody:'Hola',templateSnapshot:null,ownerEmail:'seller@example.com',activityId:null,outboxId:'77',taskId:null,status:'accepted',revision:1,lastInteractionAt:day(2),lastActorEmail:null,createdAt:day(2),updatedAt:day(2),emailEngagement:null,...over});
const account={id:'5',nombre:'Hotel Sol',assignedUserEmail:'seller@example.com',email:'hotel@example.com',telefono:'3447',whatsapp:null,tipo:'Alojamiento',ciudad:'Colón',subtipo:null,archivedAt:null,recontactAt:null,status:'active',doNotContact:false,isClient:false};
function setup(messages:unknown[]){
 mocks.getCommunication.mockResolvedValue({messages,recentMessages:[],restrictions:[],activeRestrictions:[],responses:[],inbound:[],openManagements:[],pendingOutcomes:[],recentContactHours:72,webhookConfigured:true});
 mocks.getCommercialDetail.mockResolvedValue({account,contacts:[],opportunities:[],users:[{email:'seller@example.com',displayName:'Seller'}]});
 mocks.getPipeline.mockResolvedValue({stages:[]});mocks.getWork.mockResolvedValue({tasks:[]});mocks.markCommunicationSeen.mockResolvedValue({lastSeenAt:new Date()});
 render(<MantineProvider env="test"><QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><CommunicationPanel accountId="5"/></QueryClientProvider></MantineProvider>);
 return screen.findByRole('region',{name:'Conversación'});
}
beforeAll(()=>{
 window.matchMedia=window.matchMedia||((query:string)=>({matches:false,media:query,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){},dispatchEvent:()=>false,onchange:null}) as MediaQueryList);
 globalThis.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}} as unknown as typeof ResizeObserver;
 globalThis.IntersectionObserver=class{observe(){}unobserve(){}disconnect(){}takeRecords(){return []}root=null;rootMargin='';thresholds=[]} as unknown as typeof IntersectionObserver;
 HTMLElement.prototype.scrollTo=function(){} as typeof HTMLElement.prototype.scrollTo;Element.prototype.scrollIntoView=function(){};
});
afterEach(()=>{cleanup();for(const fn of Object.values(mocks))fn.mockReset();});
const articleOf=(subject:string)=>screen.getByText(subject).closest('article') as HTMLElement;

describe('email engagement badges (spec 93)',()=>{
 it('shows «Entregado», the first open with its count and the click, with the approximate note on the open',async()=>{
  // Arrange
  const engagement={...none,deliveredAt:day(2,13),firstOpenedAt:day(2,14),openCount:2,firstClickedAt:day(2,15),clickCount:1,clickedLinks:['hospeda.com.ar/planes'],lastEventAt:day(2,15)};
  // Act
  await setup([email('a',{status:'delivery_confirmed',emailEngagement:engagement})]);
  // Assert
  const item=articleOf('Propuesta a');
  expect(within(item).getByText(`Entregado · ${engagementTime(day(2,13))}`)).toBeTruthy();
  const opened=within(item).getByText(`Abierto · ${engagementTime(day(2,14))} · ×2`);
  expect(within(item).getByText(`Click en un enlace · ${engagementTime(day(2,15))}`)).toBeTruthy();
  expect(opened.getAttribute('aria-label')).toContain(OPEN_APPROXIMATE_NOTE);
  fireEvent.focus(opened);expect((await screen.findByRole('tooltip')).textContent).toBe(OPEN_APPROXIMATE_NOTE);
  // Links are text in the click tooltip, never anchors.
  expect(within(item).getByText(/^Click en un enlace/).getAttribute('aria-label')).toContain('hospeda.com.ar/planes');
  expect(item.querySelector('a[href*="hospeda.com.ar/planes"]')).toBeNull();
 });
 it('warns about a spam complaint and keeps the accepted status when there is no delivery',async()=>{
  await setup([email('b',{emailEngagement:{...none,spamAt:day(2,16),lastEventAt:day(2,16)}})]);
  const item=articleOf('Propuesta b');
  const spam=within(item).getByText(`Marcado como spam · ${engagementTime(day(2,16))}`);
  expect(spam.getAttribute('data-tone')).toBe('warning');expect(spam.getAttribute('aria-label')).toContain(SPAM_NOTE);
  expect(within(item).getByText('Email aceptado por proveedor · entrega no confirmada')).toBeTruthy();
  expect(within(item).queryByText(/^Entregado/)).toBeNull();
 });
 it('labels proxy opens as a possible automatic open and shows no badges without events',async()=>{
  await setup([email('c',{emailEngagement:{...none,firstProxyOpenedAt:day(2,17),proxyOpenCount:1}}),email('d',{lastInteractionAt:day(3)})]);
  expect(within(articleOf('Propuesta c')).getByText(`Posible apertura automática · ${engagementTime(day(2,17))}`)).toBeTruthy();
  expect(within(articleOf('Propuesta c')).queryByText(/^Abierto/)).toBeNull();
  expect(articleOf('Propuesta d').querySelector('[data-kind="engagement"]')).toBeNull();
 });
 it('explains the email badges in «Cómo leer el chat»',async()=>{
  const conversation=await setup([email('e')]);
  fireEvent.click(within(conversation).getByRole('button',{name:'Cómo leer el chat'}));
  const legend=await screen.findByRole('dialog',{name:'Cómo leer el chat'});
  for(const text of ['Email (Brevo)','Entregado','Abierto','Click en un enlace','Posible apertura automática','Marcado como spam',OPEN_APPROXIMATE_NOTE])expect(within(legend).getByText(text)).toBeTruthy();
  expect(within(legend).getByText(/Informativos: no son una respuesta/)).toBeTruthy();
 });
});
