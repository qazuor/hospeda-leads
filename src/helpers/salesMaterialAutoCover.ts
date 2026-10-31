import {postSalesMaterial,salesMaterialFileUrl,type SalesMaterial} from '../endpoints/salesMaterials.schema';
import {CrmApiError} from './apiClient';
import {SALES_MATERIAL_MAX_COVER_BYTES} from './salesMaterialTypes';
import {uploadSalesMaterialFile} from './salesMaterialUpload';
/** Formats that get an automatic cover (spec 95): audio, Office files and external links show a drawn placeholder instead. */
export type AutoCoverFormat='image'|'video'|'pdf';
/** Longest side of an automatic cover, in px. */
export const AUTO_COVER_MAX_SIZE=1200;
/** File name of every automatic cover (the server checks extension, type, size and signature as for any cover). */
export const AUTO_COVER_FILE_NAME='portada-automatica.jpg';
/**
 * Spec 102: PDFs larger than this are not read for a cover; the admin is told why. A picked file is already in memory, and a stored one is read
 * by ranges (first page only), so the cap is about the memory of a modest notebook. Adjustable.
 */
export const AUTO_COVER_MAX_PDF_BYTES=150*1024*1024;
/** Spec 102: reason shown when the lazily loaded renderer is gone after a deploy (stale chunk). Not remembered as a failure. */
export const AUTO_COVER_RELOAD_REASON='Se actualizó el CRM: recargá la página y probá de nuevo.';
const TIMEOUT_REASON='La portada tardó demasiado.';
const PICK_HINT=' Subí una imagen con «Elegir portada».';
/** How long one cover may take before it is cancelled. */
export const AUTO_COVER_TIMEOUT_MS=30000;
const IMAGE_MIMES=new Set(['image/jpeg','image/png','image/webp','image/gif']);
/** True when this browser can decode the format: the allowed images always, videos per `canPlayType` (e.g. some .mov codecs are not). */
export function browserCanDecode({mimeType}:{mimeType:string}):boolean{
 if(mimeType==='application/pdf')return true;if(mimeType.startsWith('image/'))return IMAGE_MIMES.has(mimeType);
 if(mimeType.startsWith('video/')){try{return document.createElement('video').canPlayType(mimeType)!==''}catch{return false}}
 return false;
}
/** What a version can get: an automatic cover format, or none with the reason to tell the admin (`null` when none is expected: audio, Office, small images, links). */
export type AutoCoverPlan={format:AutoCoverFormat;reason:null}|{format:null;reason:string|null};
/** Spec 102: the automatic cover a version can get or, when it cannot get one it would normally have, why (never a silent skip). */
export function autoCoverPlan({mimeType,byteSize,canDecode=browserCanDecode}:{mimeType:string|null;byteSize:number|null;canDecode?:typeof browserCanDecode}):AutoCoverPlan{
 if(!mimeType)return {format:null,reason:null};
 if(mimeType==='application/pdf'){
  if((byteSize??Infinity)>AUTO_COVER_MAX_PDF_BYTES)return {format:null,reason:`Este PDF pesa más de ${Math.round(AUTO_COVER_MAX_PDF_BYTES/1024/1024)} MB: no podemos generar su portada en el navegador.${PICK_HINT}`};
  return {format:'pdf',reason:null};
 }
 const format:AutoCoverFormat|null=mimeType.startsWith('video/')?'video':mimeType.startsWith('image/')&&(byteSize??Infinity)>SALES_MATERIAL_MAX_COVER_BYTES?'image':null;
 if(!format)return {format:null,reason:null};
 return canDecode({mimeType})?{format,reason:null}:{format:null,reason:(format==='video'?'El navegador no puede leer este video.':'El navegador no puede leer esta imagen.')+PICK_HINT};
}
/** The automatic cover a version can get, or null: small images (up to 1 MB) are their own cover, very large PDFs and undecodable formats are skipped. */
export function autoCoverFormat(input:{mimeType:string|null;byteSize:number|null;canDecode?:typeof browserCanDecode}):AutoCoverFormat|null{return autoCoverPlan(input).format;}
const CHUNK_ERROR=/dynamically imported module|Importing a module script failed|ChunkLoadError|Loading chunk/i;
/**
 * Spec 102: a failure in plain Spanish for the admin. pdf.js errors are told apart by name, a stale chunk asks for a reload (`reload`),
 * network errors (Safari says «Load failed») and the timeout get their own text, and our own or the server's messages (already Spanish) are kept.
 */
