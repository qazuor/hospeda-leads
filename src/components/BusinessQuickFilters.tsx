import {Popover} from '@mantine/core';
import {ChevronDown} from 'lucide-react';
import {useState} from 'react';
import {Button} from './Button';
import {Checkbox} from './Checkbox';
import {Input} from './Input';
import {CURRENT_USER_FILTER_VALUE} from '../helpers/filterRules';
import {normalizeSearchText} from '../helpers/searchText';
import {businessStatusLabels} from '../helpers/businessStatus';
import {lastContactPreset,setOwnedQuickFilter} from '../helpers/businessListQuickFilters';
import type {AdvancedFilterGroup,AdvancedFilterRule} from '../endpoints/leads_GET.schema';
import styles from './BusinessQuickFilters.module.css';

type Field=AdvancedFilterRule['field'];
/** Field definitions the quick filters read their options from (same as the filter builder). */
export type QuickFilterField={key:string;options?:{value:string;label?:string|null}[]};
/** Props of {@link BusinessQuickFilters}. */
export interface BusinessQuickFiltersProps {readonly groups:AdvancedFilterGroup[];readonly fields:QuickFilterField[];readonly onChange:(groups:AdvancedFilterGroup[])=>void}

const categories:readonly {field:Field;label:string}[]=[{field:'assignedUserEmail',label:'Responsable'},{field:'businessStatus',label:'Estado'},{field:'ciudad',label:'Ciudad'}];
const DATE_FIELD:Field='fechaUltimoContacto';
const DATE_OPERATORS:readonly AdvancedFilterRule['operator'][]=['on','between','empty'];
const foreignHint=<p>Este campo tiene una regla avanzada. Editala en «Filtrar negocios».</p>;
const ownsCategory=(field:Field)=>(group:AdvancedFilterGroup)=>group.rules.length>0&&group.rules.every(rule=>rule.field===field&&rule.operator==='eq');
const ownsDate=(group:AdvancedFilterGroup)=>group.rules.length===1&&group.rules[0]!.field===DATE_FIELD&&DATE_OPERATORS.includes(group.rules[0]!.operator);
/** The single group a quick filter may edit, or `foreign` when the field is also used by other rules (or several candidate groups). */
function ownership(groups:AdvancedFilterGroup[],field:Field,owns:(group:AdvancedFilterGroup)=>boolean){
 const owned=groups.filter(owns),foreign=owned.length>1||groups.some(group=>!owned.includes(group)&&group.rules.some(rule=>rule.field===field));
 return {group:owned.length===1?owned[0]:undefined,foreign};
}
const triggerLabel=(label:string,count:number)=>`${label}${count?` · ${count}`:''}`;

function QuickFilterPopover({label,count,children}:{label:string;count:number;children:React.ReactNode}){
 const text=triggerLabel(label,count);
 return <Popover position="bottom-start" shadow="md" withinPortal><Popover.Target><Button variant={count?'secondary':'outline'} className={styles.trigger} aria-haspopup="dialog">{text}<ChevronDown size={14} aria-hidden="true"/></Button></Popover.Target>
  <Popover.Dropdown className={styles.dropdown}><strong>{label}</strong>{children}</Popover.Dropdown></Popover>;
}

/** Checkbox popover owning one OR-group of `eq` rules on its field. */
function CategoryQuickFilter({field,label,groups,options,onChange}:{field:Field;label:string;groups:AdvancedFilterGroup[];options:{value:string;label?:string|null}[];onChange:(groups:AdvancedFilterGroup[])=>void}){
 const [query,setQuery]=useState('');
 const {group,foreign}=ownership(groups,field,ownsCategory(field)),selected=group?.rules.map(rule=>rule.value??'')??[];
 // Options can come without a label (e.g. a user without display name): fall back to the value so search never crashes.
 const optionLabel=(item:{value:string;label?:string|null})=>item.value===CURRENT_USER_FILTER_VALUE?'Yo':String(item.label||item.value);
 // Options without a value (e.g. users the seller cannot see by email) cannot be filtered on.
 const visible=options.filter(item=>!!item.value).filter(item=>normalizeSearchText(optionLabel(item)).includes(normalizeSearchText(query)));
 const write=(values:string[])=>onChange(setOwnedQuickFilter(groups,field,values.map(value=>({field,operator:'eq',value}))));
 return <QuickFilterPopover label={label} count={selected.length||(foreign?1:0)}>{foreign?foreignHint:<>
  <Input aria-label={`Buscar ${label.toLocaleLowerCase('es-AR')}`} placeholder="Buscar…" value={query} onChange={event=>setQuery(event.target.value)}/>
  <div className={styles.options}>{visible.map(option=><label key={option.value}><Checkbox checked={selected.includes(option.value)} onChange={event=>write(event.currentTarget.checked?[...new Set([...selected,option.value])]:selected.filter(value=>value!==option.value))}/>{optionLabel(option)}</label>)}
   {!visible.length&&<p>No hay opciones que coincidan.</p>}</div>
  <Button size="sm" variant="ghost" disabled={!selected.length} onClick={()=>write([])}>Limpiar</Button>
 </>}</QuickFilterPopover>;
}

