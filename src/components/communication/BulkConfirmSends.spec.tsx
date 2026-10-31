import React from 'react';
import {afterEach,beforeAll,describe,expect,it,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {MantineProvider} from '@mantine/core';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
const mocks=vi.hoisted(()=>({getCommunication:vi.fn(),postCommunication:vi.fn(),getCommercialDetail:vi.fn(),getWork:vi.fn()}));
const auth=vi.hoisted(()=>({role:'user'}));
const toasts=vi.hoisted(()=>({success:vi.fn(),warning:vi.fn(),error:vi.fn(),info:vi.fn()}));
vi.mock('sonner',()=>({toast:toasts}));
vi.mock('../OutcomeAfterContact',()=>({OutcomeAfterContact:()=><p>Cómo salió (mock)</p>}));
vi.mock('../../endpoints/communication.schema',async original=>({...await original<typeof import('../../endpoints/communication.schema')>(),getCommunication:mocks.getCommunication,postCommunication:mocks.postCommunication}));
vi.mock('../../endpoints/commercial.schema',async original=>({...await original<typeof import('../../endpoints/commercial.schema')>(),getCommercialDetail:mocks.getCommercialDetail}));
vi.mock('../../endpoints/work.schema',async original=>({...await original<typeof import('../../endpoints/work.schema')>(),getWork:mocks.getWork}));
vi.mock('../../helpers/useAuth',()=>({useAuth:()=>({authState:{type:'authenticated',user:{id:1,email:'seller@example.com',displayName:'Seller',role:auth.role}}})}));
import {CommunicationPanel} from '../CommunicationPanel';
import {CrmApiError} from '../../helpers/apiClient';
import {bulkSummary,runBulkOutcome,type BulkResult} from './BulkConfirmSends';
import {formatDateTime} from '../../helpers/crmDates';

const day=(d:number,h=12)=>new Date(`2026-10-${String(d).padStart(2,'0')}T${String(h).padStart(2,'0')}:00:00-03:00`);
const open=(id:string,recipientName:string,d:number,over:Record<string,unknown>={})=>({id,accountId:'5',leadId:'9' as string|null,contactId:null as string|null,destinationDetail:null as string|null,channel:'whatsapp',recipient:'+54934420000'+d,recipientName,subject:'',body:'Hola',htmlBody:null,textBody:'Hola',templateSnapshot:null,ownerEmail:'seller@example.com',activityId:null,outboxId:null,taskId:null,status:'whatsapp_opened',revision:1,lastInteractionAt:day(d),lastActorEmail:null,createdAt:day(d),updatedAt:day(d),...over});
const pending=(m:ReturnType<typeof open>)=>({id:m.id,accountId:'5',accountName:'Hotel Sol',leadId:m.leadId,opportunityName:'Plan anual',contactId:m.contactId,channel:m.channel,recipientName:m.recipientName,status:m.status,purpose:null,lastInteractionAt:m.lastInteractionAt,ownerEmail:'seller@example.com',...(m.destinationDetail?{destinationDetail:m.destinationDetail}:{})});
const at=(d:number)=>formatDateTime(day(d));
const list=<T,>(items:T[])=>({items,count:items.length,groupCount:items.length});
// Five answerable opens: Ana, Beto, Caro and Dani can be marked; Eva's person has an active WhatsApp restriction (blocked for «Sí»).
const ana=open('a','Ana',10),beto=open('b','Beto',9),caro=open('c','Caro',8,{channel:'social',destinationDetail:'instagram',status:'instagram_opened',recipient:'caro.ig'}),dani=open('d','Dani',7),eva=open('e','Eva',6,{contactId:'77'});
const opens=[ana,beto,caro,dani,eva];
const account={id:'5',nombre:'Hotel Sol',assignedUserEmail:'seller@example.com',email:'hotel@example.com',telefono:'+5493447000111',tipo:'Alojamiento',ciudad:'Colón',subtipo:null,archivedAt:null,recontactAt:null,status:'active',doNotContact:false,isClient:false};
function setup({messages=opens,expired=[] as ReturnType<typeof open>[],restrictions=[{channel:'whatsapp',contactId:'77',leadId:null,liftedAt:null}]}:{messages?:ReturnType<typeof open>[];expired?:ReturnType<typeof open>[];restrictions?:unknown[]}={}){
 mocks.getCommunication.mockResolvedValue({messages:[...messages,...expired],recentMessages:[],restrictions,activeRestrictions:restrictions,responses:[],inbound:[],openManagements:[{id:'9',opportunityName:'Plan anual',managementType:null,estado:'main:contact',assignedUserEmail:'seller@example.com',classification:'open',canClose:true}],recentContactHours:72,webhookConfigured:false,
  followUps:{unconfirmed:list(messages.map(pending)),outcomes:list([]),expired:{unconfirmed:list(expired.map(pending)),outcomes:list([])}}});
 mocks.getCommercialDetail.mockResolvedValue({account,contacts:[],opportunities:[{id:'9',opportunityName:'Plan anual',assignedUserEmail:'seller@example.com',estado:'main:contact',deletedAt:null}],users:[{email:'seller@example.com',displayName:'Seller'}]});
 mocks.getWork.mockResolvedValue({tasks:[]});
}
let client:QueryClient;
const show=async(props:{leadId?:string}={})=>{client=new QueryClient({defaultOptions:{queries:{retry:false}}});render(<MantineProvider env="test"><QueryClientProvider client={client}><CommunicationPanel accountId="5" {...props}/></QueryClientProvider></MantineProvider>);await screen.findByRole('region',{name:'Conversación'});};
const strip=()=>screen.getByRole('region',{name:'Requiere acción'});
const expand=async()=>{fireEvent.click(await within(strip()).findByRole('button',{name:/^(Revisar|Ver)$/}));await within(strip()).findByRole('heading',{name:/^Requiere acción/});};
const asking=()=>within(strip()).getByRole('region',{name:'¿Lo enviaste?'});
const box=(scope:HTMLElement,name:string)=>within(scope).getByRole('checkbox',{name})as HTMLInputElement;
const dialog=()=>screen.getByRole('dialog');
const crmSuccessText=()=>toasts.success.mock.calls.at(-1)?.[0];
beforeAll(()=>{window.matchMedia=window.matchMedia||((query:string)=>({matches:false,media:query,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){},dispatchEvent:()=>false,onchange:null}) as MediaQueryList);globalThis.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};});
afterEach(()=>{cleanup();auth.role='user';for(const fn of [...Object.values(mocks),...Object.values(toasts)])fn.mockReset();});

