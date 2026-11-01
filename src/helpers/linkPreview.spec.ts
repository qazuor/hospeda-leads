// @vitest-environment node
import {describe,expect,it,vi} from 'vitest';
import {LinkPreviewError,blockedAddress,extractPreviewImage,fetchLinkPreviewImage,linkTargetError,pinnedLookup,type FetchPinned,type Resolve} from './linkPreview';

const png=new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,1,2,3]);
const html=(head:string)=>new TextEncoder().encode(`<!doctype html><html><head>${head}</head><body>x</body></html>`);
const publicResolve:Resolve=async()=>[{address:'93.184.215.14',family:4}];
type Reply={status?:number;location?:string|null;contentType?:string;body?:Uint8Array};
/** A fake pinned fetch answering by URL; records every call (URL, pinned address and limits). */
function fakeFetch(routes:Record<string,Reply>){
 const calls:{url:string;address:string;maxBytes:number;truncate:boolean}[]=[];
 const fetchPinned:FetchPinned=async({url,address,maxBytes,truncate})=>{calls.push({url:url.href,address,maxBytes,truncate});const r=routes[url.href];if(!r)throw new Error('unexpected '+url.href);return {status:r.status??200,location:r.location??null,contentType:r.contentType??'text/html; charset=utf-8',body:r.body??new Uint8Array()};};
 return {calls,fetchPinned};
}
const code=async(promise:Promise<unknown>)=>{try{await promise;return 'ok';}catch(e){return e instanceof LinkPreviewError?e.code:'other:'+String(e);}};

describe('blockedAddress',()=>{
 it.each(['127.0.0.1','127.8.9.10','10.0.0.1','172.16.0.1','172.31.255.255','192.168.1.1','169.254.169.254','100.64.0.1','100.127.255.255','0.0.0.0','0.1.2.3','224.0.0.1','239.255.255.255','240.0.0.1','255.255.255.255','192.0.0.8','192.0.2.1','198.18.0.1','198.51.100.7','203.0.113.9','192.88.99.1'])('refuses IPv4 %s',ip=>expect(blockedAddress(ip)).toBe(true));
 it.each(['::','::1','::ffff:127.0.0.1','::ffff:8.8.8.8','::ffff:7f00:1','::127.0.0.1','64:ff9b::a00:1','fc00::1','fd12:3456::1','fe80::1','fe80::1%eth0','fec0::1','ff02::1','2001::1','2001:0:4136:e378::1','2001:db8::1','2002:c0a8:101::1','100::1','3fff::1'])('refuses IPv6 %s',ip=>expect(blockedAddress(ip)).toBe(true));
 it.each(['not an ip','','1.2.3','999.1.1.1'])('refuses garbage %j',ip=>expect(blockedAddress(ip)).toBe(true));
 it.each(['8.8.8.8','93.184.215.14','172.32.0.1','100.128.0.1','2606:4700:4700::1111','2a00:1450:4001:80b::200e'])('accepts public %s',ip=>expect(blockedAddress(ip)).toBe(false));
});

describe('linkTargetError',()=>{
 it('accepts a plain https URL on 443',()=>{expect(linkTargetError(new URL('https://example.com/a?b=1'))).toBeNull();expect(linkTargetError(new URL('https://example.com:443/'))).toBeNull();});
 it('refuses http, other ports, credentials and IP literals',()=>{
  for(const url of ['http://example.com/','https://example.com:8443/','https://user:pw@example.com/','https://user@example.com/','https://127.0.0.1/','https://[::1]/','https://8.8.8.8/','https://0x7f.1/','https://2130706433/','ftp://example.com/'])
   expect(linkTargetError(new URL(url)),url).not.toBeNull();
 });
});

