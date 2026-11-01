import {request as httpsRequest} from 'node:https';import {lookup as dnsLookup} from 'node:dns/promises';import {isIP} from 'node:net';
import {signatureMatches} from './salesMaterialTypes';
/**
 * Spec 102 D1: the Open Graph image of an external link, fetched by the server. This is the CRM's only request to third-party sites, so every
 * hop is defended against SSRF: https on 443 only, no credentials, no IP literals; every resolved address must be public (a single private one
 * refuses the host) and the connection is pinned to the validated address (no DNS rebinding); redirects are manual (at most 3) and each one is
 * validated again; total time and response sizes are capped; content types and image signatures are checked; no cookies, fixed User-Agent.
 * Only `node:https`, `node:dns` and `node:net`: no new dependencies.
 */
export type LinkPreviewCode='blocked'|'no_image'|'timeout'|'too_large'|'bad_type'|'failed';
/** A refused or failed preview. `code` is what the log records (never the full URL, which may carry tokens). */
export class LinkPreviewError extends Error{constructor(readonly code:LinkPreviewCode,message:string){super(message);this.name='LinkPreviewError';}}
export const LINK_PREVIEW_USER_AGENT='HospedaCRM-LinkPreview/1.0';
/** Most HTML read from a page (the tags live in `<head>`; the rest is cut, not an error) and the largest image accepted. */
export const LINK_PREVIEW_MAX_HTML_BYTES=1048576,LINK_PREVIEW_MAX_IMAGE_BYTES=5242880;
/** Whole operation (page, image and redirects) and connect/idle time of one request. */
export const LINK_PREVIEW_TIMEOUT_MS=8000,LINK_PREVIEW_CONNECT_TIMEOUT_MS=4000;
export const LINK_PREVIEW_MAX_REDIRECTS=3;
const IMAGE_TYPES=['image/png','image/jpeg','image/webp','image/gif'] as const;
const blocked=(message='Ese enlace apunta a una dirección que no se puede consultar.')=>new LinkPreviewError('blocked',message);

function ipv4Bytes(ip:string):number[]|null{
 const parts=ip.split('.');if(parts.length!==4)return null;
 const bytes=parts.map(p=>/^\d{1,3}$/.test(p)?Number(p):NaN);return bytes.every(b=>Number.isInteger(b)&&b>=0&&b<=255)?bytes:null;
}
function ipv6Words(ip:string):number[]|null{
 let s=ip.toLowerCase(),tail:number[]=[];
 const v4=/(\d+\.\d+\.\d+\.\d+)$/.exec(s);
 if(v4){const b=ipv4Bytes(v4[1]);if(!b)return null;tail=[(b[0]<<8)|b[1],(b[2]<<8)|b[3]];s=s.slice(0,-v4[1].length);if(s.endsWith(':')&&!s.endsWith('::'))s=s.slice(0,-1);}
 const halves=s.split('::');if(halves.length>2)return null;
 const words=(part:string)=>part?part.split(':'):[];
 const head=words(halves[0]),rest=halves.length===2?words(halves[1]):[];
 if([...head,...rest].some(w=>!/^[0-9a-f]{1,4}$/.test(w)))return null;
 const fill=8-head.length-rest.length-tail.length;
 if(halves.length===2?fill<0:fill!==0)return null;
 return [...head.map(w=>parseInt(w,16)),...Array<number>(halves.length===2?fill:0).fill(0),...rest.map(w=>parseInt(w,16)),...tail];
}
function blockedIpv4([a,b,c]:number[]):boolean{
 return a===0||a===10||a===127||a>=224||a===100&&(b&0xc0)===64||a===169&&b===254||a===172&&(b&0xf0)===16||a===192&&b===168
  ||a===192&&b===0&&(c===0||c===2)||a===192&&b===88&&c===99||a===198&&(b&0xfe)===18||a===198&&b===51&&c===100||a===203&&b===0&&c===113;
}
/**
 * True when an address must never be contacted: loopback, private, link-local (cloud metadata), CGNAT, `0.0.0.0/8`, multicast, reserved and
 * documentation IPv4; in IPv6 everything outside global unicast `2000::/3` (`::`, `::1`, `fc00::/7`, `fe80::/10`, multicast…), IPv4-mapped and
 * IPv4-compatible addresses, NAT64, Teredo and the other `2001::/23` assignments, 6to4 and documentation ranges. Anything unparsable or with a
 * zone id is refused too.
 */
