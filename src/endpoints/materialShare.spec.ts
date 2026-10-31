// @vitest-environment node
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import type {PublicSharedMaterial,PublicShareState} from '../helpers/salesMaterialShareService';

const svc=vi.hoisted(()=>({resolve:vi.fn(),record:vi.fn(),location:vi.fn(),cover:vi.fn(),direct:vi.fn()}));
const r2=vi.hoisted(()=>({configured:true,storage:{}}));
/** In-memory stand-in of the persisted budget (`salesMaterialShareAttempts.ts`, covered by the integration suite): 5 misses per client key. */
const budget=vi.hoisted(()=>({spent:new Map<string,number>(),keys:[] as string[]}));
vi.mock('../helpers/db',()=>({db:{}}));
vi.mock('../helpers/salesMaterialShareService',()=>({resolvePublicShare:svc.resolve,recordTechnicalAccess:svc.record,publicShareFileLocation:svc.location,publicShareCover:svc.cover,publicShareDirectLocation:svc.direct}));
vi.mock('../helpers/salesMaterialShareAttempts',()=>({SHARE_UNKNOWN_WINDOW_MINUTES:60,recordShareMiss:async(_db:unknown,{clientKey}:{clientKey:string})=>{
 budget.keys.push(clientKey);const n=budget.spent.get(clientKey)??0;if(n>=5)return {limited:true};budget.spent.set(clientKey,n+1);return {limited:false};
}}));
vi.mock('../helpers/r2',async importOriginal=>{const actual=await importOriginal<typeof import('../helpers/r2')>();return {...actual,r2Configured:()=>r2.configured,r2Origin:()=>'https://acc.r2.cloudflarestorage.com',r2Storage:()=>{if(!r2.configured)throw new actual.R2NotConfigured();return r2.storage;}};});
const {page,file,cover,notFound,resetShareRateLimitsForTests}=await import('./materialShare');

