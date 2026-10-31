import {useState} from 'react';
import {afterEach,beforeAll,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {MantineProvider} from '@mantine/core';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import type {CommunicationDetail,InboundMessage} from '../endpoints/communication.schema';
import type {CommercialDetail} from '../endpoints/commercial.schema';
import type {Message} from '../endpoints/communication.schema';

vi.mock('../endpoints/work.schema',()=>({getWork:vi.fn(async()=>({tasks:[{id:'31',title:'Llamar para confirmar',dueDate:'2026-10-27',status:'pending',leadId:'9'},{id:'32',title:'Tarea solo del negocio',dueDate:'2026-10-28',status:'pending',leadId:null},{id:'33',title:'Tarea de otra gestión',dueDate:'2026-10-29',status:'pending',leadId:'10'}]}))}));
const postCommunication=vi.hoisted(()=>vi.fn(async(..._args:unknown[])=>({id:'r1'})));
vi.mock('../endpoints/communication.schema',async importOriginal=>({...await importOriginal<object>(),postCommunication}));
vi.mock('../helpers/useAuth',()=>({useAuth:()=>({authState:{type:'authenticated',user:{id:1,email:'admin@example.com',displayName:'Admin',role:'admin'}}})}));
import {ResponseRecordDialog,type ResponseDialogRequest} from './ResponseRecordDialog';
import {REAL_SEND_STATUSES,responseSaveBlocker} from '../helpers/responseRecord';
import {CONTACT_EVIDENCE_STATUSES} from '../helpers/contactEvidence';

const inbound:InboundMessage={id:'7a1c2b3a-1111-4222-8333-944455556666',channel:'email',receivedAt:new Date('2026-10-20T12:00:00Z'),fromAddress:'guest@example.com',fromName:'Guest',subject:'Consulta',textBody:'No me escriban más',status:'pending_review',isAutomatic:false,matchMethod:'',leadId:null,contextName:'General',linkedMessageId:null,responseId:null,attachments:[],canReply:false,replyAvailable:false,replyRestricted:false};
const data={messages:[],recentMessages:[],restrictions:[],responses:[],inbound:[inbound],openManagements:[],recentContactHours:72,webhookConfigured:false} as CommunicationDetail;
const detail={account:{id:'5',nombre:'Hotel Sol',assignedUserEmail:'seller@example.com',doNotContact:false,archivedAt:null},contacts:[],opportunities:[{id:'9',opportunityName:'Venta principal',deletedAt:null,assignedUserEmail:'seller@example.com'}],users:[]} as unknown as CommercialDetail;
let seq=0;
function Host({item=inbound,comm=data,biz=detail}:{item?:InboundMessage;comm?:CommunicationDetail;biz?:CommercialDetail}){
 const [request,setRequest]=useState<ResponseDialogRequest|null>(null);
 return <><button onClick={()=>setRequest({seq:++seq,inbound:item})}>open-inbound</button><button onClick={()=>setRequest({seq:++seq,inbound:null})}>open-free</button><ResponseRecordDialog request={request} onClose={()=>setRequest(null)} data={comm} detail={biz} leadId="9"/></>;
}
const mount=(props:Parameters<typeof Host>[0]={})=>render(<MantineProvider><QueryClientProvider client={new QueryClient()}><Host {...props}/></QueryClientProvider></MantineProvider>);
const category=()=>screen.getByLabelText('¿Qué respondió?') as HTMLSelectElement;
const save=()=>screen.getByRole('button',{name:'Guardar respuesta'}) as HTMLButtonElement;
beforeAll(()=>{window.matchMedia=window.matchMedia||((query:string)=>({matches:false,media:query,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){},dispatchEvent:()=>false,onchange:null}) as MediaQueryList);globalThis.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};});
afterEach(cleanup);

