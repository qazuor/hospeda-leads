import {createHash,randomBytes,timingSafeEqual} from 'node:crypto';
import {isIP} from 'node:net';
/** Public share tokens: 32 random bytes in base64url (256 bits), checked with this pattern before touching the database (spec 89 §7). */
export const SHARE_TOKEN_PATTERN=/^[A-Za-z0-9_-]{43}$/;
/** True when the value has the exact shape of a share token. */
export const isShareTokenFormat=({token}:{token:string}):boolean=>SHARE_TOKEN_PATTERN.test(token);
/** sha256 hex of a token: the only form stored in `crm_sales_material_shares.token_hash`. */
export const hashShareToken=({token}:{token:string}):string=>createHash('sha256').update(token,'utf8').digest('hex');
/**
 * A new token and its hash. 32 random bytes encode to 43 base64url characters whose LAST one carries only 4 bits of data, so it is always one of
 * `A E I M Q U Y c g k o s w 0 4 8`: alphanumeric, never `-` or `_`. Linkifiers therefore cannot swallow or extend the end of the token.
 * The plain token only travels in the message sent to the client; it is never stored. */
export function generateShareToken():{token:string;tokenHash:string}{const token=randomBytes(32).toString('base64url');return {token,tokenHash:hashShareToken({token})};}
/** Constant-time comparison between a presented token and a stored hash (defence in depth after the indexed lookup by hash). */
export function shareTokenMatches({token,tokenHash}:{token:string;tokenHash:string}):boolean{
 const a=Buffer.from(hashShareToken({token}),'hex'),b=Buffer.from(/^[0-9a-f]{64}$/.test(tokenHash)?tokenHash:'','hex');
 return a.length===b.length&&timingSafeEqual(a,b);
}
/**
 * Link-preview bots and crawlers (spec 89 §7): they get the same HTML (Open Graph) but never count as a technical access.
 * Named preview fetchers plus generic `name-bot/version`, a standalone `bot` word, `crawler`/`spider`/`preview` and HTTP libraries; an empty user agent is not a browser either.
 * A bare `bot` suffix is NOT enough: phone brands such as «CUBOT X30» would be treated as crawlers.
 */
export const PREVIEW_BOT_PATTERN=/whatsapp|facebookexternalhit|facebot|twitterbot|slackbot|telegrambot|linkedinbot|discordbot|googlebot|bingbot|skypeuripreview|applebot|pinterest|redditbot|embedly|iframely|vkshare|viber|snapchat|mastodon|bot\/|\bbot\b|crawler|spider|preview|curl\/|wget\/|python-requests|python-urllib|go-http-client|node-fetch|undici|axios\/|okhttp|headlesschrome/i;
/** True for link-preview bots, crawlers and non-browser HTTP clients. */
export const isPreviewBot=({userAgent}:{userAgent:string|null|undefined}):boolean=>!userAgent?.trim()||PREVIEW_BOT_PATTERN.test(userAgent);
const validIp=(value:string|null|undefined)=>{const v=value?.trim().replace(/^::ffff:/,'')??'';return isIP(v)?v:null;};
/** Where the client address comes from (env `CRM_CLIENT_IP_HEADER`). */
export type ClientIpMode='x-real-ip'|'cf-connecting-ip'|'x-forwarded-for'|'none';
export const CLIENT_IP_MODES:readonly ClientIpMode[]=['x-real-ip','cf-connecting-ip','x-forwarded-for','none'];
/** Parses `CRM_CLIENT_IP_HEADER`; empty or unknown values fall back to the default `x-real-ip`. */
export function clientIpMode({value=process.env.CRM_CLIENT_IP_HEADER}:{value?:string|null}={}):ClientIpMode{
 const v=value?.trim().toLowerCase();return CLIENT_IP_MODES.find(m=>m===v)??'x-real-ip';
}
/**
 * Client IP for rate limiting, from exactly ONE trusted source chosen by `mode` (default: env `CRM_CLIENT_IP_HEADER`, else `x-real-ip`):
 * - `x-real-ip`: Traefik (Coolify) overwrites it with the address it saw;
 * - `cf-connecting-ip`: only safe when the origin accepts traffic exclusively from Cloudflare, otherwise anyone can forge it;
 * - `x-forwarded-for`: the LAST hop (appended by our proxy); earlier entries are client-controlled and ignored;
 * - `none`: the socket address only.
 * Headers of the other modes are ignored, so a client cannot spoof a source we did not configure. A missing or invalid value falls back to the socket address.
 */
