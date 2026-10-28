import {act,render} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import {toast} from 'sonner';
import {CONNECTION_ATTRIBUTE,INSTALLED_ATTRIBUTE,INSTALLED_EVENT,USER_ATTRIBUTE} from '../../userscript/src/announce';
import {USERSCRIPT_PROMPT_TOAST_ID,UserscriptPromptToast} from './UserscriptPromptToast';

vi.mock('sonner',()=>({toast:{warning:vi.fn(),dismiss:vi.fn()}}));
vi.mock('./InstagramOpenChat',()=>({isCoarsePointer:()=>false}));

const announce=(version:string,connection:string)=>{const html=document.documentElement;html.setAttribute(INSTALLED_ATTRIBUTE,version);html.setAttribute(CONNECTION_ATTRIBUTE,connection);html.setAttribute(USER_ATTRIBUTE,'ana@hospeda.test');};
const mount=(path='/my-day')=>render(<MemoryRouter initialEntries={[path]}><UserscriptPromptToast/></MemoryRouter>);

describe('UserscriptPromptToast',()=>{
 beforeEach(()=>{vi.mocked(toast.warning).mockClear();vi.mocked(toast.dismiss).mockClear();});
 afterEach(()=>{const html=document.documentElement;[INSTALLED_ATTRIBUTE,CONNECTION_ATTRIBUTE,USER_ATTRIBUTE].forEach(a=>html.removeAttribute(a));});

 it('keeps an update prompt on screen for an outdated script',()=>{
  // Arrange
  announce('1.0.0','connected');
  // Act
  mount();
  // Assert
  expect(toast.warning).toHaveBeenCalledTimes(1);
  const [title,options]=vi.mocked(toast.warning).mock.calls[0];
  expect(title).toBe('Actualizá el script de Hospeda');
  expect(options).toMatchObject({id:USERSCRIPT_PROMPT_TOAST_ID,duration:Infinity,dismissible:false,closeButton:false,action:{label:'Actualizar ahora'}});
 });

 it('asks to connect when the token is missing',()=>{
  announce('99.0.0','missing-token');
  mount();
  expect(vi.mocked(toast.warning).mock.calls[0][0]).toBe('Conectá el script de Hospeda');
  expect(vi.mocked(toast.warning).mock.calls[0][1]).toMatchObject({action:{label:'Ir a User script'}});
 });

 it('removes the prompt once the script announces a fixed state',()=>{
  announce('1.0.0','connected');
  mount();
  vi.mocked(toast.dismiss).mockClear();
  act(()=>{announce('99.0.0','connected');document.dispatchEvent(new Event(INSTALLED_EVENT));});
  expect(toast.dismiss).toHaveBeenCalledWith(USERSCRIPT_PROMPT_TOAST_ID);
  expect(toast.warning).toHaveBeenCalledTimes(1);
 });

 it('is hidden on the User script page',()=>{
  announce('1.0.0','connected');
  mount('/userscript');
  expect(toast.warning).not.toHaveBeenCalled();
 });
});