describe('ResponseRecordDialog reopening',()=>{
 it('never carries a «do not contact» confirmation over to the next opening',async()=>{
  mount();
  fireEvent.click(screen.getByRole('button',{name:'open-inbound'}));
  await screen.findByText(/Registrás el email recibido de Guest/);
  fireEvent.change(category(),{target:{value:'do_not_contact'}});
  fireEvent.click(screen.getByLabelText(/Confirmo que no se le va a poder contactar/));
  fireEvent.change(screen.getByLabelText('¿Qué te dijo? Resumen (obligatorio)'),{target:{value:'Pidió no ser contactado'}});
  expect(save().disabled).toBe(false);
  fireEvent.click(screen.getByRole('button',{name:'Cancelar'}));
  fireEvent.click(screen.getByRole('button',{name:'open-inbound'}));
  await screen.findByText(/Registrás el email recibido de Guest/);
  expect(category().value).toBe('');
  expect((screen.getByLabelText('¿Qué te dijo? Resumen (obligatorio)') as HTMLInputElement).value).toBe('');
  fireEvent.change(category(),{target:{value:'do_not_contact'}});
  expect((screen.getByLabelText(/Confirmo que no se le va a poder contactar/) as HTMLInputElement).checked).toBe(false);
 });
 it('lists pending tasks for the selected management without preselecting them',async()=>{
  mount();fireEvent.click(screen.getByRole('button',{name:'open-free'}));
  expect(await screen.findByText('¿Esta respuesta resuelve alguna tarea?')).toBeTruthy();
  expect(screen.getByText(/Llamar para confirmar/)).toBeTruthy();
  expect((screen.getByLabelText(/Llamar para confirmar/) as HTMLInputElement).checked).toBe(false);
 });
 it('also lists the pending tasks of the business without management, never those of another management',async()=>{
  mount();fireEvent.click(screen.getByRole('button',{name:'open-free'}));
  expect(await screen.findByLabelText(/Tarea solo del negocio/)).toBeTruthy();
  expect(screen.queryByText(/Tarea de otra gestión/)).toBeNull();
 });
 it('starts a free response from defaults after an inbound one',async()=>{
  mount();
  fireEvent.click(screen.getByRole('button',{name:'open-inbound'}));
  await screen.findByText(/Registrás el email recibido de Guest/);
  fireEvent.change(category(),{target:{value:'other'}});
  fireEvent.change(screen.getByLabelText('Aclaración (obligatorio)'),{target:{value:'Está de viaje'}});
  fireEvent.click(screen.getByRole('button',{name:'Cancelar'}));
  fireEvent.click(screen.getByRole('button',{name:'open-free'}));
  expect(await screen.findByLabelText('¿Por dónde?')).toBeTruthy();
  expect(category().value).toBe('');
  expect(screen.queryByLabelText('Aclaración (obligatorio)')).toBeNull();
  expect((screen.getByLabelText('¿Por dónde?') as HTMLSelectElement).value).toBe('call');
  expect((screen.getByLabelText('Texto exacto (opcional)') as HTMLInputElement).value).toBe('');
  expect((screen.getByLabelText('Nombre de quien respondió') as HTMLInputElement).value).toBe('Hotel Sol');
 });
});

