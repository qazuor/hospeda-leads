import {MultiSelect,SegmentedControl} from '@mantine/core';
import {X} from 'lucide-react';
import type {SalesMaterialCategory} from '../endpoints/salesMaterials.schema';
import {SALES_MATERIAL_FORMAT_LABELS,type SalesMaterialFormat} from '../helpers/salesMaterialTypes';
import {EMPTY_SALES_MATERIAL_FILTERS,hasSalesMaterialFilters,type SalesMaterialFilters,type SalesMaterialStatusFilter} from '../helpers/salesMaterialGroups';
import {Button} from './Button';
import {Input} from './Input';
import {NativeSelect} from './NativeSelect';
import styles from './SalesMaterial.module.css';

const FORMATS=Object.keys(SALES_MATERIAL_FORMAT_LABELS) as SalesMaterialFormat[];
/**
 * Filter bar of «Material de venta» (spec 95): one row that wraps on narrow screens with search, categories, format and status
 * («Archivados» only for admins). «Limpiar filtros» appears only while a filter is active and resets all of them.
 */
export function SalesMaterialFiltersBar({admin,categories,value,onChange}:{admin:boolean;categories:readonly SalesMaterialCategory[];value:SalesMaterialFilters;onChange:(next:SalesMaterialFilters)=>void}){
 const set=<K extends keyof SalesMaterialFilters>(key:K,next:SalesMaterialFilters[K])=>onChange({...value,[key]:next});
 const statuses=[{value:'',label:'Todos'},{value:'deliverable',label:'Entregables'},{value:'internal',label:'Internos'},...(admin?[{value:'archived',label:'Archivados'}]:[])];
 return <div className={styles.filters} role="search" aria-label="Filtros de material">
  <label className={styles.searchField}>Buscar material<Input type="search" value={value.search} onChange={e=>set('search',e.target.value)} placeholder="Título o comentario"/></label>
  <MultiSelect className={styles.filterField} label="Categorías" placeholder={value.categoryIds.length?undefined:'Todas'} data={categories.map(c=>({value:c.id,label:c.name+(c.active?'':' (desactivada)')}))} value={value.categoryIds} onChange={ids=>set('categoryIds',ids)} searchable clearable nothingFoundMessage="No hay categorías con ese nombre" comboboxProps={{withinPortal:true}}/>
  <label className={styles.filterField}>Formato<NativeSelect value={value.format} onChange={e=>set('format',e.target.value as SalesMaterialFilters['format'])}><option value="">Todos</option>{FORMATS.map(f=><option key={f} value={f}>{SALES_MATERIAL_FORMAT_LABELS[f]}</option>)}</NativeSelect></label>
  <div className={styles.statusField}><span id="sales-material-status">Estado</span><SegmentedControl aria-labelledby="sales-material-status" value={value.status} onChange={v=>set('status',v as SalesMaterialStatusFilter)} data={statuses}/></div>
  {hasSalesMaterialFilters(value)&&<Button variant="ghost" onClick={()=>onChange(EMPTY_SALES_MATERIAL_FILTERS)}><X size={16} aria-hidden="true"/>Limpiar filtros</Button>}
 </div>;
}
