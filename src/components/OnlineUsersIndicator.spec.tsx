import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {fireEvent,render,screen,waitFor} from '@testing-library/react';
import {MantineProvider} from '@mantine/core';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {getOnlineUsers} from '../endpoints/presence.schema';
import {OnlineUsersIndicator,relativePresenceTime} from './OnlineUsersIndicator';
vi.mock('../endpoints/presence.schema',()=>({getOnlineUsers:vi.fn()}));
const users=[{id:1,displayName:'Ana Admin',email:'ana@example.test',role:'admin' as const,lastSeenAt:new Date(),sources:['crm','instagram'] as ('crm'|'instagram')[]},{id:2,displayName:'Vero Vendedora',email:'vero@example.test',role:'user' as const,lastSeenAt:new Date(Date.now()-60_000),sources:['whatsapp'] as ('whatsapp')[]}];
function mount(role:'admin'|'user'='admin'){const client=new QueryClient({defaultOptions:{queries:{retry:false}}});return render(<MantineProvider><QueryClientProvider client={client}><OnlineUsersIndicator role={role}/></QueryClientProvider></MantineProvider>);}
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
describe('OnlineUsersIndicator',()=>{
  beforeEach(()=>vi.stubGlobal('matchMedia',()=>({matches:false,media:'',onchange:null,addListener:vi.fn(),removeListener:vi.fn(),addEventListener:vi.fn(),removeEventListener:vi.fn(),dispatchEvent:vi.fn()})));
  it('renders roles, sources and relative times in the open list',async()=>{vi.mocked(getOnlineUsers).mockResolvedValue({users,windowSeconds:120});mount();await waitFor(()=>expect(screen.getByRole('button',{name:'2 en línea'})).toBeTruthy());fireEvent.click(screen.getByRole('button',{name:'2 en línea'}));expect(await screen.findByText('Ana Admin')).toBeTruthy();expect(screen.getByText('Administrador')).toBeTruthy();expect(screen.getByText('Vendedor')).toBeTruthy();expect(screen.getByText('CRM')).toBeTruthy();expect(screen.getByText('Instagram')).toBeTruthy();expect(screen.getByText('WhatsApp')).toBeTruthy();expect(screen.getByText('ahora')).toBeTruthy();expect(screen.getByText('hace 1 min')).toBeTruthy();});
  it('shows a muted dash on errors',async()=>{vi.mocked(getOnlineUsers).mockRejectedValue(new Error('offline'));mount();expect(await screen.findByRole('button',{name:'Estado de conexión no disponible'})).toBeTruthy();expect(screen.getByText('—')).toBeTruthy();});
  it('treats a payload without users as an error instead of crashing',async()=>{vi.mocked(getOnlineUsers).mockResolvedValue({} as Awaited<ReturnType<typeof getOnlineUsers>>);mount();expect(await screen.findByRole('button',{name:'Estado de conexión no disponible'})).toBeTruthy();});
  it('does not request or show presence for sellers',()=>{mount('user');expect(screen.queryByText(/en línea/)).toBeNull();expect(getOnlineUsers).not.toHaveBeenCalled();});
  it('formats relative presence time',()=>{expect(relativePresenceTime(new Date('2026-11-05T12:00:00.000Z'),Date.parse('2026-11-05T12:00:00.000Z'))).toBe('ahora');});
});
