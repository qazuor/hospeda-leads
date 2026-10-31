import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {MantineProvider} from '@mantine/core';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import type {SalesMaterial,SalesMaterialList} from '../endpoints/salesMaterials.schema';
import {SalesMaterialPicker} from './SalesMaterialPicker';

const api=vi.hoisted(()=>({list:vi.fn()}));
vi.mock('../endpoints/salesMaterials.schema',async importOriginal=>({...await importOriginal<typeof import('../endpoints/salesMaterials.schema')>(),getSalesMaterials:api.list}));
beforeEach(()=>{window.matchMedia=vi.fn().mockImplementation(query=>({matches:false,media:query,addEventListener:vi.fn(),removeEventListener:vi.fn(),addListener:vi.fn(),removeListener:vi.fn()}));globalThis.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};});
afterEach(()=>{cleanup();vi.clearAllMocks()});
const item=(id:string,title:string,verticalMatch?:SalesMaterial['verticalMatch']):SalesMaterial=>({id,title,description:'',kind:'deliverable',source:'url',status:'active',archivedAt:null,archivedByEmail:null,revision:1,createdByEmail:'a@example.com',createdAt:new Date(),updatedAt:new Date(),verticals:[],hasCover:false,categories:[],...(verticalMatch!==undefined?{verticalMatch}:{}),currentVersion:{id:'v-'+id,version:1,url:'https://example.com/'+id,fileName:null,mimeType:null,byteSize:null,actorEmail:'a@example.com',createdAt:new Date()}});
const list=(materials:SalesMaterial[],contextVertical:string|null=null):SalesMaterialList=>({materials,truncated:false,categories:[],limits:{maxUploadBytes:1,maxCoverBytes:1,storageConfigured:true,maxEmailAttachmentBytes:1},verticals:['Alojamiento'],contextVertical});
const setup=(context?:{accountId:string;leadId?:string|null})=>render(<MantineProvider env="test"><QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><SalesMaterialPicker opened onClose={vi.fn()} onPick={vi.fn()} context={context}/></QueryClientProvider></MantineProvider>);
const titles=(name:string)=>within(screen.getByRole('list',{name,hidden:true})).getAllByRole('heading',{hidden:true}).map(h=>h.textContent);
describe('SalesMaterialPicker (spec 102 D3)',()=>{
 it('asks for the context vertical and shows its material and the one for all verticals on top, the rest folded',async()=>{
  api.list.mockResolvedValue(list([item('1','Tarifas alojamiento','specific'),item('2','Video general','all'),item('3','Menú gastronomía','other')],'Alojamiento'));
  setup({accountId:'7',leadId:'9'});
  await screen.findByText('Tarifas alojamiento');
  expect(api.list).toHaveBeenCalledWith(expect.objectContaining({forAccountId:'7',forLeadId:'9',kind:'deliverable'}));
  expect(titles('Material entregable')).toEqual(['Tarifas alojamiento','Video general']);
  const fold=screen.getByRole('button',{name:'De otras verticales (1)'});expect(fold.getAttribute('aria-expanded')).toBe('false');
  fireEvent.click(fold);
  await waitFor(()=>expect(fold.getAttribute('aria-expanded')).toBe('true'));
  expect(titles('Material de otras verticales')).toEqual(['Menú gastronomía']);
 });
 it('shows everything unfolded with a note when nothing applies to the vertical',async()=>{
  api.list.mockResolvedValue(list([item('3','Menú gastronomía','other'),item('4','Guía editores','other')],'Alojamiento'));
  setup({accountId:'7'});
  await screen.findByText('Menú gastronomía');
  expect(screen.getByRole('note').textContent).toBe('No hay material marcado para Alojamiento; te mostramos todo.');
  expect(titles('Material entregable')).toEqual(['Menú gastronomía','Guía editores']);
  expect(screen.queryByRole('button',{name:/De otras verticales/})).toBeNull();
 });
 it('opens the other verticals by itself when the search only finds them',async()=>{
  api.list.mockResolvedValue(list([item('3','Menú gastronomía','other')],'Alojamiento'));
  setup({accountId:'7'});
  fireEvent.change(await screen.findByLabelText('Buscar material'),{target:{value:'menú'}});
  await waitFor(()=>expect(api.list).toHaveBeenLastCalledWith(expect.objectContaining({search:'menú'})));
  expect(screen.getByRole('note').textContent).toBe('Lo que buscás solo está en material de otras verticales.');
  expect(titles('Material entregable')).toEqual(['Menú gastronomía']);
 });
 it("keeps today's single list without a known vertical or context",async()=>{
  api.list.mockResolvedValue(list([item('1','Uno'),item('2','Dos')]));
  setup();
  await screen.findByText('Uno');
  expect(api.list.mock.calls[0][0].forAccountId).toBeUndefined();
  expect(titles('Material entregable')).toEqual(['Uno','Dos']);expect(screen.queryByRole('note')).toBeNull();
 });
});
