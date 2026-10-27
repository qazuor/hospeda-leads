import {AwsV4Signer} from 'aws4fetch';
/** R2 connection settings. `endpoint` is `https://<account>.r2.cloudflarestorage.com` unless R2_ENDPOINT overrides it (tests only). */
export type R2Config={readonly accountId:string;readonly accessKeyId:string;readonly secretAccessKey:string;readonly bucket:string;readonly endpoint:string};
/** Metadata returned by a HEAD on an object. */
export type R2Head={readonly size:number;readonly contentType:string|null;readonly etag:string|null};
/** Storage operations used by sales material. Every URL points at the private bucket on the R2 S3 domain. */
export type R2Storage={
 readonly origin:string;
 /** Presigned PUT that only accepts the signed Content-Type and the signed Content-Length (`byteSize`). */
 presignPut(input:{key:string;contentType:string;byteSize:number;expiresIn:number}):Promise<string>;
 /** Presigned GET; `disposition` and `contentType` become response-content-* overrides. */
 presignGet(input:{key:string;expiresIn:number;disposition?:string;contentType?:string}):Promise<string>;
 /** HEAD on an object; null when it does not exist. */
 head(input:{key:string}):Promise<R2Head|null>;
 /** First `bytes` bytes of an object (range GET); empty when it does not exist. */
 readPrefix(input:{key:string;bytes:number}):Promise<Uint8Array>;
 /** Whole object body, for small objects only (covers); null when it does not exist. */
 read(input:{key:string;maxBytes:number}):Promise<{body:Uint8Array<ArrayBuffer>;contentType:string|null}|null>;
 /** Deletes an object; a 404 counts as deleted. */
 remove(input:{key:string}):Promise<void>;
};
/** R2 environment variables are missing: storage features answer 503 while the rest of the CRM keeps working. */
export class R2NotConfigured extends Error{constructor(){super('Almacenamiento no configurado. Pedile a un administrador que cargue las variables R2_*.')}}
/** R2 answered with an unexpected status, timed out or could not be reached. */
export class R2Unavailable extends Error{constructor(detail:string){super('El almacenamiento de archivos no está disponible en este momento. Intentá de nuevo en unos minutos.');this.name='R2Unavailable';this.cause=detail}}
type Env=Readonly<Record<string,string|undefined>>;
/** Reads R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET; null when any is missing. R2_ENDPOINT is a test-only override. */
export function r2Config({env=process.env}:{env?:Env}={}):R2Config|null{
 const accountId=env.R2_ACCOUNT_ID?.trim(),accessKeyId=env.R2_ACCESS_KEY_ID?.trim(),secretAccessKey=env.R2_SECRET_ACCESS_KEY?.trim(),bucket=env.R2_BUCKET?.trim();
 if(!accountId||!accessKeyId||!secretAccessKey||!bucket)return null;
 if(!/^[A-Za-z0-9-]+$/.test(accountId)||!/^[a-z0-9][a-z0-9.-]{1,62}$/.test(bucket))return null;
 const endpoint=(env.R2_ENDPOINT?.trim()||`https://${accountId}.r2.cloudflarestorage.com`).replace(/\/+$/,'');
 return {accountId,accessKeyId,secretAccessKey,bucket,endpoint};
}
/** Origin of the R2 S3 endpoint (for CSP), or null without configuration. */
export function r2Origin({env=process.env}:{env?:Env}={}):string|null{const c=r2Config({env});if(!c)return null;try{return new URL(c.endpoint).origin}catch{return null}}
const encodeKey=(key:string)=>key.split('/').map(encodeURIComponent).join('/');
type Fetch=(input:Request|string|URL,init?:RequestInit)=>Promise<Response>;
/** Per-call timeout for server-side R2 requests, so a stalled R2 never holds a request or a transaction open. */
export const R2_TIMEOUT_MS=15000;
/**
 * Builds the R2 client over aws4fetch (SigV4, region `auto`, path-style URLs). `fetchImpl`, `now` and `timeoutMs` are injectable for tests.
 * Presigned URLs sign the query string (`X-Amz-Expires`); server calls sign headers. A call that exceeds `timeoutMs` (headers or body) is an R2Unavailable.
 */
