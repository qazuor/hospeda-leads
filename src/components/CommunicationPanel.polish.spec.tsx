import React from 'react';
import {afterEach,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {MantineProvider} from '@mantine/core';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
// Spec 91: second pass on the business «Comunicación» tab.
const mocks=vi.hoisted(()=>({getCommunication:vi.fn(),postCommunication:vi.fn(),markCommunicationSeen:vi.fn(),getCommercialDetail:vi.fn(),getPipeline:vi.fn(),getWork:vi.fn(),info:vi.fn(),role:'user'}));
vi.mock('sonner',()=>({toast:{success:vi.fn(),warning:vi.fn(),error:vi.fn(),info:mocks.info}}));
vi.mock('../endpoints/communication.schema',async original=>({...await original<typeof import('../endpoints/communication.schema')>(),getCommunication:mocks.getCommunication,postCommunication:mocks.postCommunication,markCommunicationSeen:mocks.markCommunicationSeen}));
vi.mock('../endpoints/commercial.schema',async original=>({...await original<typeof import('../endpoints/commercial.schema')>(),getCommercialDetail:mocks.getCommercialDetail}));
vi.mock('../endpoints/pipeline.schema',async original=>({...await original<typeof import('../endpoints/pipeline.schema')>(),getPipeline:mocks.getPipeline}));
vi.mock('../endpoints/work.schema',async original=>({...await original<typeof import('../endpoints/work.schema')>(),getWork:mocks.getWork}));
vi.mock('../helpers/useAuth',()=>({useAuth:()=>({authState:{type:'authenticated',user:{id:1,email:'seller@example.com',displayName:'Seller',role:mocks.role}}})}));
import {CommunicationPanel} from './CommunicationPanel';

const day=(d:number,h=12)=>new Date(`2026-10-${String(d).padStart(2,'0')}T${String(h).padStart(2,'0')}:00:00-03:00`);
const message=(id:string,over:Record<string,unknown>={})=>({id,accountId:'5',leadId:null,contactId:null,channel:'whatsapp',recipient:'+5493442123456',recipientName:'Julia',subject:'',body:'Hola Julia',htmlBody:null,textBody:'Hola Julia',templateSnapshot:null,ownerEmail:'seller@example.com',activityId:null,outboxId:null,taskId:null,status:'manual_sent',revision:1,lastInteractionAt:day(2),lastActorEmail:null,createdAt:day(2),updatedAt:day(2),...over});
const inbound=(id:string,over:Record<string,unknown>={})=>({id,channel:'whatsapp',receivedAt:day(3),fromAddress:'+5493442123456',fromName:'Julia',subject:'',textBody:'Gracias, lo vemos',status:'registered',isAutomatic:false,matchMethod:'phone',leadId:null,contextName:'General',linkedMessageId:null,responseId:null,attachments:[],canReply:false,replyAvailable:false,replyRestricted:false,...over});
const account={id:'5',nombre:'Hotel Sol',assignedUserEmail:'seller@example.com',email:'hotel@example.com',telefono:'3447',whatsapp:null,tipo:'Alojamiento',ciudad:'Colón',subtipo:null,archivedAt:null,recontactAt:null,status:'active',doNotContact:false,isClient:false};
const opportunities=[{id:'9',opportunityName:'Plan anual',assignedUserEmail:'seller@example.com',estado:'main:contact',deletedAt:null}];
type Data=Record<string,unknown>;
const followUps=(unconfirmed:Record<string,unknown>[]=[],outcomes:Record<string,unknown>[]=[])=>({unconfirmed:{items:unconfirmed,count:unconfirmed.length},outcomes:{items:outcomes,count:outcomes.length}});
const payload=(data:Data)=>({messages:[],recentMessages:[],restrictions:[],activeRestrictions:[],responses:[],inbound:[],openManagements:[],recentContactHours:72,webhookConfigured:false,...data});
function setup({data={},role='user',accountOver={},contacts=[] as unknown[]}:{data?:Data;role?:string;accountOver?:Record<string,unknown>;contacts?:unknown[]}={}){
 mocks.role=role;
 mocks.getCommunication.mockResolvedValue(payload(data));
 mocks.getCommercialDetail.mockResolvedValue({account:{...account,...accountOver},contacts,opportunities,users:[{email:'seller@example.com',displayName:'Seller'},{email:'other@example.com',displayName:'Otra'}]});
 mocks.getPipeline.mockResolvedValue({stages:[]});mocks.getWork.mockResolvedValue({tasks:[]});mocks.markCommunicationSeen.mockResolvedValue({lastSeenAt:new Date()});
}
let client:QueryClient;
function show(props:React.ComponentProps<typeof CommunicationPanel>={accountId:'5'},reuse=false){if(!reuse)client=new QueryClient({defaultOptions:{queries:{retry:false}}});return render(<MantineProvider env="test"><QueryClientProvider client={client}><CommunicationPanel {...props}/></QueryClientProvider></MantineProvider>);}
const ready=()=>screen.findByRole('region',{name:'Conversación'});
const rowOf=(name:string)=>screen.getByRole('article',{name}).closest('[id^="comm-item-"]') as HTMLElement;
const scrolled:Element[]=[];
let observe:((visible:boolean)=>void)|null=null,observerRoot:Element|Document|null|undefined,resize:(()=>void)|null=null,now=1_000_000;
// The conversation body is the only scroller (spec 91 review 2): its scrollHeight follows the rendered rows (100px each).
const bodyScrolls:{top:number;behavior?:string}[]=[];
const body=()=>screen.getByTestId('conversation-body');
beforeAll(()=>{
 window.matchMedia=window.matchMedia||((query:string)=>({matches:false,media:query,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){},dispatchEvent:()=>false,onchange:null}) as MediaQueryList);
 globalThis.ResizeObserver=class{constructor(callback:()=>void){resize=callback}observe(){}unobserve(){}disconnect(){}} as unknown as typeof ResizeObserver;
 Object.defineProperty(HTMLElement.prototype,'scrollHeight',{configurable:true,get(this:HTMLElement){return this.dataset.testid==='conversation-body'?this.querySelectorAll('li').length*100:0}});
 HTMLElement.prototype.scrollTo=function(this:HTMLElement,options?:ScrollToOptions|number){const o=typeof options==='object'?options:{};if(this.dataset.testid==='conversation-body'){bodyScrolls.push({top:Number(o.top),behavior:o.behavior});this.scrollTop=Number(o.top)}} as typeof HTMLElement.prototype.scrollTo;
 window.scrollTo=vi.fn() as unknown as typeof window.scrollTo;
 vi.spyOn(Date,'now').mockImplementation(()=>now);
 Element.prototype.scrollIntoView=function(this:Element){scrolled.push(this)};
 globalThis.IntersectionObserver=class{constructor(callback:IntersectionObserverCallback,options?:IntersectionObserverInit){observerRoot=options?.root;observe=visible=>callback([{isIntersecting:visible} as IntersectionObserverEntry],this as unknown as IntersectionObserver)}observe(){}unobserve(){}disconnect(){}takeRecords(){return []}root=null;rootMargin='';thresholds=[]} as unknown as typeof IntersectionObserver;
});
beforeEach(()=>{scrolled.length=0;observe=null;observerRoot=undefined;resize=null;bodyScrolls.length=0;now=1_000_000;vi.mocked(window.scrollTo).mockClear();});
afterEach(()=>{cleanup();for(const fn of [mocks.getCommunication,mocks.postCommunication,mocks.markCommunicationSeen,mocks.getCommercialDetail,mocks.getPipeline,mocks.getWork,mocks.info])fn.mockReset();mocks.role='user';});

