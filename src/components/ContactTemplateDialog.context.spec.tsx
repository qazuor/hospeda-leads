import React from 'react';
import {afterEach,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {MantineProvider} from '@mantine/core';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {MemoryRouter} from 'react-router-dom';
import {ContactTemplateDialog} from './ContactTemplateDialog';
import {getCommercialDetail} from '../endpoints/commercial.schema';
import {getCommunication,postCommunication} from '../endpoints/communication.schema';
import {CONNECTION_ATTRIBUTE,INSTALLED_ATTRIBUTE,USER_ATTRIBUTE} from '../../userscript/src/announce';
import {USERSCRIPT_VERSION} from '../../userscript/src/version';

vi.mock('sonner',()=>({toast:{error:vi.fn(),success:vi.fn(),info:vi.fn(),warning:vi.fn()}}));
vi.mock('./RichTemplateEditor',()=>({RichTemplateEditor:({ariaLabel}:{ariaLabel:string})=><textarea aria-label={ariaLabel}/>}));
vi.mock('../endpoints/commercial.schema',()=>({getCommercialDetail:vi.fn()}));
vi.mock('../endpoints/communication.schema',async original=>({...(await original<typeof import('../endpoints/communication.schema')>()),getCommunication:vi.fn(),postCommunication:vi.fn()}));
vi.mock('../helpers/useAuth',()=>({useAuth:()=>({authState:{type:'authenticated',user:{id:'u',email:'seller@example.com',role:'user'}}})}));

const account={id:'5',nombre:'Hotel Sol',ciudad:'Colón',tipo:'Hotel',subtipo:null,email:'hotel@example.com',telefono:'+5493447111111',whatsapp:null,sitioWeb:null,isClient:false,doNotContact:false,assignedUserEmail:'seller@example.com',perfilInstagram:null};
const contacts=[{id:'21',name:'Ana',phone:'+5493442000002',email:null,isPrimary:true,deletedAt:null},{id:'22',name:'Beto',phone:'+5493442000003',email:null,isPrimary:false,deletedAt:null}];
const templates=[{id:'1',name:'Presentación',channel:'whatsapp',purpose:'first_contact',body:'Hola {{contact}}',active:true}];
const history=(over:Record<string,unknown>={})=>({restrictions:[],activeRestrictions:[],recentMessages:[],recentContactHours:72,openManagements:[],...over});
const html=()=>document.documentElement;
const show=(props:Partial<React.ComponentProps<typeof ContactTemplateDialog>>={})=>render(<MantineProvider><MemoryRouter><QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><ContactTemplateDialog open channel="whatsapp" lead={null} general={{accountId:'5',purpose:'first_contact',otherPurpose:''}} templates={templates as never} onOpenChange={vi.fn()} {...props}/></QueryClientProvider></MemoryRouter></MantineProvider>);
const summary=()=>screen.findByText((_,el)=>el?.tagName==='P'&&/^Para: Ana · \+5493442000002 · Sin gestión · Presentación \/ primer contacto/.test(el.textContent??''));
const inCollapsed=(el:HTMLElement)=>!!el.closest('[hidden]');

beforeAll(()=>{window.ResizeObserver=window.ResizeObserver||class{observe(){}unobserve(){}disconnect(){}};Element.prototype.scrollIntoView=Element.prototype.scrollIntoView||(()=>{});});
beforeEach(()=>{
 window.matchMedia=vi.fn().mockImplementation(query=>({matches:false,media:query,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}}));
 html().setAttribute(INSTALLED_ATTRIBUTE,USERSCRIPT_VERSION);html().setAttribute(CONNECTION_ATTRIBUTE,'connected');html().setAttribute(USER_ATTRIBUTE,'seller@example.com');
 vi.mocked(getCommercialDetail).mockResolvedValue({account,contacts,opportunities:[],users:[],senderProfiles:[]} as never);
 vi.mocked(getCommunication).mockResolvedValue(history() as never);
});
afterEach(()=>{cleanup();vi.clearAllMocks();for(const name of [INSTALLED_ATTRIBUTE,CONNECTION_ATTRIBUTE,USER_ATTRIBUTE])html().removeAttribute(name);});

