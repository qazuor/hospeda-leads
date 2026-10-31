import {getDocument,GlobalWorkerOptions,version,type RenderTask} from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
GlobalWorkerOptions.workerSrc=workerUrl;
/**
 * Spec 102: pdf.js resources it only fetches when a PDF needs them: wasm image decoders (JPX/JBIG2) and color management, ICC profiles (CMYK),
 * Adobe CMaps (CJK fonts) and the standard fonts a PDF does not embed. The `pdfjsAssets` Vite plugin serves the package folders under this
 * versioned same-origin path (immutable cache). Absolute URLs, because the worker fetches them.
 */
export const PDFJS_ASSET_OPTIONS=(()=>{const base=new URL(`/assets/pdfjs-${version}/`,globalThis.location?.origin??'http://localhost').href;return {wasmUrl:base+'wasm/',iccUrl:base+'iccs/',cMapUrl:base+'cmaps/',cMapPacked:true,standardFontDataUrl:base+'standard_fonts/'};})();
/**
 * Spec 102: why a render stopped. Cancelling makes pdf.js reject its pending promises with its own errors (`RenderingCancelledException`, a
 * destroyed worker), so once the signal aborted its reason wins: the timeout must read «La portada tardó demasiado.», not «No se pudo leer el PDF.».
 */
const abortReason=(signal?:AbortSignal)=>signal?.reason instanceof Error?signal.reason:new DOMException('Aborted','AbortError');
// Keep at most two transient workers alive while visible cards request thumbnails.
const lanes:Promise<void>[]=[Promise.resolve(),Promise.resolve()];let lane=0;
export function renderPdfThumbnail(blob:Blob,signal:AbortSignal):Promise<string>{
 const index=lane++%lanes.length;
 const result=lanes[index].then(async()=>{
  if(signal.aborted)throw new DOMException('Aborted','AbortError');
  const bytes=await blob.arrayBuffer();if(signal.aborted)throw new DOMException('Aborted','AbortError');
  const task=getDocument({data:new Uint8Array(bytes),...PDFJS_ASSET_OPTIONS});let render:RenderTask|undefined;
  const cancel=()=>{render?.cancel();void task.destroy().catch(()=>undefined)};signal.addEventListener('abort',cancel,{once:true});
  try{
   const pdf=await task.promise;if(signal.aborted)throw new DOMException('Aborted','AbortError');
   const page=await pdf.getPage(1);const base=page.getViewport({scale:1});const ratio=Math.min(window.devicePixelRatio||1,2);const view=page.getViewport({scale:Math.min(160/base.width,140/base.height)*ratio});
   const canvas=document.createElement('canvas');canvas.width=Math.ceil(view.width);canvas.height=Math.ceil(view.height);const context=canvas.getContext('2d');if(!context)throw new Error('Canvas unavailable');
   render=page.render({canvas,canvasContext:context,viewport:view});await render.promise;if(signal.aborted)throw new DOMException('Aborted','AbortError');return canvas.toDataURL('image/png');
  }catch(e){throw signal.aborted?abortReason(signal):e;}finally{signal.removeEventListener('abort',cancel);await task.destroy();}
 });
 lanes[index]=result.then(()=>{},()=>{});return result;
}
/**
 * Spec 95: first page of a PDF (bytes, or a same-origin URL that may redirect to R2) on a white canvas whose longest side is at most `maxSize` px.
 * Spec 102: a URL is read by ranges, only what the first page needs (no streaming, no prefetch; the bucket's CORS allows `Range`).
 * `signal` cancels the render and destroys the loading task (which stops its network reads and the worker's work).
 */
export async function renderPdfCover({source,maxSize,signal}:{source:Blob|string;maxSize:number;signal?:AbortSignal}):Promise<HTMLCanvasElement>{
 const aborted=()=>abortReason(signal);
 if(signal?.aborted)throw aborted();
 const bytes=typeof source==='string'?null:new Uint8Array(await source.arrayBuffer());if(signal?.aborted)throw aborted();
 const task=getDocument(bytes?{data:bytes,...PDFJS_ASSET_OPTIONS}:{url:source as string,disableStream:true,disableAutoFetch:true,...PDFJS_ASSET_OPTIONS});let render:RenderTask|undefined;
 const cancel=()=>{render?.cancel();void task.destroy().catch(()=>undefined)};signal?.addEventListener('abort',cancel,{once:true});
 try{
  const pdf=await task.promise;if(signal?.aborted)throw aborted();
  const page=await pdf.getPage(1);const base=page.getViewport({scale:1});const view=page.getViewport({scale:Math.min(maxSize/base.width,maxSize/base.height)});
  const canvas=document.createElement('canvas');canvas.width=Math.ceil(view.width);canvas.height=Math.ceil(view.height);const context=canvas.getContext('2d');if(!context)throw new Error('El navegador no pudo dibujar la portada.');
  context.fillStyle='#ffffff';context.fillRect(0,0,canvas.width,canvas.height);
  render=page.render({canvas,canvasContext:context,viewport:view});await render.promise;if(signal?.aborted)throw aborted();return canvas;
 }catch(e){throw signal?.aborted?aborted():e;}finally{signal?.removeEventListener('abort',cancel);await task.destroy().catch(()=>undefined);}
}
