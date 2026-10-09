import React,{useEffect,useRef,useState} from 'react';
import {FileImage,FileText} from 'lucide-react';
import {Button} from './Button';
import type {ResourceVersion} from '../endpoints/resources.schema';
import styles from './Communication.module.css';
export const canThumbnail=(version:ResourceVersion)=>!version.url&&['application/pdf','image/png','image/jpeg'].includes(version.mimeType??'');
export function MaterialThumbnail({version}:{version:ResourceVersion}){
 const host=useRef<HTMLDivElement>(null);const [visible,setVisible]=useState(false),[attempt,setAttempt]=useState(0),[state,setState]=useState<{url?:string;error?:string}>({});
 useEffect(()=>{if(!host.current)return;if(typeof IntersectionObserver==='undefined'){setVisible(true);return;}const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){setVisible(true);observer.disconnect()}},{rootMargin:'100px'});observer.observe(host.current);return()=>observer.disconnect()},[]);
 useEffect(()=>{
  if(!visible||!canThumbnail(version))return;const controller=new AbortController();let objectUrl:string|undefined;setState({});
  void (async()=>{
   try{const r=await fetch('/_api/resources/download?versionId='+version.id,{signal:controller.signal,credentials:'same-origin',cache:'no-store',redirect:'error'});
    if(!r.ok)throw new Error('Miniatura no disponible. Podés reintentar o abrir la vista previa.');
    if(r.headers.get('Content-Type')?.split(';')[0]!==version.mimeType)throw new Error('El formato recibido no admite una miniatura.');
    const blob=await r.blob();if(controller.signal.aborted)return;
    let url:string;if(version.mimeType==='application/pdf'){const {renderPdfThumbnail}=await import('../helpers/pdfThumbnail');if(controller.signal.aborted)return;url=await renderPdfThumbnail(blob,controller.signal)}else{objectUrl=URL.createObjectURL(blob);url=objectUrl}
    if(!controller.signal.aborted)setState({url});
   }catch{if(!controller.signal.aborted)setState({error:'Miniatura no disponible. Podés reintentar o abrir la vista previa.'})}
  })();
  return()=>{controller.abort();if(objectUrl)URL.revokeObjectURL(objectUrl)};
 },[visible,version.id,version.mimeType,version.url,attempt]);
 if(!canThumbnail(version))return null;
 return <div ref={host} className={styles.materialThumbnail} aria-busy={visible&&!state.url&&!state.error}>
  {state.error?<div><span>{state.error}</span><Button variant="ghost" size="sm" onClick={()=>{setState({});setAttempt(a=>a+1)}}>Reintentar miniatura</Button></div>:state.url?<img src={state.url} alt={(version.mimeType==='application/pdf'?'Primera página de ':'Miniatura de ')+version.fileName} onError={()=>setState({error:'Miniatura no disponible. Podés reintentar o abrir la vista previa.'})}/>:visible?<span role="status">Cargando miniatura…</span>:version.mimeType==='application/pdf'?<FileText size={24} aria-hidden="true"/>:<FileImage size={24} aria-hidden="true"/>}
 </div>;
}
