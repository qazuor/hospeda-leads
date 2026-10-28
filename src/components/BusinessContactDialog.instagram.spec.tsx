import React from 'react';
import {afterEach,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {MantineProvider} from '@mantine/core';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {MemoryRouter} from 'react-router-dom';
import type {CommercialDetail} from '../endpoints/commercial.schema';
import {CONNECTION_ATTRIBUTE,INSTALLED_ATTRIBUTE,USER_ATTRIBUTE} from '../../userscript/src/announce';
import {USERSCRIPT_VERSION} from '../../userscript/src/version';

vi.mock('../helpers/useAuth',()=>({useAuth:()=>({authState:{type:'authenticated',user:{id:3,email:'owner@example.com',role:'user',displayName:'Ana'}}})}));
vi.mock('../endpoints/pipeline.schema',()=>({getPipeline:vi.fn().mockResolvedValue({stages:[{name:'open',classification:'open'}]})}));
vi.mock('../endpoints/settings_GET.schema',()=>({getSettings:vi.fn().mockResolvedValue({templates:[]})}));
vi.mock('../endpoints/communication.schema',()=>({getCommunication:vi.fn().mockResolvedValue({recentMessages:[],messages:[],restrictions:[]})}));
type ComposerProps={channel:string;lead?:{id:string}|null;general?:{purpose:string;otherPurpose:string};pickers?:React.ReactNode;blockReason?:string};
vi.mock('./ContactTemplateDialog',()=>({ContactTemplateDialog:({channel,lead,general,pickers,blockReason}:ComposerProps)=><div>{pickers}<p data-testid="composer">{general?'general':lead?'management '+lead.id:'no scope'} composer · {channel}{general?' · '+general.purpose:''}</p>{blockReason&&<p data-testid="block">{blockReason}</p>}</div>}));
vi.mock('./ManualCommunicationForm',()=>({ManualCommunicationForm:()=><div>manual form</div>}));
vi.mock('./PhoneCallPanel',()=>({PhoneCallPanel:()=><div>call</div>,useCallSession:()=>({reset:()=>{}})}));
vi.mock('./CommercialEditor',()=>({CommercialEditor:()=><div>editor</div>}));
import {BusinessContactDialog,INSTAGRAM_MISSING_REASON} from './BusinessContactDialog';

const html=()=>document.documentElement;
beforeAll(()=>{
 window.matchMedia=vi.fn().mockImplementation(query=>({matches:false,media:query,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}}));
 window.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}} as unknown as typeof ResizeObserver;
});
// A computer with the current script connected for this user (spec 96 §3.3).
beforeEach(()=>{html().setAttribute(INSTALLED_ATTRIBUTE,USERSCRIPT_VERSION);html().setAttribute(CONNECTION_ATTRIBUTE,'connected');html().setAttribute(USER_ATTRIBUTE,'owner@example.com');});
afterEach(()=>{cleanup();for(const name of [INSTALLED_ATTRIBUTE,CONNECTION_ATTRIBUTE,USER_ATTRIBUTE])html().removeAttribute(name);});

const opp=(id:string,name:string)=>({id,accountId:'7',opportunityName:name,estado:'open',assignedUserEmail:'owner@example.com',deletedAt:null});
const detail=(perfilInstagram:string|null,over:{opportunities?:unknown[];email?:string|null}={})=>({account:{id:'7',nombre:'Hotel Sol',status:'contacted',tipo:'Hotel',ciudad:'Colón',assignedUserEmail:'owner@example.com',whatsapp:null,email:over.email??null,telefono:'+54 9 3447 111111',perfilInstagram,doNotContact:false,archivedAt:null,isClient:false},contacts:[],opportunities:over.opportunities??[],users:[],journal:[],leadJournal:[]}) as unknown as CommercialDetail;
const show=(d:CommercialDetail,props:Partial<React.ComponentProps<typeof BusinessContactDialog>>={})=>render(<MantineProvider><MemoryRouter><QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><BusinessContactDialog detail={d} onClose={()=>{}} {...props}/></QueryClientProvider></MemoryRouter></MantineProvider>);
const loaded=()=>waitFor(()=>expect(screen.queryAllByText('Cargando gestiones y mensajes modelo…')).toHaveLength(0));
const channelButton=(name:string)=>[...screen.getByRole('group',{name:'Canal'}).querySelectorAll('button')].find(b=>b.textContent===name) as HTMLButtonElement;

