import React from 'react';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {MantineProvider} from '@mantine/core';
import {Link,MemoryRouter,Route,Routes,useLocation} from 'react-router-dom';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {basePreferences,preferenceKey,restoredListContext} from '../helpers/businessListPreferences';
import {businessViewSelectionKey} from '../helpers/businessViewSelection';
import {DEFAULT_BUSINESS_COLUMN_GROUPS} from '../helpers/businessColumnGroups';

const api=vi.hoisted(()=>({getDefaults:vi.fn(),getGroups:vi.fn(),getLeads:vi.fn(),getSettings:vi.fn(),getSavedViews:vi.fn(),editor:vi.fn()}));
vi.mock('../helpers/useAuth',()=>({useAuth:()=>({authState:{type:'authenticated',user:{id:8,email:'seller@example.test',role:'user'}}})}));
vi.mock('../endpoints/business_list_defaults.schema',()=>({getBusinessListDefaults:api.getDefaults}));
vi.mock('../endpoints/business_column_groups.schema',()=>({getBusinessColumnGroups:api.getGroups}));
vi.mock('../endpoints/leads_GET.schema',async importOriginal=>({...await importOriginal<typeof import('../endpoints/leads_GET.schema')>(),getLeads:api.getLeads}));
vi.mock('../endpoints/settings_GET.schema',()=>({getSettings:api.getSettings}));
vi.mock('../endpoints/saved_views_GET.schema',()=>({getSavedLeadViews:api.getSavedViews}));
vi.mock('../components/Button',()=>({Button:({children,variant,disabledReason,...props}:React.ButtonHTMLAttributes<HTMLButtonElement>&{variant?:string;disabledReason?:string})=><button {...props}>{children}</button>}));
vi.mock('../components/Checkbox',()=>({Checkbox:({checked,onChange,indeterminate,disabledReason,...props}:React.InputHTMLAttributes<HTMLInputElement>&{indeterminate?:boolean;disabledReason?:string})=><input type="checkbox" checked={checked} onChange={onChange} {...props}/> }));
vi.mock('../components/Input',()=>({Input:(props:React.InputHTMLAttributes<HTMLInputElement>)=><input {...props}/> }));
vi.mock('../components/NativeSelect',()=>({NativeSelect:({children,...props}:React.SelectHTMLAttributes<HTMLSelectElement>)=><select {...props}>{children}</select>}));
vi.mock('../components/Tooltip',()=>({Tooltip:({children}:{children:React.ReactNode})=><>{children}</>,TooltipTrigger:({children}:{children:React.ReactNode})=><>{children}</>,TooltipContent:()=>null,DisabledTooltip:({children}:{children:React.ReactNode})=><>{children}</>}));
vi.mock('../components/Skeleton',()=>({Skeleton:()=> <span/>}));
vi.mock('../components/BusinessCard',()=>({BusinessCard:({row}:{row:{nombre:string}})=><article>{row.nombre}</article>,BusinessCardSkeleton:()=>null,businessCountsSummary:()=>''}));
vi.mock('../components/BusinessRowActions',()=>({BusinessRowActions:()=>null}));
vi.mock('../components/BusinessStickyHeader',()=>({BusinessStickyHeader:({children}:{children:React.ReactNode})=><>{children}</>}));
vi.mock('../components/InlineBusinessBadge',()=>({InlineBusinessBadge:()=>null}));
vi.mock('../components/InlineBusinessStatus',async()=>{const {createPortal}=await import('react-dom');return {InlineBusinessStatus:()=>createPortal(<span>Contenido del editor de estado</span>,document.body)};});
vi.mock('../components/ValueBadge',()=>({ValueBadge:({value}:{value:string})=><span>{value}</span>}));
vi.mock('../components/BusinessPreviewDrawer',()=>({BusinessPreviewDrawer:({row,opened}:{row:{nombre:string}|null;opened:boolean})=>opened&&row?<div role="dialog" aria-label={'Vista previa de '+row.nombre}/>:null}));
vi.mock('../components/CommercialEditor',()=>({CommercialEditor:(props:unknown)=>{api.editor(props);return null;}}));
vi.mock('../components/DataImportDialog',()=>({DataImportDialog:()=>null}));
vi.mock('../components/FilterBuilderDialog',()=>({FilterBuilderDialog:()=>null,FilterLegend:()=>null}));
vi.mock('../components/BusinessListTools',()=>({BusinessListTools:()=>null}));
vi.mock('../components/BusinessListOptions',()=>({BusinessListOptions:()=>null}));
vi.mock('../helpers/liveMode',()=>({LIVE_MANUAL_WHEN_PAGED:{},useLiveModeRefreshing:()=>false,useLivePendingRefresh:()=>({pending:false,clear:vi.fn()})}));
import BusinessListPage from './business-list';