describe('bubbles, slim lines and the «⋯» menu (§1–§4)',()=>{
 it('shows the management chip only when there is one and moves «Corregir…» into the item menu',async()=>{
  setup({data:{messages:[message('own',{leadId:'9'}),message('call',{channel:'call',status:'manual_no_contact',summary:'Sonó y no atendió',lastInteractionAt:day(3)})]}});show();const conversation=await ready();
  await waitFor(()=>expect(within(conversation).getByText('Gestión: Plan anual')).toBeTruthy());
  expect(within(conversation).queryAllByText('Sin gestión').filter(el=>el.tagName!=='OPTION')).toEqual([]);
  expect(within(conversation).queryByRole('button',{name:/^Corregir/})).toBeNull();
  const call=screen.getByRole('article',{name:'Llamada registrada · No atendió'});
  expect(call.textContent).toMatch(/^\d{2}:\d{2} · Llamada · No atendió · Nosotros · Seller/);expect(within(call).getByText('Sonó y no atendió')).toBeTruthy();
  fireEvent.click(within(call).getByRole('button',{name:'Más acciones · Llamada registrada · No atendió'}));
  fireEvent.click(await screen.findByRole('menuitem',{name:'Corregir cómo salió o el resumen'}));
  expect(await within(call).findByRole('button',{name:'Cancelar corrección'})).toBeTruthy();
 });
 it('opens «Anular registro» from the menu of an automatic registration, without a button on the bubble',async()=>{
  setup({data:{messages:[message('auto',{autoRegistrationId:'reg-1',autoRegistrationUserEmail:'seller@example.com'})]}});show();await ready();
  const sent=screen.getByRole('article',{name:'WhatsApp de Seller · Envío confirmado manualmente'});
  expect(within(sent).queryByRole('button',{name:'Anular registro'})).toBeNull();
  fireEvent.click(within(sent).getByRole('button',{name:/^Más acciones · /}));
  fireEvent.click(await screen.findByRole('menuitem',{name:'Anular registro'}));
  expect(await screen.findByRole('heading',{name:'Anular registro automático'})).toBeTruthy();
 });
 it('puts time, channel, sender, badges and compact actions on one header line above the bubble',async()=>{
  setup({role:'admin',data:{messages:[message('opened',{status:'whatsapp_opened',lastInteractionAt:day(1)}),message('pending',{channel:'email',subject:'Tarifas',status:'unknown',leadId:'9',lastInteractionAt:day(2)}),message('mail',{channel:'email',subject:'Propuesta',status:'accepted',htmlBody:'<p>Hola</p>',lastInteractionAt:day(3)})],inbound:[inbound('review',{status:'pending_review',channel:'social',fromAddress:'@aguasdemo',fromName:'',receivedAt:day(4)})]}});show();await ready();
  const headOf=(name:string)=>screen.getByRole('article',{name}).firstElementChild as HTMLElement;
  const received=screen.getByRole('article',{name:/recibido de @aguasdemo$/}),head=received.firstElementChild as HTMLElement;
  expect(head.textContent).toMatch(/^\d{2}:\d{2}·.+·@aguasdemoPor revisarRegistrar respuestaNo es una respuesta$/);
  expect(within(head).getByRole('button',{name:'Registrar respuesta'})).toBeTruthy();
  // Line 2 is the bubble; no separate tag or status rows remain under it.
  expect(received.children).toHaveLength(2);
  // An opened WhatsApp is not in the conversation until it is confirmed (spec 92 owner decision).
  expect(screen.queryByRole('article',{name:'WhatsApp de Seller · WhatsApp abierto · envío no confirmado'})).toBeNull();
  const pending=headOf('Email de Seller · Resultado incierto · revisar Brevo');
  const status=within(pending).getByText('Resultado incierto · revisar Brevo');expect(status.getAttribute('data-tone')).toBe('unconfirmed');
  expect(within(pending).getByText('Gestión: Plan anual')).toBeTruthy();expect(within(pending).queryByRole('button',{name:'Sí, se envió'})).toBeNull();
  const mail=headOf('Email de Seller · Email aceptado por proveedor · entrega no confirmada');
  fireEvent.click(within(mail).getByRole('button',{name:'Ver diseño del email'}));
  expect(await screen.findByTitle('Vista previa del email')).toBeTruthy();
 });
 it('renders no menu when an item has no secondary action',async()=>{
  setup({data:{inbound:[inbound('in')]}});show();await ready();
  expect(screen.queryByRole('button',{name:/^Más acciones · /})).toBeNull();
 });
});

