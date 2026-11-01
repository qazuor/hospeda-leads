// @vitest-environment node
import {afterEach,describe,expect,it,vi} from 'vitest';
import {R2NotConfigured,R2Unavailable,createR2Storage,r2Config,r2Configured,r2Origin,r2Storage,setR2StorageForTests,type R2Config,type R2Storage} from './r2';

const env={R2_ACCOUNT_ID:'abc123',R2_ACCESS_KEY_ID:'AKID',R2_SECRET_ACCESS_KEY:'secret',R2_BUCKET:'crm-material'};
const config:R2Config={accountId:'abc123',accessKeyId:'AKID',secretAccessKey:'secret',bucket:'crm-material',endpoint:'https://abc123.r2.cloudflarestorage.com'};
const now=()=>new Date('2026-10-26T12:00:00.000Z');
afterEach(()=>setR2StorageForTests({storage:undefined}));
describe('r2Config',()=>{
 it('reads the four variables and builds the account endpoint',()=>{
  expect(r2Config({env})).toEqual(config);
  expect(r2Origin({env})).toBe('https://abc123.r2.cloudflarestorage.com');
  expect(r2Config({env:{...env,R2_ENDPOINT:'http://127.0.0.1:9000/'}})?.endpoint).toBe('http://127.0.0.1:9000');
 });
 it('is null when a variable is missing or malformed, so only storage paths fail',()=>{
  for(const key of Object.keys(env))expect(r2Config({env:{...env,[key]:' '}})).toBeNull();
  expect(r2Config({env:{...env,R2_ACCOUNT_ID:'a/b'}})).toBeNull();expect(r2Config({env:{...env,R2_BUCKET:'Bad_Bucket'}})).toBeNull();
  expect(r2Origin({env:{}})).toBeNull();
 });
});
describe('presigned URLs (aws4fetch, fixed date)',()=>{
 const storage=createR2Storage({config,now,fetchImpl:vi.fn()});
 it('signs a PUT on the path-style object URL with the Content-Type and a 30-minute expiry',async()=>{
  const url=new URL(await storage.presignPut({key:'materials/m/v1-u.pdf',contentType:'application/pdf',byteSize:1234,expiresIn:1800}));
  expect(url.origin+url.pathname).toBe('https://abc123.r2.cloudflarestorage.com/crm-material/materials/m/v1-u.pdf');
  expect(url.searchParams.get('X-Amz-Algorithm')).toBe('AWS4-HMAC-SHA256');
  expect(url.searchParams.get('X-Amz-Credential')).toBe('AKID/20261026/auto/s3/aws4_request');
  expect(url.searchParams.get('X-Amz-Date')).toBe('20261026T120000Z');
  expect(url.searchParams.get('X-Amz-Expires')).toBe('1800');
  expect(url.searchParams.get('X-Amz-SignedHeaders')).toBe('content-length;content-type;host');
  expect(url.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/);
  const other=new URL(await storage.presignPut({key:'materials/m/v1-u.pdf',contentType:'image/png',byteSize:1234,expiresIn:1800}));
  expect(other.searchParams.get('X-Amz-Signature')).not.toBe(url.searchParams.get('X-Amz-Signature'));
  const again=new URL(await storage.presignPut({key:'materials/m/v1-u.pdf',contentType:'application/pdf',byteSize:1234,expiresIn:1800}));
  expect(again.searchParams.get('X-Amz-Signature')).toBe(url.searchParams.get('X-Amz-Signature'));
 });
 it('signs a GET with response overrides and encodes each key segment',async()=>{
  const url=new URL(await storage.presignGet({key:'materials/m/v2-u ñ.pdf',expiresIn:300,disposition:'attachment; filename="a.pdf"',contentType:'application/pdf'}));
  expect(url.pathname).toBe('/crm-material/materials/m/v2-u%20%C3%B1.pdf');
  expect(url.searchParams.get('X-Amz-Expires')).toBe('300');
  expect(url.searchParams.get('response-content-disposition')).toBe('attachment; filename="a.pdf"');
  expect(url.searchParams.get('response-content-type')).toBe('application/pdf');
 });
});
describe('server calls with a mocked fetch',()=>{
 const reply=(status:number,headers:Record<string,string>={},body:BodyInit|null=null)=>vi.fn(async()=>new Response(body,{status,headers}));
 it('HEAD returns size, type and ETag, and null on 404',async()=>{
  const fetchImpl=reply(200,{'Content-Length':'42','Content-Type':'application/pdf',ETag:'"e"'});
  expect(await createR2Storage({config,now,fetchImpl}).head({key:'k'})).toEqual({size:42,contentType:'application/pdf',etag:'"e"'});
  const [url,init]=fetchImpl.mock.calls[0] as unknown as [string,RequestInit];
  expect(url).toBe('https://abc123.r2.cloudflarestorage.com/crm-material/k');expect(init.method).toBe('HEAD');
  expect(new Headers(init.headers).get('authorization')).toMatch(/^AWS4-HMAC-SHA256 Credential=AKID\/20261026\/auto\/s3\/aws4_request/);
  expect(await createR2Storage({config,now,fetchImpl:reply(404)}).head({key:'k'})).toBeNull();
 });
 it('reads a prefix with a Range header and deletes treating 404 as done',async()=>{
  const fetchImpl=reply(206,{},new Uint8Array([1,2,3,4]));
  expect([...await createR2Storage({config,now,fetchImpl}).readPrefix({key:'k',bytes:2})]).toEqual([1,2]);
  expect(new Headers((fetchImpl.mock.calls[0] as unknown as [string,RequestInit])[1].headers).get('range')).toBe('bytes=0-1');
  await expect(createR2Storage({config,now,fetchImpl:reply(404)}).remove({key:'k'})).resolves.toBeUndefined();
  await expect(createR2Storage({config,now,fetchImpl:reply(204)}).remove({key:'k'})).resolves.toBeUndefined();
 });
 it('reads small objects whole and refuses large ones',async()=>{
  const small=vi.fn(async(_url:string|URL|Request,init?:RequestInit)=>init?.method==='HEAD'?new Response(null,{headers:{'Content-Length':'3','Content-Type':'image/png'}}):new Response(new Uint8Array([7,8,9]),{headers:{'Content-Type':'image/png'}}));
  expect(await createR2Storage({config,now,fetchImpl:small}).read({key:'k',maxBytes:10})).toEqual({body:new Uint8Array([7,8,9]),contentType:'image/png'});
  await expect(createR2Storage({config,now,fetchImpl:small}).read({key:'k',maxBytes:2})).rejects.toThrow('supera');
 });
 it('streams without buffering and enforces the byte ceiling as chunks arrive',async()=>{
  const storage=createR2Storage({config,now,fetchImpl:reply(200,{'Content-Length':'4','Content-Type':'application/pdf'},new Uint8Array([1,2,3,4]))});const value=await storage.stream({key:'k',maxBytes:4});expect(value?.size).toBe(4);expect([...new Uint8Array(await new Response(value!.body).arrayBuffer())]).toEqual([1,2,3,4]);
  expect(value?.contentType).toBe('application/pdf');
  const tooLarge=await createR2Storage({config,now,fetchImpl:reply(200,{},new Uint8Array([1,2,3]))}).stream({key:'k',maxBytes:2});await expect(new Response(tooLarge!.body).arrayBuffer()).rejects.toThrow();
 });
 it('aborts a stalled call after the timeout, headers or body, as R2Unavailable',async()=>{
  const stalled=vi.fn((_url:string|URL|Request,init?:RequestInit)=>new Promise<Response>((_resolve,reject)=>{init?.signal?.addEventListener('abort',()=>reject(init.signal!.reason))}));
  await expect(createR2Storage({config,now,fetchImpl:stalled,timeoutMs:20}).head({key:'k'})).rejects.toBeInstanceOf(R2Unavailable);
  expect(stalled.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
  const body=vi.fn(async(_url:string|URL|Request,init?:RequestInit)=>new Response(new ReadableStream({start(controller){init?.signal?.addEventListener('abort',()=>controller.error(init.signal!.reason))}}),{status:206}));
  await expect(createR2Storage({config,now,fetchImpl:body,timeoutMs:20}).readPrefix({key:'k',bytes:4})).rejects.toBeInstanceOf(R2Unavailable);
 });
 it('wraps unexpected statuses and network failures as R2Unavailable',async()=>{
  await expect(createR2Storage({config,now,fetchImpl:reply(500)}).head({key:'k'})).rejects.toBeInstanceOf(R2Unavailable);
  await expect(createR2Storage({config,now,fetchImpl:reply(403)}).remove({key:'k'})).rejects.toBeInstanceOf(R2Unavailable);
  await expect(createR2Storage({config,now,fetchImpl:vi.fn(async()=>{throw new TypeError('fetch failed')})}).readPrefix({key:'k',bytes:16})).rejects.toBeInstanceOf(R2Unavailable);
 });
});
describe('process storage',()=>{
 it('throws R2NotConfigured without variables and accepts an injected stub',()=>{
  setR2StorageForTests({storage:null});expect(r2Configured()).toBe(false);expect(()=>r2Storage()).toThrow(R2NotConfigured);
  const stub={origin:'http://stub'} as R2Storage;setR2StorageForTests({storage:stub});expect(r2Configured()).toBe(true);expect(r2Storage()).toBe(stub);
 });
});
