import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {MemoryRouter,Route,Routes,useLocation,useNavigate} from 'react-router-dom';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {MantineProvider} from '@mantine/core';
const mocks=vi.hoisted(()=>({businesses:vi.fn(),threads:vi.fn(),detail:vi.fn(),search:vi.fn(),communication:vi.fn(),commercial:vi.fn(),role:'admin'}));
vi.mock('../endpoints/inbox.schema',()=>({getInboxBusinesses:mocks.businesses,getInboxThreads:mocks.threads,getInboxThread:mocks.detail,searchInbox:mocks.search}));
vi.mock('../endpoints/communication.schema',async original=>({...await original<typeof import('../endpoints/communication.schema')>(),getCommunication:mocks.communication}));
vi.mock('../endpoints/commercial.schema',async original=>({...await original<typeof import('../endpoints/commercial.schema')>(),getCommercialDetail:mocks.commercial}));
vi.mock('../helpers/useAuth',()=>({useAuth:()=>({authState:{type:'authenticated',user:{role:mocks.role,email:'a@example.com'}}})}));
import InboxPage,{inboxStage} from './inbox';

function LocationProbe(){const location=useLocation();return <output data-testid="location">{location.pathname+location.search}</output>}
/** Stands in for the browser/OS Back button. */
function HistoryBack(){const navigate=useNavigate();return <button onClick={()=>navigate(-1)}>history-back</button>}
const business=(id:string,name:string,extra={})=>({accountId:id,accountName:name,lastActivityAt:'2026-10-26T13:00:00Z',lastChannel:'email',lastDirection:'out',lastPreview:'Hola',pendingCount:1,...extra});
const thread={leadId:null,leadTitle:'General',channel:'email',lastActivityAt:'2026-10-26T13:00:00Z',messageCount:3,pendingCount:1};
const wrap=(initial='/inbox')=>render(<MantineProvider><QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><MemoryRouter initialEntries={[initial]}><><Routes><Route path="/inbox" element={<InboxPage/>}/></Routes><LocationProbe/><HistoryBack/></></MemoryRouter></QueryClientProvider></MantineProvider>);
const searchBox=()=>screen.getByLabelText('Buscar en todas las conversaciones');
const location=()=>screen.getByTestId('location').textContent;
/** The pane that holds `element`: hidden panes keep the `hidden` CSS-module class. */
const paneHidden=(element:HTMLElement)=>/hidden/.test(element.closest('[class*="pane"]')?.className??'');
const phone=()=>Object.defineProperty(window,'innerWidth',{value:390,writable:true});
beforeEach(()=>{
 Object.defineProperty(window,'innerWidth',{value:1024,writable:true});
 mocks.businesses.mockReset().mockResolvedValue({rows:[business('11','Hotel Norte')],nextCursor:'opaque-b'});
 mocks.threads.mockReset().mockResolvedValue({rows:[thread],accountName:'Hotel Norte'});
 mocks.detail.mockReset().mockResolvedValue({rows:[],nextCursor:null});
 mocks.search.mockReset().mockResolvedValue({rows:[],nextCursor:null});
 mocks.communication.mockReset().mockResolvedValue({messages:[],recentMessages:[],restrictions:[],responses:[],inbound:[],openManagements:[],recentContactHours:72,webhookConfigured:false});
 mocks.commercial.mockReset().mockResolvedValue({account:{id:'11',nombre:'Hotel Norte',assignedUserEmail:'a@example.com',doNotContact:false,archivedAt:null},contacts:[],opportunities:[],users:[]});
 mocks.role='admin';
 window.matchMedia=vi.fn().mockImplementation(query=>({matches:query.includes('max-width: 767px')&&window.innerWidth<=767,media:query,onchange:null,addEventListener:vi.fn(),removeEventListener:vi.fn(),dispatchEvent:vi.fn()}));
 globalThis.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};
});
afterEach(cleanup);

