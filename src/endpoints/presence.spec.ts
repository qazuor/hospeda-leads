import {afterEach,describe,expect,it,vi} from 'vitest';
import {getServerUserSession} from '../helpers/getServerUserSession';
import {heartbeat,online} from './presence';
import {userscriptPresenceSchema} from './userscript';

vi.mock('../helpers/getServerUserSession',()=>({getServerUserSession:vi.fn()}));
vi.mock('../helpers/db',()=>({db:{}}));
afterEach(()=>vi.clearAllMocks());
const actor=(role:'admin'|'user')=>vi.mocked(getServerUserSession).mockResolvedValue({user:{id:10,email:'seller@example.test',displayName:'Seller',fullName:null,avatarUrl:null,role},session:{id:'test',createdAt:0,lastAccessed:new Date(0)}});
describe('presence endpoint guards',()=>{
  it('accepts only WhatsApp and Instagram userscript sources',()=>{expect(userscriptPresenceSchema.parse({source:'whatsapp'})).toEqual({source:'whatsapp'});expect(userscriptPresenceSchema.parse({source:'instagram'})).toEqual({source:'instagram'});expect(userscriptPresenceSchema.safeParse({source:'crm'}).success).toBe(false);});
  it('denies the online list to sellers',async()=>{actor('user');const response=await online(new Request('http://localhost/_api/presence/online'));expect(response.status).toBe(403);});
  it('validates online query input with Zod',async()=>{actor('user');const response=await online(new Request('http://localhost/_api/presence/online?unexpected=1'));expect(response.status).toBe(400);});
  it('validates heartbeat body with Zod before writing',async()=>{actor('user');const response=await heartbeat(new Request('http://localhost/_api/presence/heartbeat',{method:'POST',headers:{'content-type':'application/json'},body:'{"json":{"unexpected":true}}'}));expect(response.status).toBe(400);});
});
