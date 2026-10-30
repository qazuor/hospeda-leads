import {describe,expect,it,vi} from 'vitest';
const session=vi.hoisted(()=>({getServerUserSession:vi.fn()}));
vi.mock('../helpers/getServerUserSession',()=>session);
vi.mock('../helpers/db',()=>({db:{}}));
import {get as workGet,post as workPost} from './work';
import {get as pipelineGet,post as pipelinePost} from './pipeline';
import {get as commercialGet,post as commercialPost} from './commercial';
const req=()=>new Request('http://x/_api/work');
const generic='No se pudo completar la acción. Intentá de nuevo.';
const pgError=(code:string,message:string,extra:Record<string,unknown>={})=>Object.assign(new Error(message),{name:'PostgresError',severity:'ERROR',code,...extra});
const handlers=[['work',workGet],['pipeline',pipelineGet],['commercial',commercialGet]] as const;
describe('error statuses',()=>{
 for(const [name,get] of handlers){
  it(`${name} GET: unexpected TypeError -> 500 generic`,async()=>{
   vi.spyOn(console,'error').mockImplementation(()=>{});
   session.getServerUserSession.mockRejectedValueOnce(new TypeError("Cannot read properties of undefined (reading 'x')"));
   const res=await get(req());expect(res.status).toBe(500);expect(await res.text()).toContain(generic);
  });
  it(`${name} GET: pg 42P01 -> 500 generic`,async()=>{
   vi.spyOn(console,'error').mockImplementation(()=>{});
   session.getServerUserSession.mockRejectedValueOnce(pgError('42P01','relation "x" does not exist'));
   const res=await get(req());const text=await res.text();expect(res.status).toBe(500);expect(text).toContain(generic);expect(text).not.toContain('relation');
  });
  it(`${name} GET: pg 23503 with table -> 400 friendly`,async()=>{
   vi.spyOn(console,'error').mockImplementation(()=>{});
   session.getServerUserSession.mockRejectedValueOnce(pgError('23503','fk violation',{table_name:'leads'}));
   const res=await get(req());expect(res.status).toBe(400);expect(await res.text()).toContain('El elemento que elegiste ya no existe');
  });
  it(`${name} GET: pg 23505 -> 400 friendly`,async()=>{
   session.getServerUserSession.mockRejectedValueOnce(pgError('23505','duplicate key'));
   const res=await get(req());expect(res.status).toBe(400);expect(await res.text()).toContain('Ya existe un registro con esos datos.');
  });
  it(`${name} GET: plain business Error stays 400`,async()=>{
   session.getServerUserSession.mockRejectedValueOnce(new Error('Elegí algo'));
   expect((await get(req())).status).toBe(400);
  });
 }
 for(const [name,post] of [['work',workPost],['pipeline',pipelinePost],['commercial',commercialPost]] as const)it(`${name} POST: malformed body -> 400 Solicitud inválida.`,async()=>{
  session.getServerUserSession.mockResolvedValue({user:{id:1,role:'admin',email:'a@b.c'}});
  const res=await post(new Request('http://x/_api/x',{method:'POST',body:'{not json'}));
  expect(res.status).toBe(400);expect(await res.text()).toContain('Solicitud inválida.');
 });
});
