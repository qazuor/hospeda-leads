import {afterEach,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {MantineProvider} from '@mantine/core';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {MemoryRouter} from 'react-router-dom';

const mocks=vi.hoisted(()=>({getCommunication:vi.fn(),getCommercialDetail:vi.fn(),thread:vi.fn(),role:'user'}));
vi.mock('../../endpoints/communication.schema',async original=>({...await original<typeof import('../../endpoints/communication.schema')>(),getCommunication:mocks.getCommunication}));
vi.mock('../../endpoints/commercial.schema',async original=>({...await original<typeof import('../../endpoints/commercial.schema')>(),getCommercialDetail:mocks.getCommercialDetail}));
vi.mock('../../endpoints/inbox.schema',()=>({getInboxThread:mocks.thread}));
vi.mock('../../helpers/useAuth',()=>({useAuth:()=>({authState:{type:'authenticated',user:{id:1,email:'seller@example.com',displayName:'Seller',role:mocks.role}}})}));
import {InboxDetail,INBOX_MESSAGE_NOT_FOUND,MAX_AUTO_PAGES} from './InboxDetail';

const uuid=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const account={id:'5',nombre:'Hotel Sol',assignedUserEmail:'seller@example.com',email:'hotel@example.com',telefono:null,archivedAt:null,status:'active',doNotContact:false,isClient:false};
const event=(n:number,extra={})=>({kind:'in',id:uuid(n),at:`2026-10-${String(10+n%15).padStart(2,'0')}T12:00:00Z`,channel:'email',status:'registered',text:`Mensaje ${n}`,summary:null,authorEmail:null,fromName:'Guest',fromAddress:'guest@example.com',pending:false,dismissed:false,isManualLog:false,replyAvailable:false,replyRestricted:false,subject:'Consulta',isAutomatic:false,linkedMessageId:null,voided:false,autoRegistrationId:null,autoRegistrationUserEmail:null,...extra});
const thread={leadId:null,leadTitle:'General',channel:'email' as const,lastActivityAt:'2026-10-20T12:00:00Z',messageCount:3,pendingCount:0};
function mount(message:string|null=null){
 const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
 render(<MantineProvider><QueryClientProvider client={client}><MemoryRouter><InboxDetail accountId="5" thread={thread} channel="email" message={message}/></MemoryRouter></QueryClientProvider></MantineProvider>);
 return client;
}
beforeAll(()=>{window.matchMedia=window.matchMedia||((query:string)=>({matches:false,media:query,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){},dispatchEvent:()=>false,onchange:null}) as MediaQueryList);globalThis.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};});
beforeEach(()=>{
 mocks.role='user';
 for(const mock of [mocks.getCommunication,mocks.getCommercialDetail,mocks.thread])mock.mockReset();
 mocks.getCommunication.mockResolvedValue({messages:[],recentMessages:[],restrictions:[],activeRestrictions:[],responses:[],inbound:[],openManagements:[],pendingOutcomes:[],recentContactHours:72,webhookConfigured:true});
 mocks.getCommercialDetail.mockResolvedValue({account,contacts:[],opportunities:[],users:[]});
});
afterEach(cleanup);

describe('Bandeja thread pagination',()=>{
 it('keeps every loaded page after an invalidation instead of collapsing to the first one',async()=>{
  mocks.thread.mockImplementation(({cursor}:{cursor?:string})=>Promise.resolve(cursor?{rows:[event(1)],nextCursor:null}:{rows:[event(3),event(2)],nextCursor:'older'}));
  const client=mount();
  fireEvent.click(await screen.findByRole('button',{name:'Cargar anteriores'}));
  expect(await screen.findByText('Mensaje 1')).toBeTruthy();
  await act(async()=>{await client.invalidateQueries({queryKey:['inbox']})});
  await waitFor(()=>expect(mocks.thread.mock.calls.filter(([params])=>params.cursor==='older').length).toBe(2));
  expect(screen.getByText('Mensaje 1')).toBeTruthy();expect(screen.getByText('Mensaje 3')).toBeTruthy();
 });
 it('blocks a second «Cargar anteriores» while the older page loads',async()=>{
  let resolveOlder:(value:unknown)=>void=()=>undefined;
  mocks.thread.mockImplementation(({cursor}:{cursor?:string})=>cursor?new Promise(resolve=>{resolveOlder=resolve}):Promise.resolve({rows:[event(3)],nextCursor:'older'}));
  mount();
  fireEvent.click(await screen.findByRole('button',{name:'Cargar anteriores'}));
  const busy=await screen.findByRole('button',{name:'Cargando…'});
  expect((busy as HTMLButtonElement).disabled).toBe(true);fireEvent.click(busy);
  expect(mocks.thread.mock.calls.filter(([params])=>params.cursor).length).toBe(1);
  resolveOlder({rows:[event(1)],nextCursor:null});
  expect(await screen.findByText('Mensaje 1')).toBeTruthy();
 });
});

