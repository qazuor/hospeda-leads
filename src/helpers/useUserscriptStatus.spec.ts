import {act,renderHook} from '@testing-library/react';
import {CONNECTION_ATTRIBUTE,INSTALLED_ATTRIBUTE,INSTALLED_EVENT,USER_ATTRIBUTE} from '../../userscript/src/announce';
import {USERSCRIPT_VERSION} from '../../userscript/src/version';
import {CONNECTION_TIMEOUT_MS,DETECT_TIMEOUT_MS,useUserscriptContactBlock,useUserscriptStatus} from './useUserscriptStatus';
import {USERSCRIPT_MISSING_REASON,USERSCRIPT_UNVERIFIED_REASON,USERSCRIPT_VERIFYING_REASON} from './userscriptGate';

const html=()=>document.documentElement;
const clear=()=>{for(const name of [INSTALLED_ATTRIBUTE,CONNECTION_ATTRIBUTE,USER_ATTRIBUTE])html().removeAttribute(name);};
const announce=(attributes:Record<string,string>)=>act(()=>{for(const [k,v] of Object.entries(attributes))html().setAttribute(k,v);document.dispatchEvent(new Event(INSTALLED_EVENT));});
const wait=(ms:number)=>act(()=>{vi.advanceTimersByTime(ms);});

beforeEach(()=>{vi.useFakeTimers();clear();window.matchMedia=vi.fn().mockImplementation((query:string)=>({matches:false,media:query,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}}));});
afterEach(()=>{vi.useRealTimers();clear();});

describe('useUserscriptStatus (spec 96 §3.3)',()=>{
 it('keeps verifying after the version arrives until the connection answers, without flipping to unverified at two seconds',()=>{
  html().setAttribute(INSTALLED_ATTRIBUTE,USERSCRIPT_VERSION);
  const {result}=renderHook(()=>useUserscriptContactBlock());
  wait(DETECT_TIMEOUT_MS);
  expect(result.current).toMatchObject({reason:USERSCRIPT_VERIFYING_REASON,waiting:true,unverified:false});
  wait(CONNECTION_TIMEOUT_MS-DETECT_TIMEOUT_MS-1);expect(result.current.reason).toBe(USERSCRIPT_VERIFYING_REASON);
  announce({[CONNECTION_ATTRIBUTE]:'connected',[USER_ATTRIBUTE]:'ana@hospeda.test'});
  expect(result.current.reason).toBe('');
 });
 it('reports unverified only after the longer timeout',()=>{
  html().setAttribute(INSTALLED_ATTRIBUTE,USERSCRIPT_VERSION);
  const {result}=renderHook(()=>useUserscriptContactBlock());
  wait(CONNECTION_TIMEOUT_MS);
  expect(result.current).toMatchObject({reason:USERSCRIPT_UNVERIFIED_REASON,waiting:false,unverified:true});
 });
 it('reports unverified at once on an explicit unknown',()=>{
  const {result}=renderHook(()=>useUserscriptContactBlock());
  announce({[INSTALLED_ATTRIBUTE]:USERSCRIPT_VERSION,[CONNECTION_ATTRIBUTE]:'unknown'});
  expect(result.current).toMatchObject({reason:USERSCRIPT_UNVERIFIED_REASON,unverified:true});
 });
 it('reports no script after the detection wait, with no connection to wait for',()=>{
  const {result}=renderHook(()=>useUserscriptStatus());
  expect(result.current).toEqual({version:undefined,connection:undefined,user:null});
  wait(DETECT_TIMEOUT_MS);
  expect(result.current).toEqual({version:null,connection:null,user:null});
  const gate=renderHook(()=>useUserscriptContactBlock());wait(DETECT_TIMEOUT_MS);
  expect(gate.result.current.reason).toBe(USERSCRIPT_MISSING_REASON);
 });
});
