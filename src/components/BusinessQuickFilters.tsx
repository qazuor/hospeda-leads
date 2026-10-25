import {ListQuickFilters,type QuickFilterField} from './ListQuickFilters';
import {lastContactPreset} from '../helpers/businessListQuickFilters';
import type {AdvancedFilterGroup,AdvancedFilterRule} from '../endpoints/leads_GET.schema';
export interface BusinessQuickFiltersProps{readonly groups:AdvancedFilterGroup[];readonly fields:QuickFilterField[];readonly onChange:(groups:AdvancedFilterGroup[])=>void}
const categories=[{field:'assignedUserEmail',label:'Responsable'},{field:'businessStatus',label:'Estado'},{field:'ciudad',label:'Ciudad'}] as const;
const presets=[['today','Hoy'],['yesterday','Ayer'],['week','Esta semana'],['7days','Últimos 7 días'],['30days','Últimos 30 días'],['never','Sin contacto']] as const;
/** Business list quick filters, preserving the Negocios labels and presets. */
export function BusinessQuickFilters({groups,fields,onChange}:BusinessQuickFiltersProps){return <ListQuickFilters groups={groups} fields={fields} categories={categories} builderLabel="Filtrar negocios" date={{field:'fechaUltimoContacto',label:'Último contacto',presets:presets.map(([key,label])=>({key,label,build:(field:AdvancedFilterRule['field'])=>lastContactPreset(key,undefined,field)}))}} onChange={onChange}/>}
