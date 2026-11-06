import {act,render} from '@testing-library/react';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {usePresenceHeartbeat} from './usePresenceHeartbeat';

const send=vi.hoisted(()=>vi.fn().mockResolvedValue(undefined));
vi.mock('../endpoints/presence.schema',()=>({sendPresenceHeartbeat:send}));
function Probe({enabled=true}:{enabled?:boolean}){usePresenceHeartbeat(enabled);return null;}
describe('usePresenceHeartbeat',()=>{
  let original:PropertyDescriptor|undefined;
  const visibility=(value:string)=>Object.defineProperty(document,'visibilityState',{configurable:true,value});
  beforeEach(()=>{vi.useFakeTimers();send.mockClear();original=Object.getOwnPropertyDescriptor(document,'visibilityState');visibility('visible');});
  afterEach(()=>{vi.useRealTimers();if(original)Object.defineProperty(document,'visibilityState',original);else Reflect.deleteProperty(document,'visibilityState');});
  it('sends immediately and every minute while visible',()=>{const view=render(<Probe/>);expect(send).toHaveBeenCalledTimes(1);act(()=>vi.advanceTimersByTime(60_000));expect(send).toHaveBeenCalledTimes(2);view.unmount();act(()=>vi.advanceTimersByTime(60_000));expect(send).toHaveBeenCalledTimes(2);});
  it('waits while hidden, sends on visibility, throttles flaps and stops when disabled',()=>{visibility('hidden');const view=render(<Probe/>);expect(send).not.toHaveBeenCalled();visibility('visible');act(()=>document.dispatchEvent(new Event('visibilitychange')));expect(send).toHaveBeenCalledTimes(1);visibility('hidden');act(()=>document.dispatchEvent(new Event('visibilitychange')));visibility('visible');act(()=>document.dispatchEvent(new Event('visibilitychange')));expect(send).toHaveBeenCalledTimes(1);act(()=>vi.advanceTimersByTime(20_000));act(()=>document.dispatchEvent(new Event('visibilitychange')));expect(send).toHaveBeenCalledTimes(2);view.rerender(<Probe enabled={false}/>);act(()=>vi.advanceTimersByTime(120_000));expect(send).toHaveBeenCalledTimes(2);});
  it('silently absorbs heartbeat failures',async()=>{send.mockRejectedValueOnce(new Error('offline'));render(<Probe/>);await act(async()=>{await Promise.resolve();});expect(send).toHaveBeenCalledTimes(1);});
});