const presets:readonly [Parameters<typeof lastContactPreset>[0],string][]=[['today','Hoy'],['yesterday','Ayer'],['week','Esta semana'],['7days','Últimos 7 días'],['30days','Últimos 30 días'],['never','Sin contacto']];
/** «Rango…» editor; mounted with the dropdown, so it always starts from the active range. */
function LastContactRange({rule,onApply}:{rule:AdvancedFilterRule|undefined;onApply:(from:string,to:string)=>void}){
 const [from,setFrom]=useState(rule?.operator==='between'?rule.value??'':''),[to,setTo]=useState(rule?.operator==='between'?rule.value2??'':'');
 const invalid=!!from&&!!to&&from>to;
 return <fieldset className={styles.range}><legend>Rango…</legend>
  <Input aria-label="Desde" type="date" value={from} max={to||undefined} onChange={event=>setFrom(event.target.value)}/>
  <Input aria-label="Hasta" type="date" value={to} min={from||undefined} onChange={event=>setTo(event.target.value)}/>
  {invalid&&<p role="alert">«Desde» tiene que ser anterior o igual a «Hasta».</p>}
  <Button size="sm" variant="outline" disabled={!from||!to||invalid} onClick={()=>onApply(from,to)}>Aplicar rango</Button>
 </fieldset>;
}

/** Last-contact presets and range owning exactly one rule on `fechaUltimoContacto`. */
function LastContactQuickFilter({groups,onChange}:{groups:AdvancedFilterGroup[];onChange:(groups:AdvancedFilterGroup[])=>void}){
 const {group,foreign}=ownership(groups,DATE_FIELD,ownsDate),rule=group?.rules[0];
 const write=(rules:AdvancedFilterRule[])=>onChange(setOwnedQuickFilter(groups,DATE_FIELD,rules));
 return <QuickFilterPopover label="Último contacto" count={rule||foreign?1:0}>{foreign?foreignHint:<>
  <div className={styles.presets}>{presets.map(([key,label])=><Button key={key} size="sm" variant="ghost" onClick={()=>write(lastContactPreset(key))}>{label}</Button>)}</div>
  <LastContactRange rule={rule} onApply={(from,to)=>write([{field:DATE_FIELD,operator:'between',value:from,value2:to}])}/>
  <Button size="sm" variant="ghost" disabled={!rule} onClick={()=>write([])}>Limpiar</Button>
 </>}</QuickFilterPopover>;
}

/** Options of a quick filter; the business status has no options in the filter definitions, so it uses its fixed labels. */
function optionsFor(field:Field,fields:QuickFilterField[]){
 const options=fields.find(f=>f.key===field)?.options;
 return options?.length||field!=='businessStatus'?options??[]:Object.entries(businessStatusLabels).map(([value,label])=>({value,label}));
}

/** Quick filters above the business list: they only edit their own groups and never touch builder rules or exclusions. */
export function BusinessQuickFilters({groups,fields,onChange}:BusinessQuickFiltersProps){
 return <div className={styles.row} role="group" aria-label="Filtros rápidos">
  {categories.map(item=><CategoryQuickFilter key={item.field} field={item.field} label={item.label} groups={groups} options={optionsFor(item.field,fields)} onChange={onChange}/>)}
  <LastContactQuickFilter groups={groups} onChange={onChange}/>
 </div>;
}