export function autoCoverFailure({error,format}:{error:unknown;format:AutoCoverFormat}):{reason:string;reload:boolean}{
 if(!(error instanceof Error))return {reason:'No se pudo generar la portada.',reload:false};
 if(CHUNK_ERROR.test(error.message)||error.name==='ChunkLoadError')return {reason:AUTO_COVER_RELOAD_REASON,reload:true};
 if(error.name==='PasswordException')return {reason:'El PDF tiene contraseña.',reload:false};
 if(error.name==='ResponseException'||error instanceof TypeError&&/fetch|network|load failed/i.test(error.message))return {reason:'No se pudo descargar el archivo para generar la portada.',reload:false};
 if(error.name.endsWith('Exception'))return {reason:format==='pdf'?'No se pudo leer el PDF.':'No se pudo leer el archivo.',reload:false};
 return {reason:error.message||'No se pudo generar la portada.',reload:false};
}
/**
 * True when an active file material should get an automatic cover: no stored cover and not removed by an admin (`coverSource` null),
 * and its current version can get one.
 */
export function needsAutoCover({material,canDecode}:{material:SalesMaterial;canDecode?:typeof browserCanDecode}):boolean{
 const v=material.currentVersion;
 return material.status==='active'&&material.source==='file'&&!material.coverSource&&!!v&&!v.url&&autoCoverFormat({mimeType:v.mimeType,byteSize:v.byteSize,canDecode})!==null;
}
/** Where the pixels come from: the file the admin just picked, or a same-origin URL of a stored version (redirects to R2, which must allow GET over CORS). */
export type AutoCoverSource={file:Blob}|{url:string};
type Drawable=CanvasImageSource&{width:number;height:number};
/** Draws a source on something `encodeAutoCover` can scale; must stop its work and release resources when `signal` aborts. */
export type AutoCoverRenderer=(source:Blob|string,signal:AbortSignal)=>Promise<Drawable>;
const abortError=(signal:AbortSignal)=>signal.reason instanceof Error?signal.reason:new DOMException('Aborted','AbortError');
/** Runs `use` with a URL for the source: an object URL for a picked file (always revoked afterwards, also on abort), the stored URL otherwise. */
async function withUrl<T>(source:Blob|string,use:(url:string,remote:boolean)=>Promise<T>):Promise<T>{
 if(typeof source==='string')return use(source,true);
 const url=URL.createObjectURL(source);try{return await use(url,false)}finally{URL.revokeObjectURL(url)}
}
/** Settles `run` and calls `cleanup` once, when it finishes or when `signal` aborts first (e.g. a media element that never fires an event). */
function abortable<T>(signal:AbortSignal,run:(resolve:(v:T)=>void,reject:(e:unknown)=>void)=>void,cleanup:()=>void):Promise<T>{
 return new Promise<T>((resolve,reject)=>{
  let done=false;
  const finish=()=>{if(done)return false;done=true;signal.removeEventListener('abort',onAbort);cleanup();return true;};
  const onAbort=()=>{if(finish())reject(abortError(signal));};
  if(signal.aborted){onAbort();return;}
  signal.addEventListener('abort',onAbort,{once:true});
  run(v=>{if(finish())resolve(v)},e=>{if(finish())reject(e)});
 });
}
/** The image itself; aborting clears its `src` so the browser stops loading it. */
export const loadImage:AutoCoverRenderer=(source,signal)=>withUrl(source,(url,remote)=>{
 const img=new Image();
 return abortable<HTMLImageElement>(signal,(resolve,reject)=>{
  if(remote)img.crossOrigin='anonymous';img.decoding='async';
  img.onload=()=>resolve(img);img.onerror=()=>reject(new Error('No se pudo leer la imagen.'));img.src=url;
 },()=>{img.onload=null;img.onerror=null;if(signal.aborted)img.src='';});
});
/** A frame about one second in (or the middle of a shorter video) on a canvas. Only metadata is preloaded; the element is emptied afterwards or on abort. */
export const videoFrame:AutoCoverRenderer=(source,signal)=>withUrl(source,(url,remote)=>{
 const video=document.createElement('video');
 return abortable<HTMLCanvasElement>(signal,(resolve,reject)=>{
  video.muted=true;video.playsInline=true;video.preload='metadata';if(remote)video.crossOrigin='anonymous';
  video.onloadedmetadata=()=>{video.currentTime=Number.isFinite(video.duration)&&video.duration>0?Math.min(1,video.duration/2):0;};
  video.onseeked=()=>{try{const canvas=document.createElement('canvas');canvas.width=video.videoWidth;canvas.height=video.videoHeight;const context=canvas.getContext('2d');if(!context||!canvas.width)throw new Error('No se pudo leer el video.');context.drawImage(video,0,0);resolve(canvas)}catch(e){reject(e)}};
  video.onerror=()=>reject(new Error('No se pudo leer el video.'));video.src=url;
 },()=>{video.onloadedmetadata=null;video.onseeked=null;video.onerror=null;video.removeAttribute('src');video.load();});
});
/** pdf.js (and its worker) is only downloaded here, the first time a PDF cover is needed. */
const pdfPage:AutoCoverRenderer=async(source,signal)=>{const {renderPdfCover}=await import('./pdfThumbnail');return renderPdfCover({source,maxSize:AUTO_COVER_MAX_SIZE,signal});};
const renderers:Record<AutoCoverFormat,AutoCoverRenderer>={image:loadImage,video:videoFrame,pdf:pdfPage};
const toBlob=(canvas:HTMLCanvasElement,quality:number)=>new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('No se pudo codificar la portada.')),'image/jpeg',quality));
/** Draws `image` scaled to fit `AUTO_COVER_MAX_SIZE` on white and encodes a JPEG under the cover limit (lower quality, then smaller, until it fits). */
export async function encodeAutoCover(image:Drawable):Promise<File>{
 if(!image.width||!image.height)throw new Error('La imagen está vacía.');
 let scale=Math.min(1,AUTO_COVER_MAX_SIZE/Math.max(image.width,image.height));
 for(let attempt=0;attempt<4;attempt++,scale/=2){
  const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));
  const context=canvas.getContext('2d');if(!context)throw new Error('El navegador no pudo dibujar la portada.');
  context.fillStyle='#ffffff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(image,0,0,canvas.width,canvas.height);
  for(const quality of [0.82,0.65]){const blob=await toBlob(canvas,quality);if(blob.size>0&&blob.size<=SALES_MATERIAL_MAX_COVER_BYTES)return new File([blob],AUTO_COVER_FILE_NAME,{type:'image/jpeg'});}
 }
 throw new Error('La portada generada supera el límite.');
}
/**
 * Generates the automatic cover of a source in the browser: the image downscaled, a video frame or the first PDF page.
 * After `timeoutMs`, or when `signal` aborts, the renderer is cancelled (media emptied, pdf.js task destroyed, object URL revoked).
 */
