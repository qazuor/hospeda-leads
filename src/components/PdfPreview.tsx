import React,{useEffect,useRef,useState} from 'react';
import {getDocument,GlobalWorkerOptions,type PDFDocumentProxy,type RenderTask} from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import {ChevronLeft,ChevronRight} from 'lucide-react';
import {Button} from './Button';
import styles from './Communication.module.css';

GlobalWorkerOptions.workerSrc=workerUrl;
export default function PdfPreview({blob,onError}:{blob:Blob;onError:()=>void}){
 const [document,setDocument]=useState<PDFDocumentProxy|null>(null),[page,setPage]=useState(1),[expanded,setExpanded]=useState(false),[busy,setBusy]=useState(true),[text,setText]=useState(''),[width,setWidth]=useState(0);
 const viewport=useRef<HTMLDivElement>(null),canvasHost=useRef<HTMLDivElement>(null);
 useEffect(()=>{let active=true;let task:ReturnType<typeof getDocument>|undefined;
  void blob.arrayBuffer().then(data=>{if(!active)return;task=getDocument({data:new Uint8Array(data)});return task.promise;}).then(pdf=>{if(active&&pdf)setDocument(pdf);}).catch(()=>{if(active)onError();});
  return()=>{active=false;void task?.destroy();};
 },[blob,onError]);
 useEffect(()=>{const element=viewport.current;if(!element)return;const observer=new ResizeObserver(()=>setWidth(element.clientWidth));observer.observe(element);setWidth(element.clientWidth);return()=>observer.disconnect();},[]);
 useEffect(()=>{if(!document||!width)return;let active=true;let render:RenderTask|undefined;setBusy(true);setText('');canvasHost.current?.replaceChildren();
  void (async()=>{const pdfPage=await document.getPage(page);if(!active)return;const base=pdfPage.getViewport({scale:1});const scale=Math.min(width/base.width,2)*(expanded?2:1);const ratio=Math.min(window.devicePixelRatio||1,2);const view=pdfPage.getViewport({scale});const canvas=window.document.createElement('canvas');canvas.width=Math.ceil(view.width*ratio);canvas.height=Math.ceil(view.height*ratio);canvas.style.width=view.width+'px';canvas.style.height=view.height+'px';canvas.setAttribute('aria-hidden','true');const context=canvas.getContext('2d');if(!context)throw new Error('Canvas unavailable');render=pdfPage.render({canvas,canvasContext:context,viewport:view,transform:ratio===1?undefined:[ratio,0,0,ratio,0,0]});await render.promise;const content=await pdfPage.getTextContent();if(!active)return;canvasHost.current?.replaceChildren(canvas);setText(content.items.map(item=>'str' in item?item.str:'').join(' '));setBusy(false);})().catch(()=>{if(active)onError();});
  // A cancelled render belongs to the previous page or a closed preview.
  // Handle failures without letting a corrupt PDF escape into the application.
  return()=>{active=false;render?.cancel();};
 },[document,page,width,expanded,onError]);
 return <><div className={styles.pdfToolbar}><Button variant="outline" size="icon-sm" aria-label="Página anterior" disabled={!document||page===1} onClick={()=>setPage(value=>value-1)}><ChevronLeft size={18} aria-hidden="true"/></Button><span role="status">{document?`Página ${page} de ${document.numPages}`:'Cargando PDF…'}</span><Button variant="outline" size="icon-sm" aria-label="Página siguiente" disabled={!document||page===document.numPages} onClick={()=>setPage(value=>value+1)}><ChevronRight size={18} aria-hidden="true"/></Button><Button variant="outline" size="sm" disabled={!document} aria-pressed={expanded} onClick={()=>setExpanded(value=>!value)}>{expanded?'Ajustar página':'Ampliar página'}</Button></div><div ref={viewport} className={styles.documentImageViewport} tabIndex={0} role="region" aria-label="Página del PDF" aria-busy={busy}>{busy&&<p role="status">Cargando página…</p>}<div ref={canvasHost} className={styles.pdfCanvas}/><span className={styles.pdfAccessibleText}>{text}</span></div></>;
}
