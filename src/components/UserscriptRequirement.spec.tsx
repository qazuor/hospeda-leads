import {act,fireEvent,render,screen} from '@testing-library/react';
import {MantineProvider} from '@mantine/core';
import {MemoryRouter} from 'react-router-dom';
import {toast} from 'sonner';
import {CONNECTION_ATTRIBUTE,INSTALLED_ATTRIBUTE,INSTALLED_EVENT,RECHECK_EVENT,USER_ATTRIBUTE} from '../../userscript/src/announce';
import {USERSCRIPT_URL} from '../helpers/userscriptGate';
import {USERSCRIPT_PROMPT_TOAST_ID,UserscriptRequirement} from './UserscriptRequirement';

vi.mock('sonner',()=>({toast:{warning:vi.fn(),dismiss:vi.fn()}}));
const pointer=vi.hoisted(()=>({coarse:false}));
vi.mock('./InstagramOpenChat',()=>({isCoarsePointer:()=>pointer.coarse}));
const auth=vi.hoisted(()=>({logout:vi.fn()}));
vi.mock('../helpers/useAuth',()=>({useAuth:()=>({authState:{type:'authenticated',user:{email:'ana@hospeda.test'}},logout:auth.logout})}));

const announce=(version:string,connection:string)=>{const html=document.documentElement;html.setAttribute(INSTALLED_ATTRIBUTE,version);html.setAttribute(CONNECTION_ATTRIBUTE,connection);html.setAttribute(USER_ATTRIBUTE,'ana@hospeda.test');};
const mount=(path='/my-day')=>render(<MantineProvider><MemoryRouter initialEntries={[path]}><main data-testid="app">CRM</main><UserscriptRequirement/></MemoryRouter></MantineProvider>);
const blocker=()=>screen.queryByRole('alertdialog');

describe('UserscriptRequirement',()=>{
 beforeAll(()=>{window.matchMedia=vi.fn().mockImplementation(query=>({matches:false,media:query,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}}));});
 beforeEach(()=>{pointer.coarse=false;vi.mocked(toast.warning).mockClear();vi.mocked(toast.dismiss).mockClear();auth.logout.mockClear();});
 afterEach(()=>{const html=document.documentElement;[INSTALLED_ATTRIBUTE,CONNECTION_ATTRIBUTE,USER_ATTRIBUTE].forEach(a=>html.removeAttribute(a));});

 it('blocks the CRM while the script is outdated, with a link to update it',()=>{
  // Arrange
  announce('1.0.0','connected');
  // Act
  mount();
  // Assert
  expect(blocker()?.textContent).toContain('Actualizá el script de Hospeda');
  expect(screen.getByRole('link',{name:'Actualizar ahora'}).getAttribute('href')).toBe(USERSCRIPT_URL);
  expect(screen.getByTestId('app').closest('[inert]')).not.toBeNull();
  expect(toast.warning).not.toHaveBeenCalled();
 });

 it('lifts by itself once the script announces a current, connected version',()=>{
  announce('1.0.0','connected');
  mount();
  act(()=>{announce('99.0.0','connected');document.dispatchEvent(new Event(INSTALLED_EVENT));});
  expect(blocker()).toBeNull();
  expect(screen.getByTestId('app').closest('[inert]')).toBeNull();
 });

 it('blocks with «Instalar ahora» when no script announces itself',()=>{
  vi.useFakeTimers();
  try{
   mount();
   expect(blocker()).toBeNull();
   act(()=>{vi.advanceTimersByTime(2000);});
   expect(blocker()?.textContent).toContain('Instalá el script de Hospeda');
   expect(screen.getByRole('link',{name:'Instalar ahora'})).toBeTruthy();
  }finally{vi.useRealTimers();}
 });

 it('sends a disconnected script to User script and can check the token again',()=>{
  announce('99.0.0','missing-token');
  const recheck=vi.fn();document.addEventListener(RECHECK_EVENT,recheck);
  try{
   mount();
   expect(blocker()?.textContent).toContain('Conectá el script de Hospeda');
   expect(screen.getByRole('link',{name:'Ir a User script'}).getAttribute('href')).toBe('/userscript');
   fireEvent.click(screen.getByRole('button',{name:'Verificar de nuevo'}));
   expect(recheck).toHaveBeenCalledTimes(1);
  }finally{document.removeEventListener(RECHECK_EVENT,recheck);}
 });

 it('lets the user log out from the blocking screen',()=>{
  announce('1.0.0','connected');
  mount();
  fireEvent.click(screen.getByRole('button',{name:'Cerrar sesión'}));
  expect(auth.logout).toHaveBeenCalledTimes(1);
 });

 it('only warns, without blocking, when the CRM could not verify the token',()=>{
  announce('99.0.0','unknown');
  mount();
  expect(blocker()).toBeNull();
  expect(toast.warning).toHaveBeenCalledWith('No pudimos verificar el script',expect.objectContaining({id:USERSCRIPT_PROMPT_TOAST_ID,action:expect.objectContaining({label:'Verificar de nuevo'})}));
 });

 it.each([
  ['on the User script page',()=>{announce('1.0.0','connected');mount('/userscript');}],
  ['on phones and tablets',()=>{pointer.coarse=true;announce('1.0.0','connected');mount();}],
  ['in automated browsers',()=>{Object.defineProperty(navigator,'webdriver',{value:true,configurable:true});announce('1.0.0','connected');mount();}],
 ] as const)('does not block %s',(_name,arrange)=>{
  try{arrange();expect(blocker()).toBeNull();}finally{Reflect.deleteProperty(navigator,'webdriver');}
 });
});
