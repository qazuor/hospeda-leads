import React from 'react';
import {afterEach,beforeAll,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {MantineProvider} from '@mantine/core';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
const mocks=vi.hoisted(()=>({getCommunication:vi.fn(),postCommunication:vi.fn(),getCommercialDetail:vi.fn(),getPipeline:vi.fn(),getWork:vi.fn(),role:'user'}));
vi.mock('sonner',()=>({toast:{success:vi.fn(),warning:vi.fn(),error:vi.fn(),info:vi.fn()}}));
vi.mock('./OutcomeAfterContact',()=>({OutcomeAfterContact:()=><p>Cómo salió (mock)</p>}));
vi.mock('../endpoints/communication.schema',async original=>({...await original<typeof import('../endpoints/communication.schema')>(),getCommunication:mocks.getCommunication,postCommunication:mocks.postCommunication}));
vi.mock('../endpoints/commercial.schema',async original=>({...await original<typeof import('../endpoints/commercial.schema')>(),getCommercialDetail:mocks.getCommercialDetail}));
vi.mock('../endpoints/pipeline.schema',async original=>({...await original<typeof import('../endpoints/pipeline.schema')>(),getPipeline:mocks.getPipeline}));
vi.mock('../endpoints/work.schema',async original=>({...await original<typeof import('../endpoints/work.schema')>(),getWork:mocks.getWork}));
vi.mock('../helpers/useAuth',()=>({useAuth:()=>({authState:{type:'authenticated',user:{id:1,email:'seller@example.com',displayName:'Seller',role:mocks.role}}})}));
import {CommunicationPanel} from './CommunicationPanel';
import {BusinessSidebar} from './BusinessSidebar';
import {COMMUNICATION_LIST_LIMIT} from '../endpoints/communication.schema';

const day=(d:number,h=12)=>new Date(`2026-10-${String(d).padStart(2,'0')}T${String(h).padStart(2,'0')}:00:00-03:00`);
const message=(id:string,over:Record<string,unknown>={})=>({id,accountId:'5',leadId:null,contactId:null,channel:'whatsapp',recipient:'+5493442123456',recipientName:'Julia',subject:'',body:'Hola Julia',htmlBody:null,textBody:'Hola Julia',templateSnapshot:null,ownerEmail:'seller@example.com',activityId:null,outboxId:null,taskId:null,status:'manual_sent',revision:1,lastInteractionAt:day(2),lastActorEmail:null,createdAt:day(2),updatedAt:day(2),...over});
const response=(id:string,over:Record<string,unknown>={})=>({id,leadId:null,channel:'call',category:'interested',summary:'Le interesa el plan',exactText:null,actorEmail:'seller@example.com',occurredAt:day(4),contextName:'General',...over});
const account={id:'5',nombre:'Hotel Sol',assignedUserEmail:'seller@example.com',email:'hotel@example.com',telefono:'+5493447000111',tipo:'Alojamiento',ciudad:'Colón',subtipo:null,archivedAt:null,recontactAt:null,status:'active',doNotContact:false,isClient:false};
const opportunity={id:'9',opportunityName:'Plan anual',assignedUserEmail:'seller@example.com',estado:'main:contact',deletedAt:null};
function setup({data={},role='user'}:{data?:Record<string,unknown>;role?:string}={}){
 mocks.role=role;
 mocks.getCommunication.mockResolvedValue({messages:[],recentMessages:[],restrictions:[],activeRestrictions:[],responses:[],inbound:[],openManagements:[],recentContactHours:72,webhookConfigured:false,...data});
 mocks.getCommercialDetail.mockResolvedValue({account,contacts:[],opportunities:[opportunity],users:[{email:'seller@example.com',displayName:'Seller'}]});
 mocks.getPipeline.mockResolvedValue({stages:[{name:'main:contact',classification:'open'}]});
 mocks.getWork.mockResolvedValue({tasks:[]});
}
const client=()=>new QueryClient({defaultOptions:{queries:{retry:false}}});
const wrap=(node:React.ReactNode)=>render(<MantineProvider env="test"><QueryClientProvider client={client()}>{node}</QueryClientProvider></MantineProvider>);
beforeAll(()=>{window.matchMedia=window.matchMedia||((query:string)=>({matches:false,media:query,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){},dispatchEvent:()=>false,onchange:null}) as MediaQueryList);globalThis.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};});
afterEach(()=>{cleanup();for(const fn of [mocks.getCommunication,mocks.postCommunication,mocks.getCommercialDetail,mocks.getPipeline,mocks.getWork])fn.mockReset();mocks.role='user';});