describe('Bandeja businesses «Cargar más»',()=>{
 it('shows loading, ignores a second click and appends the next page',async()=>{
  let resolveNext:(value:unknown)=>void=()=>undefined;
  mocks.businesses.mockImplementation(({cursor}:{cursor?:string})=>cursor?new Promise(resolve=>{resolveNext=resolve}):Promise.resolve({rows:[business('11','Hotel Norte')],nextCursor:'opaque-b'}));
  wrap();
  fireEvent.click(await screen.findByRole('button',{name:'Cargar más'}));
  const busy=await screen.findByRole('button',{name:'Cargando…'});
  expect((busy as HTMLButtonElement).disabled).toBe(true);fireEvent.click(busy);
  expect(mocks.businesses.mock.calls.filter(([params])=>params.cursor).length).toBe(1);
  resolveNext({rows:[business('22','Hotel Sur')],nextCursor:null});
  expect(await screen.findByRole('button',{name:/Hotel Sur/})).toBeTruthy();
  expect(screen.queryByRole('button',{name:'Cargar más'})).toBeNull();
 });
 it('keeps the loaded rows and offers a retry when the next page fails',async()=>{
  mocks.businesses.mockImplementation(({cursor}:{cursor?:string})=>cursor?Promise.reject(new Error('Sin conexión')):Promise.resolve({rows:[business('11','Hotel Norte')],nextCursor:'opaque-b'}));
  wrap();
  fireEvent.click(await screen.findByRole('button',{name:'Cargar más'}));
  expect((await screen.findByRole('alert')).textContent).toContain('No pudimos cargar más negocios');
  expect(screen.getByRole('button',{name:/Hotel Norte/})).toBeTruthy();
  mocks.businesses.mockImplementation(({cursor}:{cursor?:string})=>Promise.resolve(cursor?{rows:[business('22','Hotel Sur')],nextCursor:null}:{rows:[business('11','Hotel Norte')],nextCursor:'opaque-b'}));
  fireEvent.click(screen.getByRole('button',{name:'Cargar más'}));
  expect(await screen.findByRole('button',{name:/Hotel Sur/})).toBeTruthy();
 });
 it('never appends a page of the previous filter to the new list',async()=>{
  let resolveOld:(value:unknown)=>void=()=>undefined;
  mocks.businesses.mockImplementation(({filter,cursor}:{filter:string;cursor?:string})=>filter==='pending'&&cursor?new Promise(resolve=>{resolveOld=resolve}):Promise.resolve(filter==='all'?{rows:[business('33','Hotel Todas')],nextCursor:null}:{rows:[business('11','Hotel Norte')],nextCursor:'opaque-b'}));
  wrap();
  fireEvent.click(await screen.findByRole('button',{name:'Cargar más'}));
  await screen.findByRole('button',{name:'Cargando…'});
  fireEvent.click(screen.getByRole('button',{name:/^Todas/}));
  expect(await screen.findByRole('button',{name:/Hotel Todas/})).toBeTruthy();
  resolveOld({rows:[business('44','Hotel Viejo')],nextCursor:null});
  await new Promise(resolve=>setTimeout(resolve,50));
  expect(screen.queryByRole('button',{name:/Hotel Viejo/})).toBeNull();
 });
});

