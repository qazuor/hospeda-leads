import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {cleanup,render,screen} from '@testing-library/react';
import {MantineProvider} from '@mantine/core';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {MemoryRouter} from 'react-router-dom';
import {ResourcesPanel} from './ResourcesPanel';
const api=vi.hoisted(()=>({resources:vi.fn(async(..._args:unknown[])=>({documents:[],categories:[],maxDocumentBytes:2097152})),detail:vi.fn(async()=>({opportunities:[]})),work:vi.fn(async()=>({activities:[]})),role:'admin'}));
vi.mock('../endpoints/resources.schema',()=>({getResources:api.resources,postResource:vi.fn()}));
vi.mock('../endpoints/commercial.schema',()=>({getCommercialDetail:api.detail}));
vi.mock('../endpoints/work.schema',()=>({getWork:api.work}));
vi.mock('../helpers/useAuth',()=>({useAuth:()=>({authState:{type:'authenticated',user:{role:api.role,email:'admin@example.com'}}})}));
beforeEach(()=>{api.role='admin';window.matchMedia=vi.fn().mockImplementation(query=>({matches:false,media:query,addEventListener:vi.fn(),removeEventListener:vi.fn(),addListener:vi.fn(),removeListener:vi.fn()}))});
afterEach(()=>{cleanup();vi.clearAllMocks()});
function setup(props:{accountId:string;readOnly?:boolean}){render(<MantineProvider><MemoryRouter><QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><ResourcesPanel {...props}/></QueryClientProvider></MemoryRouter></MantineProvider>)}
describe('ResourcesPanel after the library was retired (spec 89)',()=>{
 it('reads only the business documents and points to «Material de venta»',async()=>{
  setup({accountId:'1'});
  await screen.findByRole('heading',{name:'Documentos del negocio'});
  expect(api.resources).toHaveBeenCalledTimes(1);expect(api.resources).toHaveBeenCalledWith('1','',undefined);
  expect(screen.getByRole('link',{name:'Material de venta'}).getAttribute('href')).toBe('/sales-material');
  expect(screen.queryByRole('button',{name:'Agregar documento'})).toBeNull();
  expect(screen.queryByRole('region',{name:'Vincular material aprobado',hidden:true})).toBeNull();
 });
 it('keeps the own-document form for admins and hides it when read only or for sellers',async()=>{
  setup({accountId:'1'});expect(await screen.findByText('Agregar documento o recurso')).toBeTruthy();cleanup();
  setup({accountId:'1',readOnly:true});await screen.findByRole('heading',{name:'Documentos del negocio'});expect(screen.queryByText('Agregar documento o recurso')).toBeNull();cleanup();
  api.role='user';setup({accountId:'1'});await screen.findByRole('heading',{name:'Documentos del negocio'});expect(screen.queryByText('Agregar documento o recurso')).toBeNull();
 });
});