describe('Bulk «Sí, se enviaron» / «No se enviaron» (spec 100 §8, D3)',()=>{
 it('gives every answerable open an unchecked box and the bar «Seleccionar todos (N)»; the bar buttons count the selection',async()=>{
  setup();await show();await expand();
  const block=asking();
  for(const m of opens)expect(box(block,`Seleccionar ${m.channel==='social'?'Instagram':'WhatsApp'} para ${m.recipientName}`).checked).toBe(false);
  expect(within(block).queryByRole('button',{name:/^Sí, se enviaron/})).toBeNull();
  fireEvent.click(box(block,'Seleccionar WhatsApp para Ana'));fireEvent.click(box(block,'Seleccionar Instagram para Caro'));
  expect(within(block).getByRole('button',{name:'Sí, se enviaron (2)'})).toBeTruthy();expect(within(block).getByRole('button',{name:'No se enviaron (2)'})).toBeTruthy();
  fireEvent.click(within(block).getByRole('button',{name:'Seleccionar todos (5)'}));
  expect(within(block).getByRole('button',{name:'Sí, se enviaron (5)'})).toBeTruthy();
  for(const m of opens)expect(box(block,`Seleccionar ${m.channel==='social'?'Instagram':'WhatsApp'} para ${m.recipientName}`).checked).toBe(true);
 });
 it('shows no box nor bar with a single answerable open, in the management view, or on opens still waiting for the script',async()=>{
  setup({messages:[ana]});await show();await expand();
  expect(within(asking()).queryByRole('checkbox')).toBeNull();expect(within(asking()).queryByRole('button',{name:/^Seleccionar todos/})).toBeNull();
  cleanup();
  setup();await show({leadId:'9'});await expand();
  expect(within(asking()).queryByRole('checkbox')).toBeNull();expect(within(asking()).queryByRole('button',{name:/^Seleccionar todos/})).toBeNull();
  cleanup();
  // Two fresh WhatsApp opens the server does not list yet (waiting for the user script): answerable one by one, no bulk.
  const fresh=[open('f1','Fede',1,{lastInteractionAt:new Date(Date.now()-60_000)}),open('f2','Gabi',1,{lastInteractionAt:new Date(Date.now()-90_000)})];
  mocks.getCommunication.mockResolvedValue({messages:fresh,recentMessages:[],restrictions:[],activeRestrictions:[],responses:[],inbound:[],openManagements:[{id:'9',opportunityName:'Plan anual',managementType:null,estado:'main:contact',assignedUserEmail:'seller@example.com',classification:'open',canClose:true}],recentContactHours:72,webhookConfigured:false,followUps:{unconfirmed:list([]),outcomes:list([]),expired:{unconfirmed:list([]),outcomes:list([])}}});
  mocks.getCommercialDetail.mockResolvedValue({account,contacts:[],opportunities:[],users:[]});await show();await expand();
  expect(within(asking()).getAllByRole('button',{name:'No se envió'})).toHaveLength(2);expect(within(asking()).queryByRole('checkbox')).toBeNull();
 });
 it('lists what will be marked and, apart, what is blocked with its reason; «No se enviaron» has no blocks',async()=>{
  setup();await show();await expand();
  fireEvent.click(within(asking()).getByRole('button',{name:'Seleccionar todos (5)'}));
  fireEvent.click(within(asking()).getByRole('button',{name:'Sí, se enviaron (5)'}));
  const d=dialog();
  expect(within(d).getByText('¿Confirmás que enviaste estos 4 mensajes?')).toBeTruthy();
  const marked=within(d).getByRole('list',{name:'Se van a marcar'});
  expect(within(marked).getAllByRole('listitem').map(li=>li.textContent)).toEqual([`WhatsApp · Ana · ${at(10)} · Plan anual`,`WhatsApp · Beto · ${at(9)} · Plan anual`,`Instagram · Caro · ${at(8)} · Plan anual`,`WhatsApp · Dani · ${at(7)} · Plan anual`]);
  const blocked=within(d).getByRole('list',{name:'No se van a marcar'});
  expect(within(blocked).getByText(/Eva/).closest('li')!.textContent).toContain('Hay una restricción de contacto activa para este canal');
  expect(within(d).getByText('Marcar como enviado es tu confirmación: queda registrado como contacto.')).toBeTruthy();
  expect(within(d).getByRole('button',{name:'Sí, marcar 4'})).toBeTruthy();
  fireEvent.click(within(d).getByRole('button',{name:'Volver'}));
  await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());expect(mocks.postCommunication).not.toHaveBeenCalled();
  fireEvent.click(within(asking()).getByRole('button',{name:'No se enviaron (5)'}));
  const no=dialog();
  expect(within(no).getByText('¿Confirmás que estos 5 mensajes no se enviaron?')).toBeTruthy();
  expect(within(no).getAllByRole('listitem')).toHaveLength(5);expect(within(no).queryByRole('list',{name:'No se van a marcar'})).toBeNull();
  expect(within(no).getByText('Marcarlos como no enviados los saca de los pendientes.')).toBeTruthy();
  expect(within(no).getByRole('button',{name:'Sí, marcar 5'})).toBeTruthy();
 });
 it('disables «Sí, marcar» when every selected open is blocked',async()=>{
  const blockedAll=[open('x','Xime',5,{contactId:'77'}),open('y','Yago',4,{contactId:'77'})];
  setup({messages:blockedAll});await show();await expand();
  fireEvent.click(within(asking()).getByRole('button',{name:'Seleccionar todos (2)'}));
  fireEvent.click(within(asking()).getByRole('button',{name:'Sí, se enviaron (2)'}));
  const d=dialog();
  expect((within(d).getByRole('button',{name:'Sí, marcar 0'}) as HTMLButtonElement).disabled).toBe(true);
  expect(within(d).getByText('Ninguno se puede marcar como enviado.')).toBeTruthy();
 });
 it('runs one `outcome` per item in sequence, never twice on a double click, and reports each result with no automatic retry; only the failed one can be retried',async()=>{
  setup();await show();await expand();const refresh=vi.spyOn(client,'invalidateQueries');
  const calls:{id:string;settle:(value:unknown)=>void;fail:(e:unknown)=>void}[]=[];
  mocks.postCommunication.mockImplementation((input:{id:string})=>new Promise((settle,fail)=>calls.push({id:input.id,settle,fail})));
  fireEvent.click(within(asking()).getByRole('button',{name:'Seleccionar todos (5)'}));
  fireEvent.click(within(asking()).getByRole('button',{name:'Sí, se enviaron (5)'}));
  const confirm=within(dialog()).getByRole('button',{name:'Sí, marcar 4'});
  fireEvent.click(confirm);fireEvent.click(confirm);
  await waitFor(()=>expect(calls).toHaveLength(1));
  expect(mocks.postCommunication).toHaveBeenCalledWith({action:'outcome',id:'a',event:'manual_sent',notes:''});
  expect(within(dialog()).getByRole('button',{name:'Guardando 1 de 4…'})).toBeTruthy();
  // While it runs, the boxes and the individual buttons are off.
  expect(box(asking(),'Seleccionar WhatsApp para Ana').disabled).toBe(true);
  for(const b of within(asking()).getAllByRole('button',{name:'Sí, se envió'}))expect((b as HTMLButtonElement).disabled).toBe(true);
  await act(async()=>calls[0].settle({ok:true}));
  await waitFor(()=>expect(calls).toHaveLength(2));expect(calls[1].id).toBe('b');
  expect(within(dialog()).getByRole('button',{name:'Guardando 2 de 4…'})).toBeTruthy();
  await act(async()=>calls[1].fail(new CrmApiError('El negocio está marcado No contactar.',403)));
  await waitFor(()=>expect(calls).toHaveLength(3));expect(calls[2].id).toBe('c');
  await act(async()=>calls[2].fail(new CrmApiError('Este envío ya estaba confirmado.',409)));
  await waitFor(()=>expect(calls).toHaveLength(4));expect(calls[3].id).toBe('d');
  // After the run the server state is reloaded: Ana, Caro and Dani are gone; Beto (refused) and Eva (blocked) stay.
  setup({messages:[beto,eva]});
  await act(async()=>calls[3].settle({ok:true}));
  const results=await within(await screen.findByRole('dialog',{name:'Resultado'})).findByRole('list',{name:'Resultado'});
  const row=(name:string)=>within(results).getByText(new RegExp(name)).closest('li')!.textContent;
  expect(row('Ana')).toContain('Marcado como enviado');expect(row('Dani')).toContain('Marcado como enviado');
  expect(row('Beto')).toContain('El negocio está marcado No contactar.');
  expect(row('Caro')).toContain('Ya estaba confirmado');expect(row('Caro')).not.toContain('script');
  expect(row('Eva')).toContain('Hay una restricción de contacto activa para este canal');
  expect(toasts.warning).toHaveBeenCalledWith('2 de 5 marcados. 2 no se pudieron marcar. 1 ya estaba confirmado.');
  for(const queryKey of [['communication'],['work'],['commercial-detail']])expect(refresh).toHaveBeenCalledWith({queryKey});
  await waitFor(()=>expect(within(asking()).getAllByRole('group')).toHaveLength(2));
  expect(calls).toHaveLength(4);// nothing retried on its own
  // Only the refused item can be retried, on an explicit click, through the same confirmation.
  fireEvent.click(within(dialog()).getByRole('button',{name:'Reintentar los que fallaron (1)'}));
  expect(within(within(dialog()).getByRole('list',{name:'Se van a marcar'})).getAllByRole('listitem').map(li=>li.textContent)).toEqual([`WhatsApp · Beto · ${at(9)} · Plan anual`]);
  expect(calls).toHaveLength(4);
  expect(within(dialog()).getByText('¿Confirmás que enviaste este mensaje?')).toBeTruthy();
  fireEvent.click(within(dialog()).getByRole('button',{name:'Sí, marcar 1'}));
  await waitFor(()=>expect(calls).toHaveLength(5));expect(calls[4].id).toBe('b');
 });
 it('stops at an uncertain result (network or timeout): never says it failed, does not attempt the rest and offers no retry for it',async()=>{
  setup();await show();await expand();
  mocks.postCommunication.mockImplementation(async({id}:{id:string})=>{if(id==='a')throw new CrmApiError('Sin permiso.',403);if(id==='b')throw new CrmApiError('No pudimos confirmar si se guardó. Revisá antes de repetir; lo que escribiste sigue acá.',0);return {ok:true};});
  fireEvent.click(box(asking(),'Seleccionar WhatsApp para Ana'));fireEvent.click(box(asking(),'Seleccionar WhatsApp para Beto'));fireEvent.click(box(asking(),'Seleccionar Instagram para Caro'));
  fireEvent.click(within(asking()).getByRole('button',{name:'No se enviaron (3)'}));
  fireEvent.click(within(dialog()).getByRole('button',{name:'Sí, marcar 3'}));
  const d=await screen.findByRole('dialog',{name:'Resultado'});
  const row=(name:string)=>within(within(d).getByRole('list',{name:'Resultado'})).getByText(new RegExp(name)).closest('li')!.textContent;
  expect(row('Ana')).toContain('Sin permiso.');expect(row('Beto')).toContain('No pudimos confirmar si se guardó.');expect(row('Caro')).toContain('No se intentó');
  expect(mocks.postCommunication).toHaveBeenCalledTimes(2);
  expect(toasts.warning).toHaveBeenCalledWith('0 de 3 marcados. 1 no se pudo marcar. 1 sin confirmar si se guardó. 1 no se intentó.');
  expect(within(d).getByRole('button',{name:'Reintentar los que fallaron (1)'})).toBeTruthy();// Ana only: Beto may be saved, Caro was never tried
  fireEvent.click(within(d).getByRole('button',{name:'Reintentar los que fallaron (1)'}));
  expect(within(within(dialog()).getByRole('list',{name:'Se van a marcar'})).getAllByRole('listitem').map(li=>li.textContent)).toEqual([`WhatsApp · Ana · ${at(10)} · Plan anual`]);
  expect(within(dialog()).getByText('¿Confirmás que este mensaje no se envió?')).toBeTruthy();
 });
 it('closes the result with «Listo» (the dialog X stays «Cerrar»)',async()=>{
  setup();await show();await expand();mocks.postCommunication.mockResolvedValue({ok:true});
  fireEvent.click(box(asking(),'Seleccionar WhatsApp para Ana'));fireEvent.click(box(asking(),'Seleccionar WhatsApp para Beto'));
  fireEvent.click(within(asking()).getByRole('button',{name:'Sí, se enviaron (2)'}));
  fireEvent.click(within(dialog()).getByRole('button',{name:'Sí, marcar 2'}));
  const d=await screen.findByRole('dialog',{name:'Resultado'});expect(crmSuccessText()).toBe('2 de 2 marcados.');
  expect(within(d).getAllByRole('button',{name:'Listo'})).toHaveLength(1);
  fireEvent.click(within(d).getByRole('button',{name:'Listo'}));await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());
 });
 it('toggles «Seleccionar todos» into «Deseleccionar todos» when every box is checked',async()=>{
  setup();await show();await expand();
  fireEvent.click(within(asking()).getByRole('button',{name:'Seleccionar todos (5)'}));
  fireEvent.click(within(asking()).getByRole('button',{name:'Deseleccionar todos'}));
  for(const m of opens)expect(box(asking(),`Seleccionar ${m.channel==='social'?'Instagram':'WhatsApp'} para ${m.recipientName}`).checked).toBe(false);
  expect(within(asking()).queryByRole('button',{name:/^Sí, se enviaron/})).toBeNull();expect(within(asking()).getByRole('button',{name:'Seleccionar todos (5)'})).toBeTruthy();
 });
 it('drops from the selection an open that moved to «Vencidos»: it arrives unchecked there',async()=>{
  setup();await show();await expand();
  fireEvent.click(within(asking()).getByRole('button',{name:'Seleccionar todos (5)'}));
  setup({messages:[beto,caro,dani,eva],expired:[ana,open('o1','Olga',1)]});
  await act(async()=>{await client.invalidateQueries({queryKey:['communication']});});
  await waitFor(()=>expect(within(asking()).getAllByRole('checkbox')).toHaveLength(4));
  expect(within(asking()).getByRole('button',{name:'Sí, se enviaron (4)'})).toBeTruthy();
  fireEvent.click(within(strip()).getByRole('button',{name:'Vencidos · 2'}));
  const expired=within(strip()).getByRole('region',{name:'Vencidos'});
  expect((await within(expired).findByRole('checkbox',{name:'Seleccionar WhatsApp para Ana'}) as HTMLInputElement).checked).toBe(false);expect(within(expired).queryByRole('button',{name:/^Sí, se enviaron/})).toBeNull();
 });
 it('tells an admin who opened each send that is not theirs',async()=>{
  auth.role='admin';setup({messages:[ana,open('z','Zoe',3,{ownerEmail:'otra@example.com'})]});
  mocks.getCommercialDetail.mockResolvedValue({account,contacts:[],opportunities:[{id:'9',opportunityName:'Plan anual',assignedUserEmail:'seller@example.com',estado:'main:contact',deletedAt:null}],users:[{email:'seller@example.com',displayName:'Seller'},{email:'otra@example.com',displayName:'Otra Vendedora'}]});
  await show();await expand();
  fireEvent.click(within(asking()).getByRole('button',{name:'Seleccionar todos (2)'}));
  fireEvent.click(within(asking()).getByRole('button',{name:'No se enviaron (2)'}));
  expect(within(within(dialog()).getByRole('list',{name:'Se van a marcar'})).getAllByRole('listitem').map(li=>li.textContent)).toEqual([`WhatsApp · Ana · ${at(10)} · Plan anual`,`WhatsApp · Zoe · ${at(3)} · Plan anual · abrió Otra Vendedora`]);
 });
 it('offers the same bulk on the opens of «Vencidos»',async()=>{
  setup({messages:[],expired:[open('o1','Olga',1),open('o2','Pía',2)]});await show();await expand();
  fireEvent.click(within(strip()).getByRole('button',{name:'Vencidos · 2'}));
  const expired=within(strip()).getByRole('region',{name:'Vencidos'});
  fireEvent.click(await within(expired).findByRole('button',{name:'Seleccionar todos (2)'}));
  expect(within(expired).getByRole('button',{name:'No se enviaron (2)'})).toBeTruthy();
 });
});