let currentQueryClient:QueryClient;
function defer<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(done=>resolve=done);return {promise,resolve};}
function setup(){currentQueryClient=new QueryClient({defaultOptions:{queries:{retry:false}}});return render(<MantineProvider><QueryClientProvider client={currentQueryClient}><MemoryRouter><BusinessListPage/></MemoryRouter></QueryClientProvider></MantineProvider>);}
function storedPrefs(){const prefs={...basePreferences(),columns:[...basePreferences().columns,'group:contact','group:missing'],widths:{...basePreferences().widths,'group:contact':240,'group:missing':260},pins:{...basePreferences().pins,'group:contact':'left' as const,'group:missing':'right' as const},sortBy:'group:contact',sortDir:'desc'};localStorage.setItem(preferenceKey(8),JSON.stringify({preferences:prefs,context:{page:1,scrollY:0,scrollX:0}}));localStorage.setItem(businessViewSelectionKey(8),JSON.stringify({kind:'system',id:'mine',name:'Mis negocios',baseline:prefs}));localStorage.setItem('hospeda-business-seller-default-v1-user-8','1');return prefs;}

beforeEach(()=>{window.scrollTo=vi.fn();window.matchMedia=vi.fn().mockImplementation(query=>({matches:false,media:query,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}}));globalThis.ResizeObserver=class{observe(){}disconnect(){}unobserve(){}};localStorage.clear();api.getDefaults.mockResolvedValue({defaults:null});api.getSettings.mockResolvedValue({users:[],cities:[],types:[],templates:[],subtypes:[],authorizedEmails:[],opportunityStages:[]});api.getSavedViews.mockResolvedValue({views:[]});api.getLeads.mockResolvedValue({rows:[{id:'-1',accountId:'1',nombre:'Negocio visible',ciudad:'Colón',canModify:false,opportunityCount:0,contactCount:0}],total:1,page:1,pageSize:50,filters:{ciudades:[],estados:[],tipos:[],asignados:[],suscripciones:[],origenes:[],quienesCargaron:[],mediosContacto:[],creadosPor:[]}});});
afterEach(()=>{cleanup();currentQueryClient?.clear();vi.clearAllMocks();});

