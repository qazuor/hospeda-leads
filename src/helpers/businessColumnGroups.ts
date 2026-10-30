import {z} from 'zod';
import {BUSINESS_COLUMNS} from './businessListPreferences';

const memberKeys=BUSINESS_COLUMNS.filter(column=>column.key!=='actions').map(column=>column.key);
export const businessColumnGroupSchema=z.object({id:z.string().regex(/^[a-z0-9][a-z0-9_-]{0,59}$/),name:z.string().trim().min(1).max(80),members:z.array(z.string().refine(key=>memberKeys.includes(key),'Columna desconocida')).min(2).max(6).refine(keys=>new Set(keys).size===keys.length,'No repitas columnas'),maxVisible:z.number().int().min(1).max(6).optional()}).refine(group=>group.maxVisible===undefined||group.maxVisible<=group.members.length,'La cantidad de líneas no puede superar los datos del grupo');
export const businessColumnGroupsSchema=z.array(businessColumnGroupSchema).max(30).refine(groups=>new Set(groups.map(group=>group.id)).size===groups.length,'Los identificadores deben ser únicos');
export type BusinessColumnGroup=z.infer<typeof businessColumnGroupSchema>;
export const BUSINESS_COLUMN_GROUPS_KEY='business_list_column_groups_v1';
export const DEFAULT_BUSINESS_COLUMN_GROUPS:BusinessColumnGroup[]=[
 {id:'classification',name:'Tipo',members:['tipo','subtipo','commercialProfile']},
 {id:'contact',name:'Contacto',members:['contactName','telefono','contactPhone','whatsapp','email','contactEmail']}
];
/** Clamps a saved line limit after members are removed; undefined means all members. */
export function clampBusinessColumnGroup(group:BusinessColumnGroup):BusinessColumnGroup{return group.maxVisible===undefined||group.maxVisible<=group.members.length?group:{...group,maxVisible:group.members.length};}
/** Returns the configured number of table lines, clamped for older or changing definitions. */
export function businessColumnGroupVisibleCount(group:BusinessColumnGroup):number{return Math.min(group.maxVisible??group.members.length,group.members.length);}

/** Returns seeded groups when no saved definitions exist, and validates saved data before use. */
export function resolveBusinessColumnGroups(value:unknown):BusinessColumnGroup[]{const parsed=businessColumnGroupsSchema.safeParse(value);return parsed.success?parsed.data:DEFAULT_BUSINESS_COLUMN_GROUPS;}
/** Removes references to deleted groups while preserving every valid preference. */
export function pruneDeletedGroupPreferences<T extends {columns:string[];widths:Record<string,number>;pins:Record<string,'left'|'right'>;sortBy:string}>(preferences:T,groups:BusinessColumnGroup[]):T{
 const valid=new Set(groups.map(group=>'group:'+group.id));
 const columns=preferences.columns.filter(key=>!key.startsWith('group:')||valid.has(key));
 const widths=Object.fromEntries(Object.entries(preferences.widths).filter(([key])=>!key.startsWith('group:')||valid.has(key)));
 const pins=Object.fromEntries(Object.entries(preferences.pins).filter(([key])=>!key.startsWith('group:')||valid.has(key)));
 const sortBy=preferences.sortBy.startsWith('group:')&&!valid.has(preferences.sortBy)?'nombre':preferences.sortBy;
 return {...preferences,columns,widths,pins,sortBy} as T;
}
/** Maps a group sort to the first member in its current definition. */
export function resolveBusinessColumnSort(sortBy:string,groups:BusinessColumnGroup[]):string{
 if(!sortBy.startsWith('group:'))return sortBy;
 return groups.find(group=>'group:'+group.id===sortBy)?.members[0]??'nombre';
}
/** Returns the label used by a normal column or a defined group column. */
export function businessColumnLabel(key:string,groups:BusinessColumnGroup[]):string{return key.startsWith('group:')?groups.find(group=>'group:'+group.id===key)?.name??key:BUSINESS_COLUMNS.find(column=>column.key===key)?.label??key;}