describe('Bandeja search target',()=>{
 it('stops loading older pages after an error and retries only by hand',async()=>{
  mocks.thread.mockImplementation(({cursor}:{cursor?:string})=>cursor?Promise.reject(new Error('Sin conexión')):Promise.resolve({rows:[event(3)],nextCursor:'older'}));
  mount(`in:${uuid(1)}`);
  expect((await screen.findByRole('alert')).textContent).toContain('No pudimos cargar los mensajes anteriores');
  await new Promise(resolve=>setTimeout(resolve,100));
  expect(mocks.thread).toHaveBeenCalledTimes(2);
  mocks.thread.mockImplementation(({cursor}:{cursor?:string})=>Promise.resolve(cursor?{rows:[event(1)],nextCursor:null}:{rows:[event(3)],nextCursor:'older'}));
  fireEvent.click(screen.getByRole('button',{name:'Cargar anteriores'}));
  const bubble=(await screen.findByText('Mensaje 1')).closest('article');
  await waitFor(()=>expect(bubble?.getAttribute('data-highlighted')).toBe('true'));
 });
 it(`tells the user when the message is not in the newest ${MAX_AUTO_PAGES} older pages`,async()=>{
  let page=0;
  mocks.thread.mockImplementation(()=>{page++;return Promise.resolve({rows:[event(20-page)],nextCursor:'more-'+page})});
  mount(`in:${uuid(1)}`);
  expect((await screen.findByText(INBOX_MESSAGE_NOT_FOUND)).getAttribute('role')).toBe('status');
  await new Promise(resolve=>setTimeout(resolve,100));
  expect(mocks.thread).toHaveBeenCalledTimes(1+MAX_AUTO_PAGES);
 });
 it('tells the user when the conversation ends without the message',async()=>{
  mocks.thread.mockResolvedValue({rows:[event(3)],nextCursor:null});
  mount(`in:${uuid(1)}`);
  expect(await screen.findByText(INBOX_MESSAGE_NOT_FOUND)).toBeTruthy();
 });
});

describe('Bandeja actions from thread rows',()=>{
 it('offers inbound actions for a message outside the communication window',async()=>{
  mocks.thread.mockResolvedValue({rows:[event(1,{status:'pending_review',pending:true,replyAvailable:true})],nextCursor:null});
  mount();
  expect(await screen.findByRole('button',{name:'Responder'})).toBeTruthy();
  expect(await screen.findByRole('button',{name:'Registrar respuesta'})).toBeTruthy();
  expect(screen.getByRole('button',{name:'Descartar'})).toBeTruthy();
 });
 it('shows the automatic badge and offers «Anular registro» to the registering user on both directions',async()=>{
  mocks.thread.mockResolvedValue({rows:[event(2,{kind:'out',status:'manual_sent',channel:'whatsapp',autoRegistrationId:uuid(9),autoRegistrationUserEmail:'seller@example.com'}),event(1,{autoRegistrationId:uuid(8),autoRegistrationUserEmail:'seller@example.com'})],nextCursor:null});
  mount();
  await waitFor(()=>expect(screen.getAllByText('Automático')).toHaveLength(2));
  await waitFor(()=>expect(screen.getAllByRole('button',{name:'Anular registro'})).toHaveLength(2));
 });
 it('does not offer «Anular registro» to another seller',async()=>{
  mocks.thread.mockResolvedValue({rows:[event(2,{kind:'out',status:'manual_sent',autoRegistrationId:uuid(9),autoRegistrationUserEmail:'other@example.com'})],nextCursor:null});
  mount();
  expect(await screen.findByText('Automático')).toBeTruthy();
  await screen.findByRole('button',{name:'Nuevo mensaje'});
  expect(screen.queryByRole('button',{name:'Anular registro'})).toBeNull();
 });
 it('lets an admin show voided rows greyed with their badge and no actions',async()=>{
  mocks.role='admin';
  mocks.thread.mockImplementation(({includeVoided}:{includeVoided?:string})=>Promise.resolve({rows:includeVoided==='1'?[event(2,{status:'voided',voided:true,text:'Anulado demo'}),event(1)]:[event(1)],nextCursor:null}));
  mount();
  await screen.findByText('Mensaje 1');expect(screen.queryByText('Registro anulado')).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'Anulados'}));
  const bubble=(await screen.findByText('Anulado demo')).closest('article');
  expect(bubble?.getAttribute('data-voided')).toBe('true');
  expect(screen.getByText('Registro anulado')).toBeTruthy();
  expect(bubble?.querySelector('button')).toBeNull();
  expect(mocks.thread).toHaveBeenLastCalledWith(expect.objectContaining({includeVoided:'1'}));
 });
 it('hides the «Anulados» filter from sellers',async()=>{
  mocks.thread.mockResolvedValue({rows:[event(1)],nextCursor:null});
  mount();
  await screen.findByText('Mensaje 1');
  expect(screen.queryByRole('button',{name:'Anulados'})).toBeNull();
 });
});