describe('Bandeja phone stages follow the URL',()=>{
 it('derives the stage from the selection',()=>{
  expect(inboxStage({accountId:null,leadId:null,channel:null})).toBe('list');
  expect(inboxStage({accountId:'11',leadId:null,channel:null})).toBe('threads');
  expect(inboxStage({accountId:'11',leadId:'none',channel:null})).toBe('threads');
  expect(inboxStage({accountId:'11',leadId:'none',channel:'email'})).toBe('detail');
 });
 it('goes back pane by pane with the browser history after drilling in',async()=>{
  phone();wrap();
  fireEvent.click(await screen.findByRole('button',{name:/Hotel Norte/}));
  const general=await screen.findByRole('button',{name:/General/});
  expect(location()).toBe('/inbox?account=11');expect(paneHidden(general)).toBe(false);
  fireEvent.click(general);
  await waitFor(()=>expect(location()).toBe('/inbox?account=11&lead=none&channel=email'));
  expect(paneHidden(screen.getByRole('button',{name:/General/}))).toBe(true);
  fireEvent.click(screen.getByRole('button',{name:'history-back'}));
  await waitFor(()=>expect(location()).toBe('/inbox?account=11'));
  expect(paneHidden(screen.getByRole('button',{name:/General/}))).toBe(false);
  fireEvent.click(screen.getByRole('button',{name:'history-back'}));
  await waitFor(()=>expect(location()).toBe('/inbox'));
  expect(paneHidden(screen.getByRole('button',{name:/Hotel Norte/}))).toBe(false);
 });
 it('in-app back buttons update the URL one level up',async()=>{
  phone();wrap('/inbox?account=11&lead=none&channel=email');
  await screen.findByRole('button',{name:/General/});
  const detailBack=screen.getAllByRole('button',{name:'Volver'}).find(button=>!paneHidden(button))!;
  fireEvent.click(detailBack);
  await waitFor(()=>expect(location()).toBe('/inbox?account=11'));
  const threadsBack=screen.getAllByRole('button',{name:'Volver'}).find(button=>!paneHidden(button))!;
  fireEvent.click(threadsBack);
  await waitFor(()=>expect(location()).toBe('/inbox'));
  expect(screen.queryAllByRole('button',{name:'Volver'}).filter(button=>!paneHidden(button))).toHaveLength(0);
 });
});

describe('Bandeja threads header',()=>{
 it('names a deep-linked business that is not in the loaded list page',async()=>{
  mocks.threads.mockResolvedValue({rows:[thread],accountName:'Hotel Lejano'});
  wrap('/inbox?account=99&lead=none&channel=email');
  const pane=(await screen.findByRole('heading',{name:'Conversaciones del negocio'})).closest('header')!;
  expect(await within(pane).findByText('Hotel Lejano')).toBeTruthy();
  expect(screen.queryByRole('button',{name:/Hotel Lejano/})).toBeNull();
 });
});

describe('Bandeja search input',()=>{
 it('keeps the search filters when the text drops below the minimum and comes back',async()=>{
  wrap();await screen.findAllByText('Hotel Norte');
  fireEvent.change(searchBox(),{target:{value:'quincho'}});
  const results=await screen.findByRole('region',{name:'Resultados de la búsqueda'});
  fireEvent.change(within(results).getByLabelText('Dirección'),{target:{value:'in'}});
  await waitFor(()=>expect(mocks.search).toHaveBeenLastCalledWith(expect.objectContaining({q:'quincho',direction:'in'})));
  fireEvent.change(searchBox(),{target:{value:'qu'}});
  expect(await screen.findByText('Escribí al menos 3 letras')).toBeTruthy();
  fireEvent.change(searchBox(),{target:{value:'quinta'}});
  const again=await screen.findByRole('region',{name:'Resultados de la búsqueda'});
  expect((within(again).getByLabelText('Dirección') as HTMLSelectElement).value).toBe('in');
  await waitFor(()=>expect(mocks.search).toHaveBeenLastCalledWith(expect.objectContaining({q:'quinta',direction:'in'})));
 });
 it('counts visible characters, so «a b» or a lone emoji does not search',async()=>{
  wrap();await screen.findAllByText('Hotel Norte');
  for(const value of ['a b','  a  b ','😀','👍🏽']){
   fireEvent.change(searchBox(),{target:{value}});
   expect(screen.getByText('Escribí al menos 3 letras')).toBeTruthy();
  }
  await new Promise(resolve=>setTimeout(resolve,400));
  expect(mocks.search).not.toHaveBeenCalled();
  fireEvent.change(searchBox(),{target:{value:'a b c'}});
  await waitFor(()=>expect(mocks.search).toHaveBeenCalledWith(expect.objectContaining({q:'a b c'})));
 });
});