export async function generateAutoCover({format,source,signal,timeoutMs=AUTO_COVER_TIMEOUT_MS,render=renderers}:{format:AutoCoverFormat;source:AutoCoverSource;signal?:AbortSignal;timeoutMs?:number;render?:Record<AutoCoverFormat,AutoCoverRenderer>}):Promise<File>{
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(new Error(TIMEOUT_REASON)),timeoutMs);
 const forward=()=>controller.abort(signal?.reason);
 if(signal?.aborted)forward();else signal?.addEventListener('abort',forward,{once:true});
 try{return await encodeAutoCover(await render[format]('file' in source?source.file:source.url,controller.signal));}
 finally{clearTimeout(timer);signal?.removeEventListener('abort',forward);}
}
/**
 * Result of {@link saveAutoCover}: stored, `kept` out because an admin's manual choice exists (not a failure), or failed with a plain reason
 * (`reload`: the CRM was updated, `conflict`: the material changed meanwhile).
 */
export type AutoCoverResult={ok:true;revision:number;kept?:boolean}|{ok:false;error:string;reload?:true;conflict?:true};
/**
 * Generates and stores an automatic cover through the normal cover path (presigned upload + `cover` mutation with `auto:true`, so the server
 * applies the same type, size and signature checks). Never throws: a failure leaves the material without cover and the card shows its placeholder.
 * Spec 102: the raw error goes to the console for diagnosis; `replaceRemoved` (an explicit request) may replace a cover removed by hand.
 */