describe('«Sí, se envió» one by one on a send already confirmed (spec 100 §9.4)',()=>{
 it('shows «Este envío ya estaba confirmado.» as information, not as an error, and reloads the lists',async()=>{
  setup({messages:[ana]});await show();await expand();const refresh=vi.spyOn(client,'invalidateQueries');
  mocks.postCommunication.mockRejectedValue(new CrmApiError('Este envío ya estaba confirmado.',409));
  fireEvent.click(within(asking()).getByRole('button',{name:'Sí, se envió'}));
  await waitFor(()=>expect(toasts.info).toHaveBeenCalledWith('Este envío ya estaba confirmado.'));
  expect(refresh).toHaveBeenCalledWith({queryKey:['communication']});expect(within(strip()).queryByRole('alert')).toBeNull();
 });
 it('still shows any other refusal as an error',async()=>{
  setup({messages:[ana]});await show();await expand();
  mocks.postCommunication.mockRejectedValue(new CrmApiError('El negocio está marcado No contactar.',403));
  fireEvent.click(within(asking()).getByRole('button',{name:'Sí, se envió'}));
  expect((await within(strip()).findByRole('alert')).textContent).toBe('El negocio está marcado No contactar.');expect(toasts.info).not.toHaveBeenCalled();
 });
});