describe('BusinessListPage group definition availability',()=>{
 it('uses the corrected restoration page when building a persisted list context',()=>{
  expect(restoredListContext({page:9,scrollY:180,scrollX:24},1)).toEqual({page:1,scrollY:180,scrollX:24});
 });
 it('renders rows and preserves group preferences while definitions are delayed, then shows the loaded group',async()=>{
  const prefs=storedPrefs(),pending=defer<{groups:typeof DEFAULT_BUSINESS_COLUMN_GROUPS}>();api.getGroups.mockReturnValue(pending.promise);setup();
  expect(await screen.findByText('Negocio visible')).toBeTruthy();await waitFor(()=>expect(api.getLeads).toHaveBeenCalled());expect(api.getLeads.mock.calls.at(-1)?.[0].sortBy).toBe('nombre');expect(api.getLeads.mock.calls.at(-1)?.[0].sortDir).toBe('desc');expect(Array.from(document.querySelectorAll('th')).find(header=>header.textContent?.includes('Nombre'))?.getAttribute('aria-sort')).toBe('descending');
  expect(JSON.parse(localStorage.getItem(preferenceKey(8))!).preferences).toMatchObject({sortBy:prefs.sortBy,columns:expect.arrayContaining(['group:contact','group:missing']),widths:{'group:contact':240,'group:missing':260},pins:{'group:contact':'left','group:missing':'right'}});expect(JSON.parse(localStorage.getItem(businessViewSelectionKey(8))!).baseline.columns).toContain('group:missing');expect(Array.from(document.querySelectorAll('th')).some(header=>header.textContent?.trim()==='Contacto')).toBe(false);
  await act(async()=>pending.resolve({groups:DEFAULT_BUSINESS_COLUMN_GROUPS}));await waitFor(()=>expect(api.getLeads.mock.calls.at(-1)?.[0].sortBy).toBe('contactName'));await waitFor(()=>expect(JSON.parse(localStorage.getItem(preferenceKey(8))!).preferences.columns).not.toContain('group:missing'));expect(JSON.parse(localStorage.getItem(businessViewSelectionKey(8))!).baseline.columns).not.toContain('group:missing');await waitFor(()=>expect(Array.from(document.querySelectorAll('th')).some(header=>header.textContent?.trim()==='Contacto')).toBe(true));
  const headers=Array.from(document.querySelectorAll('th')),groupHeader=headers.find(header=>header.textContent?.trim()==='Contacto'),memberHeader=headers.find(header=>header.textContent?.includes('Persona de contacto'));
  expect(groupHeader?.getAttribute('aria-sort')).toBe('descending');if(memberHeader)expect(memberHeader.getAttribute('aria-sort')).toBe('none');
 });
 it('keeps rows and stored group references when definitions fail',async()=>{
  const prefs=storedPrefs();api.getGroups.mockRejectedValue(new Error('Grupos no disponibles'));setup();
  expect(await screen.findByText('Negocio visible')).toBeTruthy();await waitFor(()=>expect(api.getGroups).toHaveBeenCalled());expect(api.getLeads.mock.calls.at(-1)?.[0].sortBy).toBe('nombre');expect(api.getLeads.mock.calls.at(-1)?.[0].sortDir).toBe('desc');expect(Array.from(document.querySelectorAll('th')).find(header=>header.textContent?.includes('Nombre'))?.getAttribute('aria-sort')).toBe('descending');expect(Array.from(document.querySelectorAll('th')).some(header=>header.textContent?.trim()==='Contacto')).toBe(false);
  expect(JSON.parse(localStorage.getItem(preferenceKey(8))!).preferences).toMatchObject({sortBy:prefs.sortBy,columns:expect.arrayContaining(['group:contact','group:missing']),widths:{'group:contact':240,'group:missing':260},pins:{'group:contact':'left','group:missing':'right'}});expect(JSON.parse(localStorage.getItem(businessViewSelectionKey(8))!).baseline.columns).toContain('group:missing');
 });
 it('preserves group references during edits while groups are pending and prunes only deleted groups with one preference write',async()=>{
  const prefs=storedPrefs(),pending=defer<{groups:typeof DEFAULT_BUSINESS_COLUMN_GROUPS}>(),setItem=vi.spyOn(Storage.prototype,'setItem');api.getGroups.mockReturnValue(pending.promise);setup();
  expect(await screen.findByText('Negocio visible')).toBeTruthy();fireEvent.click(Array.from(document.querySelectorAll('th')).find(header=>header.textContent?.includes('Ciudad'))!.querySelector('button')!);
  await waitFor(()=>expect(JSON.parse(localStorage.getItem(preferenceKey(8))!).preferences.sortBy).toBe('ciudad'));
  expect(JSON.parse(localStorage.getItem(preferenceKey(8))!).preferences).toMatchObject({columns:expect.arrayContaining(['group:contact','group:missing']),widths:{'group:contact':240,'group:missing':260},pins:{'group:contact':'left','group:missing':'right'}});
  setItem.mockClear();await act(async()=>pending.resolve({groups:DEFAULT_BUSINESS_COLUMN_GROUPS}));
  await waitFor(()=>expect(JSON.parse(localStorage.getItem(preferenceKey(8))!).preferences.columns).not.toContain('group:missing'));
  expect(JSON.parse(localStorage.getItem(preferenceKey(8))!).preferences).toMatchObject({columns:expect.arrayContaining(['group:contact']),widths:{'group:contact':240},pins:{'group:contact':'left'}});
  expect(JSON.parse(localStorage.getItem(preferenceKey(8))!).preferences).not.toHaveProperty('widths.group:missing');expect(JSON.parse(localStorage.getItem(preferenceKey(8))!).preferences).not.toHaveProperty('pins.group:missing');
  expect(setItem.mock.calls.filter(([key])=>key===preferenceKey(8))).toHaveLength(1);setItem.mockRestore();
 });
 it('persists pruned preferences once with the corrected page after restoration settles',async()=>{
  const prefs=storedPrefs(),groups=defer<{groups:typeof DEFAULT_BUSINESS_COLUMN_GROUPS}>(),leads=defer<Awaited<ReturnType<typeof api.getLeads>>>();
  localStorage.setItem(preferenceKey(8),JSON.stringify({preferences:prefs,context:{page:9,scrollY:180,scrollX:24}}));api.getGroups.mockReturnValue(groups.promise);api.getLeads.mockReturnValue(leads.promise);setup();
  const setItem=vi.spyOn(Storage.prototype,'setItem');setItem.mockClear();
  await act(async()=>groups.resolve({groups:DEFAULT_BUSINESS_COLUMN_GROUPS}));await waitFor(()=>expect(Array.from(document.querySelectorAll('th')).some(header=>header.textContent?.trim()==='Contacto')).toBe(true));
  expect(setItem.mock.calls.filter(([key])=>key===preferenceKey(8))).toHaveLength(0);
  Object.defineProperty(window,'scrollY',{configurable:true,value:180});await act(async()=>leads.resolve({rows:[{id:'-1',accountId:'1',nombre:'Negocio visible',ciudad:'Colón',canModify:false,opportunityCount:0,contactCount:0}],total:1,page:1,pageSize:50,anchorPage:1,filters:{ciudades:[],estados:[],tipos:[],asignados:[],suscripciones:[],origenes:[],quienesCargaron:[],mediosContacto:[],creadosPor:[]}}));
  await waitFor(()=>expect(JSON.parse(localStorage.getItem(preferenceKey(8))!).preferences.columns).not.toContain('group:missing'));
  const preferenceWrites=()=>setItem.mock.calls.filter(([key])=>key===preferenceKey(8)).map(([,value])=>JSON.parse(String(value)) as {preferences:typeof prefs;context:{page:number;scrollY:number;scrollX:number}});
  const prunedWrite=(write:{preferences:typeof prefs;context:{page:number;scrollY:number;scrollX:number}})=>!write.preferences.columns.includes('group:missing')&&write.context.page===1&&write.context.scrollY===180&&write.context.scrollX===24;
  await waitFor(()=>expect(preferenceWrites().filter(prunedWrite)).toHaveLength(1));
  fireEvent.click(Array.from(document.querySelectorAll('th')).find(header=>header.textContent?.includes('Ciudad'))!.querySelector('button')!);
  await waitFor(()=>expect(JSON.parse(localStorage.getItem(preferenceKey(8))!).preferences.sortBy).toBe('ciudad'));
  await waitFor(()=>expect(preferenceWrites().some(write=>write.preferences.sortBy==='ciudad')).toBe(true));
  expect(preferenceWrites().filter(prunedWrite)).toHaveLength(1);expect(preferenceWrites().some(write=>write.preferences.sortBy==='ciudad')).toBe(true);setItem.mockRestore();
 });

});

