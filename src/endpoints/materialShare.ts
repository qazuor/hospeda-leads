import {db} from '../helpers/db';
import {r2Configured,r2Origin,r2Storage,R2NotConfigured,R2Unavailable} from '../helpers/r2';
import {createShareRateLimiter,isPreviewBot,mangledShareTokenFromPath,shareClientKey} from '../helpers/salesMaterialShare';
import {publicShareCover,publicShareDirectLocation,publicShareFileLocation,recordTechnicalAccess,resolvePublicShare,type PublicShareState} from '../helpers/salesMaterialShareService';
import {SHARE_UNKNOWN_WINDOW_MINUTES,recordShareMiss} from '../helpers/salesMaterialShareAttempts';
import {PUBLIC_SHARE_HEADERS,materialHtmlResponse,materialStateStatus,renderMaterialPage,renderMaterialStatePage,type MaterialPageState} from '../server/materialPage';
import {logLine} from '../server/observability';
/** Who is asking: the whole `/m/<segment>` (`token`: a short `slug-XXXX` link or a legacy token) and the client IP (see `clientIp`) for rate limiting. */
export type ShareRequestContext={token:string;ip:string};
/** Process-wide limiter of requests per minute for `/m/*` (one container in Coolify; counters reset on restart). The unknown-token budget is in the database. */
const limiter=createShareRateLimiter();
/** Clears the in-memory counters (tests). The persisted budget lives in `crm_sales_material_share_attempts`. */
export function resetShareRateLimitsForTests():void{limiter.reset();}
const origin=()=>r2Configured()?r2Origin():null;
const statePage=(state:MaterialPageState,request:Request,retryAfterSeconds?:number)=>materialHtmlResponse({html:renderMaterialStatePage({state}),status:materialStateStatus(state),r2Origin:null,head:request.method==='HEAD',retryAfterSeconds});
/** 429 of the persisted budget of misses: `Retry-After: 3600`, the client waits until its oldest miss leaves the one-hour window (the per-minute limit keeps 600). */
const budgetSpent=(request:Request)=>statePage('rate_limited',request,SHARE_UNKNOWN_WINDOW_MINUTES*60);
/** Public base URL for Open Graph: only PUBLIC_APP_URL. The Host header is client-controlled and is never used (null omits og:url and og:image). */
function baseUrl():string|null{return process.env.PUBLIC_APP_URL?.trim().replace(/\/+$/,'')||null;}
/** 308 to the clean `/m/<segment>` for links mangled by chat apps and linkifiers (trailing `/`, `.`, `,` or `)`); null when the path is not such a link. */
function tidyRedirect(request:Request):Response|null{
 if(request.method!=='GET'&&request.method!=='HEAD')return null;
 const token=mangledShareTokenFromPath({pathname:new URL(request.url).pathname});if(!token)return null;
 return new Response(null,{status:308,headers:{...PUBLIC_SHARE_HEADERS,Location:'/m/'+token}});
}
type Resolved={response:Response}|{share:Extract<PublicShareState,{state:'available'}>};
/** A miss (unknown token, wrong or missing slug, malformed link or unknown sub-route): 404, or 429 once the client spent its persisted budget. */
async function miss(request:Request,ip:string):Promise<Response>{
 return (await recordShareMiss(db,{clientKey:shareClientKey({ip})})).limited?budgetSpent(request):statePage('unknown',request);
}
/**
 * Rate limit, link lookup and state pages shared by every `/m/*` route. Unknown tokens, wrong or missing slugs and malformed links look identical (404).
 * Spec 101 D1 (owner, 31/10/2026): hard limit of 5 misses per client (IPv4, or IPv6 /64) per hour, persisted; over it, misses answer 429.
 * Owner decision «Los válidos siempre abren»: the link is looked up FIRST and a valid token+slug always answers as usual (200, 302, 410),
 * for people, bots and HEAD alike, whatever the budget, so a scanner on a shared address never cuts real clients or previews.
 * ACCEPTED RISK: with 4-character tokens this keeps a 429-vs-200 oracle open (once over budget a scanner still tells hits from misses); the
 * budget only slows guessing to 5 misses per address per hour. The general per-IP limit is generous and only cuts abuse noise before the database.
 */