export function createR2Storage({config,fetchImpl=fetch,now=()=>new Date(),timeoutMs=R2_TIMEOUT_MS}:{config:R2Config;fetchImpl?:Fetch;now?:()=>Date;timeoutMs?:number}):R2Storage{
 const objectUrl=(key:string)=>new URL(`${config.endpoint}/${encodeURIComponent(config.bucket)}/${encodeKey(key)}`);
 const datetime=()=>now().toISOString().replace(/[:-]|\.\d{3}/g,'');
 const signer=(input:{method:string;url:URL;headers?:Record<string,string>;signQuery?:boolean})=>new AwsV4Signer({method:input.method,url:input.url.toString(),headers:input.headers,accessKeyId:config.accessKeyId,secretAccessKey:config.secretAccessKey,service:'s3',region:'auto',datetime:datetime(),signQuery:input.signQuery,allHeaders:input.signQuery});
 async function call(method:string,key:string,headers:Record<string,string>={}){
  const signed=await signer({method,url:objectUrl(key),headers}).sign();
  const signal=AbortSignal.timeout(timeoutMs);
  try{return await fetchImpl(signed.url.toString(),{method,headers:signed.headers,signal})}catch(e){throw new R2Unavailable(e instanceof Error?e.message:String(e))}
 }
 const bytes=async(r:Response)=>{try{return new Uint8Array(await r.arrayBuffer())}catch(e){throw new R2Unavailable(e instanceof Error?e.message:String(e))}};
 const expiry=(seconds:number)=>String(Math.max(1,Math.min(604800,Math.floor(seconds))));
 return {
  origin:new URL(config.endpoint).origin,
  async presignPut({key,contentType,byteSize,expiresIn}){const url=objectUrl(key);url.searchParams.set('X-Amz-Expires',expiry(expiresIn));return (await signer({method:'PUT',url,headers:{'Content-Type':contentType,'Content-Length':String(byteSize)},signQuery:true}).sign()).url.toString();},
  async presignGet({key,expiresIn,disposition,contentType}){const url=objectUrl(key);url.searchParams.set('X-Amz-Expires',expiry(expiresIn));if(disposition)url.searchParams.set('response-content-disposition',disposition);if(contentType)url.searchParams.set('response-content-type',contentType);return (await signer({method:'GET',url,signQuery:true}).sign()).url.toString();},
  async head({key}){const r=await call('HEAD',key);if(r.status===404)return null;if(!r.ok)throw new R2Unavailable('HEAD '+r.status);const size=Number(r.headers.get('Content-Length'));if(!Number.isFinite(size))throw new R2Unavailable('HEAD without Content-Length');return {size,contentType:r.headers.get('Content-Type'),etag:r.headers.get('ETag')};},
  async readPrefix({key,bytes:prefix}){const r=await call('GET',key,{Range:`bytes=0-${Math.max(0,prefix-1)}`});if(r.status===404||r.status===416)return new Uint8Array();if(!r.ok)throw new R2Unavailable('GET '+r.status);return (await bytes(r)).subarray(0,prefix);},
  async read({key,maxBytes}){const h=await this.head({key});if(!h)return null;if(h.size>maxBytes)throw new Error('El archivo supera el tamaño permitido.');const r=await call('GET',key);if(r.status===404)return null;if(!r.ok)throw new R2Unavailable('GET '+r.status);return {body:await bytes(r),contentType:r.headers.get('Content-Type')};},
  async remove({key}){const r=await call('DELETE',key);if(r.status===404||r.ok)return;throw new R2Unavailable('DELETE '+r.status);}
 };
}
let override:R2Storage|null|undefined;
/** Replaces the process-wide storage (tests); `undefined` restores the env-based client. */
export function setR2StorageForTests({storage}:{storage:R2Storage|null|undefined}):void{override=storage}
/** The configured storage; throws R2NotConfigured when the R2_* variables are missing. Only storage paths call it. */
export function r2Storage():R2Storage{
 if(override!==undefined){if(!override)throw new R2NotConfigured();return override;}
 const config=r2Config();if(!config)throw new R2NotConfigured();
 return createR2Storage({config});
}
/** True when sales material can reach storage (tests may inject a stub). */
export function r2Configured():boolean{return override!==undefined?!!override:!!r2Config()}
