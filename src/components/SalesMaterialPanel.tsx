import {useEffect,useRef,useState} from 'react';
import {keepPreviousData,useMutation,useQuery,useQueryClient} from '@tanstack/react-query';
import {FileText,Image,Link2,Music,Presentation,Video} from 'lucide-react';
import {getSalesMaterials,postSalesMaterial,salesMaterialCoverUrl,salesMaterialFileUrl,type SalesMaterial,type SalesMaterialLimits} from '../endpoints/salesMaterials.schema';
import {SALES_MATERIAL_FORMAT_LABELS,formatBytes,salesMaterialFormat,type SalesMaterialFormat} from '../helpers/salesMaterialTypes';
import {formatDateTime} from '../helpers/crmDates';
import {useDebounce} from '../helpers/useDebounce';
import {QueryErrorNotice} from './QueryErrorNotice';
import {QueryLoadingNotice} from './QueryLoadingNotice';
import {CrmEmptyState} from './ui/CrmEmptyState';
import {Badge} from './Badge';
import {Button} from './Button';
import {Checkbox} from './Checkbox';
import {Disclosure,DisclosureSummary} from './Disclosure';
import {Input} from './Input';
import {NativeSelect} from './NativeSelect';
import {SalesMaterialForm,type SalesMaterialFormMode} from './SalesMaterialForm';
import styles from './SalesMaterial.module.css';
import layout from './ui/CrmLayout.module.css';

const BUSY='La operación está en curso. Esperá a que termine para continuar.';
const formatIcons:Record<SalesMaterialFormat,typeof FileText>={image:Image,pdf:FileText,video:Video,audio:Music,office:Presentation,link:Link2};
/** Card of one material: cover, kind, format, categories and the actions the viewer may use. */
export function SalesMaterialCard({material,admin,selected,busy,storageConfigured,onEdit,onArchive}:{material:SalesMaterial;admin:boolean;selected:boolean;busy:boolean;storageConfigured:boolean;onEdit:(mode:SalesMaterialFormMode)=>void;onArchive:(material:SalesMaterial)=>void}){
 const current=material.currentVersion;const format=salesMaterialFormat({mimeType:current?.mimeType??null});const Icon=formatIcons[format];
 const storageReason='Almacenamiento no configurado: el archivo no se puede abrir por ahora.';
 const archived=material.status==='archived';
 return <article className={styles.card} data-selected={selected||undefined} data-archived={archived||undefined} id={'material-'+material.id} aria-label={material.title}>
  <div className={styles.cover}>{material.hasCover&&storageConfigured?<img src={salesMaterialCoverUrl({materialId:material.id,revision:material.revision})} alt="" loading="lazy"/>:<span className={styles.coverLabel}><Icon size={32} aria-hidden="true"/>{SALES_MATERIAL_FORMAT_LABELS[format]}</span>}</div>
  <div className={styles.body}>
   <h3>{material.title}</h3>
   <div className={styles.badges}><Badge variant={material.kind==='deliverable'?'success':'warning'}>{material.kind==='deliverable'?'Entregable':'Interno'}</Badge><Badge variant="secondary">{SALES_MATERIAL_FORMAT_LABELS[format]}</Badge>{archived&&<Badge variant="destructive">Archivado</Badge>}{material.categories.map(c=><Badge key={c.id} variant="outline">{c.name}</Badge>)}</div>
   {material.description&&<p className={styles.description}>{material.description}</p>}
   {current&&<p className={styles.meta}>{current.url?'Enlace externo':`${current.fileName??'Archivo'}${current.byteSize?' · '+formatBytes({bytes:current.byteSize}):''}`} · versión {current.version}</p>}
   {material.kind==='internal'&&<p className={styles.meta}>Solo para vendedores: no se manda a clientes.</p>}
   {current&&<div className={styles.actions}>
    {current.url?<Button asChild variant="outline" size="sm"><a href={salesMaterialFileUrl({versionId:current.id})} target="_blank" rel="noopener noreferrer">Abrir enlace</a></Button>:<>
     {storageConfigured?<Button asChild variant="outline" size="sm"><a href={salesMaterialFileUrl({versionId:current.id})} target="_blank" rel="noopener noreferrer">Abrir</a></Button>:<Button variant="outline" size="sm" disabled disabledReason={storageReason}>Abrir</Button>}
     {storageConfigured?<Button asChild variant="outline" size="sm"><a href={salesMaterialFileUrl({versionId:current.id,disposition:'attachment'})}>Descargar</a></Button>:<Button variant="outline" size="sm" disabled disabledReason={storageReason}>Descargar</Button>}
    </>}
   </div>}
   {admin&&<div className={styles.actions}>
    <Button size="sm" variant="ghost" disabled={busy} disabledReason={BUSY} onClick={()=>onEdit({type:'edit',material})}>Editar</Button>
    {!archived&&<Button size="sm" variant="ghost" disabled={busy} disabledReason={BUSY} onClick={()=>onEdit({type:'version',material})}>Nueva versión</Button>}
    {!archived&&material.source==='file'&&<Button size="sm" variant="ghost" disabled={busy} disabledReason={BUSY} onClick={()=>onEdit({type:'cover',material})}>Portada</Button>}
    <Button size="sm" variant="ghost" disabled={busy} disabledReason={BUSY} onClick={()=>onArchive(material)}>{archived?'Restaurar':'Archivar'}</Button>
   </div>}
   {admin&&(material.versions?.length??0)>1&&<Disclosure><DisclosureSummary>Versiones anteriores ({material.versions!.length-1})</DisclosureSummary><div className={styles.versions}>{material.versions!.slice(1).map(v=><p key={v.id}><a href={salesMaterialFileUrl({versionId:v.id,disposition:'attachment'})}>Versión {v.version}: {v.url?'enlace externo':v.fileName}</a> · {v.actorEmail} · {formatDateTime(v.createdAt)}</p>)}</div></Disclosure>}
  </div>
 </article>;
}
/**
 * «Material de venta»: every user lists, opens and downloads; admins also create, edit, version, change covers, archive and restore (spec 89 §12).
 * `selectedId` highlights the material a search result pointed at.
 */
