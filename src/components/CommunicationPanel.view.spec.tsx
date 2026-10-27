import React from 'react';
import {afterEach,beforeAll,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {MantineProvider} from '@mantine/core';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
const mocks=vi.hoisted(()=>({getCommunication:vi.fn(),postCommunication:vi.fn(),getCommercialDetail:vi.fn(),getPipeline:vi.fn(),getWork:vi.fn(),role:'user'}));
vi.mock('sonner',()=>({toast:{success:vi.fn(),warning:vi.fn(),error:vi.fn()}}));
vi.mock('../endpoints/communication.schema',async original=>({...await original<typeof import('../endpoints/communication.schema')>(),getCommunication:mocks.getCommunication,postCommunication:mocks.postCommunication}));
vi.mock('../endpoints/commercial.schema',async original=>({...await original<typeof import('../endpoints/commercial.schema')>(),getCommercialDetail:mocks.getCommercialDetail}));
vi.mock('../endpoints/pipeline.schema',async original=>({...await original<typeof import('../endpoints/pipeline.schema')>(),getPipeline:mocks.getPipeline}));
vi.mock('../endpoints/work.schema',async original=>({...await original<typeof import('../endpoints/work.schema')>(),getWork:mocks.getWork}));
vi.mock('../helpers/useAuth',()=>({useAuth:()=>({authState:{type:'authenticated',user:{id:1,email:'seller@example.com',displayName:'Seller',role:mocks.role}}})}));
import {CommunicationPanel} from './CommunicationPanel';

const day=(d:number,h=12)=>new Date(`2026-10-${String(d).padStart(2,'0')}T${String(h).padStart(2,'0')}:00:00-03:00`);
const message=(id:string,over:Record<string,unknown>={})=>({id,accountId:'5',leadId:null,contactId:null,channel:'whatsapp',recipient:'+5493442123456',recipientName:'Julia',subject:'',body:'Hola Julia',htmlBody:null,textBody:'Hola Julia',templateSnapshot:null,ownerEmail:'seller@example.com',activityId:null,outboxId:null,taskId:null,status:'manual_sent',revision:1,lastInteractionAt:day(2),lastActorEmail:null,createdAt:day(2),updatedAt:day(2),...over});
const inbound=(id:string,over:Record<string,unknown>={})=>({id,channel:'whatsapp',receivedAt:day(3),fromAddress:'+5493442123456',fromName:'Julia',subject:'',textBody:'Gracias, lo vemos',status:'pending_review',isAutomatic:false,matchMethod:'phone',leadId:null,contextName:'General',linkedMessageId:null,responseId:null,attachments:[],canReply:false,replyAvailable:false,replyRestricted:false,...over});
const response=(id:string,over:Record<string,unknown>={})=>({id,leadId:null,channel:'call',category:'interested',summary:'Le interesa el plan',exactText:null,actorEmail:'seller@example.com',occurredAt:day(4),contextName:'General',...over});
const account={id:'5',nombre:'Hotel Sol',assignedUserEmail:'seller@example.com',email:'hotel@example.com',telefono:'3447',tipo:'Alojamiento',ciudad:'Colón',subtipo:null,archivedAt:null,recontactAt:null,status:'active',doNotContact:false,isClient:false};
type Data={messages?:unknown[];inbound?:unknown[];responses?:unknown[];activeRestrictions?:unknown[];pendingOutcomes?:unknown[]};
function setup({data={},role='user',accountOver={},opportunities=[] as unknown[]}:{data?:Data;role?:string;accountOver?:Record<string,unknown>;opportunities?:unknown[]}={}){
 mocks.role=role;
 mocks.getCommunication.mockResolvedValue({messages:[],recentMessages:[],restrictions:data.activeRestrictions??[],activeRestrictions:[],responses:[],inbound:[],openManagements:[],pendingOutcomes:[],recentContactHours:72,webhookConfigured:false,...data});
 mocks.getCommercialDetail.mockResolvedValue({account:{...account,...accountOver},contacts:[],opportunities,users:[{email:'seller@example.com',displayName:'Seller'},{email:'other@example.com',displayName:'Otra'}]});
 mocks.getPipeline.mockResolvedValue({stages:[]});
 mocks.getWork.mockResolvedValue({tasks:[]});
}
function show(props:React.ComponentProps<typeof CommunicationPanel>={accountId:'5'}){render(<MantineProvider><QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><CommunicationPanel {...props}/></QueryClientProvider></MantineProvider>);}
const ready=()=>screen.findByRole('region',{name:'Conversación'});
beforeAll(()=>{window.matchMedia=window.matchMedia||((query:string)=>({matches:false,media:query,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){},dispatchEvent:()=>false,onchange:null}) as MediaQueryList);globalThis.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};});
afterEach(()=>{cleanup();for(const fn of [mocks.getCommunication,mocks.postCommunication,mocks.getCommercialDetail,mocks.getPipeline,mocks.getWork])fn.mockReset();mocks.role='user';});