describe('extractPreviewImage',()=>{
 const base=new URL('https://site.example/page/index.html');
 it('reads og:image, absolute or relative to the page',()=>{
  expect(extractPreviewImage({html:'<meta property="og:image" content="https://cdn.example/a.jpg">',baseUrl:base})).toBe('https://cdn.example/a.jpg');
  expect(extractPreviewImage({html:"<meta content='/img/b.png' property='og:image'/>",baseUrl:base})).toBe('https://site.example/img/b.png');
  expect(extractPreviewImage({html:'<META PROPERTY="OG:IMAGE" CONTENT="c.webp">',baseUrl:base})).toBe('https://site.example/page/c.webp');
 });
 it('prefers og:image:secure_url, falls back to twitter:image',()=>{
  expect(extractPreviewImage({html:'<meta property="og:image" content="https://a.example/1.jpg"><meta property="og:image:secure_url" content="https://a.example/2.jpg">',baseUrl:base})).toBe('https://a.example/2.jpg');
  expect(extractPreviewImage({html:'<meta name="twitter:image" content="https://a.example/t.jpg">',baseUrl:base})).toBe('https://a.example/t.jpg');
  expect(extractPreviewImage({html:'<meta name="twitter:image:src" content="https://a.example/s.jpg">',baseUrl:base})).toBe('https://a.example/s.jpg');
 });
 it('decodes entities and skips non-https candidates',()=>{
  expect(extractPreviewImage({html:'<meta property="og:image" content="https://a.example/x.jpg?a=1&amp;b=2">',baseUrl:base})).toBe('https://a.example/x.jpg?a=1&b=2');
  expect(extractPreviewImage({html:'<meta property="og:image" content="http://a.example/x.jpg"><meta name="twitter:image" content="https://a.example/y.jpg">',baseUrl:base})).toBe('https://a.example/y.jpg');
  expect(extractPreviewImage({html:'<meta property="og:image" content="data:image/png;base64,AAAA">',baseUrl:base})).toBeNull();
 });
 it('is linear on adversarial pages (regression: ReDoS froze the event loop)',()=>{
  for(const html of ['<meta '+'a'.repeat(1048576),'<meta'.repeat(209715),'<meta property="og:image" content="'+'a'.repeat(1048576),'<meta '+'a=b '.repeat(262144)+'>']){
   const started=performance.now();extractPreviewImage({html,baseUrl:base});expect(performance.now()-started,html.slice(0,20)).toBeLessThan(200);
  }
 });
 it('reads only the head, at most the first 64 KB',()=>{
  expect(extractPreviewImage({html:'<head></head><meta property="og:image" content="https://a.example/late.jpg">',baseUrl:base})).toBeNull();
  expect(extractPreviewImage({html:'<!--'+'x'.repeat(70000)+'--><meta property="og:image" content="https://a.example/far.jpg">',baseUrl:base})).toBeNull();
  expect(extractPreviewImage({html:'<meta name=description content=x><meta property=og:image content=https://a.example/u.jpg>',baseUrl:base})).toBe('https://a.example/u.jpg');
 });
 it('survives malformed entities: out-of-range code points stay as text and only preview tags are decoded',()=>{
  expect(extractPreviewImage({html:'<meta name="description" content="&#99999999; &#x110000; &#xD800;"><meta property="og:image" content="https://a.example/x.jpg?a=1&amp;b=2">',baseUrl:base})).toBe('https://a.example/x.jpg?a=1&b=2');
  expect(extractPreviewImage({html:'<meta property="og:image" content="https://a.example/&#99999999;.jpg">',baseUrl:base})).toMatch(/^https:\/\/a\.example\/&/);
 });
 it('returns null without a preview image',()=>{
  expect(extractPreviewImage({html:'<title>x</title><meta name="description" content="y">',baseUrl:base})).toBeNull();
  expect(extractPreviewImage({html:'<meta property="og:image" content="">',baseUrl:base})).toBeNull();
 });
});

describe('pinnedLookup',()=>{
 it('always answers the validated address, in both callback forms',()=>{
  const lookup=pinnedLookup('93.184.215.14',4);
  const single=vi.fn(),all=vi.fn();
  lookup('evil.example',{},single);lookup('evil.example',{all:true},all);
  expect(single).toHaveBeenCalledWith(null,'93.184.215.14',4);
  expect(all).toHaveBeenCalledWith(null,[{address:'93.184.215.14',family:4}]);
 });
});

