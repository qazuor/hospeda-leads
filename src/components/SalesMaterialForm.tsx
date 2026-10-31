import {useEffect,useRef,useState} from 'react';
import {Check} from 'lucide-react';
import {Loader,Progress} from '@mantine/core';
import {MultiSelect} from './MultiSelect';
import {CreatableMultiSelect} from './CreatableMultiSelect';
import {useQueryClient} from '@tanstack/react-query';
import {CrmApiError} from '../helpers/apiClient';
import {getSalesMaterials,postSalesMaterial,type SalesMaterial,type SalesMaterialCategory,type SalesMaterialLimits} from '../endpoints/salesMaterials.schema';
import {salesMaterialCategoryKey,SALES_MATERIAL_ACCEPT,SALES_MATERIAL_COVER_MIMES,externalUrlError,formatBytes,mimeForFile,uploadDeclarationError} from '../helpers/salesMaterialTypes';
import {UploadCancelled,fixMisnamedFile,uploadSalesMaterialFile,type UploadProgress} from '../helpers/salesMaterialUpload';
import {autoCoverPlan,saveAutoCover,saveLinkAutoCover,saveMissingAutoCover} from '../helpers/salesMaterialAutoCover';
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
/** Title of the progress view that replaces the form while saving (owner review of spec 96). */
const savingTitles={create:'Guardando el material',edit:'Guardando los cambios',version:'Guardando la versión',cover:'Guardando la portada'} as const;
/** Spec 102: sent with a saved message when the material was saved without the cover it should have: the notice offers «Elegir portada». */
export type SalesMaterialSavedNotice={coverMaterialId:string};
/**
 * Admin dialog for sales material: create (file or external URL), edit data, add a version, set or remove the cover.
 * Files go straight from the browser to R2 with progress and cancel; double submit is blocked and the form keeps what was typed on error.
 * Spec 102: external links take a manual cover too, and «Portada» can generate the automatic cover from the stored file on request.
 * Spec 102 D1/D4/D6: a link without manual cover gets its site's preview image; «Verticales» marks where the material applies (empty = all);
 * «Categorías» searches, picks and creates in one control.
 */
