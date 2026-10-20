import React from 'react';
import {afterEach,beforeAll,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {MantineProvider} from '@mantine/core';
import {AppErrorBoundary} from './AppErrorBoundary';

beforeAll(()=>{
  window.matchMedia=window.matchMedia||((query:string)=>({matches:false,media:query,addEventListener:()=>{},removeEventListener:()=>{},addListener:()=>{},removeListener:()=>{},dispatchEvent:()=>false,onchange:null}) as MediaQueryList);
  window.ResizeObserver=window.ResizeObserver||class{observe(){}unobserve(){}disconnect(){}};
});
afterEach(()=>{cleanup();window.sessionStorage.clear();vi.restoreAllMocks();});

let shouldThrow=true;
function Bomb(){if(shouldThrow)throw new Error('boom');return <p>contenido</p>;}
const view=()=>render(<MantineProvider><AppErrorBoundary><Bomb/></AppErrorBoundary></MantineProvider>);

describe('AppErrorBoundary',()=>{
  it('shows the Spanish fallback and retry re-renders the children',()=>{
    vi.spyOn(console,'error').mockImplementation(()=>{});
    shouldThrow=true;view();
    expect(screen.getByText('Algo salió mal al mostrar esta pantalla.')).toBeTruthy();
    expect(screen.getByRole('button',{name:'Recargar'})).toBeTruthy();
    shouldThrow=false;
    fireEvent.click(screen.getByRole('button',{name:'Reintentar'}));
    expect(screen.getByText('contenido')).toBeTruthy();
  });
});