describe('ContactTemplateDialog · context in one line (owner review of spec 96)',()=>{
 it('collapses a resolved context to one «Para:» line and expands its controls with «Cambiar»',async()=>{
  // Arrange
  show({initialContactId:'21',pickers:<p>pickers here</p>});
  await summary();
  // Assert: collapsed
  expect(inCollapsed(screen.getByText('pickers here'))).toBe(true);
  expect(screen.queryByLabelText('Destinatario')).toBeNull();
  const change=screen.getByRole('button',{name:'Cambiar'});
  expect(change.getAttribute('aria-expanded')).toBe('false');
  // Act
  fireEvent.click(change);
  // Assert: expanded, and it stays open (no toggle back)
  expect(inCollapsed(screen.getByText('pickers here'))).toBe(false);
  expect((screen.getByLabelText('Destinatario') as HTMLSelectElement).value).toBe('21');
  expect(screen.queryByRole('button',{name:'Cambiar'})).toBeNull();
 });
 it('starts expanded when the parent says a choice is still required',async()=>{
  // Arrange & Act
  show({initialContactId:'21',pickers:<p>pickers here</p>,contextRequired:true});
  await summary();
  // Assert
  expect(inCollapsed(screen.getByText('pickers here'))).toBe(false);
  expect(screen.queryByRole('button',{name:'Cambiar'})).toBeNull();
 });
 it('starts expanded when several people can receive it and none is chosen',async()=>{
  // Arrange & Act
  show({pickers:<p>pickers here</p>});
  const select=await screen.findByLabelText('Destinatario');
  // Assert
  expect(inCollapsed(select)).toBe(false);
  expect(inCollapsed(screen.getByText('pickers here'))).toBe(false);
  expect(screen.getByText('Elegí a quién enviar este mensaje.')).toBeTruthy();
 });
 it('keeps «No contactar», the block reason and the parent notices in view while collapsed',async()=>{
  // Arrange
  vi.mocked(getCommercialDetail).mockResolvedValue({account:{...account,doNotContact:true},contacts,opportunities:[],users:[],senderProfiles:[]} as never);
  // Act
  show({initialContactId:'21',pickers:<p>pickers here</p>,contextNotices:<p role="status">notice here</p>,blockReason:'Completá la aclaración del propósito.'});
  const alert=await screen.findByText('No contactar');
  // Assert
  expect(screen.getByRole('button',{name:'Cambiar'}).getAttribute('aria-expanded')).toBe('false');
  expect(inCollapsed(screen.getByText('pickers here'))).toBe(true);
  expect(inCollapsed(alert)).toBe(false);
  expect(screen.getAllByText('Completá la aclaración del propósito.').every(el=>!inCollapsed(el))).toBe(true);
  expect(inCollapsed(screen.getByText('notice here'))).toBe(false);
 });
 it('shows a recent contact as one compact line with who, when, channel, status and actor',async()=>{
  // Arrange
  vi.mocked(getCommunication).mockResolvedValue(history({recentMessages:[{contactId:'21',leadId:null,channel:'whatsapp',recipient:'+5493442000002',recipientName:'Ana',status:'whatsapp_opened',lastInteractionAt:new Date(),lastActorEmail:'seller@example.com'}]}) as never);
  // Act
  show({initialContactId:'21'});
  const line=await screen.findByText((_,el)=>el?.tagName==='P'&&(el.textContent??'').startsWith('Contacto reciente:'));
  // Assert
  expect(line.getAttribute('role')).toBe('status');
  expect(line.textContent).toMatch(/^Contacto reciente: Ana · .+ · WhatsApp · .+ · .+\. Revisalo antes de iniciar otro contacto\.$/);
 });
 it('puts the draft final button in the sticky footer, next to «Cerrar»',async()=>{
  // Arrange
  vi.mocked(postCommunication).mockResolvedValue({id:'m',accountId:'5',leadId:null,contactId:'21',channel:'whatsapp',recipient:'+5493442000002',recipientName:'Ana',subject:'',body:'Hola Ana',htmlBody:null,textBody:'Hola Ana',templateSnapshot:null,ownerEmail:'seller@example.com',activityId:null,outboxId:null,taskId:null,status:'draft',revision:0,lastInteractionAt:null,lastActorEmail:null,createdAt:new Date(),updatedAt:new Date()} as never);
  show({initialContactId:'21'});
  const template=await screen.findByRole('button',{name:/Presentación/});
  await waitFor(()=>expect((template as HTMLButtonElement).disabled).toBe(false));
  // Act
  fireEvent.click(template);
  // Assert
  const final=await screen.findByRole('button',{name:/^Abrir WhatsApp con Ana/});
  expect(screen.getAllByRole('button',{name:/^Abrir WhatsApp con/})).toHaveLength(1);
  const slot=final.closest('[class*="footerAction"]');
  expect(slot).not.toBeNull();
  expect(screen.getAllByRole('button',{name:'Cerrar'}).some(button=>slot?.parentElement?.contains(button))).toBe(true);
 });
});
