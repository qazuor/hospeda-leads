// @vitest-environment node
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import type {Hono} from 'hono';

// Malformed tokens never reach the database, so a dummy URL is enough (same approach as routes.spec.ts).
const saved={db:process.env.DATABASE_URL,jwt:process.env.JWT_SECRET};
let app:Hono;
beforeAll(async()=>{process.env.DATABASE_URL='postgres://u:p@127.0.0.1:1/x';process.env.JWT_SECRET='material-share-route-secret-0123456789abcdef';app=(await import('./app')).app as unknown as Hono;});
afterAll(()=>{if(saved.db===undefined)delete process.env.DATABASE_URL;else process.env.DATABASE_URL=saved.db;if(saved.jwt===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=saved.jwt;});

describe('/m routes',()=>{
 it.each([
  ['GET','/m/short'],['GET','/m/'+'A'.repeat(42)+'='],['GET','/m'],['GET','/m/'],['GET','/m/'+'A'.repeat(43)+'/file/'],['GET','/m/'+'A'.repeat(42)+'/'],['GET','/m/'+'A'.repeat(43)+'/other'],
  ['POST','/m/'+'A'.repeat(43)],['DELETE','/m/'+'A'.repeat(43)+'/file'],['GET','/m/x/file'],['GET','/m/x/download'],['GET','/m/x/cover']
 ])('%s %s answers the public 404 page, never the SPA',async(method,path)=>{
  const r=await app.request(path,{method,headers:{'x-real-ip':'192.0.2.'+(path.length%250)}});
  expect(r.status).toBe(404);const html=await r.text();
  expect(html).toContain('Este enlace no es válido');expect(html).not.toContain('id="root"');
  expect(r.headers.get('Content-Security-Policy')).toContain(`default-src 'none'`);expect(r.headers.get('Content-Security-Policy-Report-Only')).toBeNull();
  expect(r.headers.get('X-Robots-Tag')).toBe('noindex, nofollow, noarchive');expect(r.headers.get('Cache-Control')).toBe('no-store');expect(r.headers.get('X-Frame-Options')).toBe('DENY');
 });
 it.each(['/','.',',',')'])('redirects %j after a well-formed token to the clean page without touching the database',async tail=>{
  const token='A'.repeat(43);const r=await app.request('/m/'+token+tail,{headers:{'x-real-ip':'192.0.2.201'}});
  expect(r.status).toBe(308);expect(r.headers.get('Location')).toBe('/m/'+token);expect(r.headers.get('Cache-Control')).toBe('no-store');
 });
 it('answers HEAD without a body',async()=>{
  const r=await app.request('/m/nope',{method:'HEAD',headers:{'x-real-ip':'192.0.2.200'}});expect(r.status).toBe(404);expect(await r.text()).toBe('');
 });
 it('registers the four public routes before the static fallback',()=>{
  const paths=app.routes.map(r=>`${r.method} ${r.path}`);
  for(const p of ['GET /m/:token','GET /m/:token/file','GET /m/:token/download','GET /m/:token/cover','ALL /m/*'])expect(paths).toContain(p);
  expect(paths.lastIndexOf('ALL /*')).toBeGreaterThan(paths.indexOf('ALL /m/*'));
 });
});