async function resolve(request:Request,{token,ip}:ShareRequestContext):Promise<Resolved>{
 if(!limiter.allowRequest(ip))return {response:statePage('rate_limited',request)};
 const share=await resolvePublicShare(db,{token});
 if(share.state==='unknown')return {response:await miss(request,ip)};
 if(share.state!=='available')return {response:statePage(share.state,request)};
 return {share};
}
const failure=(error:unknown,request:Request,route:string)=>{
 if(error instanceof R2NotConfigured||error instanceof R2Unavailable)return statePage('storage',request);
 // No token, IP or user agent in the log: the token is a credential.
 logLine('error',{event:'material_share_failed',route,error:error instanceof Error?error.message.slice(0,200):'unknown'});
 return statePage('error',request);
};
/**
 * GET|HEAD /m/:token: the public page. Bots and HEAD get the same HTML but are not counted; a person bumps the technical access record.
 * Spec 101 D3/D4: with «Abrir directo» on the material (read now), a person (GET, not a bot) is counted the same way and then redirected
 * (302) to the file (fresh inline presigned GET) or to the external https destination set by the admin. Bots and HEAD keep the page, so
 * WhatsApp still builds the preview with cover and title. Revoked, unavailable and unknown links never reach this branch; a presign failure falls back to the page.
 */
export async function page(request:Request,context:ShareRequestContext):Promise<Response>{try{
 const tidy=tidyRedirect(request);if(tidy)return limiter.allowRequest(context.ip)?tidy:statePage('rate_limited',request);
 const r=await resolve(request,context);if('response' in r)return r.response;
 const m=r.share.material;
 if(!m.externalUrl&&!r2Configured())return statePage('storage',request);
 const userAgent=request.headers.get('user-agent'),person=request.method==='GET'&&!isPreviewBot({userAgent});
 if(person)
  try{await recordTechnicalAccess(db,{shareId:m.shareId})}catch(error){logLine('warn',{event:'material_share_access_not_recorded',error:error instanceof Error?error.message.slice(0,200):'unknown'})}
 // A failed presign (R2 down, misconfigured) never breaks the link: the person gets the normal page instead.
 let direct:string|null=null;
 if(person)try{direct=await publicShareDirectLocation({material:m,storage:r2Storage})}catch(error){logLine('warn',{event:'material_share_direct_failed',error:error instanceof Error?error.message.slice(0,200):'unknown'})}
 if(direct)return new Response(null,{status:302,headers:{...PUBLIC_SHARE_HEADERS,Location:direct}});
 const html=renderMaterialPage({token:m.path.slice('/m/'.length),baseUrl:baseUrl(),title:m.title,description:m.description,format:m.format,fileName:m.fileName,byteSize:m.byteSize,externalUrl:m.externalUrl,hasCover:!!m.cover&&r2Configured(),android:/android/i.test(userAgent??'')});
 return materialHtmlResponse({html,status:200,r2Origin:origin(),head:request.method==='HEAD'});
}catch(error){return failure(error,request,'page')}}
/** GET /m/:token/file and /m/:token/download: 302 to a fresh presigned GET (inline or attachment; 5 minutes, 6 hours for audio and video so playback and seeking survive). External URLs are never redirected to from these routes (only the link itself, with «Abrir directo»). */
export async function file(request:Request,context:ShareRequestContext&{disposition:'inline'|'attachment'}):Promise<Response>{try{
 const r=await resolve(request,context);if('response' in r)return r.response;
 if(!r.share.material.objectKey)return statePage('unknown',request);
 const location=await publicShareFileLocation({material:r.share.material,disposition:context.disposition,storage:r2Storage()});
 if(!location)return statePage('unknown',request);
 // SAMEORIGIN: the PDF viewer frames this redirect from our own page; DENY (the global default) would block it.
 return new Response(null,{status:302,headers:{...PUBLIC_SHARE_HEADERS,Location:location,'X-Frame-Options':'SAMEORIGIN'}});
}catch(error){return failure(error,request,'file')}}
/** GET /m/:token/cover: cover bytes (at most 1 MB) through our server, cacheable for an hour, so crawlers never follow an expiring URL. */
export async function cover(request:Request,context:ShareRequestContext):Promise<Response>{try{
 const r=await resolve(request,context);if('response' in r)return r.response;
 const found=await publicShareCover({material:r.share.material,storage:r2Storage()});
 if(!found)return new Response(null,{status:404,headers:PUBLIC_SHARE_HEADERS});
 return new Response(request.method==='HEAD'?null:found.body,{headers:{...PUBLIC_SHARE_HEADERS,'Content-Type':found.contentType,'Cache-Control':'public, max-age=3600','Content-Length':String(found.body.byteLength)}});
}catch(error){return failure(error,request,'cover')}}
/** Any other `/m/*` path or method: the generic «Este enlace no es válido», never the SPA. It is a miss of the persisted budget (404, or 429 over it). */
export async function notFound(request:Request,{ip}:{ip:string}):Promise<Response>{try{
 if(!limiter.allowRequest(ip))return statePage('rate_limited',request);
 const tidy=tidyRedirect(request);if(tidy)return tidy;
 return await miss(request,ip);
}catch(error){return failure(error,request,'not_found')}}
