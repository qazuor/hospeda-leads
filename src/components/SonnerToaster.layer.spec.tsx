import {useState} from 'react';
import {afterEach,beforeAll,describe,expect,it,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import {MantineProvider} from '@mantine/core';
import {toast} from 'sonner';
import {Dialog,DialogContent,DialogTitle} from './Dialog';
import {SonnerToaster} from './SonnerToaster';
import {LAYERS} from '../helpers/layers';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import type {Opportunity} from '../endpoints/commercial.schema';
import type {PipelineData,PipelineStage} from '../endpoints/pipeline.schema';
vi.mock('../helpers/useAuth',()=>({useAuth:()=>({authState:{type:'authenticated',user:{id:3,email:'owner@example.com',role:'user'}}})}));
vi.mock('../endpoints/commercial.schema',()=>({getCommercialDetail:()=>new Promise(()=>{})}));
vi.mock('./BusinessContactDialog',()=>({BusinessContactDialog:()=>null}));
vi.mock('./CommercialEditor',()=>({CommercialEditor:()=>null}));
import {BusinessPreviewDrawer} from './BusinessPreviewDrawer';
import {ManagementPreviewDrawer} from './ManagementPreviewDrawer';

beforeAll(()=>{
 window.matchMedia=vi.fn().mockImplementation(query=>({matches:false,media:query,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}}));
 globalThis.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};
});
afterEach(()=>{toast.dismiss();cleanup();});

/** Highest z-index painted by the element or its ancestors. Mantine passes a modal's layer as `--mb-z-index` on its root and paints the content one above it. */
const zOf=(el:Element|null)=>{let max=0;for(let node=el as HTMLElement|null;node;node=node.parentElement){const inline=Number(node.style.zIndex),modal=Number(node.style.getPropertyValue('--mb-z-index'));if(inline)max=Math.max(max,inline);if(modal)max=Math.max(max,modal+1);}return max;};

describe('toasts over dialogs (regression: a toast rendered behind a dialog overlay)',()=>{
 it('renders a toast fired while stacked dialogs are open above both of them',async()=>{
  render(<MantineProvider env="test">
   <Dialog open onOpenChange={()=>{}}><DialogContent><DialogTitle>Primero</DialogTitle>
    <Dialog open onOpenChange={()=>{}}><DialogContent><DialogTitle>Segundo</DialogTitle></DialogContent></Dialog>
   </DialogContent></Dialog>
   <SonnerToaster/>
  </MantineProvider>);
  const top=await screen.findByRole('dialog',{name:'Segundo'}),bottom=screen.getByRole('dialog',{name:'Primero'});
  act(()=>{toast.error('No se pudo guardar');});
  const message=await screen.findByText('No se pudo guardar');
  const toaster=message.closest('[data-sonner-toaster]') as HTMLElement;
  expect(Number(toaster.style.zIndex)).toBe(LAYERS.toast);
  expect(zOf(toaster)).toBeGreaterThan(zOf(top));
  expect(zOf(toaster)).toBeGreaterThan(zOf(bottom));
  expect(zOf(top)).toBeGreaterThan(zOf(bottom));
 });
 it('moves toasts to the top centre while a dialog is open, so they never cover its footer actions, and back afterwards',async()=>{
  function Harness(){const [open,setOpen]=useState(false);return <MantineProvider env="test">
   <button onClick={()=>setOpen(true)}>Abrir</button>
   <Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogTitle>Panel</DialogTitle><button onClick={()=>setOpen(false)}>Guardar</button></DialogContent></Dialog>
   <SonnerToaster/>
  </MantineProvider>;}
  render(<Harness/>);
  act(()=>{toast.success('Negocio creado');});
  const toasterOf=async()=>(await screen.findByText('Negocio creado')).closest('[data-sonner-toaster]') as HTMLElement;
  expect((await toasterOf()).dataset.yPosition).toBe('bottom');
  fireEvent.click(screen.getByRole('button',{name:'Abrir'}));await screen.findByRole('dialog',{name:'Panel'});
  // A toast fired before the dialog opened moves too.
  expect((await toasterOf()).dataset.yPosition).toBe('top');expect((await toasterOf()).dataset.xPosition).toBe('center');
  fireEvent.click(screen.getByRole('button',{name:'Guardar'}));
  await vi.waitFor(async()=>expect((await toasterOf()).dataset.yPosition).toBe('bottom'));
 });

 it('moves toasts up close to the top edge while a dialog is open, so they sit above its header instead of over it',async()=>{
  render(<MantineProvider env="test"><Dialog open onOpenChange={()=>{}}><DialogContent><DialogTitle>Panel</DialogTitle></DialogContent></Dialog><SonnerToaster/></MantineProvider>);
  await screen.findByRole('dialog',{name:'Panel'});act(()=>{toast.success('Guardado');});
  const toaster=(await screen.findByText('Guardado')).closest('[data-sonner-toaster]') as HTMLElement;
  expect(toaster.style.getPropertyValue('--offset-top')).toBe('8px');expect(toaster.style.getPropertyValue('--offset-left')).toBe('24px');
 });
});

describe('side panels register their layer (spec 104 §3.11 H1: a toast stayed over the preview footer)',()=>{
 const toasterOf=async(text:string)=>(await screen.findByText(text)).closest('[data-sonner-toaster]') as HTMLElement;
 it('moves toasts to the top centre while the business preview is open',async()=>{
  render(<MantineProvider env="test"><QueryClientProvider client={new QueryClient()}>
   <BusinessPreviewDrawer row={{accountId:'7',nombre:'Hotel Río'}} opened onClose={()=>{}} onOpenRecord={()=>{}} returnFocusTo={null}/>
   <SonnerToaster/>
  </QueryClientProvider></MantineProvider>);
  act(()=>{toast.success('Cambio guardado');});
  await vi.waitFor(async()=>expect((await toasterOf('Cambio guardado')).dataset.yPosition).toBe('top'));
  expect((await toasterOf('Cambio guardado')).dataset.xPosition).toBe('center');
 });
 it('moves toasts to the top centre while the management preview is open',async()=>{
  const lead={id:1,accountId:2,nombre:'Hotel Sol',managementType:'main',estado:'main:contact'} as unknown as Opportunity,data={users:[],stages:[{name:'main:contact',classification:'open',managementType:'main'}]} as unknown as PipelineData;
  render(<MantineProvider env="test">
   <ManagementPreviewDrawer lead={lead} data={data} stage={data.stages[0] as PipelineStage} role="admin" opened onClose={()=>{}} onOpen={()=>{}} onChangeStage={()=>{}} returnFocusTo={null}/>
   <SonnerToaster/>
  </MantineProvider>);
  act(()=>{toast.success('Etapa cambiada');});
  await vi.waitFor(async()=>expect((await toasterOf('Etapa cambiada')).dataset.yPosition).toBe('top'));
 });
});