describe('clamping (§7)',()=>{
 it('clamps a long email with «Ver más» / «Ver menos» and leaves short or medium WhatsApp texts alone',async()=>{
  setup({data:{inbound:[inbound('mail',{channel:'email',subject:'Tarifas',fromName:'Ana',textBody:Array.from({length:9},(_,i)=>'Línea '+i).join('\n')}),inbound('wa8',{fromName:'Bea',textBody:Array.from({length:8},(_,i)=>'Línea '+i).join('\n'),receivedAt:day(4)}),inbound('wa20',{fromName:'Caro',textBody:Array.from({length:20},(_,i)=>'Línea '+i).join('\n'),receivedAt:day(5)})]}});show();await ready();
  const mail=screen.getByRole('article',{name:'Email recibido de Ana'});
  const more=within(mail).getByRole('button',{name:'Ver más'});expect(more.getAttribute('aria-expanded')).toBe('false');
  fireEvent.click(more);expect(within(mail).getByRole('button',{name:'Ver menos'}).getAttribute('aria-expanded')).toBe('true');
  expect(within(screen.getByRole('article',{name:'WhatsApp recibido de Bea'})).queryByRole('button',{name:'Ver más'})).toBeNull();
  expect(within(screen.getByRole('article',{name:'WhatsApp recibido de Caro'})).getByRole('button',{name:'Ver más'})).toBeTruthy();
 });
});

describe('«Mostrar anulados» and the action bar (§5, §6)',()=>{
 it('puts the voided switch apart from the channel chips and keeps the action bar to the three channels, «Registrar» and «Enviar material» (spec 96 §2.2)',async()=>{
  setup({role:'admin',data:{messages:[message('a')]}});show({accountId:'5',onContact:vi.fn(),onSendMaterial:vi.fn()});const conversation=await ready();
  const chips=within(conversation).getByRole('group',{name:'Filtrar la conversación por canal'});
  expect(within(chips).queryByRole('switch')).toBeNull();expect(within(conversation).getByRole('switch',{name:'Mostrar anulados'})).toBeTruthy();
  const bar=screen.getByRole('group',{name:'Acciones de comunicación'});
  await waitFor(()=>expect(within(bar).getAllByRole('button').map(b=>b.textContent)).toEqual(['WhatsApp','Instagram','Email','Registrar','Enviar material']));
 });
});