export function clientIp({headers,remoteAddress,mode=clientIpMode()}:{headers:Headers;remoteAddress?:string|null;mode?:ClientIpMode}):string{
 const fromHeader=mode==='x-real-ip'?validIp(headers.get('x-real-ip')):mode==='cf-connecting-ip'?validIp(headers.get('cf-connecting-ip')):mode==='x-forwarded-for'?validIp(headers.get('x-forwarded-for')?.split(',').map(v=>v.trim()).filter(Boolean).at(-1)):null;
 return fromHeader??validIp(remoteAddress)??'unknown';
}
/**
 * Clean token for a link mangled by chat apps and linkifiers: a trailing `/`, `.`, `,` or `)` (also `%29`/`%2C`) after a well-formed token.
 * Returns null for anything else, including the clean path itself.
 */
export function mangledShareTokenFromPath({pathname}:{pathname:string}):string|null{
 const m=/^\/m\/([A-Za-z0-9_-]{43})(?:[/.,)]|%29|%2C)$/i.exec(pathname);return m?m[1]!:null;
}
type Window={start:number;count:number};
/** Process-local rate limiter for `/m/*`: requests per IP per minute and unknown tokens per IP per 10 minutes. */
export type ShareRateLimiter={
 /** Counts one request; false when the IP exceeded `requestsPerMinute`. */
 allowRequest(ip:string):boolean;
 /** False when the IP already presented `unknownPerWindow` unknown tokens in the current window. Consulted only for tokens that did not resolve. */
 allowUnknownLookup(ip:string):boolean;
 /** Records one unknown or malformed token for the IP. */
 recordUnknown(ip:string):void;
 /** Entries currently held (tests). */
 size():number;
 reset():void;
};
/**
 * In-memory fixed windows (spec 89 §7). The general limit is generous (300 per minute) because shared IPs (offices, carrier NAT) are normal and it only
 * cuts abuse noise; the strict one (20 unknown tokens per 10 minutes) applies ONLY to tokens that did not resolve, so a valid link is never locked out.
 * Production runs one container, so memory is enough; a restart clears the counters.
 * Memory is bounded: each map keeps its entries ordered by window start (a new window is re-inserted at the end), so the front is always the oldest.
 * An insert first drops expired entries from the front, then evicts the oldest while the map is over `maxEntries`: amortised O(1), no full scan, no timer.
 */
export function createShareRateLimiter({requestsPerMinute=300,unknownPerWindow=20,unknownWindowMs=600000,maxEntries=10000,now=Date.now}:{requestsPerMinute?:number;unknownPerWindow?:number;unknownWindowMs?:number;maxEntries?:number;now?:()=>number}={}):ShareRateLimiter{
 const requests=new Map<string,Window>(),unknown=new Map<string,Window>();
 const current=(map:Map<string,Window>,ip:string,windowMs:number)=>{
  const t=now();let w=map.get(ip);
  if(!w||t-w.start>=windowMs){
   map.delete(ip);
   for(const [key,value] of map){if(t-value.start<windowMs)break;map.delete(key);}
   while(map.size>=maxEntries){const oldest=map.keys().next();if(oldest.done)break;map.delete(oldest.value);}
   w={start:t,count:0};map.set(ip,w);
  }
  return w;
 };
 return {
  allowRequest(ip){const w=current(requests,ip,60000);w.count++;return w.count<=requestsPerMinute;},
  allowUnknownLookup(ip){return current(unknown,ip,unknownWindowMs).count<unknownPerWindow;},
  recordUnknown(ip){current(unknown,ip,unknownWindowMs).count++;},
  size(){return requests.size+unknown.size;},
  reset(){requests.clear();unknown.clear();}
 };
}