describe('runBulkOutcome',()=>{
 it('calls in order, one at a time, and classifies ok, already confirmed and errors (network included) without retrying',async()=>{
  const order:string[]=[];let running=0;
  const post=vi.fn(async({id}:{id:string})=>{running++;expect(running).toBe(1);order.push(id);await Promise.resolve();running--;if(id==='b')throw new CrmApiError('Sin permiso.',403);if(id==='c')throw new CrmApiError('Este envío ya estaba confirmado.',409);if(id==='d')throw new CrmApiError('No pudimos confirmar si se guardó.',0);return {};});
  const progress=vi.fn();
  const results=await runBulkOutcome({ids:['a','b','c','d'],event:'manual_not_sent',post,onProgress:progress});
  expect(order).toEqual(['a','b','c','d']);expect(post).toHaveBeenCalledTimes(4);expect(progress.mock.calls.map(c=>c[0])).toEqual([1,2,3,4]);
  expect(results).toEqual([{id:'a',kind:'ok',text:'Marcado como no enviado'},{id:'b',kind:'error',text:'Sin permiso.'},{id:'c',kind:'already',text:'Ya estaba confirmado'},{id:'d',kind:'uncertain',text:'No pudimos confirmar si se guardó. Revisá antes de repetir.'}]);
 });
 it('stops at the first uncertain result (status 0 or a 5xx) and reports the rest as not attempted',async()=>{
  for(const status of [0,502]){
   const post=vi.fn(async({id}:{id:string})=>{if(id==='b')throw new CrmApiError('x',status);return {};});
   const results=await runBulkOutcome({ids:['a','b','c','d'],event:'manual_sent',post});
   expect(post).toHaveBeenCalledTimes(2);
   expect(results.map(r=>r.kind)).toEqual(['ok','uncertain','skipped','skipped']);expect(results[2].text).toBe('No se intentó');
  }
 });
});

describe('bulkSummary',()=>{
 const r=(...kinds:BulkResult['kind'][])=>kinds.map((kind,i)=>({id:String(i),kind,text:''}));
 it('uses singular forms for one',()=>{
  expect(bulkSummary(r('ok')).text).toBe('1 de 1 marcado.');
  expect(bulkSummary(r('ok','error')).text).toBe('1 de 2 marcado. 1 no se pudo marcar.');
  expect(bulkSummary(r('ok','ok','blocked','error','already')).text).toBe('2 de 5 marcados. 2 no se pudieron marcar. 1 ya estaba confirmado.');
 });
 it('counts an uncertain result apart, never as not marked, and the not attempted ones',()=>{
  const s=bulkSummary(r('ok','uncertain','skipped','skipped'));
  expect(s.text).toBe('1 de 4 marcado. 1 sin confirmar si se guardó. 2 no se intentaron.');expect(s.warn).toBe(true);
  expect(bulkSummary(r('ok','ok')).warn).toBe(false);
 });
});
