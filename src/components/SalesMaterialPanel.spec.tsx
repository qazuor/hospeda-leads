import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {MantineProvider} from '@mantine/core';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import type {SalesMaterial,SalesMaterialList} from '../endpoints/salesMaterials.schema';
import {SalesMaterialPanel} from './SalesMaterialPanel';

const api=vi.hoisted(()=>({list:vi.fn(),post:vi.fn(),missing:vi.fn()}));
vi.mock('../helpers/salesMaterialAutoCover',async importOriginal=>({...await importOriginal<typeof import('../helpers/salesMaterialAutoCover')>(),saveMissingAutoCover:api.missing}));
vi.mock('../endpoints/salesMaterials.schema',async importOriginal=>({...await importOriginal<typeof import('../endpoints/salesMaterials.schema')>(),getSalesMaterials:api.list,postSalesMaterial:api.post}));
const version={id:'v-2',version:2,url:null,fileName:'folleto.pdf',mimeType:'application/pdf',byteSize:2048,actorEmail:'admin@example.com',createdAt:new Date('2026-10-20T12:00:00Z')};
const material=(over:Partial<SalesMaterial>={}):SalesMaterial=>({id:'m-1',title:'Folleto de tarifas',description:'Precios 2027',kind:'deliverable',source:'file',status:'active',archivedAt:null,archivedByEmail:null,revision:3,createdByEmail:'admin@example.com',createdAt:new Date(),updatedAt:new Date(),hasCover:false,coverSource:null,categories:[{id:'1',name:'Folletos',active:true}],currentVersion:version,...over});
const data=(materials:SalesMaterial[],storageConfigured=true):SalesMaterialList=>({materials,truncated:false,categories:[{id:'1',name:'Folletos',active:true},{id:'2',name:'Videos',active:true}],limits:{maxUploadBytes:524288000,maxCoverBytes:1048576,storageConfigured,maxEmailAttachmentBytes:10485760}});
beforeEach(()=>{window.matchMedia=vi.fn().mockImplementation(query=>({matches:false,media:query,addEventListener:vi.fn(),removeEventListener:vi.fn(),addListener:vi.fn(),removeListener:vi.fn()}));Element.prototype.scrollIntoView=vi.fn();globalThis.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};});
afterEach(()=>{cleanup();vi.clearAllMocks()});
const setup=(admin:boolean,selectedId?:string)=>render(<MantineProvider><QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><SalesMaterialPanel admin={admin} selectedId={selectedId}/></QueryClientProvider></MantineProvider>);
describe('SalesMaterialPanel',()=>{
 it('lets a seller open and download the current version without administration actions',async()=>{
  api.list.mockResolvedValue(data([material(),material({id:'m-2',title:'Guía interna',kind:'internal',source:'url',currentVersion:{...version,id:'v-9',url:'https://example.com/guia',fileName:null,mimeType:null,byteSize:null}})]));
  setup(false,'m-2');
  const card=await screen.findByRole('article',{name:'Folleto de tarifas'});
  expect(within(card).getByText('Entregable')).toBeTruthy();expect(within(card).getByText('Folletos')).toBeTruthy();expect(within(card).getByText(/folleto\.pdf · 2 KB · versión 2/)).toBeTruthy();
  expect(within(card).getByRole('link',{name:'Abrir'}).getAttribute('href')).toBe('/_api/sales_materials/file?versionId=v-2&disposition=inline');
  fireEvent.click(within(card).getByRole('button',{name:'Más acciones de «Folleto de tarifas»'}));const items=await screen.findAllByRole('menuitem');
  expect(items.map(i=>i.textContent)).toEqual(['Descargar']);expect(items[0].getAttribute('href')).toBe('/_api/sales_materials/file?versionId=v-2&disposition=attachment');
  const internal=screen.getByRole('article',{name:'Guía interna'});expect(within(internal).getByText('Interno')).toBeTruthy();expect(within(internal).getByText('Solo para vendedores: no se manda a clientes.')).toBeTruthy();
  expect(within(internal).getByRole('link',{name:'Abrir enlace'})).toBeTruthy();expect(internal.getAttribute('data-selected')).toBe('true');
  for(const name of ['Nuevo material','Editar','Archivar','Nueva versión','Generar portadas faltantes (1)'])expect(screen.queryByRole('button',{name})).toBeNull();
  expect(screen.queryByLabelText('Archivados')).toBeNull();
  expect(api.list).toHaveBeenCalledWith({search:'',categoryIds:undefined,kind:undefined,includeArchived:false});
 });
 it('shows administration actions to admins and archives once with the current revision',async()=>{
  api.list.mockResolvedValue(data([material()]));let release!:()=>void;api.post.mockImplementation(()=>new Promise(resolve=>{release=()=>resolve({ok:true,revision:4})}));
  setup(true);
  expect(await screen.findByRole('button',{name:'Nuevo material'})).toBeTruthy();expect(screen.getByLabelText('Archivados')).toBeTruthy();
  await screen.findByRole('article',{name:'Folleto de tarifas'});
  const openMenu=async()=>{fireEvent.click(screen.getByRole('button',{name:'Más acciones de «Folleto de tarifas»'}));return screen.findAllByRole('menuitem');};
  const archive=(await openMenu()).find(i=>i.textContent==='Archivar')!;fireEvent.click(archive);fireEvent.click(archive);
  await waitFor(()=>expect(screen.getByText('Archivando material…')).toBeTruthy());
  // While it runs, the other actions are blocked (the menu items too: see SalesMaterialCard.spec).
  expect((screen.getByRole('button',{name:'Nuevo material'}) as HTMLButtonElement).disabled).toBe(true);
  release();await screen.findByText('«Folleto de tarifas» quedó archivado. No se borró nada.');
  expect(api.post).toHaveBeenCalledTimes(1);expect(api.post.mock.calls[0][0]).toEqual({action:'archive',id:'m-1',revision:3});
 });
 it('warns when storage is not configured and disables file links',async()=>{
  api.list.mockResolvedValue(data([material()],false));setup(false);
  expect(await screen.findByText(/Almacenamiento no configurado/)).toBeTruthy();
  expect(screen.queryByRole('link',{name:'Abrir'})).toBeNull();expect((screen.getByRole('button',{name:'Abrir'}) as HTMLButtonElement).disabled).toBe(true);
 });
 it('explains the empty list differently for sellers and admins',async()=>{
  api.list.mockResolvedValue(data([]));setup(false);expect(await screen.findByText(/Lo carga un administrador/)).toBeTruthy();cleanup();
  setup(true);expect(await screen.findByText(/Usá «Nuevo material» para subir el primero/)).toBeTruthy();
 });
 it('sends the filters to the API',async()=>{
  api.list.mockResolvedValue(data([]));setup(true);await screen.findByRole('button',{name:'Nuevo material'});
  fireEvent.click(screen.getByLabelText('Internos'));
  fireEvent.click(screen.getByLabelText('Categorías',{selector:'input'}));fireEvent.click(await screen.findByRole('option',{name:'Folletos',hidden:true}));
  fireEvent.click(screen.getByLabelText('Categorías',{selector:'input'}));fireEvent.click(await screen.findByRole('option',{name:'Videos',hidden:true}));
  await waitFor(()=>expect(api.list).toHaveBeenLastCalledWith({search:'',categoryIds:['1','2'],kind:'internal',includeArchived:false}));
 });
 it('previews images, PDF, video and audio inline and keeps Descargar; office files and links have no preview',async()=>{
  const v=(id:string,fileName:string,mimeType:string)=>({...version,id,fileName,mimeType});
  api.list.mockResolvedValue(data([material({currentVersion:v('v-pdf','f.pdf','application/pdf')}),material({id:'m-img',title:'Foto',currentVersion:v('v-img','f.jpg','image/jpeg')}),material({id:'m-vid',title:'Video',currentVersion:v('v-vid','f.mp4','video/mp4')}),material({id:'m-aud',title:'Audio',currentVersion:v('v-aud','f.mp3','audio/mpeg')}),material({id:'m-doc',title:'Planilla',currentVersion:v('v-doc','f.xlsx','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')})]));
  setup(false);
  const card=await screen.findByRole('article',{name:'Folleto de tarifas'});
  expect(within(screen.getByRole('article',{name:'Planilla'})).queryByRole('button',{name:/Vista previa/})).toBeNull();
  fireEvent.click(within(card).getByRole('button',{name:'Vista previa de «Folleto de tarifas»'}));
  const dialog=await screen.findByRole('dialog');
  expect(within(dialog).getByTitle('PDF: Folleto de tarifas').getAttribute('src')).toBe('/_api/sales_materials/file?versionId=v-pdf&disposition=inline');
  expect(within(dialog).getByRole('link',{name:'Descargar'}).getAttribute('href')).toBe('/_api/sales_materials/file?versionId=v-pdf&disposition=attachment');
  expect(within(dialog).getByText('Precios 2027')).toBeTruthy();
  fireEvent.click(within(dialog).getByRole('button',{name:'Cerrar'}));await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());
  fireEvent.click(within(screen.getByRole('article',{name:'Foto'})).getByRole('button',{name:'Vista previa de «Foto»'}));
  expect((await screen.findByRole('img',{name:'Foto'})).getAttribute('src')).toBe('/_api/sales_materials/file?versionId=v-img&disposition=inline');
 });
 it('hides the preview when storage is not configured',async()=>{
  api.list.mockResolvedValue(data([material()],false));setup(false);await screen.findByRole('article',{name:'Folleto de tarifas'});
  expect(screen.queryByRole('button',{name:/Vista previa/})).toBeNull();
 });
 it('warns when the listing was truncated',async()=>{
  api.list.mockResolvedValue({...data([material()]),truncated:true});setup(false);
  expect((await screen.findByRole('note')).textContent).toContain('Hay más material del que se muestra');
 });
 it('groups the list by category in collapsible sections with a count, «Sin categoría» last and multi-category material under each',async()=>{
  const both=[{id:'1',name:'Folletos',active:true},{id:'2',name:'Videos',active:true}];
  api.list.mockResolvedValue(data([material({id:'m-a',title:'Sin cat',categories:[]}),material({id:'m-b',title:'Promo',categories:both}),material({id:'m-c',title:'Spot',categories:[both[1]]})]));
  setup(false,'m-b');
  const titles=(await screen.findAllByRole('heading',{level:2})).map(h=>h.textContent);
  expect(titles).toEqual(['Folletos1','Videos2','Sin categoría1']);
  expect(screen.getAllByRole('article',{name:'Promo'})).toHaveLength(2);expect(document.querySelectorAll('#material-m-b')).toHaveLength(1);
  const videos=screen.getByRole('button',{name:'Videos 2'});expect(videos.getAttribute('aria-expanded')).toBe('true');
  fireEvent.click(videos);expect(videos.getAttribute('aria-expanded')).toBe('false');expect(screen.queryByRole('article',{name:'Spot'})).toBeNull();
  fireEvent.click(videos);expect(screen.getByRole('article',{name:'Spot'})).toBeTruthy();
 });
 it('with a category filter shows only its sections; format and «Archivados» filter the list; «Limpiar filtros» resets everything',async()=>{
  const both=[{id:'1',name:'Folletos',active:true},{id:'2',name:'Videos',active:true}];
  const video={...version,id:'v-vid',fileName:'spot.mp4',mimeType:'video/mp4'};
  api.list.mockImplementation(async(q:{includeArchived:boolean;categoryIds?:string[]})=>data(q.includeArchived?[material({id:'m-x',title:'Viejo',status:'archived',archivedAt:new Date()}),material({id:'m-y',title:'Vigente'})]:q.categoryIds?[material({id:'m-b',title:'Promo',categories:both})]:[material({id:'m-b',title:'Promo',categories:both}),material({id:'m-c',title:'Spot',categories:[both[1]],currentVersion:video})]));
  setup(true);await screen.findByRole('article',{name:'Spot'});
  expect(screen.queryByRole('button',{name:'Limpiar filtros'})).toBeNull();
  fireEvent.change(screen.getByLabelText('Formato'),{target:{value:'video'}});
  expect(screen.queryByRole('article',{name:'Promo'})).toBeNull();expect(screen.getAllByRole('heading',{level:2}).map(h=>h.textContent)).toEqual(['Videos1']);
  fireEvent.click(screen.getByRole('button',{name:'Limpiar filtros'}));
  await waitFor(()=>expect(screen.getAllByRole('article',{name:'Promo'})).toHaveLength(2));expect(screen.queryByRole('button',{name:'Limpiar filtros'})).toBeNull();
  fireEvent.click(screen.getByLabelText('Categorías',{selector:'input'}));fireEvent.click(await screen.findByRole('option',{name:'Videos',hidden:true}));
  await waitFor(()=>expect(screen.getAllByRole('heading',{level:2}).map(h=>h.textContent)).toEqual(['Videos1']));
  fireEvent.click(screen.getByRole('button',{name:'Limpiar filtros'}));
  fireEvent.click(screen.getByLabelText('Archivados'));
  await screen.findByRole('article',{name:'Viejo'});expect(screen.queryByRole('article',{name:'Vigente'})).toBeNull();
  expect(api.list).toHaveBeenLastCalledWith({search:'',categoryIds:undefined,kind:undefined,includeArchived:true});
  fireEvent.click(screen.getByRole('button',{name:'Limpiar filtros'}));
  await waitFor(()=>expect(api.list).toHaveBeenLastCalledWith({search:'',categoryIds:undefined,kind:undefined,includeArchived:false}));
 });
 it('lets admins generate the missing covers one by one and reports failures without blocking',async()=>{
  const video={...version,id:'v-vid',fileName:'spot.mp4',mimeType:'video/mp4'};
  api.list.mockResolvedValue(data([material(),material({id:'m-2',title:'Spot',currentVersion:video}),material({id:'m-3',title:'Con tapa',hasCover:true,coverSource:'manual'}),material({id:'m-4',title:'Foto chica',currentVersion:{...version,id:'v-img',fileName:'f.jpg',mimeType:'image/jpeg',byteSize:2048}})]));
  let release!:()=>void;api.missing.mockImplementationOnce(()=>new Promise(resolve=>{release=()=>resolve({ok:true})})).mockResolvedValueOnce({ok:false});
  setup(true);
  const button=await screen.findByRole('button',{name:'Generar portadas faltantes (2)'});fireEvent.click(button);fireEvent.click(button);
  expect(await screen.findByText('Generando portadas… 1 de 2')).toBeTruthy();expect((screen.getByRole('button',{name:'Nuevo material'}) as HTMLButtonElement).disabled).toBe(true);
  release();
  expect(await screen.findByText('Se generó 1 portada. 1 material no se pudo procesar y muestra el dibujo de su formato.')).toBeTruthy();
  expect(api.missing).toHaveBeenCalledTimes(2);expect(api.missing.mock.calls.map(c=>c[0].material.id)).toEqual(['m-1','m-2']);
 });
 it('offers no cover generation without storage',async()=>{
  api.list.mockResolvedValue(data([material()],false));setup(true);await screen.findByRole('article',{name:'Folleto de tarifas'});
  expect(screen.queryByRole('button',{name:/Generar portadas faltantes/})).toBeNull();
 });
});
