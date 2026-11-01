import {createHash,randomBytes,timingSafeEqual} from 'node:crypto';
import {isIP} from 'node:net';
/**
 * Legacy public tokens (spec 89 §7, every link sent before spec 101): 32 random bytes in base64url (256 bits), no slug. They keep working forever,
 * checked with this pattern before touching the database. New links use {@link generateShortShareToken} with a slug.
 */
export const SHARE_TOKEN_PATTERN=/^[A-Za-z0-9_-]{43}$/;
/** True when the value has the exact shape of a legacy share token. */
export const isShareTokenFormat=({token}:{token:string}):boolean=>SHARE_TOKEN_PATTERN.test(token);
/** sha256 hex of a token: the only form stored in `crm_sales_material_shares.token_hash` (legacy and short tokens alike). */
export const hashShareToken=({token}:{token:string}):string=>createHash('sha256').update(token,'utf8').digest('hex');
/** Alphabet of short tokens: base62, without `-` (the slug separator) or `_` (WhatsApp italics), so linkifiers and formatting never touch them. */
export const SHORT_TOKEN_ALPHABET='0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
/** Characters of a short token. */
export const SHORT_TOKEN_LENGTH=4;
/** Longest slug stored per link. */
export const SHARE_SLUG_MAX=40;
/**
 * A new short token (spec 101 D1): 4 base62 characters, case-sensitive, valid ONLY together with the slug stored for its link (D2).
 *
 * ACCEPTED RISK (owner decision of 31/10/2026, against the 12-character recommendation of the spec, §5.2): the space is 62^4 ≈ 1.5·10^7
 * (≈ 2^23.8, base62 instead of base64url so the token never carries `-` or `_`). The slug adds almost nothing (the title travels in the
 * same message and in the preview). Guessing is only slowed by the hard limits of `salesMaterialShareAttempts.ts`: 5 misses (unknown
 * tokens, wrong slugs) per IP per hour, IPv6 grouped by /64, counters in the database. Owner decision «Los válidos siempre abren»: a valid
 * link answers as usual even over budget, so a scanner past its budget still tells hits (200) from misses (429): an accepted oracle.
 * A distributed attacker (many IPs) can find live links in days; the stored sha256 of 4 characters is reversible instantly by anyone who
 * reads the database or the journal. The per-IP budget is only as good as the client IP source (`CRM_CLIENT_IP_HEADER`).
 * Collisions with a live token are handled by the caller (unique `token_hash`, retried with a new token).
 * `random` is injectable for tests; bytes ≥ 248 (the largest multiple of 62 under 256) are discarded so every character is equally likely.
 */
export function generateShortShareToken({random=randomBytes}:{random?:(n:number)=>Buffer}={}):{token:string;tokenHash:string}{
 let token='';
 while(token.length<SHORT_TOKEN_LENGTH)for(const byte of random(8)){if(byte<248&&token.length<SHORT_TOKEN_LENGTH)token+=SHORT_TOKEN_ALPHABET[byte%62];}
 return {token,tokenHash:hashShareToken({token})};
}
const stripAccents=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'');
/**
 * Readable slug of a material title for its links: lower case, no accents (`ñ` → `n`, only for the URL), anything else than `[a-z0-9]` → `-`,
 * no repeated or edge dashes, cut at {@link SHARE_SLUG_MAX} characters on a dash when there is one; empty → `material`.
 */
