import {afterEach,describe,expect,it,vi} from 'vitest';
import {LOGOUT_STORAGE_KEY,onLogoutElsewhere,releaseUnloadGuards} from './authSync';

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

describe('onLogoutElsewhere',()=>{
 it('reacts to every logout signal and ignores other keys or a removed value',()=>{
  const onLogout=vi.fn();const stop=onLogoutElsewhere(onLogout);
  window.dispatchEvent(new StorageEvent('storage',{key:'hospeda-live-mode',newValue:'off'}));
  window.dispatchEvent(new StorageEvent('storage',{key:LOGOUT_STORAGE_KEY,newValue:null}));
  expect(onLogout).not.toHaveBeenCalled();
  window.dispatchEvent(new StorageEvent('storage',{key:LOGOUT_STORAGE_KEY,newValue:'1'}));window.dispatchEvent(new StorageEvent('storage',{key:LOGOUT_STORAGE_KEY,newValue:'2'}));
  expect(onLogout).toHaveBeenCalledTimes(2);
  stop();window.dispatchEvent(new StorageEvent('storage',{key:LOGOUT_STORAGE_KEY,newValue:'3'}));expect(onLogout).toHaveBeenCalledTimes(2);
 });
});
