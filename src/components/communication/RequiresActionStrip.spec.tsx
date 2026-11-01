import React from 'react';
import {afterEach,beforeAll,describe,expect,it,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {MantineProvider} from '@mantine/core';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {MemoryRouter,useNavigate} from 'react-router-dom';
const mocks=vi.hoisted(()=>({getCommunication:vi.fn(),postCommunication:vi.fn(),getCommercialDetail:vi.fn(),getWork:vi.fn()}));
vi.mock('sonner',()=>({toast:{success:vi.fn(),warning:vi.fn(),error:vi.fn(),info:vi.fn()}}));
// The mocked dialog can «save»: it refetches every query, as the real editor does after its mutation.
vi.mock('../OutcomeAfterContact',async()=>{const {useQueryClient}=await import('@tanstack/react-query');return {OutcomeAfterContact:({contact,note}:{contact:{messageId?:string};note?:string})=>{const qc=useQueryClient();return <div><p>Cómo salió (mock) {contact.messageId} {note}</p><button type="button" onClick={()=>void qc.invalidateQueries()}>Guardar (mock)</button></div>;}};});
vi.mock('../../endpoints/communication.schema',async original=>({...await original<typeof import('../../endpoints/communication.schema')>(),getCommunication:mocks.getCommunication,postCommunication:mocks.postCommunication}));
vi.mock('../../endpoints/commercial.schema',async original=>({...await original<typeof import('../../endpoints/commercial.schema')>(),getCommercialDetail:mocks.getCommercialDetail}));
vi.mock('../../endpoints/work.schema',async original=>({...await original<typeof import('../../endpoints/work.schema')>(),getWork:mocks.getWork}));
vi.mock('../../helpers/useAuth',()=>({useAuth:()=>({authState:{type:'authenticated',user:{id:1,email:'seller@example.com',displayName:'Seller',role:'user'}}})}));
import {CommunicationPanel} from '../CommunicationPanel';
import {pendingOpenRequested} from './RequiresActionStrip';

const day=(d:number,h=12)=>new Date(`2026-10-${String(d).padStart(2,'0')}T${String(h).padStart(2,'0')}:00:00-03:00`);
const message=(id:string,over:Record<string,unknown>={})=>({id,accountId:'5',leadId:null,contactId:null,channel:'whatsapp',recipient:'+5493442123456',recipientName:'Julia',subject:'',body:'Hola Julia',htmlBody:null,textBody:'Hola Julia',templateSnapshot:null,ownerEmail:'seller@example.com',activityId:null,outboxId:null,taskId:null,status:'manual_sent',revision:1,lastInteractionAt:day(2),lastActorEmail:null,createdAt:day(2),updatedAt:day(2),...over});
const inbound=(id:string,over:Record<string,unknown>={})=>({id,channel:'whatsapp',receivedAt:day(3),fromAddress:'+5493442123456',fromName:'Julia',subject:'',textBody:'Gracias, lo vemos',status:'pending_review',isAutomatic:false,matchMethod:'phone',leadId:null,contextName:'General',linkedMessageId:null,responseId:null,attachments:[],canReply:false,replyAvailable:false,replyRestricted:false,...over});
const pending=(id:string,status:string,over:Record<string,unknown>={})=>({id,accountId:'5',accountName:'Hotel Sol',leadId:null,opportunityName:null,contactId:null,channel:'whatsapp',recipientName:'Julia',status,purpose:null,lastInteractionAt:day(3),ownerEmail:'seller@example.com',...over});
type Item=ReturnType<typeof pending>;
const list=(items:Item[],count=items.length,groupCount=count)=>({items,count,groupCount});
const followUps=({unconfirmed=list([]),outcomes=list([]),expiredUnconfirmed=list([]),expiredOutcomes=list([])}:{unconfirmed?:ReturnType<typeof list>;outcomes?:ReturnType<typeof list>;expiredUnconfirmed?:ReturnType<typeof list>;expiredOutcomes?:ReturnType<typeof list>}={})=>({unconfirmed,outcomes,expired:{unconfirmed:expiredUnconfirmed,outcomes:expiredOutcomes}});
const account={id:'5',nombre:'Hotel Sol',assignedUserEmail:'seller@example.com',email:'hotel@example.com',telefono:'+5493447000111',tipo:'Alojamiento',ciudad:'Colón',subtipo:null,archivedAt:null,recontactAt:null,status:'active',doNotContact:false,isClient:false};
function setup(data:Record<string,unknown>={}){
 mocks.getCommunication.mockResolvedValue({messages:[],recentMessages:[],restrictions:[],activeRestrictions:[],responses:[],inbound:[],openManagements:[{id:'9',opportunityName:'Plan anual',managementType:null,estado:'main:contact',assignedUserEmail:'seller@example.com',classification:'open',canClose:true}],recentContactHours:72,webhookConfigured:false,...data});
 mocks.getCommercialDetail.mockResolvedValue({account,contacts:[],opportunities:[{id:'9',opportunityName:'Plan anual',assignedUserEmail:'seller@example.com',estado:'main:contact',deletedAt:null}],users:[{email:'seller@example.com',displayName:'Seller'}]});
 mocks.getWork.mockResolvedValue({tasks:[]});
}
const wrap=(node:React.ReactNode)=>render(<MantineProvider env="test"><QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}>{node}</QueryClientProvider></MantineProvider>);
const show=async()=>{wrap(<CommunicationPanel accountId="5"/>);await screen.findByRole('region',{name:'Conversación'});};
const strip=()=>screen.getByRole('region',{name:'Requiere acción'});
beforeAll(()=>{window.matchMedia=window.matchMedia||((query:string)=>({matches:false,media:query,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){},dispatchEvent:()=>false,onchange:null}) as MediaQueryList);globalThis.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};});
afterEach(()=>{cleanup();window.history.replaceState(null,'','/');for(const fn of Object.values(mocks))fn.mockReset();});