export function shareSlug({title}:{title:string}):string{
 let slug=stripAccents(title).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
 if(slug.length>SHARE_SLUG_MAX){const cut=slug.slice(0,SHARE_SLUG_MAX+1).lastIndexOf('-');slug=(cut>0?slug.slice(0,cut):slug.slice(0,SHARE_SLUG_MAX)).replace(/-+$/,'');}
 return slug||'material';
}
/** The slug of a presented link, ready to compare with the stored one (D2): percent-decoded when possible, without accents, lower case. */
export function normalizeShareSlug({slug}:{slug:string}):string{
 let text=slug;try{text=decodeURIComponent(slug)}catch{/* Not percent-encoded: compare as typed. */}
 return stripAccents(text).toLowerCase();
}
/** Public path of a short link: `/m/<slug>-<token>`. */
export const shortSharePath=({slug,token}:{slug:string;token:string}):string=>`/m/${slug}-${token}`;
/** The two readings of a `/m/<segment>`: a legacy token, a short link (slug + token), both for an ambiguous 43-character segment, or none. */
export type ParsedShareSegment={legacy:string|null;short:{slug:string;token:string}|null};
const SHORT_SEGMENT=/^([^/\s?#]{1,200})-([A-Za-z0-9]{4})$/;
/** Parses the path segment after `/m/`. The slug is returned as presented; compare it through {@link normalizeShareSlug}. */
export function parseShareSegment({segment}:{segment:string}):ParsedShareSegment{
 const short=SHORT_SEGMENT.exec(segment);
 return {legacy:isShareTokenFormat({token:segment})?segment:null,short:short?{slug:short[1]!,token:short[2]!}:null};
}
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
const hextets=(ip:string):string[]|null=>{
 let text=ip.toLowerCase();const v4=/(\d+\.\d+\.\d+\.\d+)$/.exec(text);
 if(v4){const parts=v4[1]!.split('.').map(Number);text=text.slice(0,-v4[1]!.length)+((parts[0]!<<8)|parts[1]!).toString(16)+':'+((parts[2]!<<8)|parts[3]!).toString(16);}
 const [head,tail]=text.split('::') as [string,string|undefined];const a=head?head.split(':'):[],b=tail?tail.split(':'):[];
 const all=tail===undefined?a:[...a,...Array<string>(8-a.length-b.length).fill('0'),...b];
 return all.length===8?all.map(h=>parseInt(h||'0',16).toString(16)):null;
};
/**
 * Key of the unknown-token budget for a client IP (spec 101 D1): an IPv4 address whole; an IPv6 address by its /64, because one subscriber
 * usually holds a whole /64 (2^64 addresses). IPv4-mapped IPv6 counts as IPv4. Anything else (`unknown`) is returned as is.
 */
export function shareClientKey({ip}:{ip:string}):string{
 const v=ip.trim().replace(/^::ffff:(?=\d+\.\d+\.\d+\.\d+$)/i,'');
 if(isIP(v)!==6)return v;
 const h=hextets(v);return h?h.slice(0,4).join(':')+'::/64':v;
}
/**
 * Clean segment for a link mangled by chat apps and linkifiers: a trailing `/`, `.`, `,` or `)` (also `%29`/`%2C`) after a well-formed legacy
 * token or short link (`slug-XXXX`, the slug possibly percent-encoded). Returns null for anything else, including the clean path itself.
 */
export function mangledShareTokenFromPath({pathname}:{pathname:string}):string|null{
 const m=/^\/m\/([A-Za-z0-9_-]{43}|(?:[A-Za-z0-9-]|%[0-9A-Fa-f]{2})+-[A-Za-z0-9]{4})(?:[/.,)]|%29|%2C)$/i.exec(pathname);return m?m[1]!:null;
}
type Window={start:number;count:number};
/** Process-local rate limiter for `/m/*`: requests per IP per minute. The unknown-token budget lives in the database (`salesMaterialShareAttempts.ts`). */
export type ShareRateLimiter={
 /** Counts one request; false when the IP exceeded `requestsPerMinute`. */
 allowRequest(ip:string):boolean;
 /** Entries currently held (tests). */
 size():number;
 reset():void;
};
/**
 * In-memory fixed window (spec 89 §7). The limit is generous (300 per minute) because shared IPs (offices, carrier NAT) are normal and it only
 * cuts abuse noise before the database is touched; a restart clears it. The strict budget of unknown tokens is persisted (spec 101 D1).
 * Memory is bounded: each map keeps its entries ordered by window start (a new window is re-inserted at the end), so the front is always the oldest.
 * An insert first drops expired entries from the front, then evicts the oldest while the map is over `maxEntries`: amortised O(1), no full scan, no timer.
 */
export function createShareRateLimiter({requestsPerMinute=300,maxEntries=10000,now=Date.now}:{requestsPerMinute?:number;maxEntries?:number;now?:()=>number}={}):ShareRateLimiter{
 const requests=new Map<string,Window>();
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
  size(){return requests.size;},
  reset(){requests.clear();}
 };
}