export function SalesMaterialPanel({admin,selectedId}:{admin:boolean;selectedId?:string|null}){
 const qc=useQueryClient();
 const [search,setSearch]=useState(''),[categoryId,setCategoryId]=useState(''),[kind,setKind]=useState<''|'deliverable'|'internal'>(''),[includeArchived,setIncludeArchived]=useState(false);
 const term=useDebounce(search.trim(),250);
 const filters={search:term,categoryId:categoryId||undefined,kind:kind||undefined,includeArchived:admin&&includeArchived};
 const q=useQuery({queryKey:['sales-materials',filters],queryFn:()=>getSalesMaterials(filters),placeholderData:keepPreviousData});
 const [form,setForm]=useState<SalesMaterialFormMode|null>(null),[notice,setNotice]=useState(''),[error,setError]=useState(''),[pending,setPending]=useState('');
 const lock=useRef(false);
 const archive=useMutation({mutationFn:postSalesMaterial,onSettled:()=>{void qc.invalidateQueries({queryKey:['sales-materials']})}});
 async function toggleArchive(material:SalesMaterial){
  if(lock.current)return;lock.current=true;setError('');setNotice('');const restore=material.status==='archived';setPending(restore?'Restaurando material…':'Archivando material…');
  try{await archive.mutateAsync({action:restore?'restore':'archive',id:material.id,revision:material.revision});setNotice(restore?`«${material.title}» volvió a estar disponible.`:`«${material.title}» quedó archivado. No se borró nada.`);}
  catch(e){setError((e instanceof Error?e.message:'No se pudo actualizar el material.')+' Podés reintentar.')}
  finally{lock.current=false;setPending('')}
 }
 useEffect(()=>{if(selectedId&&q.data)document.getElementById('material-'+selectedId)?.scrollIntoView({block:'center'});},[selectedId,q.data]);
 const limits:SalesMaterialLimits|undefined=q.data?.limits;
 const filtered=!!(term||categoryId||kind);
 return <section className={layout.panel} aria-busy={q.isFetching||!!pending}>
  <div className={styles.filters}>
   <label>Buscar material<Input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Título o comentario"/></label>
   <label>Categoría<NativeSelect value={categoryId} onChange={e=>setCategoryId(e.target.value)}><option value="">Todas</option>{q.data?.categories.map(c=><option key={c.id} value={c.id}>{c.name}{c.active?'':' (desactivada)'}</option>)}</NativeSelect></label>
   <label>Tipo<NativeSelect value={kind} onChange={e=>setKind(e.target.value as ''|'deliverable'|'internal')}><option value="">Todos</option><option value="deliverable">Entregables</option><option value="internal">Internos</option></NativeSelect></label>
   {admin&&<label className={styles.inline}><Checkbox checked={includeArchived} onChange={e=>setIncludeArchived(e.currentTarget.checked)}/>Mostrar archivados</label>}
  </div>
  {admin&&<div className={styles.actions}><Button disabled={!!pending||!limits} disabledReason={pending?BUSY:'Esperá a que cargue el material.'} onClick={()=>{setNotice('');setForm({type:'create'})}}>Nuevo material</Button></div>}
  {limits&&!limits.storageConfigured&&<p className={styles.warning} role="note">Almacenamiento no configurado. Los archivos no se pueden subir ni abrir hasta que un administrador cargue las variables R2 en el servidor. Los enlaces externos siguen funcionando.</p>}
  {pending&&<p role="status">{pending}</p>}{notice&&<p role="status">{notice}</p>}{error&&<p role="alert">{error}</p>}
  {q.isPending?<QueryLoadingNotice>Cargando material de venta…</QueryLoadingNotice>:!q.data?<QueryErrorNotice error={q.error!} onRetry={q.refetch} busy={q.isFetching} label="Reintentar material"/>:<>
   {q.error&&<QueryErrorNotice error={q.error} onRetry={q.refetch} busy={q.isFetching} label="Reintentar material"/>}
   {q.data.materials.length===0?<CrmEmptyState>{filtered?<p>No hay material con esos filtros. Probá con otra búsqueda o categoría.</p>:<p>Todavía no hay material de venta.{admin?' Usá «Nuevo material» para subir el primero.':' Lo carga un administrador; si te falta alguno, pedíselo.'}</p>}</CrmEmptyState>:
    <div className={styles.grid}>{q.data.materials.map(m=><SalesMaterialCard key={m.id} material={m} admin={admin} selected={m.id===selectedId} busy={!!pending} storageConfigured={q.data.limits.storageConfigured} onEdit={mode=>{setNotice('');setForm(mode)}} onArchive={m=>void toggleArchive(m)}/>)}</div>}
  </>}
  {form&&limits&&q.data&&<SalesMaterialForm key={form.type+('material' in form?form.material.id:'')} mode={form} categories={q.data.categories} limits={limits} onClose={()=>setForm(null)} onSaved={message=>{setForm(null);setNotice(message)}}/>}
 </section>;
}