describe('BusinessListPage restoration after a suspended navigation',()=>{
 it('focuses the opened business again when a shell link reveals the list that a pending lazy page only hid',async()=>{
  localStorage.setItem('hospeda-business-seller-default-v1-user-8','1');api.getGroups.mockResolvedValue({groups:[]});currentQueryClient=new QueryClient({defaultOptions:{queries:{retry:false}}});
  // The business page chunk never loads, so React keeps the list mounted but hidden inside the route Suspense.
  const never=new Promise<never>(()=>undefined);function PendingBusiness():React.ReactElement{throw never;}
  render(<MantineProvider><QueryClientProvider client={currentQueryClient}><MemoryRouter initialEntries={['/accounts']}><Link to="/accounts">Negocios</Link><React.Suspense fallback={<p>Cargando página…</p>}><Routes><Route path="/accounts" element={<BusinessListPage/>}/><Route path="/accounts/:accountId" element={<PendingBusiness/>}/></Routes></React.Suspense></MemoryRouter></QueryClientProvider></MantineProvider>);
  fireEvent.click(await screen.findByRole('link',{name:'Negocio visible'},{timeout:10000}));expect(await screen.findByText('Cargando página…')).toBeTruthy();
  const shellLink=screen.getByRole('link',{name:'Negocios'});shellLink.focus();fireEvent.click(shellLink);
  await waitFor(()=>expect(document.activeElement).toBe(screen.getByRole('link',{name:'Negocio visible'})));
 });
});