describe('chat window with its own scroll (§1, §8)',()=>{
 const many=(n:number)=>Array.from({length:n},(_,i)=>message('m'+i,{lastInteractionAt:new Date(day(1).getTime()+i*60000),textBody:'Mensaje '+i}));
 it('frames the conversation: header with the filters, a scrolling body with the items and the footer with «Preparar respuesta»',async()=>{
  setup({data:{messages:[message('a',{leadId:'9'})],inbound:[inbound('b')]}});show({accountId:'5',onContact:vi.fn()});const frame=await ready();
  const [head,scroller,foot]=[...frame.children] as HTMLElement[];
  expect(within(head).getByRole('heading',{name:'Conversación'})).toBeTruthy();expect(within(head).getByRole('group',{name:'Filtrar la conversación por canal'})).toBeTruthy();
  expect(within(head).getByRole('combobox',{name:'Filtrar la conversación por gestión'})).toBeTruthy();
  expect(scroller).toBe(body());expect(within(scroller).getAllByRole('article')).toHaveLength(2);
  expect(within(foot).getByRole('button',{name:'Preparar respuesta'})).toBeTruthy();
  // «Requiere acción» and the action bar stay outside (above) the frame.
  expect(within(frame).queryByRole('group',{name:'Acciones de comunicación'})).toBeNull();
 });
 it('opens at the latest item by scrolling only the body, never the page, and «Ir al último» scrolls the body',async()=>{
  setup({data:{messages:many(3)}});show();await ready();
  await waitFor(()=>expect(bodyScrolls.at(-1)).toEqual({top:300,behavior:'auto'}));
  expect(scrolled).toEqual([]);expect(window.scrollTo).not.toHaveBeenCalled();
  expect(observerRoot).toBe(body());
  expect(screen.queryByRole('button',{name:'Ir al último'})).toBeNull();
  act(()=>observe?.(false));
  fireEvent.click(await screen.findByRole('button',{name:'Ir al último'}));
  expect(bodyScrolls.at(-1)).toEqual({top:300,behavior:'smooth'});expect(scrolled).toEqual([]);
  act(()=>observe?.(true));
  await waitFor(()=>expect(screen.queryByRole('button',{name:'Ir al último'})).toBeNull());
 });
 it('stays at the end while content settles, until the user scrolls the body (wheel)',async()=>{
  setup({data:{messages:many(2)}});show();await ready();
  await waitFor(()=>expect(bodyScrolls).toHaveLength(1));
  act(()=>resize?.());expect(bodyScrolls).toHaveLength(2);
  fireEvent.wheel(body());
  act(()=>resize?.());expect(bodyScrolls).toHaveLength(2);
 });
 it('treats a scroll of the body the code did not start (a scrollbar drag) as the user scrolling, but not a layout clamp',async()=>{
  setup({data:{messages:many(2)}});show();await ready();
  await waitFor(()=>expect(bodyScrolls).toHaveLength(1));
  // Within 1s of the code's own scroll, scroll events are its own.
  fireEvent.scroll(body());act(()=>resize?.());expect(bodyScrolls).toHaveLength(2);
  now+=2000;
  fireEvent.scroll(body());
  act(()=>resize?.());expect(bodyScrolls).toHaveLength(2);
 });
 it('keeps the visible items in place when «Ver anteriores» adds older ones above',async()=>{
  setup({data:{messages:many(33)}});show();await ready();
  await waitFor(()=>expect(bodyScrolls.at(-1)?.top).toBe(3000));
  fireEvent.wheel(body());body().scrollTop=1200;
  fireEvent.click(screen.getByRole('button',{name:'Ver anteriores (3)'}));
  // 1800px were below the top before; with 300px more rows above, the same rows stay in view.
  await waitFor(()=>expect(body().scrollTop).toBe(1500));
  expect(scrolled).toEqual([]);expect(window.scrollTo).not.toHaveBeenCalled();
 });
});

