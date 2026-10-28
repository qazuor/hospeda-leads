import {useRef,useState} from 'react';
import {Progress} from '@mantine/core';
import {MultiSelect} from './MultiSelect';
import {useQueryClient} from '@tanstack/react-query';
import {CrmApiError} from '../helpers/apiClient';
import {getSalesMaterials,postSalesMaterial,type SalesMaterial,type SalesMaterialCategory,type SalesMaterialLimits} from '../endpoints/salesMaterials.schema';
import {SALES_MATERIAL_ACCEPT,SALES_MATERIAL_COVER_MIMES,externalUrlError,formatBytes,mimeForFile,uploadDeclarationError} from '../helpers/salesMaterialTypes';
import {UploadCancelled,fixMisnamedFile,uploadSalesMaterialFile,type UploadProgress} from '../helpers/salesMaterialUpload';
import {autoCoverFormat,saveAutoCover} from '../helpers/salesMaterialAutoCover';
import {CrmDialog} from './ui/CrmDialog';
import {Button} from './Button';
import {Input} from './Input';
import {Textarea} from './Textarea';
import {NativeSelect} from './NativeSelect';
import styles from './SalesMaterial.module.css';

/** What the dialog edits: a new material, its data, a new version or its cover. */
export type SalesMaterialFormMode={type:'create'}|{type:'edit'|'version'|'cover';material:SalesMaterial};
const BUSY='La operación está en curso. Esperá a que termine para continuar.';
const COVER_ACCEPT=SALES_MATERIAL_COVER_MIMES.join(',');
/** Local check of a picked file, so the admin hears about a wrong type or size before uploading. */
export function pickedFileError({file,purpose,maxUploadBytes}:{file:File;purpose:'file'|'cover';maxUploadBytes:number}):string|null{
 const mimeType=mimeForFile({fileName:file.name,type:file.type});
 if(!mimeType)return 'Ese tipo de archivo no está permitido.';
 return uploadDeclarationError({purpose,fileName:file.name,mimeType,byteSize:file.size,maxUploadBytes});
}
const titles={create:'Nuevo material',edit:'Editar material',version:'Nueva versión',cover:'Portada'} as const;
/**
 * Admin dialog for sales material: create (file or external URL), edit data, add a version, set or remove the cover.
 * Files go straight from the browser to R2 with progress and cancel; double submit is blocked and the form keeps what was typed on error.
 */
