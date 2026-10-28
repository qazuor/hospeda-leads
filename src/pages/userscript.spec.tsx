import React from 'react';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import {listenForToken} from '../../userscript/src/tokenBridge';
import {MantineProvider} from '@mantine/core';
import {MemoryRouter} from 'react-router-dom';
import UserscriptPage,{DETECT_TIMEOUT_MS,USERSCRIPT_URL} from './userscript';
import {USERSCRIPT_VERSION} from '../../userscript/src/version';
import {CONNECTION_ATTRIBUTE,INSTALLED_ATTRIBUTE,INSTALLED_EVENT,RECHECK_EVENT,USER_ATTRIBUTE} from '../../userscript/src/announce';

const auth=vi.hoisted(()=>({email:'ana@hospeda.test'}));
vi.mock('../helpers/useAuth',()=>({useAuth:()=>({authState:{type:'authenticated',user:{id:1,email:auth.email,displayName:'Ana',role:'user'}}})}));
const clearScript=()=>{for(const name of [INSTALLED_ATTRIBUTE,CONNECTION_ATTRIBUTE,USER_ATTRIBUTE])document.documentElement.removeAttribute(name);};

const tokens=(list:unknown[]=[])=>vi.fn(async()=>new Response(JSON.stringify({tokens:list,latestVersion:USERSCRIPT_VERSION}),{status:200}));
const renderPage=()=>render(<MantineProvider><MemoryRouter><UserscriptPage/></MemoryRouter></MantineProvider>);
beforeEach(()=>{window.matchMedia=vi.fn().mockImplementation((query:string)=>({matches:false,media:query,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}}));clearScript();});
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.useRealTimers();clearScript();});

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
 it('explains the Instagram paste and the one-time site approval (spec 94)',async()=>{
  vi.stubGlobal('fetch',tokens());renderPage();
  expect(screen.getByTestId('userscript-instagram').textContent).toContain('el script toca «Enviar mensaje» y escribe el mensaje preparado en el chat de ese perfil, sin pedir permiso para el portapapeles. No lo envía');
  expect(screen.getByText(/Tampermonkey te pide aprobar instagram\.com una sola vez/)).toBeTruthy();
 });
});

describe('UserscriptPage · Conexión (spec 96 §3.4)',()=>{
 const announce=(connection:string,user?:string)=>{const html=document.documentElement;html.setAttribute(INSTALLED_ATTRIBUTE,USERSCRIPT_VERSION);html.setAttribute(CONNECTION_ATTRIBUTE,connection);if(user)html.setAttribute(USER_ATTRIBUTE,user);};
 const line=()=>screen.getByRole('status',{name:'Conexión'}).textContent;
 it('connects this browser in one click when the script takes tokens (1.5.1+)',async()=>{
  // Arrange: the real script-side listener answers the page.
  const token='hcu_'+'c'.repeat(43),save=vi.fn(),stop=listenForToken({doc:document,verify:async()=>true,save,recheck:()=>{}});
  vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({tokens:[],latestVersion:USERSCRIPT_VERSION,token}),{status:200})));
  try{
   announce('missing-token');renderPage();
   fireEvent.change(await screen.findByLabelText('Nombre del dispositivo'),{target:{value:'Notebook'}});
   fireEvent.click(screen.getByRole('button',{name:'Crear token'}));
   // Act
   fireEvent.click(await screen.findByRole('button',{name:'Conectar este navegador'}));
   // Assert
   expect(await screen.findByText('Listo: este navegador quedó conectado')).toBeTruthy();
   expect(save).toHaveBeenCalledWith(token);
  }finally{stop();}
 });
 it('offers only copy and paste to a script older than 1.5.1',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({tokens:[],latestVersion:USERSCRIPT_VERSION,token:'hcu_'+'d'.repeat(43)}),{status:200})));
  document.documentElement.setAttribute(INSTALLED_ATTRIBUTE,'1.5.0');document.documentElement.setAttribute(CONNECTION_ATTRIBUTE,'missing-token');renderPage();
  fireEvent.change(await screen.findByLabelText('Nombre del dispositivo'),{target:{value:'Notebook'}});
  fireEvent.click(screen.getByRole('button',{name:'Crear token'}));
  expect(await screen.findByRole('button',{name:'Copiar y abrir WhatsApp Web'})).toBeTruthy();
  expect(screen.queryByRole('button',{name:'Conectar este navegador'})).toBeNull();
 });
 it('after creating a token, copies it and opens WhatsApp Web in one click',async()=>{
  // Arrange
  // One answer serves both the list and the creation (the page reads `tokens` from one and `token` from the other).
  vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({tokens:[],latestVersion:USERSCRIPT_VERSION,token:'tok-123'}),{status:200})));
  const open=vi.spyOn(window,'open').mockReturnValue(null),writeText=vi.fn(async()=>{});
  Object.defineProperty(navigator,'clipboard',{value:{writeText},configurable:true});
  announce('missing-token');renderPage();
  fireEvent.change(await screen.findByLabelText('Nombre del dispositivo'),{target:{value:'Notebook'}});
  fireEvent.click(screen.getByRole('button',{name:'Crear token'}));
  // Act
  fireEvent.click(await screen.findByRole('button',{name:'Copiar y abrir WhatsApp Web'}));
  // Assert
  expect(open).toHaveBeenCalledWith('https://web.whatsapp.com/','_blank','noopener');
  expect(writeText).toHaveBeenCalledWith('tok-123');
  open.mockRestore();
 });
 it.each([['missing-token','Falta el token'],['rejected','Token rechazado']])('the %s badge takes the user to the token field',async(connection,label)=>{
  vi.stubGlobal('fetch',tokens());announce(connection);renderPage();
  const field=await screen.findByLabelText('Nombre del dispositivo');
  fireEvent.click(screen.getByRole('button',{name:label}));
  expect(document.activeElement).toBe(field);
 });
 it.each([['connected','Conectado'],['missing-token','Falta el token'],['rejected','Token rechazado'],['outdated','Versión rechazada por el CRM'],['unknown','Sin verificar']])('shows %s as «%s»',(connection,label)=>{
  vi.stubGlobal('fetch',tokens());announce(connection,connection==='connected'?'ana@hospeda.test':undefined);renderPage();
  expect(line()).toContain(label);
 });
 it('offers «Verificar de nuevo» when it could not verify, and asks the script again',()=>{
  vi.stubGlobal('fetch',tokens());announce('unknown');renderPage();const listener=vi.fn();document.addEventListener(RECHECK_EVENT,listener);
  screen.getByRole('button',{name:'Verificar de nuevo'}).click();expect(listener).toHaveBeenCalledTimes(1);document.removeEventListener(RECHECK_EVENT,listener);
 });
 it('warns when the token belongs to another CRM user',()=>{
  vi.stubGlobal('fetch',tokens());announce('connected','otra@hospeda.test');renderPage();
  expect(line()).toContain('El script está conectado con otra cuenta (otra@hospeda.test). Reconectalo con la tuya.');
 });
 it('says WhatsApp and Instagram from the computer need the script connected and current',()=>{
  vi.stubGlobal('fetch',tokens());renderPage();
  expect(screen.getByText(/el script tiene que estar instalado, al día y conectado con tu cuenta/)).toBeTruthy();
 });
});