describe('Comunicación tab structure (spec 90)',()=>{
 it('renders title, Bandeja link and the sections in order, without the old duplicated blocks',async()=>{
  setup({data:{messages:[message('sent'),message('draft',{status:'draft'})],inbound:[inbound('in')]}});show();await ready();
  expect(screen.getByRole('heading',{name:'Comunicación'})).toBeTruthy();
  expect(screen.getByText('Todo lo enviado y recibido con este negocio, en orden, con o sin gestión.')).toBeTruthy();
  expect(screen.getByRole('link',{name:'Abrir en la Bandeja'}).getAttribute('href')).toBe('/inbox?account=5');
  const order=['Acciones de comunicación','Requiere acción','Conversación','Borradores'].map(name=>screen.getAllByRole(name==='Acciones de comunicación'?'group':'region',{name})[0]);
  for(let i=1;i<order.length;i++)expect(order[i-1].compareDocumentPosition(order[i])&Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  for(const old of ['Mensajes recibidos','Mensajes y borradores','Respuestas registradas','Registrar respuesta recibida','Restricciones de contacto'])expect(screen.queryByText(old,{exact:false})).toBeNull();
 });
 it('shows only a one-line notice for active restrictions, never the editor',async()=>{
  setup({role:'admin',data:{activeRestrictions:[{id:1,channel:'email',contactId:null,reason:'El email rebota',liftedAt:null}]}});show();await ready();
  expect(screen.getByRole('note').textContent).toBe('Restricción activa: Email · El email rebota · Se edita en «Preferencias y restricciones».');
  expect(screen.queryByRole('button',{name:'Registrar restricción técnica'})).toBeNull();
 });
 it('keeps the restrictions editor on a management view, with the management Bandeja link',async()=>{
  setup({role:'admin',opportunities:[{id:'9',opportunityName:'Plan anual',assignedUserEmail:'seller@example.com',estado:'main:contact',deletedAt:null}]});show({leadId:'9'});await ready();
  expect(await screen.findByText('Restricciones de contacto')).toBeTruthy();
  await waitFor(()=>expect(screen.getByRole('link',{name:'Abrir en la Bandeja'}).getAttribute('href')).toBe('/inbox?account=5&lead=9'));
 });
});

describe('action bar gating',()=>{
 it('offers the three actions to a writable owner and opens «Contactar» through the page',async()=>{
  const onContact=vi.fn();setup();show({accountId:'5',onContact});await ready();
  const bar=screen.getByRole('group',{name:'Acciones de comunicación'});
  await waitFor(()=>expect((within(bar).getByRole('button',{name:'Contactar'}) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(within(bar).getByRole('button',{name:'Contactar'}));expect(onContact).toHaveBeenCalledTimes(1);
  fireEvent.click(within(bar).getByRole('button',{name:'Registrar llamada u otro contacto'}));
  const dialog=await screen.findByRole('dialog',{name:'Registrar llamada u otro contacto'});
  fireEvent.click(within(dialog).getByRole('button',{name:'Registrar una llamada'}));
  expect(onContact).toHaveBeenLastCalledWith('call');
  fireEvent.click(within(bar).getByRole('button',{name:'Registrar respuesta sin mensaje'}));
  expect(await screen.findByRole('dialog')).toBeTruthy();
 });
 it('keeps «Contactar» disabled with its reason on a No contactar business',async()=>{
  setup({role:'admin',accountOver:{doNotContact:true}});show({accountId:'5',onContact:vi.fn()});await ready();
  await waitFor(()=>expect((screen.getByRole('button',{name:'Contactar'}) as HTMLButtonElement).disabled).toBe(true));
 });
 it('leaves a read-only view with the response action only, and an archived business without it for sellers',async()=>{
  setup();show({accountId:'5',readOnly:true,onContact:vi.fn()});await ready();
  const bar=screen.getByRole('group',{name:'Acciones de comunicación'});
  expect(within(bar).getAllByRole('button').map(b=>b.textContent)).toEqual(['Registrar respuesta sin mensaje']);
  cleanup();setup({accountOver:{archivedAt:new Date()}});show({accountId:'5',readOnly:true});await ready();
  await waitFor(()=>expect(screen.queryByRole('button',{name:'Registrar respuesta sin mensaje'})).toBeNull());
 });
});

describe('«Requiere acción»',()=>{
 it('shows the empty state with a zero count',async()=>{
  setup();show();await ready();
  expect(screen.getByRole('heading',{name:'Requiere acción · 0'})).toBeTruthy();
  expect(screen.getByText('Nada pendiente: no hay mensajes por revisar ni envíos sin confirmar.')).toBeTruthy();
 });
 it('confirms an opened WhatsApp send once, blocking a second submit',async()=>{
  setup({data:{messages:[message('opened',{status:'whatsapp_opened'})],inbound:[inbound('pending')]}});show();await ready();
  const region=screen.getByRole('region',{name:'Requiere acción'});
  expect(within(region).getByRole('heading',{name:'Requiere acción · 2'})).toBeTruthy();
  expect(within(region).getByRole('article',{name:'WhatsApp de Julia por revisar'})).toBeTruthy();
  let resolve:(v:unknown)=>void=()=>{};mocks.postCommunication.mockImplementation(()=>new Promise(r=>{resolve=r}));
  fireEvent.click(within(region).getByRole('button',{name:'Sí, se envió'}));
  const busy=await within(region).findByRole('button',{name:'Guardando…'});expect((busy as HTMLButtonElement).disabled).toBe(true);fireEvent.click(busy);
  expect(mocks.postCommunication).toHaveBeenCalledTimes(1);expect(mocks.postCommunication.mock.calls[0][0]).toMatchObject({action:'outcome',id:'opened',event:'manual_sent'});resolve({});
 });
});

describe('«Conversación»',()=>{
 it('merges both directions in order with channel chips that filter on the client',async()=>{
  setup({data:{messages:[message('wa',{lastInteractionAt:day(1)}),message('mail',{channel:'email',subject:'Propuesta',textBody:'Te paso la propuesta',status:'accepted',lastInteractionAt:day(5)})],inbound:[inbound('ig',{channel:'social',fromAddress:'@hotel',fromName:'',status:'registered'})]}});show();
  const conversation=await ready();
  expect(within(conversation).getAllByRole('article').map(a=>a.getAttribute('aria-label'))).toEqual(['WhatsApp de Seller · Envío confirmado manualmente','Instagram recibido de @hotel','Email de Seller · Email aceptado por proveedor · entrega no confirmada']);
  const chips=within(conversation).getByRole('group',{name:'Filtrar la conversación por canal'});
  expect(within(chips).getAllByRole('button').map(b=>b.textContent)).toEqual(['Todo · 3','WhatsApp · 1','Email · 1','Instagram · 1']);
  fireEvent.click(within(chips).getByRole('button',{name:'Email · 1'}));
  expect(within(chips).getByRole('button',{name:'Email · 1'}).getAttribute('aria-pressed')).toBe('true');
  expect(within(conversation).getAllByRole('article').map(a=>a.getAttribute('aria-label'))).toEqual(['Email de Seller · Email aceptado por proveedor · entrega no confirmada']);
  expect(within(conversation).getByText('Email aceptado por proveedor · entrega no confirmada')).toBeTruthy();
 });
 it('explains the empty conversation without chips',async()=>{
  setup();show();const conversation=await ready();
  await waitFor(()=>expect(within(conversation).getByText(/Todavía no hay mensajes ni respuestas\. Lo que envíes con «Contactar»/)).toBeTruthy());
  expect(within(conversation).queryByRole('group')).toBeNull();
 });
 it('shows the latest 30 items and the rest with «Ver anteriores»',async()=>{
  setup({data:{messages:Array.from({length:35},(_,i)=>message('m'+i,{lastInteractionAt:new Date(day(1).getTime()+i*60000)}))}});show();const conversation=await ready();
  expect(within(conversation).getAllByRole('article')).toHaveLength(30);
  fireEvent.click(within(conversation).getByRole('button',{name:'Ver anteriores (5)'}));
  expect(within(conversation).getAllByRole('article')).toHaveLength(35);
 });
 it('attaches a response to its message and shows a response without message as an event with «Corregir respuesta»',async()=>{
  setup({data:{inbound:[inbound('in',{status:'registered',responseId:'r1'})],responses:[response('r1',{channel:'whatsapp',occurredAt:day(3),resolvedTaskTitles:['Llamar a Julia']}),response('r2')]}});show();const conversation=await ready();
  expect(within(conversation).getByText('Respuesta registrada · Respondió, le interesa · completó la tarea «Llamar a Julia»')).toBeTruthy();
  const event=within(conversation).getByRole('article',{name:'Respuesta registrada sin mensaje · Respondió, le interesa'});
  expect(within(conversation).getAllByRole('article')).toHaveLength(2);
  fireEvent.click(within(event).getByRole('button',{name:'Corregir respuesta'}));
  expect(await within(event).findByLabelText('¿Qué respondió?')).toBeTruthy();
 });
 it('shows calls as event rows with their result',async()=>{
  setup({data:{messages:[message('call',{channel:'call',status:'manual_no_contact',summary:'Sonó y no atendió'})]}});show();const conversation=await ready();
  expect(within(conversation).getByRole('article',{name:'Llamada registrada · No atendió'})).toBeTruthy();
  expect(within(conversation).getByText('Sonó y no atendió')).toBeTruthy();
  expect(within(conversation).queryByText('Envío confirmado manualmente')).toBeNull();
 });
});

describe('«Borradores»',()=>{
 it('lists drafts apart and reopens the author’s draft with «Seguir editando»',async()=>{
  setup({data:{messages:[message('mine',{status:'draft'}),message('theirs',{status:'draft',channel:'email',ownerEmail:'other@example.com',subject:'Tarifas'})]}});show();await ready();
  const drafts=screen.getByRole('region',{name:'Borradores'});
  expect(within(drafts).getByRole('heading',{name:'Borradores · 2'})).toBeTruthy();
  const theirs=within(drafts).getByRole('article',{name:'Borrador de Email a Julia'});
  expect(within(theirs).queryByRole('button',{name:'Seguir editando'})).toBeNull();
  expect(within(theirs).getByText('Solo quien lo preparó o un administrador puede editarlo.')).toBeTruthy();
  const mine=within(drafts).getByRole('article',{name:'Borrador de WhatsApp a Julia'});
  await waitFor(()=>expect(within(mine).getByRole('button',{name:'Seguir editando'})).toBeTruthy());
  fireEvent.click(within(mine).getByRole('button',{name:'Seguir editando'}));
  expect(await within(mine).findByRole('heading',{name:'Personalizá el mensaje'})).toBeTruthy();
  expect(within(screen.getByRole('region',{name:'Conversación'})).queryAllByRole('article')).toHaveLength(0);
 });
});