describe('BusinessListPage row preview',()=>{
 it('opens the preview from the row body but not from the name link or the selection checkbox',async()=>{
  // Arrange
  localStorage.setItem('hospeda-business-seller-default-v1-user-8','1');api.getGroups.mockResolvedValue({groups:[]});setup();
  const name=await screen.findByRole('link',{name:'Negocio visible'});
  const row=name.closest('tr')!;const checkbox=row.querySelector('input[type="checkbox"]')!;const city=Array.from(row.querySelectorAll('td')).find(cell=>cell.textContent?.includes('Colón'))!;
  // Act + Assert: interactive targets keep their own behaviour
  fireEvent.click(checkbox);expect(screen.queryByRole('dialog',{name:'Vista previa de Negocio visible'})).toBeNull();
  name.addEventListener('click',event=>event.preventDefault(),{once:true});fireEvent.click(name);expect(screen.queryByRole('dialog',{name:'Vista previa de Negocio visible'})).toBeNull();
  // Act + Assert: a plain cell opens the preview
  // Act + Assert: a click inside a portal rendered by a cell (inline editor popover) stays out of the row
  fireEvent.click(screen.getByText('Contenido del editor de estado'));expect(screen.queryByRole('dialog',{name:'Vista previa de Negocio visible'})).toBeNull();
  fireEvent.click(city);expect(await screen.findByRole('dialog',{name:'Vista previa de Negocio visible'})).toBeTruthy();
 });
});

