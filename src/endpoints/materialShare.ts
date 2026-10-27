import {db} from '../helpers/db';
import {r2Configured,r2Origin,r2Storage,R2NotConfigured,R2Unavailable} from '../helpers/r2';
import {createShareRateLimiter,isPreviewBot} from '../helpers/salesMaterialShare';
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
/** Public base URL for Open Graph: PUBLIC_APP_URL, or the request origin (https when the proxy says so). */
function baseUrl(request:Request):string{
 const configured=process.env.PUBLIC_APP_URL?.trim().replace(/\/+$/,'');if(configured)return configured;
 const url=new URL(request.url);if(request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim()==='https')url.protocol='https:';
 return url.origin;
}
type Resolved={response:Response}|{share:Extract<PublicShareState,{state:'available'}>};
/** Rate limit, token lookup and state pages shared by every `/m/*` route. Unknown and malformed tokens look identical. */
async function resolve(request:Request,{token,ip}:ShareRequestContext):Promise<Resolved>{
 if(!limiter.allowRequest(ip)||!limiter.allowUnknownLookup(ip))return {response:statePage('rate_limited',request)};
 const share=await resolvePublicShare(db,{token});
 if(share.state==='unknown'){limiter.recordUnknown(ip);return {response:statePage('unknown',request)};}
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
 const r=await resolve(request,context);if('response' in r)return r.response;
 const m=r.share.material;
 if(!m.externalUrl&&!r2Configured())return statePage('storage',request);
 const userAgent=request.headers.get('user-agent');
 if(request.method==='GET'&&!isPreviewBot({userAgent}))
  try{await recordTechnicalAccess(db,{shareId:m.shareId})}catch(error){logLine('warn',{event:'material_share_access_not_recorded',error:error instanceof Error?error.message.slice(0,200):'unknown'})}
 const html=renderMaterialPage({token:context.token,baseUrl:baseUrl(request),title:m.title,description:m.description,format:m.format,fileName:m.fileName,byteSize:m.byteSize,externalUrl:m.externalUrl,hasCover:!!m.cover&&r2Configured(),android:/android/i.test(userAgent??'')});
 return materialHtmlResponse({html,status:200,r2Origin:origin(),head:request.method==='HEAD'});
}catch(error){return failure(error,request,'page')}}
/** GET /m/:token/file and /m/:token/download: 302 to a fresh 5-minute presigned GET (inline or attachment). External URLs are never redirected to. */
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
 if(!limiter.allowRequest(ip)||!limiter.allowUnknownLookup(ip))return statePage('rate_limited',request);
 limiter.recordUnknown(ip);return statePage('unknown',request);
}