export function blockedAddress(ip:string):boolean{
 const version=isIP(ip);
 if(version===4){const b=ipv4Bytes(ip);return !b||blockedIpv4(b);}
 if(version!==6||ip.includes('%'))return true;
 const w=ipv6Words(ip);if(!w)return true;
 if(w.slice(0,5).every(x=>x===0)&&(w[5]===0||w[5]===0xffff))return true;
 if(w[0]===0x64&&w[1]===0xff9b)return true;
 if((w[0]&0xe000)!==0x2000)return true;
 if(w[0]===0x2001&&(w[1]<0x200||w[1]===0xdb8))return true;
 return w[0]===0x2002||w[0]===0x3fff&&w[1]<0x1000;
}
/** Why a URL may not be requested (https, port 443, no user or password, a host name rather than an IP literal), or null when it may. */
export function linkTargetError(url:URL):string|null{
 if(url.protocol!=='https:')return 'Solo se consultan enlaces https://.';
 if(url.port&&url.port!=='443')return 'Solo se consultan enlaces en el puerto 443.';
 if(url.username||url.password)return 'El enlace no puede incluir usuario ni contraseña.';
 if(isIP(url.hostname.replace(/^\[|\]$/g,'')))return 'El enlace no puede apuntar a una dirección IP.';
 return null;
}
const ENTITIES:Record<string,string>={amp:'&',quot:'"',apos:"'",lt:'<',gt:'>',nbsp:' '};
/** Decodes HTML entities; a numeric one outside Unicode (or a surrogate) stays as written instead of throwing. */
const decodeEntities=(text:string)=>text.replace(/&(#x[0-9a-f]{1,8}|#\d{1,10}|[a-z]{2,8});/gi,(all,e:string)=>{
 if(e[0]!=='#')return ENTITIES[e.toLowerCase()]??all;
 const code=e[1]==='x'||e[1]==='X'?parseInt(e.slice(2),16):Number(e.slice(1));
 return code<=0x10ffff&&(code<0xd800||code>0xdfff)?String.fromCodePoint(code):all;
});
const META_KEYS=['og:image:secure_url','og:image','og:image:url','twitter:image','twitter:image:src'];
/** Only this much of a page is scanned for preview tags (they live in `<head>`); also stops at `</head>`. */
export const LINK_PREVIEW_MAX_HEAD_CHARS=65536;
const SPACE=/\s/;
/**
 * Attributes of one tag body (`property="og:image" content=…`), scanned by hand in one pass: every step advances, so the cost is linear in
 * the tag length (regular expressions with nested repetition here were quadratic on hostile pages and froze the event loop).
 */
function tagAttributes(body:string):Map<string,string>{
 const attrs=new Map<string,string>();let i=0;const n=body.length;
 while(i<n){
  while(i<n&&(SPACE.test(body[i])||body[i]==='/'))i++;
  const nameStart=i;while(i<n&&!SPACE.test(body[i])&&body[i]!=='='&&body[i]!=='/')i++;
  const name=body.slice(nameStart,i).toLowerCase();
  while(i<n&&SPACE.test(body[i]))i++;
  if(body[i]!=='='){if(i===nameStart)i++;continue;}
  i++;while(i<n&&SPACE.test(body[i]))i++;
  let value='';
  if(body[i]==='"'||body[i]==="'"){const quote=body[i],close=body.indexOf(quote,i+1);value=body.slice(i+1,close<0?n:close);i=close<0?n:close+1;}
  else{const valueStart=i;while(i<n&&!SPACE.test(body[i]))i++;value=body.slice(valueStart,i);}
  if(name&&!attrs.has(name))attrs.set(name,value);
 }
 return attrs;
}
/**
 * The preview image of a page: `og:image:secure_url`, `og:image`, `og:image:url`, then `twitter:image`, resolved against the page; only https.
 * Linear scan of at most the first 64 KB, up to `</head>`.
 */
