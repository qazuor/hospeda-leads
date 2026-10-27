// @vitest-environment node
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import type {PublicSharedMaterial,PublicShareState} from '../helpers/salesMaterialShareService';

const svc=vi.hoisted(()=>({resolve:vi.fn(),record:vi.fn(),location:vi.fn(),cover:vi.fn()}));
const r2=vi.hoisted(()=>({configured:true,storage:{}}));
vi.mock('../helpers/db',()=>({db:{}}));
vi.mock('../helpers/salesMaterialShareService',()=>({resolvePublicShare:svc.resolve,recordTechnicalAccess:svc.record,publicShareFileLocation:svc.location,publicShareCover:svc.cover}));
vi.mock('../helpers/r2',async importOriginal=>{const actual=await importOriginal<typeof import('../helpers/r2')>();return {...actual,r2Configured:()=>r2.configured,r2Origin:()=>'https://acc.r2.cloudflarestorage.com',r2Storage:()=>{if(!r2.configured)throw new actual.R2NotConfigured();return r2.storage;}};});
const {page,file,cover,notFound,resetShareRateLimitsForTests}=await import('./materialShare');

const token='T'.repeat(43);
const CHROME='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const material=(over:Partial<PublicSharedMaterial>={}):PublicSharedMaterial=>({shareId:'s-1',title:'Folleto',description:'Tarifas',format:'pdf',externalUrl:null,fileName:'folleto.pdf',mimeType:'application/pdf',byteSize:10,objectKey:'materials/m/v1.pdf',cover:null,...over});
const available=(over:Partial<PublicSharedMaterial>={}):PublicShareState=>({state:'available',material:material(over)});
const req=(path='',{method='GET',ua=CHROME}:{method?:string;ua?:string|null}={})=>new Request(`http://localhost/m/${token}${path}`,{method,headers:ua?{'user-agent':ua}:{}});
const ctx={token,ip:'203.0.113.1'};
beforeEach(()=>{resetShareRateLimitsForTests();r2.configured=true;svc.record.mockResolvedValue(true);vi.spyOn(console,'error').mockImplementation(()=>{});vi.spyOn(console,'warn').mockImplementation(()=>{});});
afterEach(()=>{vi.clearAllMocks();vi.restoreAllMocks();delete process.env.PUBLIC_APP_URL;});

