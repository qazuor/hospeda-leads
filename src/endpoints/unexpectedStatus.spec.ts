import {describe,expect,it,vi} from 'vitest';
const session=vi.hoisted(()=>({getServerUserSession:vi.fn()}));
vi.mock('../helpers/getServerUserSession',()=>session);
vi.mock('../helpers/db',()=>({db:{}}));
import {get as workGet} from './work';
import {get as pipelineGet} from './pipeline';
const req=()=>new Request('http://x/_api/work');
describe('unexpected errors return 500 with a generic message',()=>{
 for(const [name,get] of [['work',workGet],['pipeline',pipelineGet]] as const)it(`${name} GET`,async()=>{
  vi.spyOn(console,'error').mockImplementation(()=>{});
  session.getServerUserSession.mockRejectedValueOnce(new TypeError("Cannot read properties of undefined (reading 'x')"));
  const res=await get(req());
  expect(res.status).toBe(500);
  expect(await res.text()).toContain('No se pudo completar la acción');
 });
 it('keeps 400 for plain business errors',async()=>{
  session.getServerUserSession.mockRejectedValueOnce(new Error('Elegí algo'));
  expect((await workGet(req())).status).toBe(400);
 });
});
