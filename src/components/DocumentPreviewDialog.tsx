import React,{useEffect,useRef,useState} from 'react';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription,DialogFooter} from './Dialog';
import {Button} from './Button';
import type {ResourceVersion} from '../endpoints/resources.schema';
import styles from './Communication.module.css';

export const canPreviewDocument=(v:ResourceVersion)=>!v.url&&['application/pdf','image/png','image/jpeg','text/plain'].includes(v.mimeType??'');
export function DocumentPreviewDialog({version,onClose}:{version:ResourceVersion;onClose:()=>void}){
 const [content,setContent]=useState<{url?:string;text?:string}|null>(null),[error,setError]=useState('');
 const [attempt,setAttempt]=useState(0),[expanded,setExpanded]=useState(false);
 const loading=useRef(true);
 const download='/_api/resources/download?versionId='+version.id;
 useEffect(()=>{
  const controller=new AbortController();let objectUrl:string|undefined;
  loading.current=true;setContent(null);setError('');setExpanded(false);
  async function load(){try{
   const r=await fetch('/_api/resources/download?versionId='+version.id,{signal:controller.signal,credentials:'same-origin',cache:'no-store',redirect:'error'});
   if(!r.ok)throw new Error(r.status===403?'No tenés permiso para previsualizar esta versión.':'No se pudo cargar el documento.');
   if(r.headers.get('Content-Type')?.split(';')[0]!==version.mimeType)throw new Error('El formato recibido no admite esta vista previa.');
   const blob=await r.blob();if(controller.signal.aborted)return;
   if(version.mimeType==='text/plain'){const text=await blob.text();if(!controller.signal.aborted)setContent({text});}
   else{objectUrl=URL.createObjectURL(blob);setContent({url:objectUrl});}
  }catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:'No se pudo cargar el documento.');}
  finally{if(!controller.signal.aborted)loading.current=false;}}
  if(canPreviewDocument(version))void load();else{loading.current=false;setError('Este documento no admite vista previa.');}
  return()=>{controller.abort();if(objectUrl)URL.revokeObjectURL(objectUrl);};
 },[version.id,version.mimeType,version.url,attempt]);
 function retry(){if(loading.current)return;loading.current=true;setContent(null);setError('');setAttempt(value=>value+1);}
 return <Dialog open onOpenChange={open=>{if(!open)onClose()}}><DialogContent className={styles.documentPreviewDialog}>
  <DialogHeader><DialogTitle>Vista previa del documento</DialogTitle><DialogDescription>{version.fileName} · versión {version.version}. Previsualizar no vincula ni envía el material.</DialogDescription></DialogHeader>
  <div className={styles.documentPreviewBody}>
   {error?<><p role="alert">{error}</p>{canPreviewDocument(version)&&<Button variant="outline" onClick={retry}>Reintentar vista previa</Button>}</>:!content?<p role="status">Cargando vista previa…</p>:version.mimeType==='text/plain'?<pre className={styles.documentText}>{content.text}</pre>:version.mimeType==='application/pdf'?<>
    <object className={styles.documentPdf} data={content.url} type="application/pdf" aria-label={'Vista previa de '+version.fileName}><p>Tu navegador no puede mostrar este PDF. Usá Descargar para abrirlo.</p></object><p className={styles.muted}>Si el navegador no muestra el PDF, podés descargarlo y abrirlo.</p>
   </>:<>
    <div className={styles.actions}><Button variant="outline" aria-pressed={expanded} onClick={()=>setExpanded(value=>!value)}>{expanded?'Ajustar imagen':'Ampliar imagen'}</Button><p className={styles.muted} role="status">{expanded?'Imagen ampliada. Desplazate dentro de la vista para ver los detalles.':'Imagen ajustada al espacio disponible.'}</p></div>
    <div className={styles.documentImageViewport} tabIndex={0} role="region" aria-label="Imagen del material" aria-describedby="material-image-help"><img className={expanded?styles.documentImageExpanded:styles.documentImage} src={content.url} alt={'Vista previa de '+version.fileName} onError={()=>setError('No se pudo mostrar la imagen. Podés reintentar o descargar el archivo.')}/></div>
    <p id="material-image-help" className={styles.muted}>Podés ampliar la imagen. En la vista ampliada, usá el desplazamiento o las flechas del teclado para recorrerla.</p>
   </>}
  </div>
  <DialogFooter><Button asChild variant="outline"><a href={download} target="_blank" rel="noopener noreferrer">Descargar</a></Button><Button onClick={onClose}>Cerrar vista previa</Button></DialogFooter>
 </DialogContent></Dialog>;
}
