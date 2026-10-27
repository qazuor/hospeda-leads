import {db} from '../helpers/db';
import {r2Configured,r2Origin,r2Storage,R2NotConfigured,R2Unavailable} from '../helpers/r2';
import {createShareRateLimiter,isPreviewBot,mangledShareTokenFromPath} from '../helpers/salesMaterialShare';
import {publicShareCover,publicShareFileLocation,recordTechnicalAccess,resolvePublicShare,type PublicShareState} from '../helpers/salesMaterialShareService';
import {PUBLIC_SHARE_HEADERS,materialHtmlResponse,materialStateStatus,renderMaterialPage,renderMaterialStatePage,type MaterialPageState} from '../server/materialPage';
import {logLine} from '../server/observability';
/** Who is asking: the client IP (see `clientIp`) for rate limiting. */
export type ShareRequestContext={token:string;ip:string};
/** Process-wide limiter for `/m/*` (one container in Coolify; counters reset on restart). */
const limiter=createShareRateLimiter();
/** Clears the in-memory counters (tests). */
export function resetShareRateLimitsForTests():void{limiter.reset();}
const origin=()=>r2Configured()?r2Origin():null;
const statePage=(state:MaterialPageState,request:Request)=>materialHtmlResponse({html:renderMaterialStatePage({state}),status:materialStateStatus(state),r2Origin:null,head:request.method==='HEAD'});
/** Public base URL for Open Graph: only PUBLIC_APP_URL. The Host header is client-controlled and is never used (null omits og:url and og:image). */
function baseUrl():string|null{return process.env.PUBLIC_APP_URL?.trim().replace(/\/+$/,'')||null;}
/** 308 to the clean `/m/<token>` for links mangled by chat apps and linkifiers (trailing `/`, `.`, `,` or `)`); null when the path is not such a link. */
function tidyRedirect(request:Request):Response|null{
 if(request.method!=='GET'&&request.method!=='HEAD')return null;
 const token=mangledShareTokenFromPath({pathname:new URL(request.url).pathname});if(!token)return null;
 return new Response(null,{status:308,headers:{...PUBLIC_SHARE_HEADERS,Location:'/m/'+token}});
}
type Resolved={response:Response}|{share:Extract<PublicShareState,{state:'available'}>};
/**
 * Rate limit, token lookup and state pages shared by every `/m/*` route. Unknown and malformed tokens look identical.
 * The token is always resolved: the strict unknown-token budget only answers 429 for tokens that did NOT resolve, so a valid link never gets locked out
 * (a scanner on a shared IP must not take the real clients behind it down). The general per-IP limit is generous and only cuts abuse noise.
 */
async function resolve(request:Request,{token,ip}:ShareRequestContext):Promise<Resolved>{
 if(!limiter.allowRequest(ip))return {response:statePage('rate_limited',request)};
 const share=await resolvePublicShare(db,{token});
 if(share.state==='unknown'){
  if(!limiter.allowUnknownLookup(ip))return {response:statePage('rate_limited',request)};
  limiter.recordUnknown(ip);return {response:statePage('unknown',request)};
 }
 if(share.state!=='available')return {response:statePage(share.state,request)};
 return {share};
}
const failure=(error:unknown,request:Request,route:string)=>{
 if(error instanceof R2NotConfigured||error instanceof R2Unavailable)return statePage('storage',request);
 // No token, IP or user agent in the log: the token is a credential.
 logLine('error',{event:'material_share_failed',route,error:error instanceof Error?error.message.slice(0,200):'unknown'});
 return statePage('error',request);
};
/** GET|HEAD /m/:token: the public page. Bots and HEAD get the same HTML but are not counted; a person bumps the technical access record. */
export async function page(request:Request,context:ShareRequestContext):Promise<Response>{try{
 const tidy=tidyRedirect(request);if(tidy)return limiter.allowRequest(context.ip)?tidy:statePage('rate_limited',request);
 const r=await resolve(request,context);if('response' in r)return r.response;
 const m=r.share.material;
 if(!m.externalUrl&&!r2Configured())return statePage('storage',request);
 const userAgent=request.headers.get('user-agent');
 if(request.method==='GET'&&!isPreviewBot({userAgent}))
  try{await recordTechnicalAccess(db,{shareId:m.shareId})}catch(error){logLine('warn',{event:'material_share_access_not_recorded',error:error instanceof Error?error.message.slice(0,200):'unknown'})}
 const html=renderMaterialPage({token:context.token,baseUrl:baseUrl(),title:m.title,description:m.description,format:m.format,fileName:m.fileName,byteSize:m.byteSize,externalUrl:m.externalUrl,hasCover:!!m.cover&&r2Configured(),android:/android/i.test(userAgent??'')});
 return materialHtmlResponse({html,status:200,r2Origin:origin(),head:request.method==='HEAD'});
}catch(error){return failure(error,request,'page')}}
/** GET /m/:token/file and /m/:token/download: 302 to a fresh presigned GET (inline or attachment; 5 minutes, 6 hours for audio and video so playback and seeking survive). External URLs are never redirected to. */
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
/** Any other `/m/*` path or method: the generic «Este enlace no es válido», never the SPA. */
export async function notFound(request:Request,{ip}:{ip:string}):Promise<Response>{
 if(!limiter.allowRequest(ip))return statePage('rate_limited',request);
 const tidy=tidyRedirect(request);if(tidy)return tidy;
 if(!limiter.allowUnknownLookup(ip))return statePage('rate_limited',request);
 limiter.recordUnknown(ip);return statePage('unknown',request);
}
