import React,{useEffect} from 'react';
import {afterEach,beforeAll,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {MantineProvider} from '@mantine/core';
import {AppErrorBoundary} from './AppErrorBoundary';
import {reloadOnceForStaleChunk,resetStaleChunk} from '../helpers/chunkReload';

vi.mock('../helpers/chunkReload',async importOriginal=>({...await importOriginal<typeof import('../helpers/chunkReload')>(),reloadOnceForStaleChunk:vi.fn()}));

beforeAll(()=>{
  window.matchMedia=window.matchMedia||((query:string)=>({matches:false,media:query,addEventListener:()=>{},removeEventListener:()=>{},addListener:()=>{},removeListener:()=>{},dispatchEvent:()=>false,onchange:null}) as MediaQueryList);
  window.ResizeObserver=window.ResizeObserver||class{observe(){}unobserve(){}disconnect(){}};
});
afterEach(()=>{cleanup();resetStaleChunk();vi.clearAllMocks();vi.restoreAllMocks();});

let error:Error|null=null,mounts=0;
function Child(){useEffect(()=>{mounts++;},[]);if(error)throw error;return <p>contenido</p>;}
const wrap=(resetKey:string)=><MantineProvider><AppErrorBoundary resetKey={resetKey}><Child/></AppErrorBoundary></MantineProvider>;

describe('AppErrorBoundary',()=>{
  it('shows the Spanish fallback and retry re-renders the children',()=>{
    vi.spyOn(console,'error').mockImplementation(()=>{});
    error=new Error('boom');render(wrap('/a'));
    expect(screen.getByText('Algo salió mal al mostrar esta pantalla.')).toBeTruthy();
    expect(screen.getByRole('button',{name:'Recargar'})).toBeTruthy();
    expect(reloadOnceForStaleChunk).not.toHaveBeenCalled();
    error=null;
    fireEvent.click(screen.getByRole('button',{name:'Reintentar'}));
    expect(screen.getByText('contenido')).toBeTruthy();
  });
  it('reloads once on a chunk error and shows the new-version copy',()=>{
    vi.spyOn(console,'error').mockImplementation(()=>{});
    error=new TypeError('Failed to fetch dynamically imported module: /assets/x.js');render(wrap('/a'));
    expect(reloadOnceForStaleChunk).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/Hay una versión nueva/)).toBeTruthy();
  });
  it('clears the fallback when resetKey changes',()=>{
    vi.spyOn(console,'error').mockImplementation(()=>{});
    error=new Error('boom');const view=render(wrap('/a'));
    expect(screen.getByRole('alert')).toBeTruthy();
    error=null;view.rerender(wrap('/b'));
    expect(screen.getByText('contenido')).toBeTruthy();
  });
  it('does not remount children when resetKey changes without an error',()=>{
    error=null;mounts=0;const view=render(wrap('/accounts/1'));
    view.rerender(wrap('/accounts/2'));
    expect(mounts).toBe(1);
  });
});
