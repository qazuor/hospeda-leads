import React from 'react';
import {afterEach,beforeAll,describe,expect,it,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import {MantineProvider} from '@mantine/core';
import {MemoryRouter} from 'react-router-dom';
import {toast} from 'sonner';
import {QueryErrorNotice} from './QueryErrorNotice';
import {LiveModeSwitch} from './LiveModeSwitch';
import {crmReadError} from '../helpers/crmFeedback';
import {CrmApiError} from '../helpers/apiClient';

vi.mock('sonner',()=>({toast:{error:vi.fn(),success:vi.fn(),info:vi.fn()}}));
vi.mock('../helpers/liveMode',()=>({useLiveMode:()=>({status:'live',refreshing:false,lastCheckedAt:null})}));
beforeAll(()=>{
 window.matchMedia=window.matchMedia||((query:string)=>({matches:false,media:query,addEventListener:()=>{},removeEventListener:()=>{},addListener:()=>{},removeListener:()=>{},dispatchEvent:()=>false,onchange:null}) as MediaQueryList);
 window.ResizeObserver=window.ResizeObserver||class{observe(){}unobserve(){}disconnect(){}};
});
afterEach(()=>{cleanup();vi.clearAllMocks();vi.restoreAllMocks();});
const wrap=(node:React.ReactNode)=>render(<MantineProvider><MemoryRouter>{node}</MemoryRouter></MantineProvider>);

describe('QueryErrorNotice',()=>{
 it.each([403,404])('offers a way back instead of "Reintentar" on %i',status=>{
  const onRetry=vi.fn();
  wrap(<QueryErrorNotice error={new CrmApiError('No tenés permiso para ver este negocio.',status)} onRetry={onRetry}/>);
  expect(screen.getByRole('alert').textContent).toContain('No tenés permiso para ver este negocio.');
  expect(screen.queryByRole('button',{name:'Reintentar'})).toBeNull();
  expect(screen.getByRole('link',{name:'Volver a Negocios'}).getAttribute('href')).toBe('/accounts');
  expect(vi.mocked(toast.error).mock.calls[0][1]).toBeUndefined();
 });
 it('honours backTo',()=>{
  wrap(<QueryErrorNotice error={new CrmApiError('x',404)} onRetry={vi.fn()} backTo="/my-day"/>);
  expect(screen.getByRole('link',{name:'Volver a Hoy'}).getAttribute('href')).toBe('/my-day');
 });
 it('offers no "Reintentar" on 401: the session-expired dialog handles it',()=>{
  wrap(<QueryErrorNotice error={new CrmApiError('Tu sesión venció. Volvé a ingresar para seguir.',401)} onRetry={vi.fn()}/>);
  expect(screen.getByRole('alert').textContent).toContain('Tu sesión venció');
  expect(screen.queryByRole('button')).toBeNull();expect(screen.queryByRole('link')).toBeNull();
 });
 it('keeps "Reintentar" for retryable failures',()=>{
  const onRetry=vi.fn();
  wrap(<QueryErrorNotice error={new CrmApiError('Sin conexión',0)} onRetry={onRetry}/>);
  fireEvent.click(screen.getByRole('button',{name:'Reintentar'}));
  expect(onRetry).toHaveBeenCalledTimes(1);expect(screen.queryByRole('link')).toBeNull();
  expect(vi.mocked(toast.error).mock.calls[0][1]).toMatchObject({action:{label:'Reintentar'}});
 });
});

describe('crmReadError',()=>{
 it('accepts a plain message and keeps the retry action',()=>{
  crmReadError('No se pudo cargar.',vi.fn());
  expect(vi.mocked(toast.error)).toHaveBeenCalledWith('No se pudo cargar.',expect.objectContaining({action:expect.objectContaining({label:'Reintentar'})}));
 });
 it('shows one shared toast without retry for 401',()=>{
  crmReadError(new CrmApiError('Tu sesión venció.',401),vi.fn());crmReadError(new CrmApiError('Tu sesión venció.',401),vi.fn());
  expect(vi.mocked(toast.error).mock.calls).toEqual([['Tu sesión venció.',{id:'crm-session-expired'}],['Tu sesión venció.',{id:'crm-session-expired'}]]);
 });
 it('drops the retry action for 403',()=>{
  crmReadError(new CrmApiError('Sin permiso.',403),vi.fn());
  expect(vi.mocked(toast.error)).toHaveBeenCalledWith('Sin permiso.');
 });
});

describe('LiveModeSwitch',()=>{
 it('shows informative live state while offline and recovers when back online',()=>{
  const online=vi.spyOn(navigator,'onLine','get').mockReturnValue(false);
  wrap(<LiveModeSwitch/>);
  expect(screen.getByText('En vivo · Sin conexión')).toBeTruthy();
  expect(screen.queryByRole('button',{name:'Opciones de actualización'})).toBeNull();
  online.mockReturnValue(true);act(()=>{window.dispatchEvent(new Event('online'))});
  expect(screen.queryByText('En vivo · Sin conexión')).toBeNull();expect(screen.getByText('En vivo')).toBeTruthy();
 });
});