export function extractPreviewImage({html,baseUrl}:{html:string;baseUrl:URL}):string|null{
 // Both patterns are literal (no repetition), so each search is linear; indexes refer to the original text (values keep their case).
 const capped=html.slice(0,LINK_PREVIEW_MAX_HEAD_CHARS),headEnd=capped.search(/<\/head>/i),head=headEnd>=0?capped.slice(0,headEnd):capped;
 const found=new Map<string,string>(),opener=/<meta/gi;
 for(let m=opener.exec(head);m;m=opener.exec(head)){
  const at=m.index,next=head[at+5];if(next!==undefined&&!SPACE.test(next)&&next!=='/'&&next!=='>')continue;
  const close=head.indexOf('>',at+5);if(close<0)break;
  const attrs=tagAttributes(head.slice(at+5,close));opener.lastIndex=close+1;
  const key=(attrs.get('property')??attrs.get('name')??'').trim().toLowerCase();
  if(!META_KEYS.includes(key)||found.has(key))continue;
  const content=decodeEntities(attrs.get('content')??'').trim();if(content)found.set(key,content);
 }
 for(const key of META_KEYS){
  const value=found.get(key);if(!value)continue;
  try{const url=new URL(value,baseUrl);if(url.protocol==='https:')return url.href;}catch{/* Next candidate. */}
 }
 return null;
}
/** Resolves every address of a host (`dns.lookup` with `all`, so `/etc/hosts` counts too). */
export type Resolve=(host:string)=>Promise<readonly {address:string;family:number}[]>;
const dnsResolve:Resolve=async host=>{try{return await dnsLookup(host,{all:true,verbatim:true});}catch{return [];}};
/** One GET to `url` connected to `address` (TLS name and Host stay the URL's host). Reads at most `maxBytes`: cuts there with `truncate`, otherwise fails. */
export type FetchPinned=(input:{url:URL;address:string;family:number;accept:string;maxBytes:number;truncate:boolean;signal:AbortSignal})=>Promise<{status:number;location:string|null;contentType:string;body:Uint8Array}>;
type LookupCallback=(error:Error|null,address:string|{address:string;family:number}[],family?:number)=>void;
/** A `lookup` for `node:https` that ignores DNS and answers the validated address (both callback forms: with and without `all`). */
export function pinnedLookup(address:string,family:number){
 return (_host:string,options:{all?:boolean}|number|undefined,callback:LookupCallback)=>{
  if(typeof options==='object'&&options?.all)callback(null,[{address,family}]);else callback(null,address,family);
 };
}
const unmap=(ip:string)=>ip.replace(/^::ffff:(?=\d+\.\d+\.\d+\.\d+$)/i,'');
/**
 * The real transport: `node:https` without agent (no pooled sockets, no cookies), pinned address, no redirects followed, capped body.
 * `port` and `ca` exist only so tests can reach a local TLS server; production uses {@link httpsFetchPinned} (443, system CAs).
 */
export const createHttpsFetchPinned=({port=443,ca}:{port?:number;ca?:string}={}):FetchPinned=>({url,address,family,accept,maxBytes,truncate,signal})=>new Promise((resolve,reject)=>{
 let settled=false;
 const finish=(fn:()=>void)=>{if(!settled){settled=true;fn();}};
 const req=httpsRequest({protocol:'https:',hostname:url.hostname,port,...(ca?{ca}:{}),path:url.pathname+url.search,method:'GET',servername:url.hostname,agent:false,signal,timeout:LINK_PREVIEW_CONNECT_TIMEOUT_MS,
  lookup:pinnedLookup(address,family) as never,headers:{'User-Agent':LINK_PREVIEW_USER_AGENT,Accept:accept,'Accept-Encoding':'identity','Accept-Language':'es-AR,es;q=0.9'}});
 req.on('timeout',()=>req.destroy(new LinkPreviewError('timeout','El sitio tardó demasiado en responder.')));
 req.on('error',error=>finish(()=>reject(error)));
 req.on('response',res=>{
  const remote=res.socket?.remoteAddress;
  if(remote&&unmap(remote)!==unmap(address)){req.destroy();finish(()=>reject(blocked()));return;}
  const status=res.statusCode??0,location=typeof res.headers.location==='string'?res.headers.location:null,contentType=String(res.headers['content-type']??'');
  // Redirects and errors: only the headers matter; the body is never read (a server could stream it forever).
  if(status<200||status>=300){finish(()=>resolve({status,location,contentType,body:new Uint8Array()}));req.destroy();return;}
  if(!truncate&&Number(res.headers['content-length'])>maxBytes){req.destroy();finish(()=>reject(new LinkPreviewError('too_large','La imagen del enlace es demasiado grande.')));return;}
  const chunks:Buffer[]=[];let size=0;
  const done=()=>finish(()=>resolve({status,location,contentType,body:new Uint8Array(Buffer.concat(chunks))}));
  res.on('data',(chunk:Buffer)=>{
   if(settled)return;
   if(size+chunk.length>maxBytes){
    if(truncate){chunks.push(chunk.subarray(0,maxBytes-size));size=maxBytes;done();}
    else finish(()=>reject(new LinkPreviewError('too_large','La imagen del enlace es demasiado grande.')));
    req.destroy();return;
   }
   chunks.push(chunk);size+=chunk.length;
  });
  res.on('end',done);res.on('error',error=>finish(()=>reject(error)));
 });
 req.end();
});
/** The production transport (port 443, system CAs). */
export const httpsFetchPinned:FetchPinned=createHttpsFetchPinned();
const mimeOf=(contentType:string)=>{const m=contentType.split(';')[0].trim().toLowerCase();return m==='image/jpg'||m==='image/pjpeg'?'image/jpeg':m;};
/** A GET through the guard: validates the URL, resolves and checks every address, pins it, and follows (and re-validates) up to 3 redirects. */
async function guardedGet({url,accept,maxBytes,truncate,resolve,fetchPinned,signal}:{url:URL;accept:string;maxBytes:number;truncate:boolean;resolve:Resolve;fetchPinned:FetchPinned;signal:AbortSignal}){
 let current=url;
 for(let hop=0;;hop++){
  const refused=linkTargetError(current);if(refused)throw blocked(refused);
  // DNS cannot be cancelled: the race keeps a slow resolver from outliving the total timeout.
  const addresses=await Promise.race([resolve(current.hostname),new Promise<never>((_,reject)=>{if(signal.aborted)reject(signal.reason);signal.addEventListener('abort',()=>reject(signal.reason),{once:true});})]);
  if(!addresses.length||addresses.some(a=>blockedAddress(a.address)))throw blocked();
  const {address,family}=addresses[0];
  const response=await fetchPinned({url:current,address,family,accept,maxBytes,truncate,signal});
  if(response.status>=300&&response.status<400&&response.location){
   if(hop>=LINK_PREVIEW_MAX_REDIRECTS)throw new LinkPreviewError('failed','El enlace redirige demasiadas veces.');
   try{current=new URL(response.location,current);}catch{throw new LinkPreviewError('failed','El enlace redirige a una dirección inválida.');}
   current.hash='';continue;
  }
  if(response.status<200||response.status>=300)throw new LinkPreviewError('failed',`El sitio respondió ${response.status}.`);
  if(response.body.length>maxBytes&&!truncate)throw new LinkPreviewError('too_large','La imagen del enlace es demasiado grande.');
  return {url:current,contentType:response.contentType,body:truncate?response.body.subarray(0,maxBytes):response.body};
 }
}
/**
 * The preview image of an external page: its HTML (at most 1 MB, `text/html`), then the image (at most 5 MB, PNG/JPEG/WebP/GIF whose first
 * bytes match the declared type; SVG and anything else refused). Throws {@link LinkPreviewError}; the whole call gives up after `timeoutMs`.
 */
