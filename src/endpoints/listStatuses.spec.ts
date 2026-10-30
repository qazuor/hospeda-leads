import {describe,expect,it,vi} from 'vitest';
const session=vi.hoisted(()=>({getServerUserSession:vi.fn()}));
vi.mock('../helpers/getServerUserSession',()=>session);
vi.mock('../helpers/db',()=>({db:{}}));
import {NotAuthenticatedError} from '../helpers/getSetServerSession';
import {handle as leads} from './leads_GET';
import {handle as stats} from './leads_stats_GET';
import {handle as live} from './live_version_GET';
const generic='No se pudo completar la acción. Intentá de nuevo.';
const handlers=[['leads',leads,'http://x/_api/leads?entity=business'],['leads_stats',stats,'http://x/_api/leads_stats'],['live_version',live,'http://x/_api/live_version']] as const;
describe('list/stats/live_version statuses',()=>{
 for(const [name,handle,url] of handlers){
  const req=()=>new Request(url);
  it(`${name}: unauthenticated -> 401`,async()=>{
   session.getServerUserSession.mockRejectedValueOnce(new NotAuthenticatedError());
   expect((await handle(req())).status).toBe(401);
  });
  it(`${name}: unexpected TypeError -> 500 generic, no raw message`,async()=>{
   vi.spyOn(console,'error').mockImplementation(()=>{});
   session.getServerUserSession.mockRejectedValueOnce(new TypeError("Cannot read properties of undefined (reading 'x')"));
   const res=await handle(req());const text=await res.text();expect(res.status).toBe(500);expect(text).toContain(generic);expect(text).not.toContain('Cannot read');
  });
  it(`${name}: pg 42P01 -> 500 generic`,async()=>{
   vi.spyOn(console,'error').mockImplementation(()=>{});
   session.getServerUserSession.mockRejectedValueOnce(Object.assign(new Error('relation "x" does not exist'),{name:'PostgresError',severity:'ERROR',code:'42P01'}));
   const res=await handle(req());const text=await res.text();expect(res.status).toBe(500);expect(text).not.toContain('relation');
  });
  it(`${name}: plain business Error -> 400`,async()=>{
   session.getServerUserSession.mockRejectedValueOnce(new Error('Elegí algo'));
   const res=await handle(req());expect(res.status).toBe(400);expect(await res.text()).toContain('Elegí algo');
  });
 }
 it('leads: invalid query -> 400 (validation is not a logout)',async()=>{
  session.getServerUserSession.mockResolvedValueOnce({user:{id:1,role:'admin',email:'a@b.c'}});
  expect((await leads(new Request('http://x/_api/leads?view=bogus'))).status).toBe(400);
 });
 it('leads: seller requesting deletedAt -> 403',async()=>{
  session.getServerUserSession.mockResolvedValueOnce({user:{id:2,role:'seller',email:'s@b.c'}});
  const filterGroups=JSON.stringify([{rules:[{field:'deletedAt',operator:'is_true'}]}]);
  expect((await leads(new Request(`http://x/_api/leads?entity=business&filterGroups=${encodeURIComponent(filterGroups)}`))).status).toBe(403);
 });
});
