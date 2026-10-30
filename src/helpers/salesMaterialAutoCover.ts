import {postSalesMaterial,salesMaterialFileUrl,type SalesMaterial} from '../endpoints/salesMaterials.schema';
import {SALES_MATERIAL_MAX_COVER_BYTES} from './salesMaterialTypes';
import {uploadSalesMaterialFile} from './salesMaterialUpload';
/** Formats that get an automatic cover (spec 95): audio, Office files and external links show a drawn placeholder instead. */
export type AutoCoverFormat='image'|'video'|'pdf';
/** Longest side of an automatic cover, in px. */
export const AUTO_COVER_MAX_SIZE=1200;
/** File name of every automatic cover (the server checks extension, type, size and signature as for any cover). */
export const AUTO_COVER_FILE_NAME='portada-automatica.jpg';
/** PDFs larger than this are not read for a cover (pdf.js would download and parse them whole): they keep the placeholder. */
export const AUTO_COVER_MAX_PDF_BYTES=50*1024*1024;
/** How long one cover may take before it is cancelled. */
export const AUTO_COVER_TIMEOUT_MS=30000;
const IMAGE_MIMES=new Set(['image/jpeg','image/png','image/webp','image/gif']);
/** True when this browser can decode the format: the allowed images always, videos per `canPlayType` (e.g. some .mov codecs are not). */
export function browserCanDecode({mimeType}:{mimeType:string}):boolean{
 if(mimeType==='application/pdf')return true;if(mimeType.startsWith('image/'))return IMAGE_MIMES.has(mimeType);
 if(mimeType.startsWith('video/')){try{return document.createElement('video').canPlayType(mimeType)!==''}catch{return false}}
 return false;
}
/** The automatic cover a version can get, or null: small images (up to 1 MB) are their own cover, very large PDFs and undecodable formats are skipped. */
export function autoCoverFormat({mimeType,byteSize,canDecode=browserCanDecode}:{mimeType:string|null;byteSize:number|null;canDecode?:typeof browserCanDecode}):AutoCoverFormat|null{
 if(!mimeType)return null;
 const format:AutoCoverFormat|null=mimeType==='application/pdf'?((byteSize??Infinity)<=AUTO_COVER_MAX_PDF_BYTES?'pdf':null):mimeType.startsWith('video/')?'video':mimeType.startsWith('image/')&&(byteSize??Infinity)>SALES_MATERIAL_MAX_COVER_BYTES?'image':null;
 return format&&canDecode({mimeType})?format:null;
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
  const context=canvas.getContext('2d');if(!context)throw new Error('Canvas unavailable');
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
 const timer=setTimeout(()=>controller.abort(new Error('La portada tardó demasiado en generarse.')),timeoutMs);
 const forward=()=>controller.abort(signal?.reason);
 if(signal?.aborted)forward();else signal?.addEventListener('abort',forward,{once:true});
 try{return await encodeAutoCover(await render[format]('file' in source?source.file:source.url,controller.signal));}
 finally{clearTimeout(timer);signal?.removeEventListener('abort',forward);}
}
/** Result of {@link saveAutoCover}: stored, `kept` out because an admin's manual choice exists (not a failure), or failed. */
export type AutoCoverResult={ok:true;revision:number;kept?:boolean}|{ok:false;error:string};
/**
 * Generates and stores an automatic cover through the normal cover path (presigned upload + `cover` mutation with `auto:true`, so the server
 * applies the same type, size and signature checks). Never throws: a failure leaves the material without cover and the card shows its placeholder.
 */
export async function saveAutoCover({materialId,revision,format,source,signal,generate=generateAutoCover,upload=uploadSalesMaterialFile,post=postSalesMaterial}:{materialId:string;revision:number;format:AutoCoverFormat;source:AutoCoverSource;signal?:AbortSignal;generate?:typeof generateAutoCover;upload?:typeof uploadSalesMaterialFile;post?:typeof postSalesMaterial}):Promise<AutoCoverResult>{
 try{
  const file=await generate({format,source,signal});
  const uploadId=await upload({file,purpose:'cover',materialId,signal});
  const result=await post({action:'cover',id:materialId,revision,uploadId,auto:true});
  return result.coverKept?{ok:true,revision:result.revision??revision,kept:true}:{ok:true,revision:result.revision??revision+1};
 }catch(e){return {ok:false,error:e instanceof Error?e.message:'No se pudo generar la portada.'}}
}
/** Materials whose backfill failed in this browser session: «Generar portadas faltantes» does not download them again until a reload. */
export const failedAutoCoverIds=new Set<string>();
/** Automatic cover of a stored material (the backfill «Generar portadas faltantes»): reads its current version through the same-origin file URL. */
export async function saveMissingAutoCover({material,signal,save=saveAutoCover}:{material:SalesMaterial;signal?:AbortSignal;save?:typeof saveAutoCover}):Promise<{ok:boolean}>{
 const v=material.currentVersion;const format=v?autoCoverFormat({mimeType:v.mimeType,byteSize:v.byteSize}):null;
 if(!v||!format||!needsAutoCover({material}))return {ok:false};
 const result=await save({materialId:material.id,revision:material.revision,format,source:{url:salesMaterialFileUrl({versionId:v.id})},signal});
 if(!result.ok&&!signal?.aborted)failedAutoCoverIds.add(material.id);
 return {ok:result.ok};
}
