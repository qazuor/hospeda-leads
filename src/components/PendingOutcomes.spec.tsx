import {afterEach,beforeAll,describe,it,expect,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {MantineProvider} from '@mantine/core';
import {MemoryRouter} from 'react-router-dom';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
const postCommunication=vi.hoisted(()=>vi.fn());
const toast=vi.hoisted(()=>({success:vi.fn(),info:vi.fn(),error:vi.fn(),warning:vi.fn()}));
vi.mock('sonner',()=>({toast}));
vi.mock('../endpoints/communication.schema',async importOriginal=>({...(await importOriginal<typeof import('../endpoints/communication.schema')>()),postCommunication}));
import {OutcomeGroupRow,PendingOutcomes,groupOutcomeNote} from './PendingOutcomes';
import {groupOutcomeFollowUps} from '../helpers/contactFollowUpGroups';
import type {ContactFollowUpList,ContactFollowUps,PendingOutcome} from '../endpoints/communication.schema';

const item=(id:string,over:Partial<PendingOutcome>={}):PendingOutcome=>({id,accountId:'1',accountName:'Hotel',leadId:null,opportunityName:null,contactId:null,channel:'whatsapp',status:'manual_sent',purpose:null,recipientName:'Julia',lastInteractionAt:new Date('2026-10-30T12:00:00Z'),...over});
const list=(items:PendingOutcome[],count=items.length,groupCount=count):ContactFollowUpList=>({items,count,groupCount});
const none=list([]);
const follow=(over:Partial<ContactFollowUps>={}):ContactFollowUps=>({unconfirmed:none,outcomes:none,expired:{unconfirmed:none,outcomes:none},...over});
const mount=(followUps:ContactFollowUps|undefined,onOutcome=vi.fn(),client=new QueryClient({defaultOptions:{mutations:{retry:false}}}))=>render(<QueryClientProvider client={client}><MantineProvider><MemoryRouter><PendingOutcomes id="today-outcomes" followUps={followUps} onOutcome={onOutcome}/></MemoryRouter></MantineProvider></QueryClientProvider>);
beforeAll(()=>{window.matchMedia=()=>({matches:false,media:'',onchange:null,addListener:()=>{},removeListener:()=>{},addEventListener:()=>{},removeEventListener:()=>{},dispatchEvent:()=>false});});
afterEach(()=>{cleanup();postCommunication.mockReset();for(const fn of Object.values(toast))fn.mockReset();});
const conflict=(message:string)=>Object.assign(new Error(message),{status:409});
describe('PendingOutcomes (Hoy «Pendientes de contacto», spec 100 §4.2 D8)',()=>{
 it('shows the actual confirmation source for WhatsApp, Instagram and manual confirmation',()=>{
  mount(follow({outcomes:list([item('wa',{leadId:'1',externalId:'wamid.1',confirmationSource:'userscript'}),item('ig',{leadId:'2',channel:'social',destinationDetail:'instagram',externalId:'mid.1',confirmationSource:'instagram'}),item('manual',{leadId:'3',externalId:'wamid.2',confirmationSource:'manual'})],3,3)}));
  expect(screen.getByText(/Enviado · confirmado por el script de WhatsApp/)).toBeTruthy();
  expect(screen.getByText(/Enviado · confirmado por Instagram/)).toBeTruthy();
  expect(screen.getByText(/Envío confirmado manualmente/)).toBeTruthy();
 });
 it('titles the card «Pendientes de contacto» and counts unconfirmed sends plus management groups, like the strip without «Por revisar»',()=>{
  mount(follow({unconfirmed:list([item('u1',{status:'whatsapp_opened'}),item('u2',{status:'manual_pending',channel:'call'})],2),outcomes:list([item('a1',{leadId:'9',opportunityName:'Plan A'}),item('a2',{leadId:'9',opportunityName:'Plan A'}),item('b1',{leadId:'8',opportunityName:'Plan B'})],3,2),expired:{unconfirmed:list([item('x1',{status:'whatsapp_opened'})]),outcomes:none}}));
  const card=screen.getByRole('region',{name:'Pendientes de contacto'});
  expect(within(card).getByRole('heading',{name:'Pendientes de contacto'})).toBeTruthy();
  expect(within(card).getByLabelText('Total de pendientes de contacto').textContent).toBe('4');
  expect(within(card).getByRole('heading',{name:'¿Lo enviaste? · 2'})).toBeTruthy();
  expect(within(card).getByRole('heading',{name:'Anotá cómo salió · 2'})).toBeTruthy();
  const outcomes=within(card).getByRole('region',{name:'Anotá cómo salió'});
  expect(within(outcomes).getAllByRole('article')).toHaveLength(2);
  expect(within(outcomes).getByRole('article',{name:'Resultado pendiente de Plan A'}).textContent).toContain('Hotel · Plan A');
  expect(within(card).queryByText(/sin confirmar ·|Envíos sin confirmar/)).toBeNull();
 });
 it('keeps «Vencidos» collapsed and uncounted, and still answerable once opened',async()=>{
  mount(follow({expired:{unconfirmed:list([item('x1',{status:'whatsapp_opened'})]),outcomes:list([item('o1',{leadId:'9',opportunityName:'Plan viejo'})],1,1)}}));
  const card=screen.getByRole('region',{name:'Pendientes de contacto'});
  expect(within(card).getByLabelText('Total de pendientes de contacto').textContent).toBe('0');
  const toggle=within(card).getByRole('button',{name:'Vencidos · 2'});
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
  fireEvent.click(toggle);
  const expired=within(card).getByRole('region',{name:'Vencidos'});
  await waitFor(()=>expect(within(expired).getByText(/No cuentan como pendientes, pero podés responderlas igual/)).toBeTruthy());
  expect(await within(expired).findByRole('button',{name:'Sí, se envió'})).toBeTruthy();
  expect(within(expired).getByRole('article',{name:'Resultado pendiente de Plan viejo'})).toBeTruthy();
 });
 it('renders nothing without pending or expired contacts',()=>{
  mount(follow());expect(screen.queryByRole('region')).toBeNull();
  cleanup();mount(undefined);expect(screen.queryByRole('region')).toBeNull();
 });
 it('answers an open with «Sí, se envió» once, blocking both buttons while it saves (no double submit)',async()=>{
  let resolve:(v:unknown)=>void=()=>{};postCommunication.mockImplementation(()=>new Promise(r=>{resolve=r}));
  mount(follow({unconfirmed:list([item('u1',{status:'whatsapp_opened'})])}));
  const row=screen.getByRole('article',{name:'Contacto pendiente con Julia'});
  const yes=within(row).getByRole('button',{name:'Sí, se envió'});
  fireEvent.click(yes);fireEvent.click(yes);
  await waitFor(()=>expect(within(row).getByRole('button',{name:'Guardando…'})).toBeTruthy());
  expect(postCommunication).toHaveBeenCalledTimes(1);
  expect(postCommunication.mock.calls[0][0]).toEqual({action:'outcome',id:'u1',event:'manual_sent',notes:''});
  expect((within(row).getByRole('button',{name:'No se envió'}) as HTMLButtonElement).disabled).toBe(true);
  resolve({});
 });
 it('shows the server refusal on the row and never retries it',async()=>{
  postCommunication.mockRejectedValue(new Error('El negocio está marcado como No contactar.'));
  mount(follow({unconfirmed:list([item('u1',{status:'instagram_opened',channel:'social',destinationDetail:'instagram'})])}));
  const row=screen.getByRole('article',{name:'Contacto pendiente con Julia'});
  fireEvent.click(within(row).getByRole('button',{name:'Sí, se envió'}));
  expect((await within(row).findByRole('alert')).textContent).toBe('El negocio está marcado como No contactar.');
  expect(postCommunication).toHaveBeenCalledTimes(1);
 });
 it.each([['Sí, se envió'],['No se envió']])('shows «Este envío ya estaba confirmado.» from «%s» as information and reloads the lists so the row leaves (spec 100 §8)',async name=>{
  postCommunication.mockRejectedValue(conflict('Este envío ya estaba confirmado.'));
  const client=new QueryClient({defaultOptions:{mutations:{retry:false}}}),invalidate=vi.spyOn(client,'invalidateQueries');
  mount(follow({unconfirmed:list([item('u1',{status:'whatsapp_opened'})])}),vi.fn(),client);
  const row=screen.getByRole('article',{name:'Contacto pendiente con Julia'});
  fireEvent.click(within(row).getByRole('button',{name}));
  await waitFor(()=>expect(toast.info).toHaveBeenCalledWith('Este envío ya estaba confirmado.'));
  expect(within(row).queryByRole('alert')).toBeNull();
  const keys=invalidate.mock.calls.map(([filters])=>filters?.queryKey);
  for(const key of [['communication'],['work'],['global-journal'],['lead-journal'],['commercial-detail']])expect(keys).toContainEqual(key);
  expect(postCommunication).toHaveBeenCalledTimes(1);
 });
 it('keeps any other 409 («Este registro fue anulado.») as an error on the row',async()=>{
  postCommunication.mockRejectedValue(conflict('Este registro fue anulado.'));
  mount(follow({unconfirmed:list([item('u1',{status:'whatsapp_opened'})])}));
  const row=screen.getByRole('article',{name:'Contacto pendiente con Julia'});
  fireEvent.click(within(row).getByRole('button',{name:'No se envió'}));
  expect((await within(row).findByRole('alert')).textContent).toBe('Este registro fue anulado.');
  expect(toast.info).not.toHaveBeenCalled();
 });
 it('opens the outcome of a manual attempt from «Anotá cómo salió» through the owner of the dialog',()=>{
  const onOutcome=vi.fn();
  mount(follow({unconfirmed:list([item('m1',{status:'manual_pending',channel:'call'})])}),onOutcome);
  const row=screen.getByRole('article',{name:'Contacto pendiente con Julia'});
  expect(within(row).queryByRole('button',{name:'Sí, se envió'})).toBeNull();
  fireEvent.click(within(row).getByRole('button',{name:'Anotá cómo salió'}));
  expect(onOutcome).toHaveBeenCalledWith(expect.objectContaining({key:'out:m1',contact:expect.objectContaining({messageId:'m1',messageStatus:'manual_pending'})}));
 });
 it('opens a group outcome with the newest send and the «vale para los N envíos» note',()=>{
  const onOutcome=vi.fn();
  mount(follow({outcomes:list([item('old',{leadId:'9',opportunityName:'Plan A',lastInteractionAt:new Date('2026-10-28T12:00:00Z')}),item('new',{leadId:'9',opportunityName:'Plan A'})],2,1)}),onOutcome);
  fireEvent.click(screen.getByRole('button',{name:'Anotá cómo salió'}));
  expect(onOutcome).toHaveBeenCalledWith({key:'group:1|9|',contact:expect.objectContaining({messageId:'new'}),note:'Este resultado vale para los 2 envíos de esta gestión.'});
 });
 it('links every row to the business with the strip open (spec 100 §5.4)',()=>{
  mount(follow({unconfirmed:list([item('u1',{status:'whatsapp_opened',accountId:'7'})]),outcomes:list([item('a1',{accountId:'8',leadId:'9'})])}));
  const links=screen.getAllByRole('link',{name:'Ver en el negocio'}).map(a=>a.getAttribute('href'));
  expect(links).toEqual(['/accounts/7?section=communication&pending=open','/accounts/8?section=communication&pending=open']);
 });
 it('shows a management group with its 3 sends (manual, script, Instagram), their labels and one button whose dialog covers all 3 (spec 100 §6)',()=>{
  const [group]=groupOutcomeFollowUps({items:[item('manual',{leadId:'9',opportunityName:'Plan anual',channel:'call',lastInteractionAt:new Date('2026-10-28T12:00:00Z')}),item('wa',{leadId:'9',opportunityName:'Plan anual',externalId:'wamid.1',confirmationSource:'userscript',lastInteractionAt:new Date('2026-10-29T12:00:00Z')}),item('ig',{leadId:'9',opportunityName:'Plan anual',channel:'social',destinationDetail:'instagram',externalId:'mid.1',confirmationSource:'instagram'})]});
  const onOutcome=vi.fn();
  render(<MantineProvider><OutcomeGroupRow group={group} showBusiness={false} onOutcome={onOutcome}/></MantineProvider>);
  const row=screen.getByRole('article',{name:'Resultado pendiente de Plan anual'});
  expect(within(row).getByText('3 envíos sin resultado')).toBeTruthy();
  for(const label of [/Envío confirmado manualmente/,/Enviado · confirmado por el script de WhatsApp/,/Enviado · confirmado por Instagram/])expect(within(row).getByText(label)).toBeTruthy();
  fireEvent.click(within(row).getByRole('button',{name:'Anotá cómo salió'}));
  expect(onOutcome).toHaveBeenCalledWith(group);expect(group.newest.id).toBe('ig');
  expect(groupOutcomeNote(group)).toBe('Este resultado vale para los 3 envíos de esta gestión.');
 });
 it('shows at most 3 sends of a group and «+N más» for the rest',()=>{
  const [group]=groupOutcomeFollowUps({items:['a','b','c','d','e'].map((id,i)=>item(id,{lastInteractionAt:new Date(Date.UTC(2026,9,20+i))}))});
  render(<MantineProvider><OutcomeGroupRow group={group} showBusiness={false} onOutcome={()=>{}}/></MantineProvider>);
  const row=screen.getByRole('article',{name:'Resultado pendiente de Sin gestión'});
  expect(within(row).getAllByRole('listitem')).toHaveLength(3);
  fireEvent.click(within(row).getByRole('button',{name:'+2 más'}));
  expect(within(row).getAllByRole('listitem')).toHaveLength(5);
 });
 it('counts a group of 12 sends by the server total although only its 10 newest arrive',()=>{
  const [group]=groupOutcomeFollowUps({items:Array.from({length:10},(_,i)=>item('s'+i,{groupTotal:12,lastInteractionAt:new Date(Date.UTC(2026,9,20,i))}))});
  expect(group.total).toBe(12);expect(groupOutcomeNote(group)).toBe('Este resultado vale para los 12 envíos de esta gestión.');
  render(<MantineProvider><OutcomeGroupRow group={group} showBusiness={false} onOutcome={()=>{}}/></MantineProvider>);
  const row=screen.getByRole('article',{name:'Resultado pendiente de Sin gestión'});
  expect(within(row).getByText('12 envíos sin resultado')).toBeTruthy();
  fireEvent.click(within(row).getByRole('button',{name:'+9 más'}));
  expect(within(row).getAllByRole('listitem')).toHaveLength(10);
  expect(within(row).queryByRole('button',{name:/más$/})).toBeNull();expect(within(row).getByText('+2 más')).toBeTruthy();
 });
 it('never counts a group below the sends it lists (an older server without groupTotal)',()=>{
  const [group]=groupOutcomeFollowUps({items:[item('a',{leadId:'9'}),item('b',{leadId:'9'})]});
  expect(group.total).toBe(2);expect(groupOutcomeNote(groupOutcomeFollowUps({items:[item('a')]})[0])).toBeUndefined();
 });
});
