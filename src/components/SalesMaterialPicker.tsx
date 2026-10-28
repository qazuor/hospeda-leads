import {useState} from 'react';
import {keepPreviousData,useQuery} from '@tanstack/react-query';
import {MultiSelect} from './MultiSelect';
import {FileText,Image,Link2,Music,Presentation,Video} from 'lucide-react';
import {getSalesMaterials,salesMaterialCoverUrl,type SalesMaterial} from '../endpoints/salesMaterials.schema';
import {SALES_MATERIAL_FORMAT_LABELS,formatBytes,salesMaterialFormat,type SalesMaterialFormat} from '../helpers/salesMaterialTypes';
import {useDebounce} from '../helpers/useDebounce';
import {CrmDialog} from './ui/CrmDialog';
import {Badge} from './Badge';
import {Button} from './Button';
import {Input} from './Input';
import {HelpLink} from './HelpLink';
import {QueryErrorNotice} from './QueryErrorNotice';
import {QueryLoadingNotice} from './QueryLoadingNotice';
import styles from './SalesMaterial.module.css';

const icons:Record<SalesMaterialFormat,typeof FileText>={image:Image,pdf:FileText,video:Video,audio:Music,office:Presentation,link:Link2};
/** The part of a material the composer needs once it was picked. */
export type PickedSalesMaterial=Pick<SalesMaterial,'id'|'title'>;
/**
 * «Agregar material de venta» (spec 89 §8.2): search, several categories (any of them, as on /sales-material) and thumbnails, listing only active
 * deliverables. Picking one hands it to the caller, which creates the link on the server; `includedIds` are already in the message.
 */
export function SalesMaterialPicker({opened,onClose,onPick,includedIds=[],busy=false,title='Agregar material de venta'}:{opened:boolean;onClose:()=>void;onPick:(material:PickedSalesMaterial)=>void;includedIds?:readonly string[];busy?:boolean;title?:string}){
 const [search,setSearch]=useState(''),[categoryIds,setCategoryIds]=useState<string[]>([]);
 const term=useDebounce(search.trim(),250);
 const filters={search:term,categoryIds:categoryIds.length?[...categoryIds].sort():undefined,kind:'deliverable' as const};
 const q=useQuery({queryKey:['sales-materials',filters],queryFn:()=>getSalesMaterials(filters),placeholderData:keepPreviousData,enabled:opened});
 const storage=q.data?.limits.storageConfigured??false;
 const materials=(q.data?.materials??[]).filter(m=>m.kind==='deliverable'&&m.status==='active'&&m.currentVersion);
 return <CrmDialog opened={opened} onClose={onClose} busy={busy} title={title} description={<>Solo material entregable y activo. Cada envío lleva su propio enlace, que podés revocar después. <HelpLink topic="salesMaterial" hint="messageMaterial"/></>}>
  <div className={styles.form}>
   <div className={styles.filters}>
    <label>Buscar material<Input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Título o comentario" disabled={busy}/></label>
    <MultiSelect label="Categorías" allLabel="Todas" data={(q.data?.categories??[]).filter(c=>c.active).map(c=>({value:c.id,label:c.name}))} value={categoryIds} onChange={setCategoryIds} searchable clearable disabled={busy} nothingFoundMessage="No hay categorías con ese nombre"/>
   </div>
   {busy&&<p role="status">Agregando el material al mensaje…</p>}
   {q.isPending?<QueryLoadingNotice>Cargando material de venta…</QueryLoadingNotice>:!q.data?<QueryErrorNotice error={q.error!} onRetry={q.refetch} busy={q.isFetching} label="Reintentar material"/>:<>
    {q.error&&<QueryErrorNotice error={q.error} onRetry={q.refetch} busy={q.isFetching} label="Reintentar material"/>}
    {!materials.length?<p className={styles.hint}>{term||categoryIds.length?'No hay material entregable con esos filtros. Probá con otra búsqueda o categoría.':'Todavía no hay material entregable. Lo carga un administrador en «Material de venta».'}</p>:
    <ul className={styles.pickList} aria-label="Material entregable" aria-busy={q.isFetching||busy}>{materials.map(m=>{
     const current=m.currentVersion!,format=salesMaterialFormat({mimeType:current.url?null:current.mimeType}),Icon=icons[format],included=includedIds.includes(m.id);
     return <li key={m.id} className={styles.pickRow}>
      <span className={styles.thumb} aria-hidden="true">{m.hasCover&&storage?<img src={salesMaterialCoverUrl({materialId:m.id,revision:m.revision})} alt="" loading="lazy"/>:<Icon size={24}/>}</span>
      <div className={styles.body} style={{padding:0}}><h4>{m.title}</h4><div className={styles.badges}><Badge variant="secondary">{SALES_MATERIAL_FORMAT_LABELS[format]}</Badge>{m.categories.map(c=><Badge key={c.id} variant="outline">{c.name}</Badge>)}</div><p className={styles.meta}>{current.url?'Enlace externo':`${current.fileName??'Archivo'}${current.byteSize?' · '+formatBytes({bytes:current.byteSize}):''}`}</p></div>
      <Button size="sm" disabled={busy||included} disabledReason={included?'Ya está en el mensaje.':'La operación está en curso. Esperá a que termine para continuar.'} onClick={()=>onPick({id:m.id,title:m.title})}>{included?'Agregado':'Agregar'}</Button>
     </li>;})}</ul>}
    {q.data.truncated&&<p className={styles.hint}>Hay más material del que se muestra. Buscá por título o filtrá por categoría.</p>}
   </>}
   <div className={styles.actions}><Button variant="outline" disabled={busy} disabledReason="La operación está en curso. Esperá a que termine para continuar." onClick={onClose}>Cerrar</Button></div>
  </div>
 </CrmDialog>;
}