describe('BusinessContactDialog · contact step (spec 96 §2.3)',()=>{
 it('opens the composer step at once: the compact channel choice, «Sobre» and the purpose, with no «Continuar» screen',async()=>{
  show(detail('https://instagram.com/hotel.sol'));
  await waitFor(()=>expect(screen.getByTestId('composer').textContent).toBe('general composer · whatsapp · first_contact'));
  expect([...screen.getByRole('group',{name:'Canal'}).querySelectorAll('button')].map(b=>b.textContent)).toEqual(['WhatsApp','Instagram','Email']);
  expect(screen.getByText('Sin gestión (contacto general)')).toBeTruthy();
  expect(screen.getByText(/Propósito:/).textContent).toContain('Presentación / primer contacto');
  expect(screen.queryByRole('button',{name:'Continuar con el mensaje'})).toBeNull();
  expect(screen.queryByLabelText('Canal',{selector:'select'})).toBeNull();
  fireEvent.click(channelButton('Instagram'));
  expect(screen.getByTestId('composer').textContent).toBe('general composer · instagram · first_contact');
 });
 it('auto-picks the only open management and asks only when there are two or more',async()=>{
  show(detail(null,{opportunities:[opp('11','Alta')]}));
  await waitFor(()=>expect(screen.getByTestId('composer').textContent).toBe('management 11 composer · whatsapp'));
  expect(screen.getByText(/Sobre:/).textContent).toContain('Alta');
  cleanup();
  show(detail(null,{opportunities:[opp('11','Alta'),opp('12','Renovación')]}));await loaded();
  await waitFor(()=>expect(screen.getByTestId('composer').textContent).toBe('no scope composer · whatsapp'));
  expect(screen.getByTestId('block').textContent).toBe('Elegí sobre qué es el contacto.');
  expect(screen.getAllByLabelText('¿Sobre qué?').length).toBeGreaterThan(0);
 });
 it('blocks templates with the purpose reason until «Otro» has its aclaración',async()=>{
  show(detail(null));
  await loaded();
  fireEvent.click(screen.getByRole('button',{name:'Cambiar'}));
  fireEvent.change(screen.getByLabelText('Propósito del contacto'),{target:{value:'other'}});
  expect(screen.getByTestId('block').textContent).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Aclaración del propósito'),{target:{value:'Pedido de fotos'}});
  expect(screen.queryByTestId('block')).toBeNull();
  expect(screen.getByTestId('composer').textContent).toBe('general composer · whatsapp · other');
 });
 it('offers only WhatsApp and Email for «Enviar material» and no «Otro» row',async()=>{
  show(detail('hotel.sol'),{initialMaterial:{id:'m1',title:'Tarifas'} as never});
  await loaded();
  expect([...screen.getByRole('group',{name:'Canal'}).querySelectorAll('button')].map(b=>b.textContent)).toEqual(['WhatsApp','Email']);
  expect(screen.queryByRole('button',{name:'Llamada'})).toBeNull();
 });
 it('keeps the call in its own dialog with «¿Sobre qué?»',async()=>{
  show(detail(null));
  await loaded();
  fireEvent.click(screen.getByRole('button',{name:'Llamada'}));
  expect(await screen.findByText('call')).toBeTruthy();
  expect(screen.getByRole('heading',{name:'Registrar una llamada'})).toBeTruthy();
 });
 it('gates WhatsApp and Instagram on a computer without the script, never Email',async()=>{
  for(const name of [INSTALLED_ATTRIBUTE,CONNECTION_ATTRIBUTE,USER_ATTRIBUTE])html().removeAttribute(name);html().setAttribute(INSTALLED_ATTRIBUTE,'1.4.0');
  show(detail('hotel.sol',{email:'sol@example.com'}));
  await loaded();
  expect(channelButton('WhatsApp').disabled).toBe(true);expect(channelButton('Instagram').disabled).toBe(true);expect(channelButton('Email').disabled).toBe(false);
  expect(screen.getByRole('link',{name:'Ir a User script'})).toBeTruthy();
 });
});

describe('BusinessContactDialog · Instagram (spec 92)',()=>{
 it('disables Instagram without a valid username and explains why',async()=>{
  show(detail('no es un perfil'),{initialChannel:'instagram'});
  await waitFor(()=>expect(screen.getByTestId('block').textContent).toBe(INSTAGRAM_MISSING_REASON));
  expect(screen.getByRole('button',{name:'Agregar o editar datos de contacto'})).toBeTruthy();
  cleanup();show(detail('no es un perfil'));
  await loaded();
  expect(channelButton('Instagram').disabled).toBe(true);
 });
});
