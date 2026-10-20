import {afterEach,describe,expect,it,vi} from 'vitest';
import {releaseUnloadGuards} from './authSync';

describe('releaseUnloadGuards',()=>{
 afterEach(()=>vi.restoreAllMocks());
 it('lets a deliberate reload skip dirty-form beforeunload prompts registered later',()=>{
  const prompt=vi.fn((event:Event)=>event.preventDefault());
  window.addEventListener('beforeunload',prompt);
  const guarded=new Event('beforeunload',{cancelable:true});window.dispatchEvent(guarded);
  expect(prompt).toHaveBeenCalledTimes(1);expect(guarded.defaultPrevented).toBe(true);
  releaseUnloadGuards();
  const released=new Event('beforeunload',{cancelable:true});window.dispatchEvent(released);
  expect(prompt).toHaveBeenCalledTimes(1);expect(released.defaultPrevented).toBe(false);
  window.removeEventListener('beforeunload',prompt);
 });
});