// Spec 99 §3.4: nothing is inferred, what is known is used, and what is shown is what is saved.
const person=(id:string,name:string,over:Record<string,unknown>={})=>({id,name,phone:null,email:null,deletedAt:null,...over});
const sent=(id:string,over:Partial<Message>={}):Message=>({id,accountId:'5',leadId:'9',contactId:null,channel:'whatsapp',recipient:'+54 9 3442 555111',recipientName:'Ana',subject:'',body:'Hola',htmlBody:null,textBody:null,templateSnapshot:null,ownerEmail:'seller@example.com',activityId:null,outboxId:null,taskId:null,status:'manual_sent',revision:1,lastInteractionAt:new Date('2026-10-19T15:30:00Z'),lastActorEmail:null,createdAt:new Date('2026-10-19T15:00:00Z'),updatedAt:new Date('2026-10-19T15:30:00Z'),...over} as Message);
const whatsapp:InboundMessage={...inbound,channel:'whatsapp',fromAddress:'5493442555111',fromName:'Ana',leadId:'9'};
const withPeople=(contacts:unknown[])=>({...detail,contacts} as unknown as CommercialDetail);
const withSends=(messages:Message[])=>({...data,messages} as CommunicationDetail);
const from=()=>screen.getByLabelText('¿De quién vino? (opcional)') as HTMLSelectElement;
const linked=()=>screen.getByLabelText('¿Responde a un mensaje que mandaste? (opcional)') as HTMLSelectElement;
const openInbound=async()=>{fireEvent.click(screen.getByRole('button',{name:'open-inbound'}));await screen.findByText(/Registrás el/);};
describe('ResponseRecordDialog spec 99 §3.4',()=>{
 it('opens without a result and does not let you save until one is chosen',async()=>{
  mount();await openInbound();
  expect(category().value).toBe('');
  const placeholder=[...category().options].find(o=>o.value==='')!;expect(placeholder.textContent).toBe('Elegí qué respondió');expect(placeholder.disabled).toBe(true);
  fireEvent.change(screen.getByLabelText('¿Qué te dijo? Resumen (obligatorio)'),{target:{value:'Pidió precios'}});
  expect(save().disabled).toBe(true);
  fireEvent.change(category(),{target:{value:'later'}});
  expect(save().disabled).toBe(false);
 });
 it('preselects the stored person of the received message',async()=>{
  mount({item:{...whatsapp,contactId:'21'},biz:withPeople([person('20','Bea'),person('21','Ana')])});await openInbound();
  expect(from().value).toBe('21');
 });
 it('without a stored person preselects the only one whose phone matches, never one of two',async()=>{
  mount({item:whatsapp,biz:withPeople([person('20','Bea',{phone:'0343 4111222'}),person('21','Ana',{phone:'03442 555111'})])});await openInbound();
  expect(from().value).toBe('21');
  cleanup();
  mount({item:whatsapp,biz:withPeople([person('20','Bea',{phone:'+5493442555111'}),person('21','Ana',{phone:'03442 555111'})])});await openInbound();
  expect(from().value).toBe('');
 });
 it('lists a WhatsApp sent to a person with «El negocio» chosen, never opens or attempts not done',async()=>{
  mount({item:{...whatsapp,fromAddress:'+5493442000000'},comm:withSends([sent('real',{contactId:'21'}),sent('opened',{status:'whatsapp_opened'}),sent('notdone',{status:'manual_not_done'})]),biz:withPeople([person('21','Ana')])});await openInbound();
  expect(from().value).toBe('');
  const options=[...linked().options].map(o=>o.value);
  expect(options).toEqual(['','real']);
  expect(linked().options[1].textContent).toMatch(/^WhatsApp · Ana \(\+54 9 3442 555111\) · 19 de oct de 2026, 12:30$/);
 });
 it('preselects the only recent send to that address and choosing a send keeps the chosen person',async()=>{
  mount({item:whatsapp,comm:withSends([sent('recent',{contactId:'21'}),sent('old',{lastInteractionAt:new Date('2026-10-10T12:00:00Z')})]),biz:withPeople([person('20','Bea'),person('21','Ana')])});await openInbound();
  expect(linked().value).toBe('recent');
  fireEvent.change(from(),{target:{value:'20'}});
  fireEvent.change(linked(),{target:{value:'old'}});
  expect(from().value).toBe('20');
 });
 it('«Otro» says the clarification is required and why saving is blocked',async()=>{
  mount();await openInbound();
  fireEvent.change(category(),{target:{value:'other'}});
  expect((screen.getByLabelText('Aclaración (obligatorio)') as HTMLInputElement).required).toBe(true);
  expect(responseSaveBlocker({category:'other',recipient:'Ana',summary:'Algo',otherDetail:'',confirmDoNotContact:false,reminder:false,reminderDate:''})).toBe('Contá la aclaración de «Otro».');
  expect(responseSaveBlocker({category:'',recipient:'',summary:'',otherDetail:'',confirmDoNotContact:false,reminder:false,reminderDate:''})).toBe('Elegí qué respondió.');
  expect(responseSaveBlocker({category:'later',recipient:'Ana',summary:'Más adelante',otherDetail:'',confirmDoNotContact:false,reminder:true,reminderDate:''})).toBe('Elegí la fecha del recordatorio.');
  expect(REAL_SEND_STATUSES).toEqual(CONTACT_EVIDENCE_STATUSES);
 });
 it('inbound_register sends the chosen person and send',async()=>{
  postCommunication.mockClear();
  mount({item:whatsapp,comm:withSends([sent('recent',{contactId:'21'})]),biz:withPeople([person('20','Bea'),person('21','Ana',{phone:'03442 555111'})])});await openInbound();
  fireEvent.change(from(),{target:{value:'20'}});
  fireEvent.change(category(),{target:{value:'later'}});
  fireEvent.change(screen.getByLabelText('¿Qué te dijo? Resumen (obligatorio)'),{target:{value:'Pidió precios'}});
  fireEvent.click(save());
  await vi.waitFor(()=>expect(postCommunication).toHaveBeenCalled());
  expect(postCommunication.mock.calls[0][0]).toMatchObject({action:'inbound_register',category:'later',contactId:'20',linkedMessageId:'recent'});
 });
 it('sends exactly what the screen shows: «El negocio», «No, es una respuesta nueva» and the management as explicit values',async()=>{
  postCommunication.mockClear();
  mount({item:{...whatsapp,contactId:'21',linkedMessageId:'recent'},comm:withSends([sent('recent',{contactId:'21'})]),biz:withPeople([person('21','Ana')])});await openInbound();
  expect(from().value).toBe('21');expect(linked().value).toBe('recent');
  fireEvent.change(from(),{target:{value:''}});fireEvent.change(linked(),{target:{value:''}});
  fireEvent.change(category(),{target:{value:'later'}});
  fireEvent.change(screen.getByLabelText('¿Qué te dijo? Resumen (obligatorio)'),{target:{value:'Pidió precios'}});
  fireEvent.click(save());
  await vi.waitFor(()=>expect(postCommunication).toHaveBeenCalled());
  expect(postCommunication.mock.calls[0][0]).toMatchObject({action:'inbound_register',leadId:'9',contactId:null,linkedMessageId:null});
 });
 it('a stored person that was deleted shows and sends «El negocio»',async()=>{
  postCommunication.mockClear();
  mount({item:{...whatsapp,contactId:'21'},biz:withPeople([person('21','Ana',{deletedAt:new Date()})])});await openInbound();
  expect(from().value).toBe('');
  fireEvent.change(category(),{target:{value:'later'}});
  fireEvent.change(screen.getByLabelText('¿Qué te dijo? Resumen (obligatorio)'),{target:{value:'Pidió precios'}});
  fireEvent.click(save());
  await vi.waitFor(()=>expect(postCommunication).toHaveBeenCalled());
  expect(postCommunication.mock.calls[0][0]).toMatchObject({contactId:null});
 });
 it('changing the management clears a chosen send it no longer lists and sends the management shown',async()=>{
  postCommunication.mockClear();
  const two={...withPeople([]),opportunities:[{id:'9',opportunityName:'Venta principal',deletedAt:null},{id:'10',opportunityName:'Renovación',deletedAt:null}]} as unknown as CommercialDetail;
  mount({item:whatsapp,comm:withSends([sent('recent')]),biz:two});await openInbound();
  const management=()=>screen.getByLabelText('¿Sobre qué gestión?') as HTMLSelectElement;
  expect(linked().value).toBe('recent');
  fireEvent.change(management(),{target:{value:''}});
  expect(linked().value).toBe('recent');
  fireEvent.change(management(),{target:{value:'10'}});
  expect(linked().value).toBe('');
  fireEvent.change(category(),{target:{value:'later'}});
  fireEvent.change(screen.getByLabelText('¿Qué te dijo? Resumen (obligatorio)'),{target:{value:'Pidió precios'}});
  fireEvent.click(save());
  await vi.waitFor(()=>expect(postCommunication).toHaveBeenCalled());
  expect(postCommunication.mock.calls[0][0]).toMatchObject({leadId:'10',linkedMessageId:null});
 });
 it('preselects again when the business people load after opening, never over a choice the seller made',async()=>{
  const tree=(biz:CommercialDetail)=><MantineProvider><QueryClientProvider client={client}><Host item={whatsapp} biz={biz}/></QueryClientProvider></MantineProvider>;
  const client=new QueryClient();
  const view=render(tree(withPeople([])));await openInbound();
  expect(from().value).toBe('');
  view.rerender(tree(withPeople([person('21','Ana',{phone:'03442 555111'})])));
  expect(from().value).toBe('21');
  cleanup();
  const again=render(tree(withPeople([person('20','Bea')])));await openInbound();
  fireEvent.change(from(),{target:{value:'20'}});
  again.rerender(tree(withPeople([person('20','Bea'),person('21','Ana',{phone:'03442 555111'})])));
  expect(from().value).toBe('20');
 });
});
