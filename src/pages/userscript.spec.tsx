import React from 'react';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {act,cleanup,render,screen} from '@testing-library/react';
import {MantineProvider} from '@mantine/core';
import {MemoryRouter} from 'react-router-dom';
import UserscriptPage,{DETECT_TIMEOUT_MS,USERSCRIPT_URL} from './userscript';
import {USERSCRIPT_VERSION} from '../../userscript/src/version';
import {INSTALLED_ATTRIBUTE,INSTALLED_EVENT} from '../../userscript/src/announce';

const tokens=(list:unknown[]=[])=>vi.fn(async()=>new Response(JSON.stringify({tokens:list,latestVersion:USERSCRIPT_VERSION}),{status:200}));
const renderPage=()=>render(<MantineProvider><MemoryRouter><UserscriptPage/></MemoryRouter></MantineProvider>);
beforeEach(()=>{window.matchMedia=vi.fn().mockImplementation((query:string)=>({matches:false,media:query,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}}));document.documentElement.removeAttribute(INSTALLED_ATTRIBUTE);});
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.useRealTimers();document.documentElement.removeAttribute(INSTALLED_ATTRIBUTE);});

describe('UserscriptPage',()=>{
 it('reports the script as not detected after the wait and offers to install it from this CRM',async()=>{
  vi.useFakeTimers({shouldAdvanceTime:true});vi.stubGlobal('fetch',tokens());renderPage();
  expect(screen.getByText('Buscando el user script…')).toBeTruthy();
  await act(async()=>{vi.advanceTimersByTime(DETECT_TIMEOUT_MS);});
  expect(screen.getByText('No detectado')).toBeTruthy();
  expect(screen.getByRole('link',{name:'Instalar user script'}).getAttribute('href')).toBe(USERSCRIPT_URL);
 });
 it('shows the installed version as current when the script announced it',async()=>{
  vi.stubGlobal('fetch',tokens());document.documentElement.setAttribute(INSTALLED_ATTRIBUTE,USERSCRIPT_VERSION);renderPage();
  expect(screen.getByText('Instalado')).toBeTruthy();
  expect(screen.getByRole('link',{name:'Reinstalar user script'})).toBeTruthy();
 });
 it('flags an outdated script announced after the page rendered',async()=>{
  vi.stubGlobal('fetch',tokens());renderPage();
  act(()=>{document.documentElement.setAttribute(INSTALLED_ATTRIBUTE,'0.9.0');document.dispatchEvent(new Event(INSTALLED_EVENT));});
  expect(screen.getAllByText('Desactualizado').length).toBeGreaterThan(0);
  expect(screen.getByRole('link',{name:'Actualizar user script'})).toBeTruthy();
 });
 it('shows the version each token last reported and flags outdated devices',async()=>{
  vi.stubGlobal('fetch',tokens([{id:'1',label:'Chrome oficina',createdAt:'2026-10-25T12:00:00Z',lastUsedAt:'2026-10-25T15:00:00Z',lastVersion:'0.9.0',revokedAt:null}]));renderPage();
  expect(await screen.findByText('Chrome oficina')).toBeTruthy();
  expect(screen.getByText(/versión 0\.9\.0/)).toBeTruthy();
  expect(screen.getByText('Desactualizado')).toBeTruthy();
 });
});