// The smoke case (spec 100 §16): 1 received to review, 4 opens and 3 contacts without outcome in 2 managements.
const smoke=()=>followUps({
 unconfirmed:list([pending('opened','whatsapp_opened',{lastInteractionAt:day(6)}),pending('o2','whatsapp_opened',{recipientName:'Pedro',lastInteractionAt:day(5)}),pending('o3','whatsapp_opened',{recipientName:'Ana',lastInteractionAt:day(5,10)}),pending('o4','manual_pending',{channel:'call',recipientName:'Luis',lastInteractionAt:day(4)})]),
 outcomes:list([pending('c1','manual_sent',{channel:'call',leadId:'9',opportunityName:'Plan anual',lastInteractionAt:day(3)}),pending('c2','manual_sent',{leadId:'9',opportunityName:'Plan anual',externalId:'wamid.1',confirmationSource:'userscript',lastInteractionAt:day(2)}),pending('c3','manual_sent',{channel:'social',destinationDetail:'instagram',externalId:'mid.1',confirmationSource:'instagram',lastInteractionAt:day(1)})],3,2),
});

describe('«Requiere acción» strip (spec 100 §5)',()=>{
 it('starts collapsed in one line «7 pendientes · Revisar» with the breakdown, the entries hidden (smoke 10)',async()=>{
  setup({messages:[message('opened',{status:'whatsapp_opened',lastInteractionAt:day(6)})],inbound:[inbound('in1')],followUps:smoke()});await show();
  const region=strip();
  expect(within(region).getByText('7 pendientes')).toBeTruthy();
  expect(within(region).getByText('1 mensaje por revisar · 4 envíos sin confirmar · 2 gestiones sin resultado')).toBeTruthy();
  const toggle=within(region).getByRole('button',{name:'Revisar'});expect(toggle.getAttribute('aria-expanded')).toBe('false');
  expect(within(region).queryByRole('heading',{name:/Requiere acción/})).toBeNull();
  expect(within(region).queryByRole('group',{name:'WhatsApp sin confirmar para Julia'})).toBeNull();
  expect(within(region).queryByRole('button',{name:'Sí, se envió'})).toBeNull();
 });
 it('says «1 pendiente» in singular',async()=>{
  setup({inbound:[inbound('in1')],followUps:followUps()});await show();
  expect(within(strip()).getByText('1 pendiente')).toBeTruthy();
 });
 it('expands with «Revisar» into the blocks in order and «Ocultar» collapses it again',async()=>{
  setup({messages:[message('opened',{status:'whatsapp_opened',lastInteractionAt:day(6)})],inbound:[inbound('in1')],followUps:{...smoke(),expired:{unconfirmed:list([pending('old','whatsapp_opened',{recipientName:'Vieja',lastInteractionAt:day(1)})]),outcomes:list([])}}});await show();
  fireEvent.click(within(strip()).getByRole('button',{name:'Revisar'}));
  const region=strip();
  expect(within(region).getByRole('heading',{name:'Requiere acción · 7'})).toBeTruthy();
  const titles=within(region).getAllByRole('heading').map(h=>h.textContent);
  expect(titles).toEqual(['Requiere acción · 7','Por revisar · 1','¿Lo enviaste? · 4','Anotá cómo salió · 2']);
  expect(within(region).getByRole('button',{name:'Vencidos · 1'})).toBeTruthy();
  // The loaded open is compact: who and when on one line, the prepared text behind «Ver mensaje y material».
  const full=within(region).getByRole('group',{name:'WhatsApp sin confirmar para Julia'});
  expect(within(full).getByText(/Abriste WhatsApp para Julia \(\+5493442123456\)/)).toBeTruthy();
  expect(within(full).getByRole('button',{name:'Sí, se envió'})).toBeTruthy();expect(within(full).getByRole('button',{name:'No se envió'})).toBeTruthy();
  expect(within(full).getByRole('button',{name:'Ver mensaje y material'}).getAttribute('aria-expanded')).toBe('false');
  const hide=within(region).getByRole('button',{name:'Ocultar'});expect(hide.getAttribute('aria-expanded')).toBe('true');
  fireEvent.click(hide);
  expect(within(strip()).getByRole('button',{name:'Revisar'})).toBeTruthy();expect(within(strip()).queryByRole('heading')).toBeNull();
 });
 it('lists one «Anotá cómo salió» row per management with its sends and one outcome action for the newest (D2)',async()=>{
  setup({followUps:smoke()});await show();
  fireEvent.click(within(strip()).getByRole('button',{name:'Revisar'}));
  const block=within(strip()).getByRole('region',{name:'Anotá cómo salió'});
  const rows=within(block).getAllByRole('article');expect(rows).toHaveLength(2);
  const plan=within(block).getByRole('article',{name:'Resultado pendiente de Plan anual'});
  expect(within(plan).getByText('2 envíos sin resultado')).toBeTruthy();
  expect(within(plan).getByText(/WhatsApp · Julia · .* · Enviado · confirmado por el script de WhatsApp/)).toBeTruthy();
  expect(within(plan).getByText(/Llamada · Julia · .*/)).toBeTruthy();
  const none=within(block).getByRole('article',{name:'Resultado pendiente de Sin gestión'});expect(within(none).getByText('1 envío sin resultado')).toBeTruthy();
  expect(within(plan).getAllByRole('button',{name:'Anotá cómo salió'})).toHaveLength(1);
  fireEvent.click(within(plan).getByRole('button',{name:'Anotá cómo salió'}));
  expect(screen.getByText('Cómo salió (mock) c1 Este resultado vale para los 2 envíos de esta gestión.')).toBeTruthy();
 });
 it('keeps the outcome dialog open while the save refetches and the group (and the strip) goes away',async()=>{
  setup({followUps:followUps({outcomes:list([pending('c1','manual_sent',{leadId:'9',opportunityName:'Plan anual'})])})});await show();
  fireEvent.click(within(strip()).getByRole('button',{name:'Revisar'}));
  fireEvent.click(within(strip()).getByRole('button',{name:'Anotá cómo salió'}));
  setup({followUps:followUps()});
  fireEvent.click(screen.getByRole('button',{name:'Guardar (mock)'}));
  await waitFor(()=>expect(screen.queryByRole('region',{name:'Requiere acción'})).toBeNull());
  expect(screen.getByText(/Cómo salió \(mock\) c1/)).toBeTruthy();
 });
 it('says «Se muestran X de Y» in «Vencidos» when the server cut a list',async()=>{
  setup({followUps:followUps({expiredUnconfirmed:list([pending('old','whatsapp_opened',{recipientName:'Vieja',lastInteractionAt:day(1)})],21),expiredOutcomes:list([pending('e1','manual_sent',{leadId:'9',opportunityName:'Plan anual'})],30,25)})});await show();
  fireEvent.click(within(strip()).getByRole('button',{name:'Ver'}));
  fireEvent.click(within(strip()).getByRole('button',{name:'Vencidos · 46'}));
  const expired=within(strip()).getByRole('region',{name:'Vencidos'});
  await waitFor(()=>expect(within(expired).getByText('Se muestran los 1 más recientes de 21.')).toBeTruthy());
  expect(within(expired).getByText('Se muestran las 1 gestiones más recientes de 25.')).toBeTruthy();
 });
 it('does not count expired items nor uncounted opens: «Sin pendientes · …» with «Ver»',async()=>{
  const waiting=message('fresh',{status:'whatsapp_opened',recipientName:'Nueva',lastInteractionAt:new Date(Date.now()-60_000)});
  setup({messages:[waiting],followUps:followUps({expiredUnconfirmed:list([pending('old','whatsapp_opened',{lastInteractionAt:day(1)})]),expiredOutcomes:list([pending('e1','manual_sent',{leadId:'9',opportunityName:'Plan anual'}),pending('e2','manual_sent',{leadId:'9',opportunityName:'Plan anual'})],2,1)})});await show();
  const region=strip();
  expect(within(region).getByText('Sin pendientes · 2 vencidos · 1 envío esperando confirmación')).toBeTruthy();
  fireEvent.click(within(region).getByRole('button',{name:'Ver'}));
  expect(within(strip()).getByRole('heading',{name:'Requiere acción · 0'})).toBeTruthy();
  expect(within(strip()).getByRole('heading',{name:'¿Lo enviaste?'})).toBeTruthy();// uncounted opens only: no «· 0»
  // The waiting WhatsApp is listed, answerable, with its waiting status.
  const entry=within(strip()).getByRole('group',{name:'WhatsApp sin confirmar para Nueva'});
  expect(within(entry).getByText('Esperando que el script de WhatsApp confirme el envío')).toBeTruthy();expect(within(entry).getByRole('button',{name:'No se envió'})).toBeTruthy();
 });
 it('keeps «Vencidos» collapsed and answerable, with the explanation',async()=>{
  setup({messages:[message('old',{status:'whatsapp_opened',recipientName:'Vieja',lastInteractionAt:day(1)})],inbound:[inbound('in1')],followUps:followUps({expiredUnconfirmed:list([pending('old','whatsapp_opened',{recipientName:'Vieja',lastInteractionAt:day(1)})]),expiredOutcomes:list([pending('e1','manual_sent',{leadId:'9',opportunityName:'Plan anual'})])})});await show();
  expect(within(strip()).getByText('1 pendiente')).toBeTruthy();
  fireEvent.click(within(strip()).getByRole('button',{name:'Revisar'}));
  const toggle=within(strip()).getByRole('button',{name:'Vencidos · 2'});expect(toggle.getAttribute('aria-expanded')).toBe('false');
  fireEvent.click(toggle);
  const expired=within(strip()).getByRole('region',{name:'Vencidos'});
  await waitFor(()=>expect(within(expired).getByText('Preguntas de más de 3 días (envíos sin confirmar) o 7 días (gestiones sin resultado). No cuentan como pendientes, pero podés responderlas igual.')).toBeTruthy());
  const old=await within(expired).findByRole('group',{name:'WhatsApp sin confirmar para Vieja'});expect(within(old).getByRole('button',{name:'Sí, se envió'})).toBeTruthy();
  expect(within(expired).getByRole('article',{name:'Resultado pendiente de Plan anual'})).toBeTruthy();
  // An expired open is never listed twice (it is not an uncounted open).
  expect(within(strip()).getAllByRole('group',{name:'WhatsApp sin confirmar para Vieja'})).toHaveLength(1);
 });
 it('renders nothing when nothing is pending, expired, waiting or carrying material',async()=>{
  setup({followUps:followUps()});await show();
  expect(screen.queryByRole('region',{name:'Requiere acción'})).toBeNull();
  expect(screen.queryByText(/Nada pendiente/)).toBeNull();
 });
 it('arrives expanded with ?pending=open',async()=>{
  window.history.replaceState(null,'','/accounts/5?section=communication&pending=open');
  setup({inbound:[inbound('in1')],followUps:followUps()});await show();
  expect(within(strip()).getByRole('heading',{name:'Requiere acción · 1'})).toBeTruthy();
  expect(within(strip()).getByRole('button',{name:'Ocultar'})).toBeTruthy();
 });
 it('expands an already mounted strip when the router navigates to ?pending=open (work editor toast «Ver en Comunicación»)',async()=>{
  setup({inbound:[inbound('in1')],followUps:followUps()});
  let go:(to:string)=>void=()=>{};
  function Nav(){const navigate=useNavigate();go=navigate;return null;}
  wrap(<MemoryRouter initialEntries={['/accounts/5?section=communication']}><Nav/><CommunicationPanel accountId="5"/></MemoryRouter>);
  await screen.findByRole('region',{name:'Conversación'});
  expect(within(strip()).getByRole('button',{name:'Revisar'})).toBeTruthy();
  act(()=>go('/accounts/5?section=communication&pending=open'));
  expect(within(strip()).getByRole('heading',{name:'Requiere acción · 1'})).toBeTruthy();
  // Collapsed again by hand, the same link reopens it (a new navigation).
  fireEvent.click(within(strip()).getByRole('button',{name:'Ocultar'}));
  act(()=>go('/accounts/5?section=communication&pending=open'));
  expect(within(strip()).getByRole('button',{name:'Ocultar'})).toBeTruthy();
 });
 it('collapses back once the last counted pending is resolved',async()=>{
  const opened=message('opened',{status:'whatsapp_opened',lastInteractionAt:day(6)});
  setup({messages:[opened],followUps:followUps({unconfirmed:list([pending('opened','whatsapp_opened',{lastInteractionAt:day(6)})])})});
  mocks.postCommunication.mockResolvedValue({ok:true});await show();
  fireEvent.click(within(strip()).getByRole('button',{name:'Revisar'}));
  setup({messages:[{...opened,status:'manual_sent'}],inbound:[inbound('later',{status:'registered'})],followUps:followUps({expiredOutcomes:list([pending('e1','manual_sent')])})});
  fireEvent.click(within(strip()).getByRole('button',{name:'Sí, se envió'}));
  await waitFor(()=>expect(within(strip()).getByText('Sin pendientes · 1 vencido')).toBeTruthy());
  expect(within(strip()).getByRole('button',{name:'Ver'}).getAttribute('aria-expanded')).toBe('false');
 });
});

describe('pendingOpenRequested',()=>{
 it('is true only for pending=open',()=>{
  expect(pendingOpenRequested('?section=communication&pending=open')).toBe(true);
  expect(pendingOpenRequested('?pending=closed')).toBe(false);expect(pendingOpenRequested('')).toBe(false);
 });
});
