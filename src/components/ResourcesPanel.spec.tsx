import React from 'react';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {MantineProvider} from '@mantine/core';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {ResourcesPanel} from './ResourcesPanel';
const api=vi.hoisted(()=>({resources:vi.fn(async()=>({documents:[],categories:[],maxDocumentBytes:2097152})),detail:vi.fn(async()=>({opportunities:[]})),work:vi.fn(async()=>({activities:[]}))}));
vi.mock('../endpoints/resources.schema',()=>({getResources:api.resources,postResource:vi.fn()}));
vi.mock('../endpoints/commercial.schema',()=>({getCommercialDetail:api.detail,getCommercialList:vi.fn(async()=>({rows:[]}))}));
vi.mock('../endpoints/work.schema',()=>({getWork:api.work}));
vi.mock('../helpers/useAuth',()=>({useAuth:()=>({authState:{type:'authenticated',user:{role:'admin',email:'admin@example.com'}}})}));
vi.mock('./ResourceLinkForm',()=>({ResourceLinkForm:({onLinked,onStateChange,onRetry,error}:{onLinked:()=>void;onRetry:()=>void;error:Error|null;onStateChange:(busy:boolean,error:boolean,confirmation:string)=>void})=><section role="region" aria-label="Vincular material aprobado">{error&&<button onClick={onRetry}>Reintentar biblioteca</button>}<button onClick={()=>onStateChange(true,false,'')}>Set busy</button><button onClick={()=>onStateChange(false,true,'')}>Set error</button><button onClick={()=>{onStateChange(false,false,'«Folleto» quedó vinculado. No se envió al cliente.');onLinked()}}>Link success</button></section>}));
beforeEach(()=>{window.matchMedia=vi.fn().mockImplementation(query=>({matches:false,media:query,addEventListener:vi.fn(),removeEventListener:vi.fn(),addListener:vi.fn(),removeListener:vi.fn()}))});
afterEach(()=>{cleanup();vi.clearAllMocks()});
function setup(props:{accountId?:string;readOnly?:boolean}={accountId:'1'}){render(<MantineProvider><QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><ResourcesPanel {...props}/></QueryClientProvider></MantineProvider>)}
describe('ResourcesPanel on demand form',()=>{
 it('shows the toggle only for editable business records and keeps the form mounted hidden',async()=>{setup({accountId:'1'});const toggle=await screen.findByRole('button',{name:'Agregar documento'});expect(toggle.getAttribute('aria-expanded')).toBe('false');expect(toggle.getAttribute('aria-controls')).toBeTruthy();const region=screen.getByRole('region',{name:'Vincular material aprobado',hidden:true});expect(region.parentElement?.hasAttribute('hidden')).toBe(true);fireEvent.click(toggle);expect(toggle.getAttribute('aria-expanded')).toBe('true');expect(region.parentElement?.hasAttribute('hidden')).toBe(false);
 });
 it('keeps success status after collapsing and disables toggle while busy',async()=>{setup({accountId:'1'});const toggle=await screen.findByRole('button',{name:'Agregar documento'});fireEvent.click(toggle);fireEvent.click(screen.getByRole('button',{name:'Set busy'}));await waitFor(()=>expect((toggle as HTMLButtonElement).disabled).toBe(true));fireEvent.click(screen.getByRole('button',{name:'Link success'}));await waitFor(()=>expect((toggle as HTMLButtonElement).disabled).toBe(false));expect(screen.getByRole('status').textContent).toContain('«Folleto» quedó vinculado. No se envió al cliente.');expect(screen.getByRole('region',{name:'Vincular material aprobado',hidden:true}).parentElement?.hasAttribute('hidden')).toBe(true);
 });
 it('hides the toggle for read only and library views',async()=>{setup({accountId:'1',readOnly:true});await screen.findByRole('heading',{name:'Documentos del negocio'});expect(screen.queryByRole('button',{name:'Agregar documento'})).toBeNull();cleanup();setup({});await screen.findByRole('heading',{name:'Biblioteca comercial'});expect(screen.queryByRole('button',{name:'Agregar documento'})).toBeNull()});
});

describe('library load errors',()=>{it('keeps the folded toggle enabled and exposes retry after opening',async()=>{api.resources.mockImplementation(async(...args:unknown[])=>{if(args[0]===undefined)throw new Error('Library unavailable');return {documents:[],categories:[],maxDocumentBytes:2097152}});setup({accountId:'1'});const toggle=await screen.findByRole('button',{name:'Agregar documento'});expect((toggle as HTMLButtonElement).disabled).toBe(false);fireEvent.click(toggle);expect(screen.getByRole('button',{name:'Reintentar biblioteca'})).toBeTruthy();});});
