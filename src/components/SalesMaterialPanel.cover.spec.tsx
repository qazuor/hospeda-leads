import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {MantineProvider} from '@mantine/core';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import type {SalesMaterial,SalesMaterialList} from '../endpoints/salesMaterials.schema';
import type {SalesMaterialFormMode} from './SalesMaterialForm';
import {SalesMaterialPanel} from './SalesMaterialPanel';

// Spec 102 block 1: the cover notice of a save carries «Elegir portada», which opens the «Portada» dialog of that material.
const api=vi.hoisted(()=>({list:vi.fn(),success:vi.fn(),warning:vi.fn(),missing:vi.fn()}));
vi.mock('sonner',()=>({toast:{success:api.success,warning:api.warning}}));
vi.mock('../endpoints/salesMaterials.schema',async importOriginal=>({...await importOriginal<typeof import('../endpoints/salesMaterials.schema')>(),getSalesMaterials:api.list}));
// The real form is covered by SalesMaterialForm.spec: here it only reports a save with a cover notice, and shows which mode it was opened in.
// «Generar portadas faltantes» is held open by this fake, to check the panel lock.
vi.mock('../helpers/salesMaterialAutoCover',async importOriginal=>({...await importOriginal<typeof import('../helpers/salesMaterialAutoCover')>(),saveMissingAutoCover:api.missing}));
vi.mock('./SalesMaterialForm',()=>({SalesMaterialForm:({mode,onSaved}:{mode:SalesMaterialFormMode;onSaved:(message:string,notice?:{coverMaterialId:string})=>void})=><div role="dialog" aria-label={mode.type==='cover'?'Portada de «'+mode.material.title+'»':'Nuevo material'}>
 {mode.type==='create'&&<><button onClick={()=>onSaved('Material guardado. La portada automática no se pudo generar: No se pudo leer el PDF.',{coverMaterialId:'m-1'})}>fake save with failure</button><button onClick={()=>onSaved('Material guardado.')}>fake save</button></>}
</div>}));
const version={id:'v-2',version:2,url:null,fileName:'folleto.pdf',mimeType:'application/pdf',byteSize:2048,actorEmail:'admin@example.com',createdAt:new Date('2026-10-20T12:00:00Z')};
const material:SalesMaterial={id:'m-1',title:'Folleto de tarifas',description:'',kind:'deliverable',source:'file',status:'active',archivedAt:null,archivedByEmail:null,revision:3,createdByEmail:'admin@example.com',createdAt:new Date(),updatedAt:new Date(),verticals:[],hasCover:false,coverSource:'manual',categories:[],currentVersion:version};
const data=(materials:SalesMaterial[]):SalesMaterialList=>({materials,truncated:false,categories:[],limits:{maxUploadBytes:524288000,maxCoverBytes:1048576,storageConfigured:true,maxEmailAttachmentBytes:10485760}});
beforeEach(()=>{window.matchMedia=vi.fn().mockImplementation(query=>({matches:false,media:query,addEventListener:vi.fn(),removeEventListener:vi.fn(),addListener:vi.fn(),removeListener:vi.fn()}));Element.prototype.scrollIntoView=vi.fn();globalThis.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};});
afterEach(()=>{cleanup();vi.clearAllMocks()});
const openCreate=async()=>{const button=await screen.findByRole('button',{name:'Nuevo material'});await waitFor(()=>expect((button as HTMLButtonElement).disabled).toBe(false));fireEvent.click(button);};
const setup=()=>render(<MantineProvider><QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><SalesMaterialPanel admin/></QueryClientProvider></MantineProvider>);
describe('SalesMaterialPanel cover notice (spec 102)',()=>{
 it('a cover notice is a warning with «Elegir portada», which opens the «Portada» dialog of that material',async()=>{
  api.list.mockResolvedValue(data([material]));setup();
  await openCreate();fireEvent.click(screen.getByRole('button',{name:'fake save with failure'}));
  await waitFor(()=>expect(api.warning).toHaveBeenCalled());
  const [message,options]=api.warning.mock.calls[0] as [string,{duration:number;action:{label:string;onClick:()=>void}}];
  expect(message).toContain('No se pudo leer el PDF.');expect(options.duration).toBe(10000);expect(options.action.label).toBe('Elegir portada');
  expect(screen.queryByRole('dialog')).toBeNull();
  options.action.onClick();
  expect(await screen.findByRole('dialog',{name:'Portada de «Folleto de tarifas»'})).toBeTruthy();
 });
 it('a material outside the loaded list is fetched before opening its dialog; a plain save is a success without action',async()=>{
  api.list.mockResolvedValueOnce(data([])).mockResolvedValue(data([material]));setup();
  await openCreate();fireEvent.click(screen.getByRole('button',{name:'fake save'}));
  expect(api.success).toHaveBeenCalledWith('Material guardado.');
  await openCreate();fireEvent.click(screen.getByRole('button',{name:'fake save with failure'}));
  await waitFor(()=>expect(api.warning).toHaveBeenCalled());
  (api.warning.mock.calls[0][1] as {action:{onClick:()=>void}}).action.onClick();
  expect(await screen.findByRole('dialog',{name:'Portada de «Folleto de tarifas»'})).toBeTruthy();
 });
 it('«Elegir portada» never replaces an open form nor interrupts a running operation: it says why (spec 102 review)',async()=>{
  api.list.mockResolvedValue(data([material,{...material,id:'m-2',title:'Catálogo',coverSource:null}]));setup();
  await openCreate();fireEvent.click(screen.getByRole('button',{name:'fake save with failure'}));
  await waitFor(()=>expect(api.warning).toHaveBeenCalledTimes(1));const action=(api.warning.mock.calls[0][1] as {action:{onClick:()=>void}}).action;
  // Another form is open (e.g. an upload in progress): it stays.
  await openCreate();action.onClick();
  await waitFor(()=>expect(api.warning).toHaveBeenLastCalledWith('Cerrá la ventana abierta antes de elegir la portada.'));
  expect(screen.getByRole('dialog',{name:'Nuevo material'})).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:'fake save'}));expect(screen.queryByRole('dialog')).toBeNull();
  // «Generar portadas faltantes» is running: the panel lock is held.
  api.missing.mockImplementation(()=>new Promise(()=>undefined));
  fireEvent.click(await screen.findByRole('button',{name:'Generar portadas faltantes (1)'}));await waitFor(()=>expect(api.missing).toHaveBeenCalled());
  action.onClick();
  await waitFor(()=>expect(api.warning).toHaveBeenLastCalledWith('Esperá a que termine la operación en curso antes de elegir la portada.'));
  expect(screen.queryByRole('dialog')).toBeNull();
 });
});
