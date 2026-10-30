import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {MantineProvider} from '@mantine/core';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {SalesMaterialCategories} from './SalesMaterialCategories';

const api=vi.hoisted(()=>({list:vi.fn(),post:vi.fn()}));
vi.mock('../endpoints/salesMaterials.schema',async importOriginal=>({...await importOriginal<typeof import('../endpoints/salesMaterials.schema')>(),getSalesMaterials:api.list,postSalesMaterial:api.post}));
beforeEach(()=>{window.matchMedia=vi.fn().mockImplementation(query=>({matches:false,media:query,addEventListener:vi.fn(),removeEventListener:vi.fn(),addListener:vi.fn(),removeListener:vi.fn()}));
 api.list.mockResolvedValue({materials:[],categories:[{id:'1',name:'Folletos',active:true},{id:'2',name:'Videos viejos',active:false}],limits:{maxUploadBytes:1,maxCoverBytes:1,storageConfigured:true}});api.post.mockResolvedValue({ok:true});});
afterEach(()=>{cleanup();vi.clearAllMocks()});
const setup=()=>render(<MantineProvider><QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><SalesMaterialCategories/></QueryClientProvider></MantineProvider>);
describe('SalesMaterialCategories',()=>{
 it('creates a category with a trimmed name and clears the field',async()=>{
  setup();await screen.findByText('Folletos');
  const field=screen.getByLabelText('Nombre de la categoría') as HTMLInputElement;
  expect((screen.getByRole('button',{name:'Agregar categoría'}) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(field,{target:{value:'  Presentaciones '}});fireEvent.click(screen.getByRole('button',{name:'Agregar categoría'}));
  await screen.findByText('Categoría creada.');expect(api.post).toHaveBeenCalledWith({action:'category_create',name:'Presentaciones'});expect(field.value).toBe('');
 });
 it('deactivates, reactivates and renames without losing the typed name on error',async()=>{
  setup();await screen.findByText('Folletos');expect(screen.getByText('Videos viejos · desactivada')).toBeTruthy();
  fireEvent.click(screen.getAllByRole('button',{name:'Desactivar'})[0]);
  await waitFor(()=>expect(api.post).toHaveBeenCalledWith({action:'category_update',id:'1',name:'Folletos',active:false}));
  fireEvent.click(screen.getByRole('button',{name:'Activar'}));
  await waitFor(()=>expect(api.post).toHaveBeenCalledWith({action:'category_update',id:'2',name:'Videos viejos',active:true}));
  api.post.mockRejectedValueOnce(new Error('Ya existe una categoría con ese nombre.'));
  fireEvent.click(screen.getAllByRole('button',{name:'Renombrar'})[0]);
  const input=screen.getByLabelText('Nuevo nombre') as HTMLInputElement;fireEvent.change(input,{target:{value:'Videos viejos'}});fireEvent.click(screen.getByRole('button',{name:'Guardar nombre'}));
  expect((await screen.findByRole('alert')).textContent).toBe('Ya existe una categoría con ese nombre. Lo que escribiste se conserva.');expect(input.value).toBe('Videos viejos');
 });
});
