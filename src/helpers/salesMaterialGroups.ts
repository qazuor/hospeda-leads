import type {SalesMaterial,SalesMaterialCategory} from '../endpoints/salesMaterials.schema';
import {salesMaterialFormat,type SalesMaterialFormat} from './salesMaterialTypes';
/** Status filter of «Material de venta» (spec 95): all active, only deliverables, only internal, or archived (admins). */
export type SalesMaterialStatusFilter=''|'deliverable'|'internal'|'archived';
/** Filters of the screen. `search`, `categoryIds` and the kind go to the API; format and «archived only» are applied to the returned list. */
export type SalesMaterialFilters={search:string;categoryIds:string[];format:''|SalesMaterialFormat;status:SalesMaterialStatusFilter};
export const EMPTY_SALES_MATERIAL_FILTERS:SalesMaterialFilters={search:'',categoryIds:[],format:'',status:''};
/** True when any filter differs from the default (shows «Limpiar filtros»). */
export const hasSalesMaterialFilters=(f:SalesMaterialFilters):boolean=>!!(f.search.trim()||f.categoryIds.length||f.format||f.status);
/** The API query for the filters (same contract as spec 89: archived only reaches admins through `includeArchived`). */
export function salesMaterialQuery({filters,search,admin}:{filters:SalesMaterialFilters;search:string;admin:boolean}){
 return {search,categoryIds:filters.categoryIds.length?[...filters.categoryIds].sort():undefined,kind:filters.status==='deliverable'||filters.status==='internal'?filters.status:undefined,includeArchived:admin&&filters.status==='archived'};
}
/** Applies the filters the API does not know: the format of the current version and «archived only». */
export function filterSalesMaterials({materials,filters}:{materials:readonly SalesMaterial[];filters:SalesMaterialFilters}):SalesMaterial[]{
 return materials.filter(m=>(filters.status!=='archived'||m.status==='archived')&&(!filters.format||salesMaterialFormat({mimeType:m.currentVersion?.mimeType??null})===filters.format));
}
/** One section of the list. `key` is the category id or {@link UNCATEGORIZED_KEY}. */
export type SalesMaterialGroup={key:string;name:string;materials:SalesMaterial[]};
export const UNCATEGORIZED_KEY='none';
/**
 * Groups materials by category (spec 95): one section per category in the order of `categories` (categories the list does not know go after,
 * by name), «Sin categoría» last, empty sections left out. A material with several categories appears under each of them, so whoever
 * browses one category finds everything in it. With `onlyCategoryIds` (the category filter) only those sections are shown.
 */
export function groupSalesMaterials({materials,categories,onlyCategoryIds=[]}:{materials:readonly SalesMaterial[];categories:readonly SalesMaterialCategory[];onlyCategoryIds?:readonly string[]}):SalesMaterialGroup[]{
 const groups=new Map<string,SalesMaterialGroup>(),none:SalesMaterialGroup={key:UNCATEGORIZED_KEY,name:'Sin categoría',materials:[]};
 for(const m of materials){
  const own=onlyCategoryIds.length?m.categories.filter(c=>onlyCategoryIds.includes(c.id)):m.categories;
  if(!m.categories.length){if(!onlyCategoryIds.length)none.materials.push(m);continue;}
  for(const c of own){const group=groups.get(c.id)??{key:c.id,name:c.name,materials:[]};group.materials.push(m);groups.set(c.id,group);}
 }
 const order=new Map(categories.map((c,i)=>[c.id,i]));
 const sorted=[...groups.values()].sort((a,b)=>(order.get(a.key)??Infinity)-(order.get(b.key)??Infinity)||a.name.localeCompare(b.name,'es'));
 return none.materials.length?[...sorted,none]:sorted;
}
