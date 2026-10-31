import {beforeEach,describe,expect,it,vi} from 'vitest';
const api=vi.hoisted(()=>({success:vi.fn(),error:vi.fn()}));
vi.mock('sonner',()=>({toast:api}));
import {TOAST_MS,crmSuccess} from './crmFeedback';

beforeEach(()=>{api.success.mockReset();});

describe('success toast durations (spec 104 §3.11: success toasts lingered 8 s)',()=>{
 it('keeps the shared durations: 4 s without an action, 8 s with one',()=>{
  expect(TOAST_MS).toEqual({success:4000,action:8000});
 });
 it('dismisses a success toast without an action after 4 s',()=>{
  crmSuccess('Registro anulado');
  expect(api.success).toHaveBeenCalledWith('Registro anulado',expect.objectContaining({duration:4000}));
  expect(api.success.mock.calls[0]?.[1]).not.toHaveProperty('action');
 });
 it('gives a success toast with a destination 8 s, so its action can be reached',()=>{
  crmSuccess('Negocio guardado',{label:'Ver negocio',href:'/accounts/7'},'Detalle');
  expect(api.success).toHaveBeenCalledWith('Negocio guardado',expect.objectContaining({duration:8000,description:'Detalle',action:expect.objectContaining({label:'Ver negocio'})}));
 });
});
