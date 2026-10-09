import {getDocument,GlobalWorkerOptions,type RenderTask} from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
GlobalWorkerOptions.workerSrc=workerUrl;
// Keep at most two transient workers alive while visible cards request thumbnails.
const lanes:Promise<void>[]=[Promise.resolve(),Promise.resolve()];let lane=0;
export function renderPdfThumbnail(blob:Blob,signal:AbortSignal):Promise<string>{
 const index=lane++%lanes.length;
 const result=lanes[index].then(async()=>{
  if(signal.aborted)throw new DOMException('Aborted','AbortError');
  const bytes=await blob.arrayBuffer();if(signal.aborted)throw new DOMException('Aborted','AbortError');
  const task=getDocument({data:new Uint8Array(bytes)});let render:RenderTask|undefined;
  const cancel=()=>{render?.cancel();void task.destroy().catch(()=>undefined)};signal.addEventListener('abort',cancel,{once:true});
  try{
   const pdf=await task.promise;if(signal.aborted)throw new DOMException('Aborted','AbortError');
   const page=await pdf.getPage(1);const base=page.getViewport({scale:1});const ratio=Math.min(window.devicePixelRatio||1,2);const view=page.getViewport({scale:Math.min(160/base.width,140/base.height)*ratio});
   const canvas=document.createElement('canvas');canvas.width=Math.ceil(view.width);canvas.height=Math.ceil(view.height);const context=canvas.getContext('2d');if(!context)throw new Error('Canvas unavailable');
   render=page.render({canvas,canvasContext:context,viewport:view});await render.promise;if(signal.aborted)throw new DOMException('Aborted','AbortError');return canvas.toDataURL('image/png');
  }finally{signal.removeEventListener('abort',cancel);await task.destroy();}
 });
 lanes[index]=result.then(()=>{},()=>{});return result;
}
