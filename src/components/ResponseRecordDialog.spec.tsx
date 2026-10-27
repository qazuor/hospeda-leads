import {useState} from 'react';
import {afterEach,beforeAll,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {MantineProvider} from '@mantine/core';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import type {CommunicationDetail,InboundMessage} from '../endpoints/communication.schema';
import type {CommercialDetail} from '../endpoints/commercial.schema';

vi.mock('../endpoints/work.schema',()=>({getWork:vi.fn(async()=>({tasks:[{id:'31',title:'Llamar para confirmar',dueDate:'2026-10-27',status:'pending',leadId:'9'},{id:'32',title:'Tarea solo del negocio',dueDate:'2026-10-28',status:'pending',leadId:null},{id:'33',title:'Tarea de otra gestión',dueDate:'2026-10-29',status:'pending',leadId:'10'}]}))}));
vi.mock('../helpers/useAuth',()=>({useAuth:()=>({authState:{type:'authenticated',user:{id:1,email:'admin@example.com',displayName:'Admin',role:'admin'}}})}));
import {ResponseRecordDialog,type ResponseDialogRequest} from './ResponseRecordDialog';

const inbound:InboundMessage={id:'7a1c2b3a-1111-4222-8333-944455556666',channel:'email',receivedAt:new Date('2026-10-20T12:00:00Z'),fromAddress:'guest@example.com',fromName:'Guest',subject:'Consulta',textBody:'No me escriban más',status:'pending_review',isAutomatic:false,matchMethod:'',leadId:null,contextName:'General',linkedMessageId:null,responseId:null,attachments:[],canReply:false,replyAvailable:false,replyRestricted:false};
const data={messages:[],recentMessages:[],restrictions:[],responses:[],inbound:[inbound],openManagements:[],recentContactHours:72,webhookConfigured:false} as CommunicationDetail;
const detail={account:{id:'5',nombre:'Hotel Sol',assignedUserEmail:'seller@example.com',doNotContact:false,archivedAt:null},contacts:[],opportunities:[{id:'9',opportunityName:'Venta principal',deletedAt:null,assignedUserEmail:'seller@example.com'}],users:[]} as unknown as CommercialDetail;
let seq=0;
function Host(){
 const [request,setRequest]=useState<ResponseDialogRequest|null>(null);
 return <><button onClick={()=>setRequest({seq:++seq,inbound})}>open-inbound</button><button onClick={()=>setRequest({seq:++seq,inbound:null})}>open-free</button><ResponseRecordDialog request={request} onClose={()=>setRequest(null)} data={data} detail={detail} leadId="9"/></>;
}
const mount=()=>render(<MantineProvider><QueryClientProvider client={new QueryClient()}><Host/></QueryClientProvider></MantineProvider>);
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
  expect(category().value).toBe('interested');
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
  fireEvent.change(screen.getByLabelText('Aclaración (contame)'),{target:{value:'Está de viaje'}});
  fireEvent.click(screen.getByRole('button',{name:'Cancelar'}));
  fireEvent.click(screen.getByRole('button',{name:'open-free'}));
  expect(await screen.findByLabelText('¿Por dónde?')).toBeTruthy();
  expect(category().value).toBe('interested');
  expect(screen.queryByLabelText('Aclaración (contame)')).toBeNull();
  expect((screen.getByLabelText('¿Por dónde?') as HTMLSelectElement).value).toBe('call');
  expect((screen.getByLabelText('Texto exacto (opcional)') as HTMLInputElement).value).toBe('');
  expect((screen.getByLabelText('Nombre de quien respondió') as HTMLInputElement).value).toBe('Hotel Sol');
 });
});
