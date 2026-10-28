import {postSalesMaterial,salesMaterialFileUrl,type SalesMaterial} from '../endpoints/salesMaterials.schema';
import {SALES_MATERIAL_MAX_COVER_BYTES} from './salesMaterialTypes';
import {uploadSalesMaterialFile} from './salesMaterialUpload';
/** Formats that get an automatic cover (spec 95): audio, Office files and external links show a drawn placeholder instead. */
export type AutoCoverFormat='image'|'video'|'pdf';
/** Longest side of an automatic cover, in px. */
export const AUTO_COVER_MAX_SIZE=1200;
/** File name of every automatic cover (the server checks extension, type, size and signature as for any cover). */
export const AUTO_COVER_FILE_NAME='portada-automatica.jpg';
const TIMEOUT_MS=30000;
/** The automatic cover a version can get, or null: small images (up to 1 MB) are already their own cover. */
export function autoCoverFormat({mimeType,byteSize}:{mimeType:string|null;byteSize:number|null}):AutoCoverFormat|null{
 if(!mimeType)return null;if(mimeType==='application/pdf')return 'pdf';if(mimeType.startsWith('video/'))return 'video';
 return mimeType.startsWith('image/')&&(byteSize??Infinity)>SALES_MATERIAL_MAX_COVER_BYTES?'image':null;
}
/** True when an active file material has no stored cover and its current version can get an automatic one. */
export function needsAutoCover({material}:{material:SalesMaterial}):boolean{
 const v=material.currentVersion;
 return material.status==='active'&&material.source==='file'&&!material.coverSource&&!!v&&!v.url&&autoCoverFormat({mimeType:v.mimeType,byteSize:v.byteSize})!==null;
}
/** Where the pixels come from: the file the admin just picked, or a same-origin URL of a stored version (redirects to R2, which must allow GET over CORS). */
export type AutoCoverSource={file:Blob}|{url:string};
type Renderer=(source:Blob|string)=>Promise<CanvasImageSource&{width:number;height:number}>;
const withTimeout=<T,>(promise:Promise<T>,ms=TIMEOUT_MS)=>new Promise<T>((resolve,reject)=>{const t=setTimeout(()=>reject(new Error('La portada tardó demasiado en generarse.')),ms);promise.then(v=>{clearTimeout(t);resolve(v)},e=>{clearTimeout(t);reject(e)});});
/** Runs `use` with a URL for the source: an object URL for a picked file (revoked afterwards), the stored URL otherwise. */
async function withUrl<T>(source:Blob|string,use:(url:string,remote:boolean)=>Promise<T>):Promise<T>{
 if(typeof source==='string')return use(source,true);
 const url=URL.createObjectURL(source);try{return await use(url,false)}finally{URL.revokeObjectURL(url)}
}
const loadImage:Renderer=source=>withUrl(source,(url,remote)=>new Promise<HTMLImageElement>((resolve,reject)=>{
 const img=new Image();if(remote)img.crossOrigin='anonymous';img.decoding='async';
 img.onload=()=>resolve(img);img.onerror=()=>reject(new Error('No se pudo leer la imagen.'));img.src=url;
}));
/** A frame about one second in (or the middle of a shorter video), drawn on a canvas. */
const videoFrame:Renderer=source=>withUrl(source,(url,remote)=>new Promise<HTMLCanvasElement>((resolve,reject)=>{
 const video=document.createElement('video');video.muted=true;video.playsInline=true;video.preload='auto';if(remote)video.crossOrigin='anonymous';
 const stop=()=>{video.removeAttribute('src');video.load();};
 video.onloadedmetadata=()=>{video.currentTime=Number.isFinite(video.duration)&&video.duration>0?Math.min(1,video.duration/2):0;};
 video.onseeked=()=>{try{const canvas=document.createElement('canvas');canvas.width=video.videoWidth;canvas.height=video.videoHeight;const context=canvas.getContext('2d');if(!context||!canvas.width)throw new Error('No se pudo leer el video.');context.drawImage(video,0,0);resolve(canvas)}catch(e){reject(e)}finally{stop()}};
 video.onerror=()=>{stop();reject(new Error('No se pudo leer el video.'))};video.src=url;
}));
/** pdf.js (and its worker) is only downloaded here, the first time a PDF cover is needed. */
const pdfPage:Renderer=async source=>{const {renderPdfCover}=await import('./pdfThumbnail');return renderPdfCover({source,maxSize:AUTO_COVER_MAX_SIZE});};
const renderers:Record<AutoCoverFormat,Renderer>={image:loadImage,video:videoFrame,pdf:pdfPage};
const toBlob=(canvas:HTMLCanvasElement,quality:number)=>new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('No se pudo codificar la portada.')),'image/jpeg',quality));
/** Draws `image` scaled to fit `AUTO_COVER_MAX_SIZE` on white and encodes a JPEG under the cover limit (lower quality, then smaller, until it fits). */
export async function encodeAutoCover(image:CanvasImageSource&{width:number;height:number}):Promise<File>{
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
/** Generates the automatic cover of a source in the browser: the image downscaled, a video frame or the first PDF page. */
export async function generateAutoCover({format,source}:{format:AutoCoverFormat;source:AutoCoverSource}):Promise<File>{
 return withTimeout((async()=>encodeAutoCover(await renderers[format]('file' in source?source.file:source.url)))());
}
/**
 * Generates and stores an automatic cover through the normal cover path (presigned upload + `cover` mutation with `auto:true`, so the server
 * applies the same type, size and signature checks). Never throws: a failure leaves the material without cover and the card shows its placeholder.
 */
export async function saveAutoCover({materialId,revision,format,source,generate=generateAutoCover,upload=uploadSalesMaterialFile,post=postSalesMaterial}:{materialId:string;revision:number;format:AutoCoverFormat;source:AutoCoverSource;generate?:typeof generateAutoCover;upload?:typeof uploadSalesMaterialFile;post?:typeof postSalesMaterial}):Promise<{ok:true;revision:number}|{ok:false;error:string}>{
 try{
  const file=await generate({format,source});
  const uploadId=await upload({file,purpose:'cover',materialId});
  const result=await post({action:'cover',id:materialId,revision,uploadId,auto:true});
  return {ok:true,revision:result.revision??revision+1};
 }catch(e){return {ok:false,error:e instanceof Error?e.message:'No se pudo generar la portada.'}}
}
/** Automatic cover of a stored material (the backfill «Generar portadas faltantes»): reads its current version through the same-origin file URL. */
export async function saveMissingAutoCover({material,save=saveAutoCover}:{material:SalesMaterial;save?:typeof saveAutoCover}):Promise<{ok:boolean}>{
 const v=material.currentVersion;const format=v?autoCoverFormat({mimeType:v.mimeType,byteSize:v.byteSize}):null;
 if(!v||!format||!needsAutoCover({material}))return {ok:false};
 return save({materialId:material.id,revision:material.revision,format,source:{url:salesMaterialFileUrl({versionId:v.id})}});
}
