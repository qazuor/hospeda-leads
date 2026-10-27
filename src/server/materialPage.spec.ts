// @vitest-environment node
import {describe,expect,it} from 'vitest';
import {escapeHtml,materialHtmlResponse,materialPageCsp,materialStateStatus,ogDescription,renderMaterialPage,renderMaterialStatePage,type MaterialPageView} from './materialPage';

const token='A'.repeat(43);
const view=(over:Partial<MaterialPageView>={}):MaterialPageView=>({token,baseUrl:'https://crm.hospeda.com.ar',title:'Folleto 2027',description:'Tarifas y beneficios',format:'pdf',fileName:'folleto.pdf',byteSize:2048,externalUrl:null,hasCover:false,android:false,...over});
const meta=(html:string,property:string)=>new RegExp(`<meta (?:property|name)="${property}" content="([^"]*)">`).exec(html)?.[1];

describe('renderMaterialPage',()=>{
 it('emits Open Graph, Twitter and noindex tags with the token URL',()=>{
  const html=renderMaterialPage(view());
  expect(meta(html,'og:title')).toBe('Folleto 2027');expect(meta(html,'og:description')).toBe('Tarifas y beneficios');expect(meta(html,'og:type')).toBe('website');
  expect(meta(html,'og:url')).toBe(`https://crm.hospeda.com.ar/m/${token}`);expect(meta(html,'twitter:card')).toBe('summary_large_image');
  expect(meta(html,'og:image')).toBe('https://crm.hospeda.com.ar/hospeda-logo.jpg');
  expect(meta(html,'robots')).toBe('noindex, nofollow, noarchive');expect(html).toContain('<meta name="viewport" content="width=device-width,initial-scale=1">');
  expect(html).not.toMatch(/<script/i);
 });
 it('uses the cover route as og:image when the material has a cover',()=>{
  const html=renderMaterialPage(view({hasCover:true}));
  expect(meta(html,'og:image')).toBe(`https://crm.hospeda.com.ar/m/${token}/cover`);expect(meta(html,'twitter:image')).toBe(`https://crm.hospeda.com.ar/m/${token}/cover`);
 });
 it('escapes admin text everywhere, including attributes (no XSS through title or description)',()=>{
  const evil=`"><script>alert(1)</script><img src=x onerror='alert(2)'>`;
  const html=renderMaterialPage(view({title:evil,description:evil+'\n`x`',format:'image'}));
  expect(html).not.toContain('<script>');expect(html).not.toContain(`onerror='`);expect(html).not.toContain('"><script');
  expect(html).toContain('&#34;&#62;&#60;script&#62;alert(1)&#60;/script&#62;');
  expect(meta(html,'og:title')).toBe(escapeHtml(evil));expect(html).toContain(`alt="${escapeHtml(evil)}"`);
 });
 it('cuts og:description at 200 characters on one line',()=>{
  const long='palabra '.repeat(60);const d=ogDescription({description:long});
  expect(d.length).toBeLessThanOrEqual(200);expect(d.endsWith('…')).toBe(true);
  expect(ogDescription({description:'a\n\n b'})).toBe('a b');expect(ogDescription({description:'  '})).toBe('Material de Hospeda para vos.');
 });
 it('shows each format with our same-origin routes',()=>{
  const f=`/m/${token}/file`;
  expect(renderMaterialPage(view({format:'image'}))).toContain(`<img src="${f}" alt="Folleto 2027">`);
  const pdf=renderMaterialPage(view());expect(pdf).toContain(`<iframe src="${f}"`);expect(pdf).toContain('>Abrir PDF</a>');expect(pdf).toContain(`href="/m/${token}/download">Descargar</a>`);
  const android=renderMaterialPage(view({android:true,hasCover:true}));expect(android).not.toContain('<iframe');expect(android).toContain(`src="/m/${token}/cover"`);expect(android).toContain('Abrir PDF');
  const video=renderMaterialPage(view({format:'video',hasCover:true}));expect(video).toContain(`<video controls preload="metadata" playsinline src="${f}" poster="/m/${token}/cover">`);
  expect(renderMaterialPage(view({format:'audio'}))).toContain(`<audio controls preload="metadata" src="${f}">`);
  const office=renderMaterialPage(view({format:'office',fileName:'tarifas.xlsx',byteSize:3*1024*1024}));expect(office).toContain('tarifas.xlsx · 3 MB');expect(office).toContain('>Documento<');expect(office).toContain('Descargar');
 });
 it('opens external URLs only from a button with noopener noreferrer, without download or redirect',()=>{
  const html=renderMaterialPage(view({format:'link',fileName:null,byteSize:null,externalUrl:'https://example.com/tour?a=1&b="2"'}));
  expect(html).toContain('href="https://example.com/tour?a=1&#38;b=&#34;2&#34;" target="_blank" rel="noopener noreferrer">Abrir</a>');
  expect(html).toContain('Enlace a example.com');expect(html).not.toContain('Descargar');expect(html).not.toContain('/file');expect(html).not.toMatch(/http-equiv="refresh"/i);
 });
 it('never shows business, seller or internal data (only what the view carries)',()=>{
  const html=renderMaterialPage(view());
  for(const word of ['@example','negocio','vendedor','interno','versión'])expect(html.toLowerCase()).not.toContain(word);
 });
});
describe('state pages',()=>{
 it.each([['unknown',404,'Este enlace no es válido'],['revoked',410,'Este enlace ya no está disponible'],['unavailable',410,'Este material ya no está disponible'],['storage',503,'no está disponible en este momento'],['rate_limited',429,'Demasiados pedidos'],['error',500,'No pudimos abrir']] as const)('%s answers %i',(state,status,text)=>{
  const html=renderMaterialStatePage({state});expect(materialStateStatus(state)).toBe(status);expect(html).toContain(text);expect(html).not.toContain('og:');expect(meta(html,'robots')).toBe('noindex, nofollow, noarchive');
 });
});
describe('materialHtmlResponse',()=>{
 it('enforces its own CSP and the public headers',async()=>{
  const r=materialHtmlResponse({html:'<p>x</p>',status:200,r2Origin:'https://acc.r2.cloudflarestorage.com'});
  expect(r.headers.get('Content-Security-Policy')).toBe(`default-src 'none'; img-src 'self' https://acc.r2.cloudflarestorage.com; media-src 'self' https://acc.r2.cloudflarestorage.com; frame-src 'self' https://acc.r2.cloudflarestorage.com; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`);
  expect(r.headers.get('Content-Security-Policy-Report-Only')).toBeNull();
  expect(r.headers.get('Cache-Control')).toBe('no-store');expect(r.headers.get('X-Robots-Tag')).toBe('noindex, nofollow, noarchive');expect(r.headers.get('Referrer-Policy')).toBe('no-referrer');
  expect(r.headers.get('Content-Type')).toBe('text/html; charset=utf-8');expect(await r.text()).toBe('<p>x</p>');
 });
 it('omits the body for HEAD and asks to retry later on 429',async()=>{
  expect(await materialHtmlResponse({html:'<p>x</p>',status:200,r2Origin:null,head:true}).text()).toBe('');
  expect(materialHtmlResponse({html:'',status:429,r2Origin:null}).headers.get('Retry-After')).toBe('600');
  expect(materialPageCsp({r2Origin:null})).toContain(`img-src 'self';`);
 });
});