export async function saveAutoCover({materialId,revision,format,source,signal,replaceRemoved,generate=generateAutoCover,upload=uploadSalesMaterialFile,post=postSalesMaterial}:{materialId:string;revision:number;format:AutoCoverFormat;source:AutoCoverSource;signal?:AbortSignal;replaceRemoved?:boolean;generate?:typeof generateAutoCover;upload?:typeof uploadSalesMaterialFile;post?:typeof postSalesMaterial}):Promise<AutoCoverResult>{
 try{
  const file=await generate({format,source,signal});
  const uploadId=await upload({file,purpose:'cover',materialId,signal});
  const result=await post({action:'cover',id:materialId,revision,uploadId,auto:true,...(replaceRemoved?{replaceRemoved:true}:{})});
  return result.coverKept?{ok:true,revision:result.revision??revision,kept:true}:{ok:true,revision:result.revision??revision+1};
 }catch(e){
  if(!signal?.aborted)console.warn('[portada automática]',materialId,e);
  const {reason,reload}=autoCoverFailure({error:e,format});
  return {ok:false,error:reason,...(reload?{reload:true as const}:{}),...(e instanceof CrmApiError&&e.status===409?{conflict:true as const}:{})};
 }
}
/** Materials whose backfill failed in this browser session: «Generar portadas faltantes» does not download them again until a reload. */
export const failedAutoCoverIds=new Set<string>();
/** Result of {@link saveMissingAutoCover}. */
export type MissingAutoCoverResult={ok:boolean;kept?:boolean;error?:string;conflict?:boolean};
/**
 * Automatic cover of a stored material: reads its current version through the same-origin file URL (pdf.js reads PDFs by ranges).
 * Without `explicit` it is the backfill «Generar portadas faltantes» (only materials that {@link needsAutoCover}). With `explicit` it is
 * «Generar desde el archivo» (spec 102): it also regenerates an automatic cover and replaces a removed one (`replaceRemoved`), never a manual one.
 * A failure is remembered for the session unless the run was stopped or the CRM was updated (stale chunk).
 */
export async function saveMissingAutoCover({material,signal,explicit=false,save=saveAutoCover}:{material:SalesMaterial;signal?:AbortSignal;explicit?:boolean;save?:typeof saveAutoCover}):Promise<MissingAutoCoverResult>{
 const v=material.currentVersion;const plan=v?autoCoverPlan({mimeType:v.mimeType,byteSize:v.byteSize}):null;
 if(explicit){
  if(material.coverSource==='manual')return {ok:false,error:'Este material ya tiene una portada elegida a mano.'};
  if(!v||v.url||material.source!=='file'||material.status!=='active'||!plan?.format)return {ok:false,error:plan?.reason??'Este formato no admite portada automática.'};
 }else if(!v||!plan?.format||!needsAutoCover({material}))return {ok:false};
 const result=await save({materialId:material.id,revision:material.revision,format:plan!.format!,source:{url:salesMaterialFileUrl({versionId:v!.id})},signal,...(explicit&&material.coverSource==='none'?{replaceRemoved:true}:{})});
 if(!result.ok&&!signal?.aborted&&!result.reload)failedAutoCoverIds.add(material.id);
 if(result.ok)return result.kept?{ok:true,kept:true}:{ok:true};
 return explicit?{ok:false,error:result.error,...(result.conflict?{conflict:true}:{})}:{ok:false};
}