describe('GET /m/:token',()=>{
 it('renders an available material with an enforced CSP, no-store and noindex, and counts a person',async()=>{
  svc.resolve.mockResolvedValue(available());process.env.PUBLIC_APP_URL='https://crm.hospeda.com.ar/';
  const r=await page(req(),ctx);const html=await r.text();
  expect(r.status).toBe(200);expect(r.headers.get('Content-Security-Policy')).toContain(`default-src 'none'`);expect(r.headers.get('Content-Security-Policy')).toContain('https://acc.r2.cloudflarestorage.com');
  expect(r.headers.get('Cache-Control')).toBe('no-store');expect(r.headers.get('X-Robots-Tag')).toBe('noindex, nofollow, noarchive');expect(r.headers.get('Referrer-Policy')).toBe('no-referrer');
  expect(html).toContain(`<meta property="og:url" content="https://crm.hospeda.com.ar/m/${token}">`);
  expect(svc.resolve).toHaveBeenCalledWith({},{token});expect(svc.record).toHaveBeenCalledWith({},{shareId:'s-1'});
 });
 it('serves bots and HEAD the same page without counting them',async()=>{
  svc.resolve.mockResolvedValue(available({cover:{key:'covers/m/c.jpg',mime:'image/jpeg'}}));
  const bot=await page(req('',{ua:'WhatsApp/2.23.20.0'}),ctx);const html=await bot.text();
  expect(bot.status).toBe(200);expect(html).toContain('og:image');expect(html).toContain(`http://localhost/m/${token}/cover`);
  const head=await page(req('',{method:'HEAD'}),ctx);expect(head.status).toBe(200);expect(await head.text()).toBe('');
  expect(svc.record).not.toHaveBeenCalled();
 });
 it('still renders when the technical record fails',async()=>{
  svc.resolve.mockResolvedValue(available());svc.record.mockRejectedValue(new Error('db down'));
  expect((await page(req(),ctx)).status).toBe(200);
 });
 it.each([['unknown',404,'Este enlace no es válido'],['revoked',410,'Este enlace ya no está disponible'],['unavailable',410,'Este material ya no está disponible']] as const)('answers %s with %i',async(state,status,text)=>{
  svc.resolve.mockResolvedValue({state});const r=await page(req(),ctx);
  expect(r.status).toBe(status);expect(await r.text()).toContain(text);expect(r.headers.get('Cache-Control')).toBe('no-store');expect(svc.record).not.toHaveBeenCalled();
 });
 it('answers 503 for a file material when storage is not configured, but still shows external URLs',async()=>{
  r2.configured=false;svc.resolve.mockResolvedValue(available());expect((await page(req(),ctx)).status).toBe(503);
  svc.resolve.mockResolvedValue(available({format:'link',externalUrl:'https://example.com/x',objectKey:null,fileName:null,mimeType:null}));
  const r=await page(req(),ctx);expect(r.status).toBe(200);expect(await r.text()).toContain('href="https://example.com/x"');
 });
 it('answers 500 with a page (never the stack) when the lookup fails',async()=>{
  svc.resolve.mockRejectedValue(new Error('boom secret'));const r=await page(req(),ctx);
  expect(r.status).toBe(500);expect(await r.text()).not.toContain('boom');
 });
});
describe('rate limiting',()=>{
 it('refuses after 20 unknown tokens from one IP, before touching the database again',async()=>{
  svc.resolve.mockResolvedValue({state:'unknown'});
  for(let i=0;i<20;i++)expect((await page(req(),ctx)).status).toBe(404);
  const r=await page(req(),ctx);expect(r.status).toBe(429);expect(r.headers.get('Retry-After')).toBe('600');
  expect(svc.resolve).toHaveBeenCalledTimes(20);
  expect((await page(req(),{token,ip:'198.51.100.2'})).status).toBe(404);
 });
 it('refuses more than 60 requests per minute from one IP',async()=>{
  svc.resolve.mockResolvedValue(available());
  for(let i=0;i<60;i++)expect((await page(req('',{ua:'Twitterbot/1.0'}),ctx)).status).toBe(200);
  expect((await page(req(),ctx)).status).toBe(429);
 });
 it('counts unknown /m paths too',async()=>{
  for(let i=0;i<20;i++)expect((await notFound(new Request('http://localhost/m/x'),{ip:'192.0.2.9'})).status).toBe(404);
  expect((await notFound(new Request('http://localhost/m/x'),{ip:'192.0.2.9'})).status).toBe(429);
 });
});
describe('GET /m/:token/file and /download',()=>{
 it('redirects to a fresh presigned URL without caching or Referer, framable only by our page',async()=>{
  svc.resolve.mockResolvedValue(available());svc.location.mockResolvedValue('https://acc.r2.cloudflarestorage.com/b/k?X-Amz-Signature=1');
  const r=await file(req('/download'),{...ctx,disposition:'attachment'});
  expect(r.status).toBe(302);expect(r.headers.get('Location')).toBe('https://acc.r2.cloudflarestorage.com/b/k?X-Amz-Signature=1');
  expect(r.headers.get('Cache-Control')).toBe('no-store');expect(r.headers.get('Referrer-Policy')).toBe('no-referrer');expect(r.headers.get('X-Frame-Options')).toBe('SAMEORIGIN');
  expect(svc.location.mock.calls[0][0].disposition).toBe('attachment');expect(svc.record).not.toHaveBeenCalled();
 });
 it('never redirects to an external URL (no open redirect)',async()=>{
  svc.resolve.mockResolvedValue(available({format:'link',externalUrl:'https://evil.example',objectKey:null}));
  const r=await file(req('/file'),{...ctx,disposition:'inline'});expect(r.status).toBe(404);expect(r.headers.get('Location')).toBeNull();
 });
 it('applies the same states and answers 503 when storage is missing',async()=>{
  svc.resolve.mockResolvedValue({state:'revoked'});expect((await file(req('/file'),{...ctx,disposition:'inline'})).status).toBe(410);
  svc.resolve.mockResolvedValue(available());r2.configured=false;expect((await file(req('/file'),{...ctx,disposition:'inline'})).status).toBe(503);
 });
});
describe('GET /m/:token/cover',()=>{
 it('serves the cover bytes, cacheable for an hour',async()=>{
  svc.resolve.mockResolvedValue(available({cover:{key:'c',mime:'image/png'}}));svc.cover.mockResolvedValue({body:new Uint8Array([1,2,3]),contentType:'image/png'});
  const r=await cover(req('/cover'),ctx);expect(r.status).toBe(200);expect(r.headers.get('Content-Type')).toBe('image/png');expect(r.headers.get('Cache-Control')).toBe('public, max-age=3600');
  expect(new Uint8Array(await r.arrayBuffer())).toEqual(new Uint8Array([1,2,3]));
 });
 it('answers 404 without a cover and 410 for an unavailable material',async()=>{
  svc.resolve.mockResolvedValue(available());svc.cover.mockResolvedValue(null);expect((await cover(req('/cover'),ctx)).status).toBe(404);
  svc.resolve.mockResolvedValue({state:'unavailable'});expect((await cover(req('/cover'),ctx)).status).toBe(410);
 });
});