describe('sent rows never look sent when they are not (M2)',()=>{
 it('gives unconfirmed, not done and failed rows a neutral name and a muted tone',async()=>{
  setup({data:{messages:[message('opened',{status:'whatsapp_opened',lastInteractionAt:day(1)}),message('pending',{channel:'email',subject:'Tarifas',status:'unknown',lastInteractionAt:day(1,13)}),message('failed',{channel:'email',status:'failed',subject:'Tarifas',lastInteractionAt:day(2)}),message('ok',{lastInteractionAt:day(3)})]}});
  wrap(<CommunicationPanel accountId="5"/>);const conversation=await screen.findByRole('region',{name:'Conversación'});
  const names=within(conversation).getAllByRole('article').map(a=>a.getAttribute('aria-label'));
  // The opened WhatsApp lives only in «Requiere acción» (spec 92 owner decision).
  expect(names).toEqual(['Email de Seller · Resultado incierto · revisar Brevo','Email de Seller · Rebote/fallo','WhatsApp de Seller · Envío confirmado manualmente']);
  expect(within(conversation).getAllByRole('article').map(a=>a.closest('[data-tone]')?.getAttribute('data-tone'))).toEqual(['unconfirmed','failed','sent']);
 });
});

describe('a call survives closing the dialog (M3)',()=>{
 it('keeps the dialog open while saving and retries an uncertain save with the same key after reopening',async()=>{
  setup({role:'admin'});
  let reject:(e:Error)=>void=()=>{};mocks.postCommunication.mockImplementationOnce(()=>new Promise((_,r)=>{reject=r}));
  wrap(<CommunicationPanel leadId="9" accountId="5"/>);await screen.findByRole('region',{name:'Conversación'});
  const openDialog=async()=>{fireEvent.click(await screen.findByRole('button',{name:'Registrar'}));fireEvent.click(await screen.findByRole('menuitem',{name:'Llamada u otro contacto'}));const dialog=await screen.findByRole('dialog',{name:'Registrar llamada u otro contacto'});fireEvent.click(within(dialog).getByRole('button',{name:'Registrar una llamada'}));return dialog;};
  let dialog=await openDialog();
  const call=()=>within(dialog).findByRole('button',{name:/Ya llamé: anotar cómo salió|Guardando…/});
  await waitFor(async()=>expect(((await call()) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(await call());
  await waitFor(()=>expect(mocks.postCommunication).toHaveBeenCalledTimes(1));
  // While the call is being saved the dialog offers no way out.
  await waitFor(()=>expect(within(dialog).queryByRole('button',{name:'Cerrar'})).toBeNull());
  reject(new Error('timeout'));
  await waitFor(()=>expect(within(dialog).queryAllByRole('button',{name:'Cerrar'}).length).toBeGreaterThan(0));
  fireEvent.click(within(dialog).getAllByRole('button',{name:'Cerrar'})[0]);
  await waitFor(()=>expect(screen.queryByRole('dialog',{name:'Registrar llamada u otro contacto'})).toBeNull());
  mocks.postCommunication.mockResolvedValueOnce({...message('c1',{channel:'call',leadId:'9'})});
  dialog=await openDialog();
  await waitFor(async()=>expect(((await call()) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(await call());
  await waitFor(()=>expect(mocks.postCommunication).toHaveBeenCalledTimes(2));
  const [first,second]=mocks.postCommunication.mock.calls.map(c=>c[0] as {action:string;id:string});
  expect(first.action).toBe('manual_start');expect(second.id).toBe(first.id);
 });
});

describe('response wording and list limits (L1)',()=>{
 it('drops «sin mensaje» when the response has a linked message outside the window and warns when a list is full',async()=>{
  setup({data:{responses:[response('linked',{hasInbound:true}),response('free',{hasInbound:false,occurredAt:day(5)})]}});
  wrap(<CommunicationPanel accountId="5"/>);const conversation=await screen.findByRole('region',{name:'Conversación'});
  expect(within(conversation).getAllByRole('article').map(a=>a.getAttribute('aria-label'))).toEqual(['Respuesta registrada · Respondió, le interesa','Respuesta registrada sin mensaje · Respondió, le interesa']);
  expect(within(conversation).queryByText(/Mostrando lo más reciente/)).toBeNull();
  cleanup();
  setup({data:{messages:Array.from({length:COMMUNICATION_LIST_LIMIT},(_,i)=>message('m'+i,{lastInteractionAt:new Date(day(1).getTime()+i*60000)}))}});
  wrap(<CommunicationPanel accountId="5"/>);
  expect(await screen.findByText(/^Mostrando lo más reciente/)).toBeTruthy();
 });
});

describe('«Requiere acción» from the server follow-ups (spec 99 §3.6)',()=>{
 const pending=(id:string,status:string,over:Record<string,unknown>={})=>({id,accountId:'5',accountName:'Hotel Sol',leadId:null,opportunityName:null,contactId:null,channel:'whatsapp',recipientName:'Julia',status,purpose:null,lastInteractionAt:day(3),...over});
 it('shows 4 «¿Lo enviaste?» entries and «Anotá cómo salió · 3» from followUps, loaded message or not',async()=>{
  const unconfirmed=[pending('opened','whatsapp_opened',{lastInteractionAt:day(6)}),pending('notLoaded','whatsapp_opened',{recipientName:'Pedro',lastInteractionAt:day(5)}),pending('ig','instagram_opened',{channel:'social',destinationDetail:'instagram',recipientName:'Hotel Sol',lastInteractionAt:day(4)}),pending('attempt','manual_pending',{channel:'call',recipientName:'Ana',lastInteractionAt:day(3)})];
  const outcomes=[pending('call1','manual_sent',{channel:'call'}),pending('call2','manual_no_contact',{channel:'call'}),pending('wa1','manual_sent')];
  setup({data:{messages:[message('opened',{status:'whatsapp_opened',lastInteractionAt:day(6)})],followUps:{unconfirmed:{items:unconfirmed,count:4},outcomes:{items:outcomes,count:3}}}});
  wrap(<CommunicationPanel accountId="5"/>);const region=await screen.findByRole('region',{name:'Requiere acción'});
  expect(within(region).getByRole('heading',{name:'Requiere acción · 7'})).toBeTruthy();
  expect(within(region).getByText('4 envíos sin confirmar · 3 contactos sin resultado')).toBeTruthy();
  expect(within(region).getAllByText('¿Lo enviaste?')).toHaveLength(4);
  // The loaded message keeps its full entry (text and «Sí, se envió» / «No se envió»); the others are minimal with recipient and time.
  const full=within(region).getByRole('group',{name:'WhatsApp sin confirmar para Julia'});expect(within(full).getByText('Hola Julia')).toBeTruthy();expect(within(full).getByRole('button',{name:'Sí, se envió'})).toBeTruthy();
  for(const name of ['WhatsApp sin confirmar para Pedro','Instagram sin confirmar para Hotel Sol','Llamada sin confirmar para Ana'])expect(within(within(region).getByRole('group',{name})).getByRole('button',{name:'Anotá cómo salió'})).toBeTruthy();
  const card=within(region).getByRole('region',{name:'Anotá cómo salió'});
  expect(within(card).getByLabelText('Contactos sin resultado').textContent).toBe('3');expect(within(card).getAllByRole('article')).toHaveLength(3);
 });
 it('counts only the server entries and still lists loaded opens the server leaves out, with «Sí, se envió» off and its reason',async()=>{
  // The closed management and the open before the outcome window are not in followUps; they stay answerable here («No se envió»), not counted.
  setup({data:{messages:[message('listed',{status:'whatsapp_opened',lastInteractionAt:day(6)}),message('closed',{status:'whatsapp_opened',leadId:'9',recipientName:'Pedro',lastInteractionAt:day(5)}),message('old',{status:'whatsapp_opened',recipientName:'Ana',lastInteractionAt:day(4)}),message('foreign',{status:'whatsapp_opened',ownerEmail:'other@example.com',recipientName:'Otra',lastInteractionAt:day(3)})],followUps:{unconfirmed:{items:[pending('listed','whatsapp_opened',{lastInteractionAt:day(6)})],count:1},outcomes:{items:[],count:0}}}});
  wrap(<CommunicationPanel accountId="5"/>);const region=await screen.findByRole('region',{name:'Requiere acción'});
  expect(within(region).getByRole('heading',{name:'Requiere acción · 1'})).toBeTruthy();
  expect(within(region).getByText('1 envío sin confirmar')).toBeTruthy();
  expect(within(region).getAllByText('¿Lo enviaste?')).toHaveLength(3);
  const closed=within(region).getByRole('group',{name:'WhatsApp sin confirmar para Pedro'});
  await waitFor(()=>expect((within(closed).getByRole('button',{name:'Sí, se envió'}) as HTMLButtonElement).disabled).toBe(true));
  expect((within(closed).getByRole('button',{name:'No se envió'}) as HTMLButtonElement).disabled).toBe(false);
  const old=within(region).getByRole('group',{name:'WhatsApp sin confirmar para Ana'});
  expect((within(old).getByRole('button',{name:'Sí, se envió'}) as HTMLButtonElement).disabled).toBe(false);
  // Someone else's open is not answerable by a seller: only its material (none here) would show.
  expect(within(region).queryByRole('group',{name:'WhatsApp sin confirmar para Otra'})).toBeNull();
 });
 it('says how many of the server unconfirmed sends are listed when the count passes the limit',async()=>{
  setup({data:{followUps:{unconfirmed:{items:[pending('a','whatsapp_opened'),pending('b','whatsapp_opened',{recipientName:'Pedro'})],count:25},outcomes:{items:[],count:0}}}});
  wrap(<CommunicationPanel accountId="5"/>);const region=await screen.findByRole('region',{name:'Requiere acción'});
  expect(within(region).getByText('25 envíos sin confirmar')).toBeTruthy();
  expect(within(region).getByText('Se muestran los 2 más recientes de 25.')).toBeTruthy();
 });
});

describe('restrictions editor in the business sidebar',()=>{
 const sidebar=()=>wrap(<BusinessSidebar detail={{account,contacts:[],opportunities:[],users:[]} as never} mainContact={undefined} contactCount={0} contactSection={<p>Personas</p>} facts={[]} emptyFactLabels={[]} readOnly={false} contactEditable={false} canDoWork={false} work={{ready:true,blockedReason:'',error:null,retry:()=>{},retrying:false}} onWork={()=>{}} onEditAccount={()=>{}}/>);
 const posted=()=>mocks.postCommunication.mock.calls.map(c=>c[0]);
 it('queries nothing until opened, then lets an admin register and lift a technical restriction',async()=>{
  setup({role:'admin',data:{restrictions:[{id:'r1',channel:'email',contactId:null,reason:'El email rebota',actorEmail:'seller@example.com',createdAt:day(1),liftedAt:null,liftReason:null,liftedBy:null}]}});
  mocks.postCommunication.mockResolvedValue({ok:true});
  sidebar();
  expect(mocks.getCommunication).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'Preferencias y restricciones de contacto'}));
  const region=await screen.findByRole('region',{name:'Restricciones técnicas por canal'});
  expect(mocks.getCommunication).toHaveBeenCalled();
  fireEvent.change(within(region).getByLabelText('Motivo de restricción'),{target:{value:'Pidió que no le escribamos'}});
  await waitFor(()=>expect((within(region).getByRole('button',{name:'Registrar restricción técnica'}) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(within(region).getByRole('button',{name:'Registrar restricción técnica'}));
  await waitFor(()=>expect(posted()).toContainEqual(expect.objectContaining({action:'restrict',accountId:'5',channel:'email',reason:'Pidió que no le escribamos'})));
  fireEvent.click(await within(region).findByRole('button',{name:'Levantar restricción'}));
  const lift=await screen.findByRole('dialog');
  fireEvent.change(within(lift).getByLabelText('Motivo para levantar la restricción'),{target:{value:'Nueva autorización del contacto'}});
  fireEvent.click(within(lift).getByRole('button',{name:'Confirmar levantamiento'}));
  await waitFor(()=>expect(posted()).toContainEqual(expect.objectContaining({action:'lift',id:'r1',reason:'Nueva autorización del contacto'})));
 });
});
