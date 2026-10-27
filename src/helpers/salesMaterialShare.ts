import {createHash,randomBytes,timingSafeEqual} from 'node:crypto';
import {isIP} from 'node:net';
/** Public share tokens: 32 random bytes in base64url (256 bits), checked with this pattern before touching the database (spec 89 §7). */
export const SHARE_TOKEN_PATTERN=/^[A-Za-z0-9_-]{43}$/;
/** True when the value has the exact shape of a share token. */
export const isShareTokenFormat=({token}:{token:string}):boolean=>SHARE_TOKEN_PATTERN.test(token);
/** sha256 hex of a token: the only form stored in `crm_sales_material_shares.token_hash`. */
export const hashShareToken=({token}:{token:string}):string=>createHash('sha256').update(token,'utf8').digest('hex');
/** A new token and its hash. The plain token only travels in the message sent to the client; it is never stored. */
export function generateShareToken():{token:string;tokenHash:string}{const token=randomBytes(32).toString('base64url');return {token,tokenHash:hashShareToken({token})};}
/** Constant-time comparison between a presented token and a stored hash (defence in depth after the indexed lookup by hash). */
export function shareTokenMatches({token,tokenHash}:{token:string;tokenHash:string}):boolean{
 const a=Buffer.from(hashShareToken({token}),'hex'),b=Buffer.from(/^[0-9a-f]{64}$/.test(tokenHash)?tokenHash:'','hex');
 return a.length===b.length&&timingSafeEqual(a,b);
}
/**
 * Link-preview bots and crawlers (spec 89 §7): they get the same HTML (Open Graph) but never count as a technical access.
 * Named preview fetchers plus generic `bot`/`crawler`/`spider`/`preview` and HTTP libraries; an empty user agent is not a browser either.
 */
export const PREVIEW_BOT_PATTERN=/whatsapp|facebookexternalhit|facebot|twitterbot|slackbot|telegrambot|linkedinbot|discordbot|googlebot|bingbot|skypeuripreview|applebot|pinterest|redditbot|embedly|iframely|vkshare|viber|snapchat|mastodon|bot\b|bot\/|crawler|spider|preview|curl\/|wget\/|python-requests|python-urllib|go-http-client|node-fetch|undici|axios\/|okhttp|headlesschrome/i;
/** True for link-preview bots, crawlers and non-browser HTTP clients. */
export const isPreviewBot=({userAgent}:{userAgent:string|null|undefined}):boolean=>!userAgent?.trim()||PREVIEW_BOT_PATTERN.test(userAgent);
const validIp=(value:string|null|undefined)=>{const v=value?.trim().replace(/^::ffff:/,'')??'';return isIP(v)?v:null;};
/**
 * Client IP for rate limiting. Behind Coolify the request arrives through Traefik, which overwrites `X-Real-IP` with the address it saw and
 * appends that same address as the LAST `X-Forwarded-For` entry (earlier entries are client-controlled and ignored). Without a proxy, the socket address.
 * Not verified against production: if Cloudflare proxies the domain, both headers carry a Cloudflare edge address (see the spec 89 F2 notes).
 */
export function clientIp({headers,remoteAddress}:{headers:Headers;remoteAddress?:string|null}):string{
 const forwarded=headers.get('x-forwarded-for')?.split(',').map(v=>v.trim()).filter(Boolean)??[];
 return validIp(headers.get('x-real-ip'))??validIp(forwarded.at(-1))??validIp(remoteAddress)??'unknown';
}
type Window={start:number;count:number};
/** Process-local rate limiter for `/m/*`: requests per IP per minute and unknown tokens per IP per 10 minutes. */
export type ShareRateLimiter={
 /** Counts one request; false when the IP exceeded `requestsPerMinute`. */
 allowRequest(ip:string):boolean;
 /** False when the IP already presented `unknownPerWindow` unknown tokens in the current window. */
 allowUnknownLookup(ip:string):boolean;
 /** Records one unknown or malformed token for the IP. */
 recordUnknown(ip:string):void;
 reset():void;
};
/**
 * In-memory fixed windows (spec 89 §7: 60 requests per minute per IP, 20 unknown tokens per 10 minutes). Production runs one container,
 * so memory is enough; a restart clears the counters. Expired entries are pruned when the map grows past `maxEntries`.
 */
export function createShareRateLimiter({requestsPerMinute=60,unknownPerWindow=20,unknownWindowMs=600000,maxEntries=10000,now=Date.now}:{requestsPerMinute?:number;unknownPerWindow?:number;unknownWindowMs?:number;maxEntries?:number;now?:()=>number}={}):ShareRateLimiter{
 const requests=new Map<string,Window>(),unknown=new Map<string,Window>();
 const current=(map:Map<string,Window>,ip:string,windowMs:number)=>{
  const t=now();let w=map.get(ip);
  if(!w||t-w.start>=windowMs){
   if(map.size>=maxEntries)for(const [key,value] of map)if(t-value.start>=windowMs)map.delete(key);
   w={start:t,count:0};map.set(ip,w);
  }
  return w;
 };
 return {
  allowRequest(ip){const w=current(requests,ip,60000);w.count++;return w.count<=requestsPerMinute;},
  allowUnknownLookup(ip){return current(unknown,ip,unknownWindowMs).count<unknownPerWindow;},
  recordUnknown(ip){current(unknown,ip,unknownWindowMs).count++;},
  reset(){requests.clear();unknown.clear();}
 };
}
