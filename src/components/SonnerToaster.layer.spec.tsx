import {afterEach,beforeAll,describe,expect,it,vi} from 'vitest';
import {act,cleanup,render,screen} from '@testing-library/react';
import {MantineProvider} from '@mantine/core';
import {toast} from 'sonner';
import {Dialog,DialogContent,DialogTitle} from './Dialog';
import {SonnerToaster} from './SonnerToaster';
import {LAYERS} from '../helpers/layers';

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
});
