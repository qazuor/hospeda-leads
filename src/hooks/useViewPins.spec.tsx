import {afterEach,describe,expect,it,vi} from 'vitest';
import {act,cleanup,renderHook,waitFor} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {postViewPins,getViewPins} from '../endpoints/view_pins.schema';
import {useViewPins} from './useViewPins';
vi.mock('../endpoints/view_pins.schema',()=>({getViewPins:vi.fn(),postViewPins:vi.fn()}));
vi.mock('sonner',()=>({toast:{error:vi.fn()}}));
afterEach(cleanup);
function wrapper(){const client=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});return ({children}:{children:React.ReactNode})=><QueryClientProvider client={client}>{children}</QueryClientProvider>;}
describe('useViewPins',()=>{it('optimistically pins at the end of effective order and rolls back on failure',async()=>{vi.mocked(getViewPins).mockResolvedValue({business:{order:['system:all'],hidden:['personal:x']}});vi.mocked(postViewPins).mockRejectedValue(new Error('offline'));const Wrapper=wrapper(),{result}=renderHook(()=>useViewPins(),{wrapper:Wrapper});await waitFor(()=>expect(result.current.config('business')?.hidden).toEqual(['personal:x']));await act(async()=>{await result.current.pin('business','personal:x',['system:all','system:today','personal:x']);});expect(result.current.config('business')).toEqual({order:['system:all'],hidden:['personal:x']});expect(postViewPins).toHaveBeenCalledWith({entity:'business',config:{order:['system:all','system:today','personal:x'],hidden:[]}},expect.anything());});});