export function SalesMaterialForm({mode,categories,verticals:catalog=[],limits,onClose,onSaved}:{mode:SalesMaterialFormMode;categories:SalesMaterialCategory[];/** Active catalog verticals, in order. */verticals?:readonly string[];limits:SalesMaterialLimits;onClose:()=>void;onSaved:(message:string,notice?:SalesMaterialSavedNotice)=>void}){
 const qc=useQueryClient();
 const material='material' in mode?mode.material:null;
 const [title,setTitle]=useState(material?.title??''),[description,setDescription]=useState(material?.description??'');
 const [kind,setKind]=useState<'deliverable'|'internal'>(material?.kind??'deliverable'),[source,setSource]=useState<'file'|'url'>(material?.source??'file');
 const [categoryIds,setCategoryIds]=useState<string[]>(material?.categories.map(c=>c.id)??[]);
 const [extraCategories,setExtraCategories]=useState<SalesMaterialCategory[]>([]),[verticals,setVerticals]=useState<string[]>(material?.verticals??[]);
 const [file,setFile]=useState<File|null>(null),[cover,setCover]=useState<File|null>(null),[url,setUrl]=useState('');
 const [fileNotice,setFileNotice]=useState(''),[coverNotice,setCoverNotice]=useState(''),picks=useRef({file:0,cover:0});
 const [pending,setPending]=useState(''),[progress,setProgress]=useState<UploadProgress|null>(null),[error,setError]=useState(''),[generateError,setGenerateError]=useState('');
 // Owner review of spec 96: while saving, the form gives way to a progress view listing each step (`steps`); an error brings the form back.
 const [saving,setSaving]=useState(false),[steps,setSteps]=useState<string[]>([]),[generating,setGenerating]=useState(false),[creatingCategory,setCreatingCategory]=useState(false);
 useEffect(()=>{if(saving&&pending)setSteps(list=>list.at(-1)===pending?list:[...list,pending]);},[saving,pending]);
 const lock=useRef(false),abort=useRef<AbortController|null>(null),createId=useRef(crypto.randomUUID());
 // The revision this dialog saves against: refreshed after a 409 so a retry uses the latest one. The verified upload is kept for that retry (a 409 never consumes it).
 // `latest` is the material as the server last returned it, so «Generar desde el archivo» retries with the current cover state too.
 const revision=useRef(material?.revision??1),latest=useRef(material),uploaded=useRef<{file:File;purpose:'file'|'cover';uploadId:string}|null>(null);
 const busy=!!pending;
 const known=[...categories,...extraCategories.filter(c=>!categories.some(k=>k.id===c.id))];
 const options=known.filter(c=>c.active||categoryIds.includes(c.id)).map(c=>({value:c.id,label:c.active?c.name:c.name+' (desactivada)'}));
 // Deactivated categories are not offered, but «Crear» must not be offered for them either (the server rejects the name).
 const unavailableCategories=known.filter(c=>!c.active).map(c=>({label:c.name,reason:`«${c.name}» está desactivada. Reactivala en Configuración → «Categorías de material».`}));
 // A vertical the material has that is no longer active stays visible (and kept on save), like a deactivated category.
 const verticalOptions=[...catalog.map(v=>({value:v,label:v})),...(material?.verticals??[]).filter(v=>!catalog.includes(v)).map(v=>({value:v,label:v+' (desactivada)'}))];
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
  try{const list=await qc.fetchQuery({queryKey:['sales-materials','latest'],queryFn:()=>getSalesMaterials({includeArchived:true}),staleTime:0});const found=list.materials.find(m=>m.id===material.id);if(found){revision.current=found.revision;latest.current=found;return true;}}catch{/* The generic message below still lets the user retry. */}
  return false;
 }
 async function failure(e:unknown,fallback:string):Promise<string>{
  if(e instanceof UploadCancelled)return e.message;
  const message=e instanceof Error?e.message:fallback;
  if(e instanceof CrmApiError&&e.status===409){const fresh=await refreshRevision();return message+(fresh?' Ya tomamos los datos más recientes; reintentá. Lo que cargaste se conserva.':' Actualizá la página antes de reintentar.');}
  uploaded.current=null;
  return message+' Lo que cargaste se conserva; podés reintentar.';
 }
 /** Spec 102 D6: «Crear categoría «X»» of the selector (admin-only on the server). Holds the form lock so saving waits for it; errors stay in the control. */
 async function createCategory(name:string){
  if(lock.current)throw new Error(BUSY);
  lock.current=true;setCreatingCategory(true);
  try{const result=await postSalesMaterial({action:'category_create',name});if(!result.id)throw new Error('No se pudo crear la categoría.');
   setExtraCategories(list=>[...list,{id:result.id!,name,active:true}]);void qc.invalidateQueries({queryKey:['sales-materials']});return {value:result.id,label:name};}
  finally{lock.current=false;setCreatingCategory(false)}
 }
 async function save(){
  if(lock.current||missing)return;
  lock.current=true;setError('');setSteps([]);setSaving(true);
  let saved='',coverFor='';
  /**
   * Spec 95: without a manual cover, a picked image, video or PDF gets one generated here; a failure only adds a note (a manual choice kept by
   * the server adds none), the material is saved. Spec 102: the note says why (a PDF too large, an unreadable format or the real error) and
   * the notice offers «Elegir portada».
   */
  const autoCover=async(target:File,materialId:string,at:number)=>{
   const plan=autoCoverPlan({mimeType:mimeForFile({fileName:target.name,type:target.type}),byteSize:target.size});
   if(!plan.format){if(plan.reason)coverFor=materialId;return plan.reason?' '+plan.reason:'';}
   setPending('Generando portada…');
   const result=await saveAutoCover({materialId,revision:at,format:plan.format,source:{file:target}});if(result.ok)return '';
   coverFor=materialId;return ` La portada automática no se pudo generar: ${result.error} La tarjeta muestra el dibujo del formato; podés subir una imagen o reintentar con «Elegir portada».`;
  };
  /** Spec 102 D1: a link without manual cover takes its site's preview image (the server fetches it); without one, the notice offers «Elegir portada». */
  const linkCover=async(materialId:string,at:number)=>{
   setPending('Buscando la imagen del enlace…');
   const result=await saveLinkAutoCover({materialId,revision:at});if(result.ok)return '';
   coverFor=materialId;return ` ${result.error} La tarjeta muestra el dibujo del enlace; podés subir una imagen con «Elegir portada».`;
  };
  try{
   if(mode.type==='create'){
    const id=createId.current;
    const version=source==='file'?{uploadId:await upload(file!,'file',id)}:{url:url.trim()};
    setPending('Guardando material…');
    await postSalesMaterial({action:'create',id,title:title.trim(),description:description.trim(),kind,source,categoryIds,verticals,version});saved='Material guardado.';
    if(cover){const uploadId=await upload(cover,'cover',id);setPending('Guardando portada…');await postSalesMaterial({action:'cover',id,revision:1,uploadId});}
    else saved+=source==='file'?await autoCover(file!,id,1):await linkCover(id,1);
   }else if(mode.type==='edit'){
    setPending('Guardando cambios…');await postSalesMaterial({action:'update',id:material!.id,revision:revision.current,title:title.trim(),description:description.trim(),kind,categoryIds,verticals});saved='Cambios guardados.';
   }else if(mode.type==='version'){
    const version=material!.source==='file'?{uploadId:await upload(file!,'file',material!.id)}:{url:url.trim()};
    setPending('Guardando versión…');const result=await postSalesMaterial({action:'version',id:material!.id,revision:revision.current,version});saved='Nueva versión guardada. Las anteriores se conservan.';
    // The server drops an automatic cover with the old file; a manual cover or a removal stays and always wins. If `coverSource` is stale,
    // the server keeps the manual choice and answers `coverKept`, which is a quiet skip (no note).
    if(material!.coverSource==null||material!.coverSource==='auto'){const at=result.revision??revision.current+1;saved+=material!.source==='file'?await autoCover(file!,material!.id,at):await linkCover(material!.id,at);}
   }else{
    const uploadId=await upload(cover!,'cover',material!.id);
    setPending('Guardando portada…');await postSalesMaterial({action:'cover',id:material!.id,revision:revision.current,uploadId});saved='Portada actualizada.';
   }
   uploaded.current=null;await qc.invalidateQueries({queryKey:['sales-materials']});if(coverFor)onSaved(saved,{coverMaterialId:coverFor});else onSaved(saved);
  }catch(e){
   if(saved){void qc.invalidateQueries({queryKey:['sales-materials']});onSaved(saved+' La portada no se pudo guardar: probá de nuevo con «Elegir portada».',{coverMaterialId:material?.id??createId.current});return;}
   setError(await failure(e,'No se pudo guardar.'));
  }finally{lock.current=false;setPending('');setSaving(false)}
 }
 /**
  * Spec 102: «Generar desde el archivo» in «Portada»: an explicit request, so it ignores earlier failures of this session and may replace a
  * removed cover. On failure the reason stays in the dialog next to the image field; after a conflict the latest material (revision and
  * cover state) is taken first. «Cancelar» aborts the download, the render and the upload.
  */
 async function generateCover(){
  if(lock.current||!latest.current)return;
  lock.current=true;setPending('Generando portada…');setError('');setGenerateError('');
  const controller=new AbortController();abort.current=controller;setGenerating(true);
  try{
   const result=await saveMissingAutoCover({material:{...latest.current,revision:revision.current},explicit:true,signal:controller.signal});
   if(result.ok){await qc.invalidateQueries({queryKey:['sales-materials']});onSaved(result.kept?'Ya hay una portada elegida a mano: no se reemplazó.':'Portada generada.');return;}
   if(controller.signal.aborted){setGenerateError('Se canceló la generación de la portada. Podés reintentar o subir una imagen.');return;}
   const fresh=result.conflict?await refreshRevision():false;
   setGenerateError((result.error??'No se pudo generar la portada.')+(result.conflict?(fresh?' Ya tomamos los datos más recientes; reintentá.':' Actualizá la página antes de reintentar.'):' Podés reintentar o subir una imagen.'));
  }finally{lock.current=false;abort.current=null;setGenerating(false);setPending('')}
 }
 async function removeCover(){
  if(lock.current||!material)return;
  lock.current=true;setPending('Quitando portada…');setError('');
  try{await postSalesMaterial({action:'cover',id:material.id,revision:revision.current,uploadId:null});await qc.invalidateQueries({queryKey:['sales-materials']});onSaved('Portada quitada.');}
  catch(e){setError(await failure(e,'No se pudo quitar la portada.'))}
  finally{lock.current=false;setPending('')}
 }
 // Spec 102 D1: «Generar desde el enlace» for an active link without a manual cover.
 const storedLink=mode.type==='cover'&&material?.source==='url'&&material.status==='active'&&material.coverSource!=='manual'&&!!material.currentVersion?.url;
 // Spec 102: «Generar desde el archivo» for a stored file without a manual cover (never set, automatic or removed) whose format takes one.
 const stored=mode.type==='cover'&&material?.source==='file'&&material.status==='active'&&material.coverSource!=='manual'&&material.currentVersion&&!material.currentVersion.url?material.currentVersion:null;
 const storedPlan=stored?autoCoverPlan({mimeType:stored.mimeType,byteSize:stored.byteSize}):null;
 const percent=progress&&progress.total?Math.min(100,Math.round(progress.loaded/progress.total*100)):0;
 return <CrmDialog opened onClose={()=>{if(!lock.current)onClose()}} busy={busy} title={saving?savingTitles[mode.type]:titles[mode.type]} description={saving?`«${(material?.title??title).trim()}»`:material?`«${material.title}»`:'Subí un archivo o registrá un enlace externo.'}>
  {saving?<div className={styles.savingView} role="status" aria-live="polite">
   <ol className={styles.savingSteps}>{steps.map((step,i)=>{const done=i<steps.length-1;return <li key={step+i} data-done={done||undefined}>{done?<Check size={16} aria-hidden="true"/>:<Loader size={14}/>}<span>{done?step.replace(/…$/,''):step}</span></li>;})}</ol>
   {progress&&<div className={styles.progress}><Progress value={percent} aria-label="Progreso de la subida"/><span>{formatBytes({bytes:progress.loaded})} de {formatBytes({bytes:progress.total})} · {percent} %</span></div>}
   <p className={styles.hint}>No cierres esta ventana hasta que termine.</p>
   {progress&&<div className={styles.actions}><Button variant="outline" onClick={()=>abort.current?.abort()}>Cancelar subida</Button></div>}
  </div>:<form className={styles.form} aria-busy={busy} onSubmit={event=>{event.preventDefault();void save()}}>
   {mode.type==='create'&&<label>Origen<NativeSelect value={source} disabled={busy} onChange={e=>setSource(e.target.value as 'file'|'url')}><option value="file">Archivo</option><option value="url">Enlace externo</option></NativeSelect></label>}
   {needsFile&&<label>Archivo<Input type="file" aria-label="Archivo" accept={SALES_MATERIAL_ACCEPT} disabled={busy} onChange={e=>void pick('file',e.target.files?.[0]??null)}/><span className={styles.hint}>Imágenes, PDF, video, audio o documentos de Office, hasta {formatBytes({bytes:limits.maxUploadBytes})}.{file&&!fileError?` Elegiste ${file.name} (${formatBytes({bytes:file.size})}).`:''}</span>{fileNotice&&<span className={styles.hint} role="status">{fileNotice}</span>}</label>}
   {needsUrl&&<label>Enlace (https)<Input type="url" value={url} disabled={busy} placeholder="https://…" onChange={e=>setUrl(e.target.value)}/></label>}
   {(mode.type==='create'||mode.type==='edit')&&<>
    <label>Título<Input value={title} maxLength={200} disabled={busy} onChange={e=>setTitle(e.target.value)} placeholder="Ej.: Folleto de tarifas 2027" aria-describedby="sales-material-title-hint"/></label><span id="sales-material-title-hint" className={styles.hint}>Lo ve el cliente: en el mensaje («Podés ver «…» en: …»), en la página del material y en la vista previa de WhatsApp.</span>
    <label>Comentario<Textarea value={description} maxLength={4000} disabled={busy} onChange={e=>setDescription(e.target.value)} placeholder="Para qué sirve, a quién conviene mostrarlo"/></label>
    <label>Tipo<NativeSelect value={kind} disabled={busy} onChange={e=>setKind(e.target.value as 'deliverable'|'internal')}><option value="deliverable">Entregable: se puede mandar a clientes</option><option value="internal">Interno: solo para vendedores</option></NativeSelect></label>
    {becomesInternal&&<p className={styles.warning} role="note">Al pasarlo a interno, los enlaces que ya se mandaron van a mostrar «Este material ya no está disponible».</p>}
    <CreatableMultiSelect label="Categorías" data={options} compareKey={salesMaterialCategoryKey} unavailable={unavailableCategories} value={categoryIds} onChange={setCategoryIds} onCreate={createCategory} disabled={busy} placeholder="Buscá o escribí una nueva" createLabel={text=>`Crear categoría «${text}»`} creatingLabel="Creando categoría…" nothingFoundMessage="No hay categorías con ese nombre"/>
    <MultiSelect label="Verticales" allLabel="Todas las verticales" data={verticalOptions} value={verticals} onChange={setVerticals} searchable clearable disabled={busy} maxValues={20} nothingFoundMessage="No hay verticales con ese nombre" aria-describedby="sales-material-verticals-hint"/>
    <span id="sales-material-verticals-hint" className={styles.hint}>Vacío: el material se ofrece para cualquier negocio. Con verticales, se ofrece primero en los negocios de esas verticales.</span>
   </>}
   {mode.type==='cover'&&storedPlan?.format&&<div className={styles.inline}><Button variant="outline" disabled={busy||!limits.storageConfigured} disabledReason={busy?BUSY:'Almacenamiento no configurado: no se puede leer el archivo.'} onClick={()=>void generateCover()}>Generar desde el archivo</Button><span className={styles.hint}>Dibuja la portada {storedPlan.format==='pdf'?'con la primera página del PDF':storedPlan.format==='video'?'con un cuadro del video':'con la imagen achicada'}.</span></div>}
   {storedLink&&<div className={styles.inline}><Button variant="outline" disabled={busy||!limits.storageConfigured} disabledReason={busy?BUSY:'Almacenamiento no configurado: no se puede guardar la portada.'} onClick={()=>void generateCover()}>Generar desde el enlace</Button><span className={styles.hint}>Usa la imagen de vista previa del sitio, si la tiene.</span></div>}
   {mode.type==='cover'&&storedPlan?.reason&&<p className={styles.hint} role="note">{storedPlan.reason}</p>}
   {generateError&&<p role="alert">{generateError}</p>}
   {(mode.type==='cover'||mode.type==='create')&&<label>{mode.type==='cover'?'Imagen de portada':'Portada (opcional)'}<Input type="file" aria-label={mode.type==='cover'?'Imagen de portada':'Portada (opcional)'} accept={COVER_ACCEPT} disabled={busy} onChange={e=>void pick('cover',e.target.files?.[0]??null)}/><span className={styles.hint}>JPG, PNG, WebP o GIF de hasta {formatBytes({bytes:limits.maxCoverBytes})}. Se usa en las vistas previas{source==='url'&&mode.type==='create'||material?.source==='url'?' y en la página del enlace.':'; en una imagen chica, la portada es la imagen misma. Sin portada, se genera una automática de la imagen, el video o la primera página del PDF.'}</span>{coverNotice&&<span className={styles.hint} role="status">{coverNotice}</span>}</label>}
   {(fileError||coverError||urlError)&&<p role="alert">{fileError||coverError||urlError}</p>}
   {progress&&<div className={styles.progress} role="status"><Progress value={percent} aria-label="Progreso de la subida"/><span>{pending} {percent} %</span></div>}
   {busy&&!progress&&<p role="status">{pending}</p>}
   {error&&<p role="alert">{error}</p>}
   <div className={styles.actions}>
    <Button type="submit" disabled={busy||creatingCategory||!!missing} disabledReason={busy||creatingCategory?BUSY:missing??undefined}>{busy?pending:creatingCategory?'Creando categoría…':mode.type==='create'?'Guardar material':mode.type==='edit'?'Guardar cambios':mode.type==='version'?'Guardar versión':'Guardar portada'}</Button>
    {progress&&<Button variant="outline" onClick={()=>abort.current?.abort()}>Cancelar subida</Button>}
    {generating&&<Button variant="outline" onClick={()=>abort.current?.abort()}>Cancelar</Button>}
    {mode.type==='cover'&&material?.hasCover&&<Button variant="ghost" disabled={busy} disabledReason={BUSY} onClick={()=>void removeCover()}>Quitar portada</Button>}
    <Button variant="ghost" disabled={busy} disabledReason={BUSY} onClick={onClose}>Cerrar</Button>
   </div>
  </form>}
 </CrmDialog>;
}