export async function fetchLinkPreviewImage({url,resolve=dnsResolve,fetchPinned=httpsFetchPinned,timeoutMs=LINK_PREVIEW_TIMEOUT_MS}:{url:string;resolve?:Resolve;fetchPinned?:FetchPinned;timeoutMs?:number}):Promise<{body:Uint8Array;contentType:string}>{
 let target:URL;try{target=new URL(url);}catch{throw blocked('El enlace no es una dirección válida.');}
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(new LinkPreviewError('timeout','El sitio tardó demasiado en responder.')),timeoutMs);
 try{
  const page=await guardedGet({url:target,accept:'text/html,application/xhtml+xml;q=0.9',maxBytes:LINK_PREVIEW_MAX_HTML_BYTES,truncate:true,resolve,fetchPinned,signal:controller.signal});
  if(!/^(text\/html|application\/xhtml\+xml)$/.test(mimeOf(page.contentType)))throw new LinkPreviewError('bad_type','El enlace no es una página web.');
  const image=extractPreviewImage({html:new TextDecoder().decode(page.body),baseUrl:page.url});
  if(!image)throw new LinkPreviewError('no_image','La página no tiene imagen de vista previa.');
  const found=await guardedGet({url:new URL(image),accept:IMAGE_TYPES.join(','),maxBytes:LINK_PREVIEW_MAX_IMAGE_BYTES,truncate:false,resolve,fetchPinned,signal:controller.signal});
  const contentType=mimeOf(found.contentType);
  if(!(IMAGE_TYPES as readonly string[]).includes(contentType)||!signatureMatches({mimeType:contentType,bytes:found.body.subarray(0,16)}))throw new LinkPreviewError('bad_type','La imagen del enlace no es JPG, PNG, WebP ni GIF.');
  return {body:found.body,contentType};
 }catch(error){
  if(error instanceof LinkPreviewError)throw error;
  if(controller.signal.aborted)throw new LinkPreviewError('timeout','El sitio tardó demasiado en responder.');
  throw new LinkPreviewError('failed','No se pudo consultar el enlace.');
 }finally{clearTimeout(timer);}
}
