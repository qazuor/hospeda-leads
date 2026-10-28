import {useEffect,useRef,useState,type ReactNode} from 'react';
import {toast} from 'sonner';
import {keepPreviousData,useMutation,useQuery,useQueryClient} from '@tanstack/react-query';
import {Loader} from '@mantine/core';
import {ChevronDown,ImagePlus,Plus} from 'lucide-react';
import {getSalesMaterials,postSalesMaterial,type SalesMaterial,type SalesMaterialLimits} from '../endpoints/salesMaterials.schema';
import {needsAutoCover,saveMissingAutoCover} from '../helpers/salesMaterialAutoCover';
import {EMPTY_SALES_MATERIAL_FILTERS,filterSalesMaterials,groupSalesMaterials,hasSalesMaterialFilters,salesMaterialQuery,type SalesMaterialFilters} from '../helpers/salesMaterialGroups';
import {useDebounce} from '../helpers/useDebounce';
import {QueryErrorNotice} from './QueryErrorNotice';
import {QueryLoadingNotice} from './QueryLoadingNotice';
import {CrmEmptyState} from './ui/CrmEmptyState';
import {Badge} from './Badge';
import {Button} from './Button';
import {SalesMaterialCard,SALES_MATERIAL_BUSY as BUSY} from './SalesMaterialCard';
import {SalesMaterialFiltersBar} from './SalesMaterialFilters';
import {SalesMaterialForm,type SalesMaterialFormMode} from './SalesMaterialForm';
import {SalesMaterialPreview} from './SalesMaterialPreview';
import styles from './SalesMaterial.module.css';
import layout from './ui/CrmLayout.module.css';

export {SalesMaterialCard} from './SalesMaterialCard';
/**
 * «Material de venta»: every user lists, opens and downloads; admins also create, edit, version, change covers, archive and restore (spec 89 §12).
 * Spec 95: filter bar in one row, list grouped by category in collapsible sections and «Generar portadas faltantes» for admins.
 * `selectedId` highlights the material a search result pointed at.
 */