export function SalesMaterialForm({mode,categories,limits,onClose,onSaved}:{mode:SalesMaterialFormMode;categories:SalesMaterialCategory[];limits:SalesMaterialLimits;onClose:()=>void;onSaved:(message:string)=>void}){
 const qc=useQueryClient();
 const material='material' in mode?mode.material:null;
 const [title,setTitle]=useState(material?.title??''),[description,setDescription]=useState(material?.description??'');
 const [kind,setKind]=useState<'deliverable'|'internal'>(material?.kind??'deliverable'),[source,setSource]=useState<'file'|'url'>(material?.source??'file');
 const [categoryIds,setCategoryIds]=useState<string[]>(material?.categories.map(c=>c.id)??[]);
 const [extraCategories,setExtraCategories]=useState<SalesMaterialCategory[]>([]),[newCategory,setNewCategory]=useState('');
 const [file,setFile]=useState<File|null>(null),[cover,setCover]=useState<File|null>(null),[url,setUrl]=useState('');
 const [fileNotice,setFileNotice]=useState(''),[coverNotice,setCoverNotice]=useState(''),picks=useRef({file:0,cover:0});
 const [pending,setPending]=useState(''),[progress,setProgress]=useState<UploadProgress|null>(null),[error,setError]=useState('');
 const lock=useRef(false),abort=useRef<AbortController|null>(null),createId=useRef(crypto.randomUUID());
 // The revision this dialog saves against: refreshed after a 409 so a retry uses the latest one. The verified upload is kept for that retry (a 409 never consumes it).
 const revision=useRef(material?.revision??1),uploaded=useRef<{file:File;purpose:'file'|'cover';uploadId:string}|null>(null);
 const busy=!!pending;
 const known=[...categories,...extraCategories.filter(c=>!categories.some(k=>k.id===c.id))];
 const options=known.filter(c=>c.active||categoryIds.includes(c.id)).map(c=>({value:c.id,label:c.active?c.name:c.name+' (desactivada)'}));
 const needsFile=mode.type==='create'?source==='file':mode.type==='version'&&material?.source==='file';
 const needsUrl=mode.type==='create'?source==='url':mode.type==='version'&&material?.source==='url';
 const fileError=file?pickedFileError({file,purpose:'file',maxUploadBytes:limits.maxUploadBytes}):null;
 const coverError=cover?pickedFileError({file:cover,purpose:'cover',maxUploadBytes:limits.maxCoverBytes}):null;
 const urlError=needsUrl&&url.trim()?externalUrlError({url:url.trim()}):null;
 const missing=(mode.type==='create'||mode.type==='edit')&&title.trim().length<3?'Escribí un título de 3 letras o más.':
  needsFile&&!file?'Elegí el archivo del material.':needsUrl&&!url.trim()?'Pegá el enlace del material.':mode.type==='cover'&&!cover?'Elegí una imagen para la portada.':
  fileError||coverError||urlError||(!limits.storageConfigured&&(needsFile||!!cover)?'Almacenamiento no configurado: no se pueden subir archivos.':null);
 const becomesInternal=mode.type==='edit'&&material?.kind==='deliverable'&&kind==='internal';
 /** Keeps the picked file and, once its first bytes are read, swaps in a renamed copy when its extension lies about its content. */
 async function pick(kind:'file'|'cover',picked:File|null){
  const token=++picks.current[kind],set=kind==='file'?setFile:setCover,setNotice=kind==='file'?setFileNotice:setCoverNotice;
  set(picked);setNotice('');if(!picked)return;
  const fixed=await fixMisnamedFile({file:picked});
  // A newer pick of the same input wins.
  if(picks.current[kind]===token&&fixed.file!==picked){set(fixed.file);setNotice(fixed.notice);}
 }
 async function upload(target:File,purpose:'file'|'cover',materialId:string){
  const reusable=uploaded.current;if(reusable&&reusable.file===target&&reusable.purpose===purpose)return reusable.uploadId;
  uploaded.current=null;
  setPending(purpose==='cover'?'Subiendo portada…':'Subiendo archivo…');setProgress({loaded:0,total:target.size});
  const controller=new AbortController();abort.current=controller;
  try{const uploadId=await uploadSalesMaterialFile({file:target,purpose,materialId,signal:controller.signal,onProgress:setProgress});uploaded.current={file:target,purpose,uploadId};return uploadId;}
  finally{abort.current=null;setProgress(null);}
 }
 /** After a 409: takes the latest revision of this material (server state, not the stale prop) so the next attempt can succeed. */
 async function refreshRevision():Promise<boolean>{
  void qc.invalidateQueries({queryKey:['sales-materials']});
  if(!material)return false;
  try{const list=await qc.fetchQuery({queryKey:['sales-materials','latest'],queryFn:()=>getSalesMaterials({includeArchived:true}),staleTime:0});const latest=list.materials.find(m=>m.id===material.id);if(latest){revision.current=latest.revision;return true;}}catch{/* The generic message below still lets the user retry. */}
  return false;
 }
 async function failure(e:unknown,fallback:string):Promise<string>{
  if(e instanceof UploadCancelled)return e.message;
  const message=e instanceof Error?e.message:fallback;
  if(e instanceof CrmApiError&&e.status===409){const fresh=await refreshRevision();return message+(fresh?' Ya tomamos los datos más recientes; reintentá. Lo que cargaste se conserva.':' Actualizá la página antes de reintentar.');}
  uploaded.current=null;
  return message+' Lo que cargaste se conserva; podés reintentar.';
 }
 async function createCategory(){
  const name=newCategory.trim();if(lock.current||name.length<2)return;
  lock.current=true;setPending('Creando categoría…');setError('');
  try{const result=await postSalesMaterial({action:'category_create',name});if(result.id){setExtraCategories(list=>[...list,{id:result.id!,name,active:true}]);setCategoryIds(ids=>[...ids,result.id!]);}setNewCategory('');void qc.invalidateQueries({queryKey:['sales-materials']});}
  catch(e){setError(e instanceof Error?e.message:'No se pudo crear la categoría.')}
  finally{lock.current=false;setPending('')}
 }
 async function save(){
  if(lock.current||missing)return;
  lock.current=true;setError('');
  let saved='';
  /** Spec 95: without a manual cover, a picked image, video or PDF gets one generated here; a failure only adds a note (a manual choice kept by the server adds none), the material is saved. */
  const autoCover=async(target:File,materialId:string,at:number)=>{
   const format=autoCoverFormat({mimeType:mimeForFile({fileName:target.name,type:target.type}),byteSize:target.size});if(!format)return '';
   setPending('Generando portada…');
   return (await saveAutoCover({materialId,revision:at,format,source:{file:target}})).ok?'':' La portada automática no se pudo generar: la tarjeta muestra el dibujo del formato.';
  };
  try{
   if(mode.type==='create'){
    const id=createId.current;
    const version=source==='file'?{uploadId:await upload(file!,'file',id)}:{url:url.trim()};
    setPending('Guardando material…');
    await postSalesMaterial({action:'create',id,title:title.trim(),description:description.trim(),kind,source,categoryIds,version});saved='Material guardado.';
    if(cover){const uploadId=await upload(cover,'cover',id);setPending('Guardando portada…');await postSalesMaterial({action:'cover',id,revision:1,uploadId});}
    else if(source==='file')saved+=await autoCover(file!,id,1);
   }else if(mode.type==='edit'){
    setPending('Guardando cambios…');await postSalesMaterial({action:'update',id:material!.id,revision:revision.current,title:title.trim(),description:description.trim(),kind,categoryIds});saved='Cambios guardados.';
   }else if(mode.type==='version'){
    const version=material!.source==='file'?{uploadId:await upload(file!,'file',material!.id)}:{url:url.trim()};
    setPending('Guardando versión…');const result=await postSalesMaterial({action:'version',id:material!.id,revision:revision.current,version});saved='Nueva versión guardada. Las anteriores se conservan.';
    // The server drops an automatic cover with the old file; a manual cover or a removal stays and always wins. If `coverSource` is stale,
    // the server keeps the manual choice and answers `coverKept`, which is a quiet skip (no note).
    if(material!.source==='file'&&(material!.coverSource==null||material!.coverSource==='auto'))saved+=await autoCover(file!,material!.id,result.revision??revision.current+1);
   }else{
    const uploadId=await upload(cover!,'cover',material!.id);
    setPending('Guardando portada…');await postSalesMaterial({action:'cover',id:material!.id,revision:revision.current,uploadId});saved='Portada actualizada.';
   }
   uploaded.current=null;await qc.invalidateQueries({queryKey:['sales-materials']});onSaved(saved);
  }catch(e){
   if(saved){void qc.invalidateQueries({queryKey:['sales-materials']});onSaved(saved+' La portada no se pudo guardar: probá de nuevo con «Portada».');return;}
   setError(await failure(e,'No se pudo guardar.'));
  }finally{lock.current=false;setPending('')}
 }
 async function removeCover(){
  if(lock.current||!material)return;
  lock.current=true;setPending('Quitando portada…');setError('');
  try{await postSalesMaterial({action:'cover',id:material.id,revision:revision.current,uploadId:null});await qc.invalidateQueries({queryKey:['sales-materials']});onSaved('Portada quitada.');}
  catch(e){setError(await failure(e,'No se pudo quitar la portada.'))}
  finally{lock.current=false;setPending('')}
 }
 const percent=progress&&progress.total?Math.min(100,Math.round(progress.loaded/progress.total*100)):0;
 return <CrmDialog opened onClose={()=>{if(!lock.current)onClose()}} busy={busy} title={titles[mode.type]} description={material?`«${material.title}»`:'Subí un archivo o registrá un enlace externo.'}>
  <form className={styles.form} aria-busy={busy} onSubmit={event=>{event.preventDefault();void save()}}>
   {mode.type==='create'&&<label>Origen<NativeSelect value={source} disabled={busy} onChange={e=>setSource(e.target.value as 'file'|'url')}><option value="file">Archivo</option><option value="url">Enlace externo</option></NativeSelect></label>}
   {needsFile&&<label>Archivo<Input type="file" aria-label="Archivo" accept={SALES_MATERIAL_ACCEPT} disabled={busy} onChange={e=>void pick('file',e.target.files?.[0]??null)}/><span className={styles.hint}>Imágenes, PDF, video, audio o documentos de Office, hasta {formatBytes({bytes:limits.maxUploadBytes})}.{file&&!fileError?` Elegiste ${file.name} (${formatBytes({bytes:file.size})}).`:''}</span>{fileNotice&&<span className={styles.hint} role="status">{fileNotice}</span>}</label>}
   {needsUrl&&<label>Enlace (https)<Input type="url" value={url} disabled={busy} placeholder="https://…" onChange={e=>setUrl(e.target.value)}/></label>}
   {(mode.type==='create'||mode.type==='edit')&&<>
    <label>Título<Input value={title} maxLength={200} disabled={busy} onChange={e=>setTitle(e.target.value)} placeholder="Ej.: Folleto de tarifas 2027"/></label>
    <label>Comentario<Textarea value={description} maxLength={4000} disabled={busy} onChange={e=>setDescription(e.target.value)} placeholder="Para qué sirve, a quién conviene mostrarlo"/></label>
    <label>Tipo<NativeSelect value={kind} disabled={busy} onChange={e=>setKind(e.target.value as 'deliverable'|'internal')}><option value="deliverable">Entregable: se puede mandar a clientes</option><option value="internal">Interno: solo para vendedores</option></NativeSelect></label>
    {becomesInternal&&<p className={styles.warning} role="note">Al pasarlo a interno, los enlaces que ya se mandaron van a mostrar «Este material ya no está disponible».</p>}
    <MultiSelect label="Categorías" data={options} value={categoryIds} onChange={setCategoryIds} searchable clearable disabled={busy} nothingFoundMessage="No hay categorías con ese nombre"/>
    <div className={styles.inline}><label>Nueva categoría<Input value={newCategory} maxLength={100} disabled={busy} onChange={e=>setNewCategory(e.target.value)}/></label><Button variant="outline" disabled={busy||newCategory.trim().length<2} disabledReason={busy?BUSY:'Escribí un nombre de 2 letras o más.'} onClick={()=>void createCategory()}>Crear categoría</Button></div>
   </>}
   {(mode.type==='cover'||mode.type==='create'&&source==='file')&&<label>{mode.type==='cover'?'Imagen de portada':'Portada (opcional)'}<Input type="file" aria-label={mode.type==='cover'?'Imagen de portada':'Portada (opcional)'} accept={COVER_ACCEPT} disabled={busy} onChange={e=>void pick('cover',e.target.files?.[0]??null)}/><span className={styles.hint}>JPG, PNG, WebP o GIF de hasta {formatBytes({bytes:limits.maxCoverBytes})}. Se usa en las vistas previas; en una imagen chica, la portada es la imagen misma. Sin portada, se genera una automática de la imagen, el video o la primera página del PDF.</span>{coverNotice&&<span className={styles.hint} role="status">{coverNotice}</span>}</label>}
   {(fileError||coverError||urlError)&&<p role="alert">{fileError||coverError||urlError}</p>}
   {progress&&<div className={styles.progress} role="status"><Progress value={percent} aria-label="Progreso de la subida"/><span>{pending} {percent} %</span></div>}
   {busy&&!progress&&<p role="status">{pending}</p>}
   {error&&<p role="alert">{error}</p>}
   <div className={styles.actions}>
    <Button type="submit" disabled={busy||!!missing} disabledReason={busy?BUSY:missing??undefined}>{busy?pending:mode.type==='create'?'Guardar material':mode.type==='edit'?'Guardar cambios':mode.type==='version'?'Guardar versión':'Guardar portada'}</Button>
    {progress&&<Button variant="outline" onClick={()=>abort.current?.abort()}>Cancelar subida</Button>}
    {mode.type==='cover'&&material?.hasCover&&<Button variant="ghost" disabled={busy} disabledReason={BUSY} onClick={()=>void removeCover()}>Quitar portada</Button>}
    <Button variant="ghost" disabled={busy} disabledReason={BUSY} onClick={onClose}>Cerrar</Button>
   </div>
  </form>
 </CrmDialog>;
}
