import React,{useEffect,useState} from 'react';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription,DialogFooter} from './Dialog';
import {Button} from './Button';
import type {ResourceVersion} from '../endpoints/resources.schema';
import styles from './Communication.module.css';

export const canPreviewDocument=(v:ResourceVersion)=>!v.url&&['application/pdf','image/png','image/jpeg','text/plain'].includes(v.mimeType??'');
export function DocumentPreviewDialog({version,onClose}:{version:ResourceVersion;onClose:()=>void}){
 const [content,setContent]=useState<{url?:string;text?:string}|null>(null),[error,setError]=useState('');
 const download='/_api/resources/download?versionId='+version.id;
 useEffect(()=>{
  const controller=new AbortController();let objectUrl:string|undefined;
  setContent(null);setError('');
  async function load(){try{
   const r=await fetch('/_api/resources/download?versionId='+version.id,{signal:controller.signal,credentials:'same-origin',cache:'no-store',redirect:'error'});
   if(!r.ok)throw new Error(r.status===403?'No tenés permiso para previsualizar esta versión.':'No se pudo cargar el documento.');
   if(r.headers.get('Content-Type')?.split(';')[0]!==version.mimeType)throw new Error('El formato recibido no admite esta vista previa.');
   const blob=await r.blob();if(controller.signal.aborted)return;
   if(version.mimeType==='text/plain'){const text=await blob.text();if(!controller.signal.aborted)setContent({text});}
   else{objectUrl=URL.createObjectURL(blob);setContent({url:objectUrl});}
  }catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:'No se pudo cargar el documento.');}}
  if(canPreviewDocument(version))void load();else setError('Este documento no admite vista previa.');
  return()=>{controller.abort();if(objectUrl)URL.revokeObjectURL(objectUrl);};
 },[version.id,version.mimeType,version.url]);
 return <Dialog open onOpenChange={open=>{if(!open)onClose()}}><DialogContent className={styles.documentPreviewDialog}><DialogHeader><DialogTitle>Vista previa del documento</DialogTitle><DialogDescription>{version.fileName} · versión {version.version}</DialogDescription></DialogHeader><div className={styles.documentPreviewBody}>
 {error?<p role="alert">{error}</p>:!content?<p role="status">Cargando vista previa…</p>:version.mimeType==='text/plain'?<pre className={styles.documentText}>{content.text}</pre>:version.mimeType==='application/pdf'?<><object className={styles.documentPdf} data={content.url} type="application/pdf" aria-label={'Vista previa de '+version.fileName}><p>Tu navegador no puede mostrar este PDF. Usá Descargar para abrirlo.</p></object><p className={styles.muted}>Si el navegador no muestra el PDF, podés descargarlo y abrirlo.</p></>:<img className={styles.documentImage} src={content.url} alt={'Vista previa de '+version.fileName} onError={()=>setError('No se pudo mostrar la imagen. Podés descargar el archivo.')}/>}</div><DialogFooter><Button asChild variant="outline"><a href={download} target="_blank" rel="noopener noreferrer">Descargar</a></Button><Button onClick={onClose}>Cerrar vista previa</Button></DialogFooter></DialogContent></Dialog>;
}