export function SalesMaterialPanel({admin,selectedId,header}:{admin:boolean;selectedId?:string|null;/** Renders the page header with the admin actions; without it they get their own row. */header?:(actions:ReactNode)=>ReactNode}){
 const qc=useQueryClient();
 const [filters,setFilters]=useState<SalesMaterialFilters>(EMPTY_SALES_MATERIAL_FILTERS);
 const term=useDebounce(filters.search.trim(),250);
 const query=salesMaterialQuery({filters,search:term,admin});
 const q=useQuery({queryKey:['sales-materials',query],queryFn:()=>getSalesMaterials(query),placeholderData:keepPreviousData});
 const [form,setForm]=useState<SalesMaterialFormMode|null>(null),[preview,setPreview]=useState<SalesMaterial|null>(null),[error,setError]=useState(''),[pending,setPending]=useState('');
 const [collapsed,setCollapsed]=useState<ReadonlySet<string>>(new Set());
 const lock=useRef(false);
 const archive=useMutation({mutationFn:postSalesMaterial,onSettled:()=>{void qc.invalidateQueries({queryKey:['sales-materials']})}});
 async function toggleArchive(material:SalesMaterial){
  if(lock.current)return;lock.current=true;setError('');const restore=material.status==='archived';setPending(restore?'Restaurando material…':'Archivando material…');
  try{await archive.mutateAsync({action:restore?'restore':'archive',id:material.id,revision:material.revision});toast.success(restore?`«${material.title}» volvió a estar disponible.`:`«${material.title}» quedó archivado. No se borró nada.`);}
  catch(e){setError((e instanceof Error?e.message:'No se pudo actualizar el material.')+' Podés reintentar.')}
  finally{lock.current=false;setPending('')}
 }
 const materials=q.data?filterSalesMaterials({materials:q.data.materials,filters}):[];
 const missingCovers=admin&&q.data?.limits.storageConfigured?materials.filter(m=>needsAutoCover({material:m})):[];
 /** One cover at a time, so a long list does not download many files at once; a failure only leaves that card with its placeholder. */
 async function generateMissingCovers(){
  if(lock.current||!missingCovers.length)return;lock.current=true;setError('');
  const list=[...missingCovers];let done=0;
  try{for(const [i,m] of list.entries()){setPending(`Generando portadas… ${i+1} de ${list.length}`);if((await saveMissingAutoCover({material:m})).ok)done++;}}
  finally{
   lock.current=false;setPending('');await qc.invalidateQueries({queryKey:['sales-materials']});
   const failed=list.length-done,message=`${done===1?'Se generó 1 portada':`Se generaron ${done} portadas`}.${failed?` ${failed===1?'1 material no se pudo procesar y muestra':`${failed} materiales no se pudieron procesar y muestran`} el dibujo de su formato.`:''}`;
   if(failed)toast.warning(message,{duration:10000});else toast.success(message);
  }
 }
 useEffect(()=>{if(selectedId&&q.data)document.getElementById('material-'+selectedId)?.scrollIntoView({block:'center'});},[selectedId,q.data]);
 // A new search or filter opens every section again, so no result stays hidden in a section collapsed before.
 const filterKey=JSON.stringify([term,filters.categoryIds,filters.format,filters.status]);
 useEffect(()=>setCollapsed(new Set()),[filterKey]);
 const limits:SalesMaterialLimits|undefined=q.data?.limits;
 const filtered=hasSalesMaterialFilters(filters);
 const groups=q.data?groupSalesMaterials({materials,categories:q.data.categories,onlyCategoryIds:filters.categoryIds}):[];
 const anchored=new Set<string>();
 const toggle=(key:string)=>setCollapsed(prev=>{const next=new Set(prev);if(next.has(key))next.delete(key);else next.add(key);return next;});
 const actions=admin?<>
   <Button disabled={!!pending||!limits} disabledReason={pending?BUSY:'Esperá a que cargue el material.'} onClick={()=>setForm({type:'create'})}><Plus size={17} aria-hidden="true"/>Nuevo material</Button>
   {missingCovers.length>0&&<Button variant="outline" disabled={!!pending} disabledReason={BUSY} onClick={()=>void generateMissingCovers()}><ImagePlus size={17} aria-hidden="true"/>Generar portadas faltantes ({missingCovers.length})</Button>}
  </>:null;
 return <>{header?header(actions):actions&&<div className={styles.toolbar}>{actions}</div>}<section className={layout.panel+' '+styles.stack} aria-busy={q.isFetching||!!pending}>
  <SalesMaterialFiltersBar admin={admin} categories={q.data?.categories??[]} value={filters} onChange={setFilters}/>
  {limits&&!limits.storageConfigured&&<p className={styles.warning} role="note">Almacenamiento no configurado. Los archivos no se pueden subir ni abrir hasta que un administrador cargue las variables R2 en el servidor. Los enlaces externos siguen funcionando.</p>}
  {pending&&<p role="status" className={styles.status}><Loader size="xs" aria-hidden="true"/>{pending}</p>}{error&&<p role="alert" className={styles.error}>{error}</p>}
  {q.isPending?<QueryLoadingNotice>Cargando material de venta…</QueryLoadingNotice>:!q.data?<QueryErrorNotice error={q.error!} onRetry={q.refetch} busy={q.isFetching} label="Reintentar material"/>:<>
   {q.error&&<QueryErrorNotice error={q.error} onRetry={q.refetch} busy={q.isFetching} label="Reintentar material"/>}
   {q.data.truncated&&<p className={styles.warning} role="note">Hay más material del que se muestra. Buscá por título o filtrá por categoría o tipo para encontrar el resto.</p>}
   {materials.length===0?<CrmEmptyState>{filtered?<p>No hay material con esos filtros. Probá con otra búsqueda o categoría.</p>:<p>Todavía no hay material de venta.{admin?' Usá «Nuevo material» para subir el primero.':' Lo carga un administrador; si te falta alguno, pedíselo.'}</p>}</CrmEmptyState>:
    <div className={styles.groups}>{groups.map(g=>{const open=!collapsed.has(g.key);const id='material-group-'+g.key;return <section key={g.key} className={styles.group} aria-labelledby={id+'-title'}>
     <h2 id={id+'-title'} className={styles.groupTitle}><button type="button" aria-expanded={open} aria-controls={id} onClick={()=>toggle(g.key)}><ChevronDown size={18} aria-hidden="true" data-open={open||undefined}/>{g.name}<Badge variant="secondary">{g.materials.length}</Badge></button></h2>
     {open&&<div id={id} className={styles.grid}>{g.materials.map(m=>{const anchor=!anchored.has(m.id);anchored.add(m.id);return <SalesMaterialCard key={m.id} material={m} admin={admin} selected={m.id===selectedId} anchor={anchor} busy={!!pending} storageConfigured={q.data.limits.storageConfigured} onEdit={setForm} onArchive={m=>void toggleArchive(m)} onPreview={setPreview}/>})}</div>}
    </section>})}</div>}
  </>}
  {preview&&<SalesMaterialPreview material={preview} onClose={()=>setPreview(null)}/>}
  {form&&limits&&q.data&&<SalesMaterialForm key={form.type+('material' in form?form.material.id:'')} mode={form} categories={q.data.categories} limits={limits} onClose={()=>setForm(null)} onSaved={message=>{setForm(null);if(message.includes('no se pudo'))toast.warning(message,{duration:10000});else toast.success(message);}}/>}
 </section></>;
}
