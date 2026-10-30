import {requestSalesMaterialUpload} from '../endpoints/salesMaterials.schema';
import {correctedSalesMaterialFile,fileExtension,mimeForFile} from './salesMaterialTypes';
/** Upload progress in bytes. */
export type UploadProgress={readonly loaded:number;readonly total:number};
/** The browser cancelled the upload on request: not an error to report. */
export class UploadCancelled extends Error{constructor(){super('Subida cancelada. Lo que cargaste se conserva.')}}
type XhrLike=Pick<XMLHttpRequest,'open'|'setRequestHeader'|'send'|'abort'|'status'|'onload'|'onerror'|'onabort'|'ontimeout'>&{upload:Pick<XMLHttpRequestUpload,'onprogress'>};
/**
 * PUTs a file to a presigned R2 URL with XMLHttpRequest, so the browser reports progress and the user can cancel (spec 89 §6.3).
 * `createXhr` is injectable for tests.
 */
export function putWithProgress({url,file,contentType,onProgress,signal,createXhr=()=>new XMLHttpRequest()}:{url:string;file:Blob;contentType:string;onProgress?:(progress:UploadProgress)=>void;signal?:AbortSignal;createXhr?:()=>XhrLike}):Promise<void>{
 return new Promise((resolve,reject)=>{
  if(signal?.aborted){reject(new UploadCancelled());return;}
  const xhr=createXhr();
  const abort=()=>xhr.abort();signal?.addEventListener('abort',abort,{once:true});
  const done=(fn:()=>void)=>{signal?.removeEventListener('abort',abort);fn();};
  xhr.open('PUT',url);xhr.setRequestHeader('Content-Type',contentType);
  xhr.upload.onprogress=event=>onProgress?.({loaded:event.loaded,total:event.lengthComputable?event.total:file.size});
  xhr.onload=()=>done(()=>xhr.status>=200&&xhr.status<300?resolve():reject(new Error(`El almacenamiento rechazó el archivo (${xhr.status}). Reintentá; lo que cargaste se conserva.`)));
  xhr.onerror=()=>done(()=>reject(new Error('Se cortó la subida del archivo. Revisá tu conexión y reintentá; lo que cargaste se conserva.')));
  xhr.ontimeout=xhr.onerror;
  xhr.onabort=()=>done(()=>reject(new UploadCancelled()));
  xhr.send(file);
 });
}
/** Asks the API for a presigned PUT and uploads the file; returns the upload id to confirm with a `create`, `version` or `cover` mutation. */
export async function uploadSalesMaterialFile({file,purpose,materialId,onProgress,signal,put=putWithProgress,request=requestSalesMaterialUpload}:{file:File;purpose:'file'|'cover';materialId:string;onProgress?:(progress:UploadProgress)=>void;signal?:AbortSignal;put?:typeof putWithProgress;request?:typeof requestSalesMaterialUpload}):Promise<string>{
 const mimeType=mimeForFile({fileName:file.name,type:file.type});if(!mimeType)throw new Error('Ese tipo de archivo no está permitido.');
 const target=await request({purpose,fileName:file.name,mimeType,byteSize:file.size,materialId});
 if(signal?.aborted)throw new UploadCancelled();
 await put({url:target.putUrl,file,contentType:target.headers['Content-Type'],onProgress,signal});
 return target.uploadId;
}
/** The first `bytes` bytes of a blob; FileReader where `Blob.arrayBuffer` is missing (older engines, jsdom). */
function readPrefix(blob:Blob,bytes:number):Promise<Uint8Array>{
 const part=blob.slice(0,bytes);
 if(typeof part.arrayBuffer==='function')return part.arrayBuffer().then(b=>new Uint8Array(b));
 return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(new Uint8Array(reader.result as ArrayBuffer));reader.onerror=()=>reject(reader.error);reader.readAsArrayBuffer(part);});
}
/**
 * Owner review of spec 96 (28/10/2026): reads the first bytes of a picked file and, when its extension lies about its content (a JPEG
 * saved as «.png»), returns it renamed under its real type with a one-line notice for the form. Otherwise (or when it cannot be read)
 * returns the same file and no notice; the server still checks what arrives.
 */
export async function fixMisnamedFile({file}:{file:File}):Promise<{file:File;notice:string}>{
 const declaredMime=mimeForFile({fileName:file.name,type:file.type});if(!declaredMime)return {file,notice:''};
 try{
  const fixed=correctedSalesMaterialFile({fileName:file.name,declaredMime,bytes:await readPrefix(file,16)});
  if(!fixed)return {file,notice:''};
  return {file:new File([file],fixed.fileName,{type:fixed.mimeType,lastModified:file.lastModified}),notice:`${file.name} en realidad es un archivo ${fileExtension({fileName:fixed.fileName}).toUpperCase()}: se sube como ${fixed.fileName}.`};
 }catch{return {file,notice:''}}
}