describe('fetchLinkPreviewImage',()=>{
 it('fetches the page, then its og:image, connecting to the validated address with the size caps',async()=>{
  const {calls,fetchPinned}=fakeFetch({'https://site.example/':{body:html('<meta property="og:image" content="/cover.png">')},'https://site.example/cover.png':{contentType:'image/png',body:png}});
  const result=await fetchLinkPreviewImage({url:'https://site.example/',resolve:publicResolve,fetchPinned});
  expect(result.contentType).toBe('image/png');expect([...result.body]).toEqual([...png]);
  expect(calls).toEqual([{url:'https://site.example/',address:'93.184.215.14',maxBytes:1048576,truncate:true},{url:'https://site.example/cover.png',address:'93.184.215.14',maxBytes:5242880,truncate:false}]);
 });
 it('refuses a host when any resolved address is private, without connecting',async()=>{
  const {calls,fetchPinned}=fakeFetch({});
  const resolve:Resolve=async()=>[{address:'93.184.215.14',family:4},{address:'10.0.0.5',family:4}];
  expect(await code(fetchLinkPreviewImage({url:'https://site.example/',resolve,fetchPinned}))).toBe('blocked');expect(calls).toEqual([]);
 });
 it('refuses a host that does not resolve, http, credentials and IP literals',async()=>{
  const {calls,fetchPinned}=fakeFetch({});
  expect(await code(fetchLinkPreviewImage({url:'https://nowhere.example/',resolve:async()=>[],fetchPinned}))).toBe('blocked');
  for(const url of ['http://site.example/','https://a:b@site.example/','https://127.0.0.1/','https://site.example:444/','not a url'])expect(await code(fetchLinkPreviewImage({url,resolve:publicResolve,fetchPinned})),url).toBe('blocked');
  expect(calls).toEqual([]);
 });
 it('re-validates every redirect: a hop to a private address or to http is refused',async()=>{
  const resolve:Resolve=async host=>host==='internal.example'?[{address:'192.168.0.10',family:4}]:[{address:'93.184.215.14',family:4}];
  const toPrivate=fakeFetch({'https://site.example/':{status:302,location:'https://internal.example/admin'}});
  expect(await code(fetchLinkPreviewImage({url:'https://site.example/',resolve,fetchPinned:toPrivate.fetchPinned}))).toBe('blocked');expect(toPrivate.calls.map(c=>c.url)).toEqual(['https://site.example/']);
  const toHttp=fakeFetch({'https://site.example/':{status:301,location:'http://site.example/'}});
  expect(await code(fetchLinkPreviewImage({url:'https://site.example/',resolve,fetchPinned:toHttp.fetchPinned}))).toBe('blocked');
  const imageToPrivate=fakeFetch({'https://site.example/':{body:html('<meta property="og:image" content="https://site.example/i.png">')},'https://site.example/i.png':{status:307,location:'https://internal.example/i.png'}});
  expect(await code(fetchLinkPreviewImage({url:'https://site.example/',resolve,fetchPinned:imageToPrivate.fetchPinned}))).toBe('blocked');
 });
 it('follows at most 3 redirects',async()=>{
  const ok=fakeFetch({'https://site.example/':{status:301,location:'/1'},'https://site.example/1':{status:302,location:'/2'},'https://site.example/2':{status:303,location:'/3'},'https://site.example/3':{body:html('<meta property="og:image" content="/i.png">')},'https://site.example/i.png':{contentType:'image/png',body:png}});
  expect(await code(fetchLinkPreviewImage({url:'https://site.example/',resolve:publicResolve,fetchPinned:ok.fetchPinned}))).toBe('ok');
  const tooMany=fakeFetch({'https://site.example/':{status:301,location:'/1'},'https://site.example/1':{status:302,location:'/2'},'https://site.example/2':{status:303,location:'/3'},'https://site.example/3':{status:302,location:'/4'}});
  expect(await code(fetchLinkPreviewImage({url:'https://site.example/',resolve:publicResolve,fetchPinned:tooMany.fetchPinned}))).toBe('failed');
 });
 it('needs an HTML page with a preview image',async()=>{
  const json=fakeFetch({'https://site.example/':{contentType:'application/json',body:new TextEncoder().encode('{}')}});
  expect(await code(fetchLinkPreviewImage({url:'https://site.example/',resolve:publicResolve,fetchPinned:json.fetchPinned}))).toBe('bad_type');
  const none=fakeFetch({'https://site.example/':{body:html('<title>Sin imagen</title>')}});
  expect(await code(fetchLinkPreviewImage({url:'https://site.example/',resolve:publicResolve,fetchPinned:none.fetchPinned}))).toBe('no_image');
  const missing=fakeFetch({'https://site.example/':{status:404}});
  expect(await code(fetchLinkPreviewImage({url:'https://site.example/',resolve:publicResolve,fetchPinned:missing.fetchPinned}))).toBe('failed');
 });
 it('accepts only PNG, JPEG, WebP or GIF whose bytes match the declared type; never SVG',async()=>{
  const page={body:html('<meta property="og:image" content="/i">')};
  for(const [contentType,body,expected] of [['image/svg+xml',new TextEncoder().encode('<svg/>'),'bad_type'],['image/png',new Uint8Array([0xff,0xd8,0xff,0,1,2,3,4,5,6,7,8,9,10,11,12]),'bad_type'],['text/html',png,'bad_type'],['image/jpg',new Uint8Array([0xff,0xd8,0xff,0xe0,1,2,3,4,5,6,7,8,9,10,11,12]),'ok']] as const){
   const f=fakeFetch({'https://site.example/':page,'https://site.example/i':{contentType,body:new Uint8Array(body)}});
   expect(await code(fetchLinkPreviewImage({url:'https://site.example/',resolve:publicResolve,fetchPinned:f.fetchPinned})),contentType).toBe(expected);
  }
 });
 it('refuses an image over 5 MB even if the transport returned it',async()=>{
  const big=new Uint8Array(5242881);big.set(png);
  const f=fakeFetch({'https://site.example/':{body:html('<meta property="og:image" content="/i.png">')},'https://site.example/i.png':{contentType:'image/png',body:big}});
  expect(await code(fetchLinkPreviewImage({url:'https://site.example/',resolve:publicResolve,fetchPinned:f.fetchPinned}))).toBe('too_large');
 });
 it('gives up after the total timeout',async()=>{
  const fetchPinned:FetchPinned=({signal})=>new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));
  expect(await code(fetchLinkPreviewImage({url:'https://site.example/',resolve:publicResolve,fetchPinned,timeoutMs:20}))).toBe('timeout');
  const slowDns:Resolve=()=>new Promise(()=>{});
  expect(await code(fetchLinkPreviewImage({url:'https://site.example/',resolve:slowDns,fetchPinned,timeoutMs:20}))).toBe('timeout');
 });
});