describe('«Buscar o crear en el CRM» (spec 98 §17)',{timeout:15000},()=>{
 const empty={rows:[],total:0,page:1,pageSize:50,filters:{ciudades:[],estados:[],tipos:[],asignados:[],suscripciones:[],origenes:[],quienesCargaron:[],mediosContacto:[],creadosPor:[]}};
 // The page mounts the whole Negocios table; under the full parallel suite its first render can exceed the 1 s default (cf. the 10 s wait at the top of this file).
 const slow={timeout:5000};
 // Deterministic start: the search from the link reached getLeads and the panel params left the URL.
 const applied=async(q:string)=>{await waitFor(()=>expect(api.getLeads.mock.calls.at(-1)?.[0].q).toBe(q),slow);await waitFor(()=>expect(screen.getByLabelText('ubicación').textContent).toBe(''),slow);};
 const Where=()=>{const location=useLocation();return <output aria-label="ubicación">{location.search}</output>;};
 // A seller without the marker starts on the default «Mis negocios» view (a filter); these tests start without filters unless they say so.
 const open=(entry:string)=>{if(!localStorage.getItem(preferenceKey(8)))localStorage.setItem('hospeda-business-seller-default-v1-user-8','1');currentQueryClient=new QueryClient({defaultOptions:{queries:{retry:false}}});return render(<MantineProvider><QueryClientProvider client={currentQueryClient}><MemoryRouter initialEntries={[entry]}><BusinessListPage/><Where/></MemoryRouter></QueryClientProvider></MantineProvider>);};
 it('applies the search, clears the params and offers creating with the phone only when nothing is found',async()=>{
  // Arrange
  api.getLeads.mockResolvedValue(empty);
  // Act
  open('/accounts?q=%2B5493442453797&createPhone=%2B5493442453797');
  // Assert
  await applied('+5493442453797');
  const create=await screen.findByRole('button',{name:'Crear negocio con este teléfono'},slow);
  fireEvent.click(create);
  await waitFor(()=>expect(api.editor).toHaveBeenLastCalledWith(expect.objectContaining({createPrefill:{telefono:'+5493442453797'}})),slow);
 });
 it('with an Instagram prefill offers «Crear negocio con este Instagram»; «Nuevo negocio» opens without prefill',async()=>{
  api.getLeads.mockResolvedValue(empty);
  open('/accounts?q=cabanas_del_rio&createInstagram=cabanas_del_rio');
  await applied('cabanas_del_rio');
  fireEvent.click(await screen.findByRole('button',{name:'Crear negocio con este Instagram'},slow));
  await waitFor(()=>expect(api.editor).toHaveBeenLastCalledWith(expect.objectContaining({createPrefill:{instagram:'@cabanas_del_rio'}})),slow);
  fireEvent.click(screen.getAllByRole('button',{name:/Nuevo negocio/})[0]!);
  await waitFor(()=>expect(api.editor).toHaveBeenLastCalledWith(expect.objectContaining({createPrefill:undefined})),slow);
 });
 it('never offers creating when the search finds businesses (the seller picks one), and never opens the dialog by itself',async()=>{
  open('/accounts?q=%2B5493442453797&createPhone=%2B5493442453797');
  expect(await screen.findByText('Negocio visible',undefined,slow)).toBeTruthy();
  await waitFor(()=>expect(screen.getByLabelText('ubicación').textContent).toBe(''),slow);
  expect(screen.queryByRole('button',{name:'Crear negocio con este teléfono'})).toBeNull();expect(api.editor).not.toHaveBeenCalled();
 });
 it('with active filters shows the hint instead of creating (the business may be hidden by them)',async()=>{
  // Arrange
  const prefs={...basePreferences(),filters:[{rules:[{field:'reviewStatus',operator:'is_true'}]}]};
  localStorage.setItem(preferenceKey(8),JSON.stringify({preferences:prefs,context:{page:1,scrollY:0,scrollX:0}}));localStorage.setItem('hospeda-business-seller-default-v1-user-8','1');
  api.getLeads.mockResolvedValue(empty);
  // Act
  open('/accounts?q=%2B5493442453797&createPhone=%2B5493442453797');
  // Assert
  expect(await screen.findByText(/Hay filtros activos que pueden ocultar el negocio/,undefined,slow)).toBeTruthy();
  expect(screen.queryByRole('button',{name:'Crear negocio con este teléfono'})).toBeNull();
  await waitFor(()=>expect(api.getLeads.mock.calls.at(-1)?.[0].q).toBe('+5493442453797'),slow);
  expect(api.getLeads.mock.calls.at(-1)?.[0].filterGroups).toHaveLength(1);
  fireEvent.click(screen.getByRole('button',{name:'Buscar en todos los negocios'}));
  await waitFor(()=>expect(api.getLeads.mock.calls.at(-1)?.[0].filterGroups).toEqual([]),slow);
  expect(api.getLeads.mock.calls.at(-1)?.[0].q).toBe('+5493442453797');
  expect(await screen.findByRole('button',{name:'Crear negocio con este teléfono'},slow)).toBeTruthy();
 });
 it('never offers creating when the latest search failed, even with an empty result kept',async()=>{
  api.getLeads.mockRejectedValue(new Error('Sin conexión'));
  open('/accounts?q=%2B5493442453797&createPhone=%2B5493442453797');
  await waitFor(()=>expect(api.getLeads).toHaveBeenCalled(),slow);
  await waitFor(()=>expect(screen.getByLabelText('ubicación').textContent).toBe(''),slow);
  await waitFor(()=>expect(currentQueryClient.getQueryCache().findAll().some(q=>q.state.status==='error')).toBe(true),slow);
  expect(screen.queryByRole('button',{name:'Crear negocio con este teléfono'})).toBeNull();
 });
 it('without the panel params shows no create-with button',async()=>{
  api.getLeads.mockResolvedValue(empty);
  open('/accounts');
  await screen.findByRole('heading',{name:/^Sin (negocios cargados|resultados)/},slow);
  expect(screen.queryByRole('button',{name:/Crear negocio con este/})).toBeNull();
 });
});