describe('«Requiere acción» summary (§9)',()=>{
 it('keeps «Por revisar» actions on the bubble only and scrolls to it, clearing a filter that hides it',async()=>{
  setup({data:{messages:[message('mail',{channel:'email',subject:'Propuesta',status:'accepted',lastInteractionAt:day(1)})],inbound:[inbound('pending',{status:'pending_review',receivedAt:day(4)})]}});show();await ready();
  const region=screen.getByRole('region',{name:'Requiere acción'});
  expect(within(region).getByText('1 mensaje por revisar')).toBeTruthy();
  expect(within(region).queryByRole('button',{name:'Registrar respuesta'})).toBeNull();
  await waitFor(()=>expect(within(rowOf('WhatsApp recibido de Julia')).getByRole('button',{name:'Registrar respuesta'})).toBeTruthy());
  fireEvent.click(screen.getByRole('button',{name:'Email · 1'}));
  expect(screen.queryByRole('article',{name:'WhatsApp recibido de Julia'})).toBeNull();
  bodyScrolls.length=0;
  fireEvent.click(within(region).getByRole('button',{name:/^WhatsApp de Julia por revisar/}));
  // The body (not the page) scrolls to the item; the frame is in view, so the page does not move.
  await waitFor(()=>expect(bodyScrolls.at(-1)?.behavior).toBe('smooth'));
  expect(scrolled).toEqual([]);expect(window.scrollTo).not.toHaveBeenCalled();
  expect(document.activeElement?.id).toBe('comm-item-in-pending');
  expect(rowOf('WhatsApp recibido de Julia').getAttribute('data-highlight')).toBe('true');
  expect(screen.getByRole('button',{name:'Todo · 2'}).getAttribute('aria-pressed')).toBe('true');
 });
 it('shows an opened WhatsApp only in «Requiere acción», with its text and its own buttons, and one click blocks both',async()=>{
  // Spec 99 §3.6: the entry is the server's unconfirmed send, drawn from the loaded message.
  setup({data:{messages:[message('opened',{status:'whatsapp_opened'})],followUps:followUps([message('opened',{status:'whatsapp_opened'})])}});show();const conversation=await ready();
  const region=screen.getByRole('region',{name:'Requiere acción'});
  expect(within(region).getByText('1 envío sin confirmar')).toBeTruthy();
  expect(within(conversation).queryAllByRole('article')).toEqual([]);expect(within(conversation).queryByText('Hola Julia')).toBeNull();
  const entry=within(region).getByRole('group',{name:'WhatsApp sin confirmar para Julia'});
  expect(within(entry).getByText('¿Lo enviaste?')).toBeTruthy();expect(within(entry).getByText('Hola Julia')).toBeTruthy();
  // Nothing scrolls to a missing item, and WhatsApp has no «Copiar y abrir de nuevo».
  expect(within(entry).queryByRole('button',{name:'Ver en la conversación'})).toBeNull();expect(within(entry).queryByRole('button',{name:'Copiar y abrir de nuevo'})).toBeNull();
  let resolve:(value:unknown)=>void=()=>{};mocks.postCommunication.mockImplementation(()=>new Promise(r=>{resolve=r}));
  fireEvent.click(within(entry).getByRole('button',{name:'No se envió'}));
  await waitFor(()=>expect((within(region).getByRole('button',{name:'Guardando…'}) as HTMLButtonElement).disabled).toBe(true));
  expect((within(region).getByRole('button',{name:'Sí, se envió'}) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(within(region).getByRole('button',{name:'Sí, se envió'}));
  expect(mocks.postCommunication).toHaveBeenCalledTimes(1);expect(mocks.postCommunication.mock.calls[0][0]).toMatchObject({action:'outcome',id:'opened',event:'manual_not_sent'});resolve({});
 });
 it('lists an Instagram attempt while it waits for the echo, with «Sí» / «No» and «Copiar y abrir de nuevo», then asks «¿Lo enviaste?»',async()=>{
  const ig=(id:string,lastInteractionAt:Date)=>message(id,{channel:'social',destinationDetail:'instagram',recipient:'@hotel.sol',recipientName:'Hotel Sol',status:'instagram_opened',lastInteractionAt});
  setup({data:{messages:[ig('waiting',new Date(now-60_000))]}});show();const conversation=await ready();
  expect(within(conversation).queryAllByRole('article')).toEqual([]);
  const region=screen.getByRole('region',{name:'Requiere acción'}),entry=within(region).getByRole('group',{name:'Instagram sin confirmar para Hotel Sol'});
  expect(within(entry).getByRole('status').textContent).toBe('Esperando que Instagram confirme el envío…');
  for(const name of ['Sí, se envió','No se envió','Copiar y abrir de nuevo'])expect(within(entry).getByRole('button',{name})).toBeTruthy();
  // After the wait the server lists it among the unconfirmed sends (spec 99 §3.6).
  cleanup();setup({data:{messages:[ig('late',new Date(now-16*60_000))],followUps:followUps([ig('late',new Date(now-16*60_000))])}});show();await ready();
  const late=within(screen.getByRole('region',{name:'Requiere acción'})).getByRole('group',{name:'Instagram sin confirmar para Hotel Sol'});
  expect(within(late).getByText('¿Lo enviaste?')).toBeTruthy();expect(within(late).queryByRole('status')).toBeNull();
  expect(within(late).getByRole('button',{name:'Copiar y abrir de nuevo'})).toBeTruthy();
 });
 it('keeps the own Instagram entry after the client wait ends until the server lists it, then shows it once',async()=>{
  // Clock skew or a reload still in flight: the server does not list it yet, but «¿Lo enviaste?» must not disappear.
  const ig=message('skew',{channel:'social',destinationDetail:'instagram',recipient:'@hotel.sol',recipientName:'Hotel Sol',status:'instagram_opened',lastInteractionAt:new Date(now-16*60_000)});
  setup({data:{messages:[ig]}});show();await ready();
  let region=screen.getByRole('region',{name:'Requiere acción'});
  expect(within(within(region).getByRole('group',{name:'Instagram sin confirmar para Hotel Sol'})).getByText('¿Lo enviaste?')).toBeTruthy();
  cleanup();setup({data:{messages:[ig],followUps:followUps([ig])}});show();await ready();
  region=screen.getByRole('region',{name:'Requiere acción'});
  expect(within(region).getAllByRole('group',{name:'Instagram sin confirmar para Hotel Sol'})).toHaveLength(1);
  expect(within(region).getByText('1 envío sin confirmar')).toBeTruthy();
 });
 it('shows a «No se envió» send only with «Mostrar anulados»',async()=>{
  setup({role:'admin',data:{messages:[message('not',{status:'manual_not_done',lastInteractionAt:day(2)}),message('ok',{lastInteractionAt:day(3)})]}});show();const conversation=await ready();
  expect(within(conversation).getAllByRole('article').map(a=>a.getAttribute('aria-label'))).toEqual(['WhatsApp de Seller · Envío confirmado manualmente']);
  fireEvent.click(within(conversation).getByRole('switch',{name:'Mostrar anulados'}));
  // The query key changes, so the panel reloads: look the conversation up again.
  await waitFor(()=>expect(within(screen.getByRole('region',{name:'Conversación'})).getAllByRole('article').map(a=>a.getAttribute('aria-label'))).toEqual(['WhatsApp de Seller · No enviado / no realizado','WhatsApp de Seller · Envío confirmado manualmente']));
 });
});

describe('«Preparar respuesta» (§10)',()=>{
 const contacts=[{id:'7',name:'Julia',phone:'+5493442123456',email:null,deletedAt:null}];
 it('opens «Contactar» with the channel and person of the last received message',async()=>{
  const onContact=vi.fn();setup({contacts,data:{inbound:[inbound('old',{channel:'email',fromAddress:'otra@example.com',receivedAt:day(1)}),inbound('last',{receivedAt:day(5)})]}});show({accountId:'5',onContact});await ready();
  const reply=await screen.findByRole('button',{name:'Preparar respuesta'});await waitFor(()=>expect((reply as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(reply);
  expect(onContact).toHaveBeenCalledWith('whatsapp',{contactId:'7'});expect(mocks.info).not.toHaveBeenCalled();
 });
 it('falls back to the normal composer and says why when Instagram cannot be prepared (no username, spec 92)',async()=>{
  const onContact=vi.fn();setup({contacts,data:{inbound:[inbound('ig',{channel:'social',fromAddress:'@hotel'})]}});show({accountId:'5',onContact});await ready();
  const reply=await screen.findByRole('button',{name:'Preparar respuesta'});await waitFor(()=>expect((reply as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(reply);
  expect(onContact).toHaveBeenCalledWith(undefined,undefined);expect(mocks.info).toHaveBeenCalledWith('El negocio no tiene usuario de Instagram cargado: elegí el canal en «Contactar».');
 });
 it('is absent without received messages or on a read-only view, and disabled under No contactar',async()=>{
  setup({data:{messages:[message('a')]}});show({accountId:'5',onContact:vi.fn()});await ready();
  expect(screen.queryByRole('button',{name:'Preparar respuesta'})).toBeNull();
  cleanup();setup({data:{inbound:[inbound('a')]}});show({accountId:'5',readOnly:true,onContact:vi.fn()});await ready();
  expect(screen.queryByRole('button',{name:'Preparar respuesta'})).toBeNull();
  cleanup();setup({accountOver:{doNotContact:true},data:{inbound:[inbound('a')]}});show({accountId:'5',onContact:vi.fn()});await ready();
  await waitFor(()=>expect((screen.getByRole('button',{name:'Preparar respuesta'}) as HTMLButtonElement).disabled).toBe(true));
 });
});

describe('management filter (§11)',()=>{
 it('appears only with two or more values and combines with the channel chips',async()=>{
  setup({data:{messages:[message('plan',{leadId:'9',lastInteractionAt:day(1)}),message('mail',{channel:'email',subject:'Hola',status:'accepted',lastInteractionAt:day(2)})],inbound:[inbound('in',{receivedAt:day(3)})]}});show();const conversation=await ready();
  const select=await within(conversation).findByRole('combobox',{name:'Filtrar la conversación por gestión'}) as HTMLSelectElement;
  expect([...select.options].map(o=>o.textContent)).toEqual(['Todas las gestiones','Plan anual','Sin gestión']);
  fireEvent.change(select,{target:{value:'none'}});
  expect(within(conversation).getAllByRole('article')).toHaveLength(2);
  fireEvent.click(within(conversation).getByRole('button',{name:'WhatsApp · 2'}));
  expect(within(conversation).getAllByRole('article').map(a=>a.getAttribute('aria-label'))).toEqual(['WhatsApp recibido de Julia']);
  fireEvent.change(select,{target:{value:'lead:9'}});
  expect(within(conversation).getAllByRole('article').map(a=>a.getAttribute('aria-label'))).toEqual(['WhatsApp de Seller · Envío confirmado manualmente']);
  cleanup();setup({data:{messages:[message('a')],inbound:[inbound('b')]}});show();
  expect(within(await ready()).queryByRole('combobox',{name:'Filtrar la conversación por gestión'})).toBeNull();
 });
});

describe('«Nuevo desde tu última visita» (§12)',()=>{
 const data={lastSeenAt:day(2,13),messages:[message('old',{lastInteractionAt:day(1)}),message('mine',{lastInteractionAt:day(3)})],inbound:[inbound('new',{receivedAt:day(4)})]};
 it('marks the first item newer than the previous visit that the viewer did not send, and records the visit with the newest item',async()=>{
  setup({data});show();await ready();
  const divider=await screen.findByText('Nuevo desde tu última visita');
  expect(within(divider.closest('li')!).getByRole('article',{name:'WhatsApp recibido de Julia'})).toBeTruthy();
  await waitFor(()=>expect(mocks.markCommunicationSeen).toHaveBeenCalledTimes(1));
  expect(mocks.markCommunicationSeen.mock.calls[0][0]).toEqual({accountId:'5',seenAt:day(4)});
  // A refresh returns the new marker: the divider of this visit stays where it was and nothing is marked again.
  mocks.getCommunication.mockResolvedValue(payload({...data,lastSeenAt:day(4)}));
  await act(()=>client.invalidateQueries({queryKey:['communication']}));
  expect(screen.getByText('Nuevo desde tu última visita')).toBeTruthy();expect(mocks.markCommunicationSeen).toHaveBeenCalledTimes(1);
 });
 it('shows no divider on the first visit and never marks a management view or a server without read state',async()=>{
  setup({data:{...data,lastSeenAt:null}});show();await ready();
  await waitFor(()=>expect(mocks.markCommunicationSeen).toHaveBeenCalledTimes(1));
  expect(screen.queryByText('Nuevo desde tu última visita')).toBeNull();
  cleanup();mocks.markCommunicationSeen.mockClear();setup({data});show({leadId:'9',accountId:'5'});await ready();
  await new Promise(r=>setTimeout(r,20));
  expect(screen.queryByText('Nuevo desde tu última visita')).toBeNull();expect(mocks.markCommunicationSeen).not.toHaveBeenCalled();
  cleanup();setup({data:{...data,lastSeenAt:undefined}});show();await ready();
  await new Promise(r=>setTimeout(r,20));
  expect(mocks.markCommunicationSeen).not.toHaveBeenCalled();
 });
 it('does not repeat the divider when the tab remounts with a cached payload from the previous visit',async()=>{
  setup({data});mocks.markCommunicationSeen.mockResolvedValue({lastSeenAt:day(4)});const first=show();await ready();
  await waitFor(()=>expect(mocks.markCommunicationSeen).toHaveBeenCalledTimes(1));
  await waitFor(()=>expect((client.getQueryData(['communication','account','5',false]) as {lastSeenAt:Date}).lastSeenAt).toEqual(day(4)));
  mocks.getCommunication.mockResolvedValue(payload({...data,lastSeenAt:day(4)}));first.unmount();
  // Same QueryClient, as when switching tabs (`keepMounted={false}`) or leaving the business and coming back.
  show({accountId:'5'},true);await ready();await new Promise(r=>setTimeout(r,20));
  expect(screen.queryByText('Nuevo desde tu última visita')).toBeNull();expect(mocks.markCommunicationSeen).toHaveBeenCalledTimes(1);
 });
 it('takes «previous» only from data fetched after mount, even if the cache was not updated',async()=>{
  setup({data});mocks.markCommunicationSeen.mockRejectedValue(new Error('offline'));const first=show();await ready();
  await waitFor(()=>expect(mocks.markCommunicationSeen).toHaveBeenCalledTimes(1));
  expect((client.getQueryData(['communication','account','5',false]) as {lastSeenAt:Date}).lastSeenAt).toEqual(day(2,13));
  first.unmount();
  let resolve:(value:unknown)=>void=()=>{};mocks.getCommunication.mockImplementation(()=>new Promise(r=>{resolve=r}));
  show({accountId:'5'},true);await ready();
  // The stale cached payload (lastSeenAt T0) renders first but must not become the previous visit.
  expect(screen.queryByText('Nuevo desde tu última visita')).toBeNull();
  await act(async()=>{resolve(payload({...data,lastSeenAt:day(4)}))});
  await new Promise(r=>setTimeout(r,20));
  expect(screen.queryByText('Nuevo desde tu última visita')).toBeNull();
 });
 it('does not mark again when the previous visit already covers the newest item',async()=>{
  setup({data:{...data,lastSeenAt:day(5)}});show();await ready();
  await new Promise(r=>setTimeout(r,20));
  expect(mocks.markCommunicationSeen).not.toHaveBeenCalled();expect(screen.queryByText('Nuevo desde tu última visita')).toBeNull();
 });
});

describe('reading aids: side prefix, legend and the dashed-bubble hint (owner review)',()=>{
 it('prefixes the sender with «Nosotros» for what we sent or did and «Negocio» for what the business sent or replied',async()=>{
  setup({data:{messages:[message('sent',{lastInteractionAt:day(2)}),message('call',{channel:'call',status:'manual_no_contact',lastInteractionAt:day(3)})],inbound:[inbound('in',{receivedAt:day(4)})],responses:[{id:'r',leadId:null,channel:'call',category:'interested',summary:'Le interesa',exactText:null,actorEmail:'seller@example.com',occurredAt:day(5),contextName:'General'}]}});show();await ready();
  const sent=screen.getByRole('article',{name:/^WhatsApp de Seller · /}),received=screen.getByRole('article',{name:/recibido de Julia$/});
  expect((sent.firstElementChild as HTMLElement).textContent).toContain('Nosotros·Seller');
  expect((received.firstElementChild as HTMLElement).textContent).toContain('Negocio·Julia');
  expect(screen.getByRole('article',{name:'Llamada registrada · No atendió'}).textContent).toContain('Nosotros · Seller');
  const response=screen.getAllByRole('article').find(el=>el.textContent?.includes('Negocio · registró Seller'));expect(response).toBeTruthy();
 });
 it('opens «Cómo leer el chat» from the conversation header with the side, background, platform, dashed and box explanations',async()=>{
  setup({data:{messages:[message('sent')]}});show();const conversation=await ready();
  fireEvent.click(within(conversation).getByRole('button',{name:'Cómo leer el chat'}));
  const legend=await screen.findByRole('dialog',{name:'Cómo leer el chat'});
  for(const text of ['Derecha: lo enviamos nosotros. Izquierda: lo envió el negocio.','Teñido: enviado por nosotros. Blanco con borde de color: recibido.','WhatsApp','Instagram','Email','Llamada','Otra red','Una llamada o una respuesta registrada sin mensaje.'])expect(within(legend).getByText(text)).toBeTruthy();
  expect(within(legend).getByText(/Todavía no sabemos si salió/)).toBeTruthy();
  expect(within(legend).getByText(/Un WhatsApp o Instagram abierto que no confirmaste no aparece acá/).textContent).toContain('«Requiere acción»');
 });
 it('explains a dashed bubble whose result is unknown on focus and to screen readers, and leaves confirmed bubbles alone',async()=>{
  setup({data:{messages:[message('opened',{channel:'email',subject:'Tarifas',status:'unknown',lastInteractionAt:day(2)}),message('done',{lastInteractionAt:day(3)})]}});show();await ready();
  const hint='Todavía no sabemos si salió: falta el resultado del envío.';
  const opened=screen.getByRole('article',{name:'Email de Seller · Resultado incierto · revisar Brevo'});
  const bubble=within(opened).getByText('Hola Julia').closest('[aria-describedby]') as HTMLElement;
  expect(document.getElementById(bubble.getAttribute('aria-describedby')!)?.textContent).toBe(hint);
  fireEvent.focus(bubble);expect(await screen.findByRole('tooltip')).toHaveProperty('textContent',hint);
  const done=screen.getByRole('article',{name:'WhatsApp de Seller · Envío confirmado manualmente'});
  expect(within(done).getByText('Hola Julia').closest('[aria-describedby]')).toBeNull();
 });
});