const token='T'.repeat(43);
const CHROME='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const material=(over:Partial<PublicSharedMaterial>={}):PublicSharedMaterial=>({shareId:'s-1',path:'/m/'+token,openDirect:false,title:'Folleto',description:'Tarifas',format:'pdf',externalUrl:null,fileName:'folleto.pdf',mimeType:'application/pdf',byteSize:10,objectKey:'materials/m/v1.pdf',cover:null,...over});
const available=(over:Partial<PublicSharedMaterial>={}):PublicShareState=>({state:'available',material:material(over)});
const req=(path='',{method='GET',ua=CHROME}:{method?:string;ua?:string|null}={})=>new Request(`http://localhost/m/${token}${path}`,{method,headers:ua?{'user-agent':ua}:{}});
const ctx={token,ip:'203.0.113.1'};
beforeEach(()=>{resetShareRateLimitsForTests();budget.spent.clear();budget.keys.length=0;r2.configured=true;svc.record.mockResolvedValue(true);svc.direct.mockResolvedValue(null);vi.spyOn(console,'error').mockImplementation(()=>{});vi.spyOn(console,'warn').mockImplementation(()=>{});});
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
  expect(bot.status).toBe(200);expect(html).not.toContain('og:image');expect(html).not.toContain('og:url');
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
describe('Open Graph origin',()=>{
 it('never builds og:url or og:image from the Host or X-Forwarded-Proto headers when PUBLIC_APP_URL is unset',async()=>{
  svc.resolve.mockResolvedValue(available({cover:{key:'covers/m/c.jpg',mime:'image/jpeg'}}));
  const r=await page(new Request(`http://evil.example/m/${token}`,{headers:{'user-agent':CHROME,host:'evil.example','x-forwarded-host':'evil.example','x-forwarded-proto':'https'}}),ctx);
  const html=await r.text();expect(r.status).toBe(200);
  expect(html).not.toContain('evil.example');expect(html).not.toContain('og:url');expect(html).not.toContain('og:image');expect(html).not.toContain('twitter:image');
  expect(html).toContain('og:title');expect(html).toContain('<meta name="twitter:card" content="summary">');
 });
 it('uses PUBLIC_APP_URL (without trailing slashes) when configured, whatever the Host says',async()=>{
  svc.resolve.mockResolvedValue(available());process.env.PUBLIC_APP_URL='https://crm.hospeda.com.ar//';
  const html=await (await page(new Request(`http://evil.example/m/${token}`,{headers:{'user-agent':CHROME}}),ctx)).text();
  expect(html).toContain(`<meta property="og:url" content="https://crm.hospeda.com.ar/m/${token}">`);expect(html).toContain('content="https://crm.hospeda.com.ar/hospeda-logo.jpg"');expect(html).not.toContain('evil.example');
 });
});
describe('mangled links',()=>{
 it.each(['/','.',',',')'])('redirects %j after the token to the clean page with 308 and no caching',async tail=>{
  const r=await page(new Request(`http://localhost/m/${token}${tail}`,{headers:{'user-agent':CHROME}}),ctx);
  expect(r.status).toBe(308);expect(r.headers.get('Location')).toBe(`/m/${token}`);expect(r.headers.get('Cache-Control')).toBe('no-store');expect(svc.resolve).not.toHaveBeenCalled();expect(svc.record).not.toHaveBeenCalled();
 });
 it('redirects a trailing slash arriving at the catch-all, but not other garbage',async()=>{
  const r=await notFound(new Request(`http://localhost/m/${token}/`),{ip:'192.0.2.50'});expect(r.status).toBe(308);expect(r.headers.get('Location')).toBe(`/m/${token}`);
  expect((await notFound(new Request(`http://localhost/m/${token}/file/`),{ip:'192.0.2.50'})).status).toBe(404);
  expect((await notFound(new Request(`http://localhost/m/${token.slice(1)}/`),{ip:'192.0.2.50'})).status).toBe(404);
  expect((await notFound(new Request(`http://localhost/m/${token}/`,{method:'POST'}),{ip:'192.0.2.50'})).status).toBe(404);
 });
});
describe('rate limiting',()=>{
 it('spec 101 D1: after 5 misses from one IP, misses answer 429 (Retry-After 3600) and are no longer counted',async()=>{
  svc.resolve.mockResolvedValue({state:'unknown'});
  for(let i=0;i<5;i++)expect((await page(req(),ctx)).status).toBe(404);
  const r=await page(req(),ctx);expect(r.status).toBe(429);expect(r.headers.get('Retry-After')).toBe('3600');expect(r.headers.get('Cache-Control')).toBe('no-store');
  expect((await page(req('',{method:'HEAD'}),ctx)).status).toBe(429);expect((await notFound(new Request('http://localhost/m/x'),{ip:ctx.ip})).status).toBe(429);
  expect(budget.spent.get(ctx.ip)).toBe(5);
  expect((await page(req(),{token,ip:'198.51.100.2'})).status).toBe(404);
 });
 it('owner decision «Los válidos siempre abren»: over budget, a valid link still answers as usual for people, bots and HEAD',async()=>{
  svc.resolve.mockResolvedValue({state:'unknown'});for(let i=0;i<5;i++)await page(req(),ctx);
  svc.resolve.mockResolvedValue(available());svc.location.mockResolvedValue('https://acc.r2.cloudflarestorage.com/b/k?X-Amz-Signature=1');
  expect((await page(req(),ctx)).status).toBe(200);expect((await page(req('',{ua:'WhatsApp/2.23.20.0'}),ctx)).status).toBe(200);expect((await page(req('',{method:'HEAD'}),ctx)).status).toBe(200);
  expect((await file(req('/file'),{...ctx,disposition:'inline'})).status).toBe(302);
  svc.resolve.mockResolvedValue({state:'revoked'});expect((await page(req(),ctx)).status).toBe(410);
  svc.resolve.mockResolvedValue({state:'unknown'});expect((await page(req(),ctx)).status).toBe(429);
 });
 it('a valid link never spends the budget',async()=>{
  svc.resolve.mockResolvedValue(available());
  for(let i=0;i<20;i++)expect((await page(req('',{ua:'WhatsApp/2'}),ctx)).status).toBe(200);
  svc.resolve.mockResolvedValue({state:'unknown'});expect((await page(req(),ctx)).status).toBe(404);
 });
 it('groups IPv6 clients by their /64',async()=>{
  svc.resolve.mockResolvedValue({state:'unknown'});
  for(let i=1;i<=5;i++)expect((await page(req(),{token,ip:`2001:db8:1:2::${i}`})).status).toBe(404);
  expect((await page(req(),{token,ip:'2001:db8:1:2:ffff:ffff:ffff:9'})).status).toBe(429);
  expect((await page(req(),{token,ip:'2001:db8:1:3::1'})).status).toBe(404);
  expect(new Set(budget.keys.slice(0,5))).toEqual(new Set(['2001:db8:1:2::/64']));
 });
 it('refuses more than 300 requests per minute from one IP',async()=>{
  svc.resolve.mockResolvedValue(available());
  for(let i=0;i<300;i++)expect((await page(req('',{ua:'Twitterbot/1.0'}),ctx)).status).toBe(200);
  expect((await page(req(),ctx)).status).toBe(429);
 });
 it('counts unknown /m paths too',async()=>{
  for(let i=0;i<5;i++)expect((await notFound(new Request('http://localhost/m/x'),{ip:'192.0.2.9'})).status).toBe(404);
  const r=await notFound(new Request('http://localhost/m/x'),{ip:'192.0.2.9'});expect(r.status).toBe(429);expect(r.headers.get('Retry-After')).toBe('3600');
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
 it('never redirects to an external URL from the file routes (only the link itself does, with «Abrir directo»)',async()=>{
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
describe('spec 101: canonical path and «Abrir directo»',()=>{
 it('builds sub-routes and og:url from the stored slug, never from the slug as typed',async()=>{
  svc.resolve.mockResolvedValue(available({path:'/m/folleto-2027-Ab3x'}));process.env.PUBLIC_APP_URL='https://crm.hospeda.com.ar';
  const html=await (await page(new Request('http://localhost/m/FOLLETO-2027-Ab3x',{headers:{'user-agent':CHROME}}),{token:'FOLLETO-2027-Ab3x',ip:'203.0.113.9'})).text();
  expect(html).toContain('<meta property="og:url" content="https://crm.hospeda.com.ar/m/folleto-2027-Ab3x">');expect(html).toContain('src="/m/folleto-2027-Ab3x/file"');expect(html).not.toContain('FOLLETO');
 });
 it('sends a person straight to the file or the external link, counted, without caching or Referer',async()=>{
  svc.resolve.mockResolvedValue(available({openDirect:true}));svc.direct.mockResolvedValue('https://acc.r2.cloudflarestorage.com/b/k?X-Amz-Signature=1');
  const r=await page(req(),ctx);
  expect(r.status).toBe(302);expect(r.headers.get('Location')).toBe('https://acc.r2.cloudflarestorage.com/b/k?X-Amz-Signature=1');
  expect(r.headers.get('Cache-Control')).toBe('no-store');expect(r.headers.get('Referrer-Policy')).toBe('no-referrer');
  expect(svc.record).toHaveBeenCalledWith({},{shareId:'s-1'});expect(svc.direct.mock.calls[0][0].material.openDirect).toBe(true);
 });
 it('keeps the page for preview bots and HEAD, so WhatsApp still shows cover and title',async()=>{
  svc.resolve.mockResolvedValue(available({openDirect:true}));svc.direct.mockResolvedValue('https://example.com/tour');
  const bot=await page(req('',{ua:'WhatsApp/2.23.20.0'}),ctx);expect(bot.status).toBe(200);expect(bot.headers.get('Location')).toBeNull();
  expect((await page(req('',{method:'HEAD'}),ctx)).status).toBe(200);expect(svc.direct).not.toHaveBeenCalled();expect(svc.record).not.toHaveBeenCalled();
 });
 it('shows the page when there is no acceptable destination',async()=>{
  svc.resolve.mockResolvedValue(available({openDirect:true}));svc.direct.mockResolvedValue(null);
  const r=await page(req(),ctx);expect(r.status).toBe(200);expect(r.headers.get('Location')).toBeNull();
 });
 it('never redirects a revoked, unavailable or unknown link',async()=>{
  for(const state of ['revoked','unavailable','unknown'] as const){svc.resolve.mockResolvedValue({state});expect((await page(req(),ctx)).headers.get('Location')).toBeNull();}
  expect(svc.direct).not.toHaveBeenCalled();
 });
});
describe('spec 101 review: a failed presign with «Abrir directo»',()=>{
 it('falls back to the normal page instead of a 500',async()=>{
  svc.resolve.mockResolvedValue(available({openDirect:true}));svc.direct.mockRejectedValue(new Error('presign down'));
  const r=await page(req(),ctx);expect(r.status).toBe(200);expect(r.headers.get('Location')).toBeNull();expect(await r.text()).toContain('Folleto');
  expect(svc.record).toHaveBeenCalledTimes(1);
 });
});
