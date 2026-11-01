// @vitest-environment node
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer,type Server} from 'node:https';
import type {AddressInfo} from 'node:net';
import type {IncomingHttpHeaders} from 'node:http';
import {LINK_PREVIEW_USER_AGENT,LinkPreviewError,createHttpsFetchPinned,type FetchPinned} from './linkPreview';

/**
 * The real `node:https` transport against a local TLS server on an ephemeral port, with a throwaway self-signed certificate for the host name
 * `preview.test` generated here (never committed). No network: the URL host does not resolve; the transport must connect to the pinned address.
 * Skipped when `openssl` is not installed.
 */
let openssl=true;try{execFileSync('openssl',['version'],{stdio:'ignore'});}catch{openssl=false;}
const PNG=Buffer.from([137,80,78,71,13,10,26,10,0,0,0,13]);
describe.skipIf(!openssl)('httpsFetchPinned (local TLS server)',()=>{
 let server:Server,dir='',cert='',fetchPinned:FetchPinned;const seen:{url:string;headers:IncomingHttpHeaders}[]=[];
 beforeAll(async()=>{
  dir=mkdtempSync(join(tmpdir(),'link-preview-'));
  execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-days','1','-subj','/CN=preview.test','-addext','subjectAltName=DNS:preview.test','-keyout',join(dir,'key.pem'),'-out',join(dir,'cert.pem')],{stdio:'ignore'});
  cert=readFileSync(join(dir,'cert.pem'),'utf8');
  server=createServer({key:readFileSync(join(dir,'key.pem')),cert},(req,res)=>{
   seen.push({url:req.url??'',headers:req.headers});
   if(req.url?.startsWith('/page')){res.writeHead(200,{'Content-Type':'text/html'});res.end('<meta property="og:image" content="/i.png">'+'x'.repeat(5000));return;}
   if(req.url==='/redirect'){res.writeHead(302,{Location:'https://elsewhere.test/'});res.write('x'.repeat(1000));return;} // body never ends
   if(req.url==='/image'){res.writeHead(200,{'Content-Type':'image/png'});res.end(PNG);return;}
   if(req.url==='/big-declared'){res.writeHead(200,{'Content-Type':'image/png','Content-Length':'99999999'});res.write(PNG);return;}
   if(req.url==='/big-streamed'){res.writeHead(200,{'Content-Type':'image/png'});res.write(Buffer.alloc(3000));res.write(Buffer.alloc(3000));res.end();return;}
   res.writeHead(404).end();
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  fetchPinned=createHttpsFetchPinned({port:(server.address() as AddressInfo).port,ca:cert});
 });
 afterAll(()=>{server?.closeAllConnections();server?.close();if(dir)rmSync(dir,{recursive:true,force:true});});
 const get=(path:string,{maxBytes=4096,truncate=true}:{maxBytes?:number;truncate?:boolean}={})=>fetchPinned({url:new URL('https://preview.test'+path),address:'127.0.0.1',family:4,accept:'text/html',maxBytes,truncate,signal:AbortSignal.timeout(5000)});
 it('connects to the pinned address with the URL host for TLS and Host, a fixed User-Agent and no cookies',async()=>{
  const r=await get('/page?q=1');
  expect(r.status).toBe(200);expect(r.contentType).toBe('text/html');
  const req=seen.find(s=>s.url==='/page?q=1')!;
  expect(req.headers.host).toMatch(/^preview\.test(:\d+)?$/);expect(req.headers['user-agent']).toBe(LINK_PREVIEW_USER_AGENT);expect(req.headers.cookie).toBeUndefined();expect(req.headers['accept-encoding']).toBe('identity');
 });
 it('cuts HTML at maxBytes when truncating',async()=>{
  const r=await get('/page',{maxBytes:100});expect(r.body.length).toBe(100);expect(new TextDecoder().decode(r.body)).toContain('og:image');
 });
 it('returns a redirect without following it or reading its endless body',async()=>{
  const r=await get('/redirect');expect(r).toEqual({status:302,location:'https://elsewhere.test/',contentType:'',body:new Uint8Array()});
 });
 it('rejects an image over the cap, declared or streamed',async()=>{
  expect(await get('/image',{truncate:false}).then(r=>r.body.length)).toBe(PNG.length);
  for(const path of ['/big-declared','/big-streamed']){
   const error=await get(path,{maxBytes:4096,truncate:false}).then(()=>null,e=>e);
   expect(error,path).toBeInstanceOf(LinkPreviewError);expect((error as LinkPreviewError).code).toBe('too_large');
  }
 });
 it('refuses a certificate that does not match the host name',async()=>{
  const error=await fetchPinned({url:new URL('https://other.test/page'),address:'127.0.0.1',family:4,accept:'text/html',maxBytes:4096,truncate:true,signal:AbortSignal.timeout(5000)}).then(()=>null,e=>e);
  expect(error).toBeInstanceOf(Error);expect(String((error as Error).message)).toMatch(/altnames|certificate|Hostname/i);
 });
});
