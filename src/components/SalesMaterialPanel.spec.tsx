import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {MantineProvider} from '@mantine/core';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import type {SalesMaterial,SalesMaterialList} from '../endpoints/salesMaterials.schema';
import {SalesMaterialPanel} from './SalesMaterialPanel';

const api=vi.hoisted(()=>({list:vi.fn(),post:vi.fn()}));
vi.mock('../endpoints/salesMaterials.schema',async importOriginal=>({...await importOriginal<typeof import('../endpoints/salesMaterials.schema')>(),getSalesMaterials:api.list,postSalesMaterial:api.post}));
const version={id:'v-2',version:2,url:null,fileName:'folleto.pdf',mimeType:'application/pdf',byteSize:2048,actorEmail:'admin@example.com',createdAt:new Date('2026-10-20T12:00:00Z')};
const material=(over:Partial<SalesMaterial>={}):SalesMaterial=>({id:'m-1',title:'Folleto de tarifas',description:'Precios 2027',kind:'deliverable',source:'file',status:'active',archivedAt:null,archivedByEmail:null,revision:3,createdByEmail:'admin@example.com',createdAt:new Date(),updatedAt:new Date(),hasCover:false,categories:[{id:'1',name:'Folletos',active:true}],currentVersion:version,...over});
const data=(materials:SalesMaterial[],storageConfigured=true):SalesMaterialList=>({materials,categories:[{id:'1',name:'Folletos',active:true}],limits:{maxUploadBytes:524288000,maxCoverBytes:1048576,storageConfigured}});
beforeEach(()=>{window.matchMedia=vi.fn().mockImplementation(query=>({matches:false,media:query,addEventListener:vi.fn(),removeEventListener:vi.fn(),addListener:vi.fn(),removeListener:vi.fn()}));Element.prototype.scrollIntoView=vi.fn();});
afterEach(()=>{cleanup();vi.clearAllMocks()});
const setup=(admin:boolean,selectedId?:string)=>render(<MantineProvider><QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><SalesMaterialPanel admin={admin} selectedId={selectedId}/></QueryClientProvider></MantineProvider>);
describe('SalesMaterialPanel',()=>{
 it('lets a seller open and download the current version without administration actions',async()=>{
  api.list.mockResolvedValue(data([material(),material({id:'m-2',title:'Guía interna',kind:'internal',source:'url',currentVersion:{...version,id:'v-9',url:'https://example.com/guia',fileName:null,mimeType:null,byteSize:null}})]));
  setup(false,'m-2');
  const card=await screen.findByRole('article',{name:'Folleto de tarifas'});
  expect(within(card).getByText('Entregable')).toBeTruthy();expect(within(card).getByText('Folletos')).toBeTruthy();expect(within(card).getByText(/folleto\.pdf · 2 KB · versión 2/)).toBeTruthy();
  expect(within(card).getByRole('link',{name:'Abrir'}).getAttribute('href')).toBe('/_api/sales_materials/file?versionId=v-2&disposition=inline');
  expect(within(card).getByRole('link',{name:'Descargar'}).getAttribute('href')).toBe('/_api/sales_materials/file?versionId=v-2&disposition=attachment');
  const internal=screen.getByRole('article',{name:'Guía interna'});expect(within(internal).getByText('Interno')).toBeTruthy();expect(within(internal).getByText('Solo para vendedores: no se manda a clientes.')).toBeTruthy();
  expect(within(internal).getByRole('link',{name:'Abrir enlace'})).toBeTruthy();expect(internal.getAttribute('data-selected')).toBe('true');
  for(const name of ['Nuevo material','Editar','Archivar','Nueva versión'])expect(screen.queryByRole('button',{name})).toBeNull();
  expect(api.list).toHaveBeenCalledWith({search:'',categoryId:undefined,kind:undefined,includeArchived:false});
 });
 it('shows administration actions to admins and archives once with the current revision',async()=>{
  api.list.mockResolvedValue(data([material()]));let release!:()=>void;api.post.mockImplementation(()=>new Promise(resolve=>{release=()=>resolve({ok:true,revision:4})}));
  setup(true);
  expect(await screen.findByRole('button',{name:'Nuevo material'})).toBeTruthy();expect(screen.getByText('Mostrar archivados')).toBeTruthy();
  const archive=await screen.findByRole('button',{name:'Archivar'});fireEvent.click(archive);fireEvent.click(archive);
  await waitFor(()=>expect(screen.getByText('Archivando material…')).toBeTruthy());
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
  fireEvent.change(screen.getByLabelText('Tipo'),{target:{value:'internal'}});fireEvent.change(screen.getByLabelText('Categoría'),{target:{value:'1'}});
  await waitFor(()=>expect(api.list).toHaveBeenLastCalledWith({search:'',categoryId:'1',kind:'internal',includeArchived:false}));
 });
});
