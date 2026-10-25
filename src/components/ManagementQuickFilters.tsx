import {ListQuickFilters} from './ListQuickFilters';
import {CURRENT_USER_FILTER_VALUE} from '../helpers/filterRules';
import {localDay} from '../helpers/workDates';
import type {AdvancedFilterGroup,AdvancedFilterRule} from '../endpoints/leads_GET.schema';

/** Next-step shortcuts of the Gestiones quick filters. */
export type NextStepPreset='overdue'|'today'|'week'|'7days'|'none';
/** Operators the «Próximo paso» quick filter owns: `before` backs «Vencidas». */
export const NEXT_STEP_OPERATORS:readonly AdvancedFilterRule['operator'][]=['on','between','empty','before'];

/** Rule for a next-step shortcut in Argentina calendar days; «Esta semana» runs from today to Sunday. */
export function nextStepPreset(preset:NextStepPreset,now=new Date()):AdvancedFilterRule[]{
 const field='fechaProximaAccion',today=localDay(now),shift=(days:number)=>{const date=new Date(`${today}T12:00:00Z`);date.setUTCDate(date.getUTCDate()+days);return date.toISOString().slice(0,10);};
 if(preset==='none')return [{field,operator:'empty',value:'',value2:''}];
 if(preset==='overdue')return [{field,operator:'before',value:today,value2:''}];
 if(preset==='today')return [{field,operator:'on',value:today,value2:''}];
 const daysToSunday=(7-new Date(`${today}T12:00:00Z`).getUTCDay())%7;
 return [{field,operator:'between',value:today,value2:shift(preset==='week'?daysToSunday:6)}];
}

const presets:readonly [NextStepPreset,string][]=[['overdue','Vencidas'],['today','Hoy'],['week','Esta semana'],['7days','Próximos 7 días'],['none','Sin próximo paso']];

/** Props of {@link ManagementQuickFilters}. */
export interface ManagementQuickFiltersProps{readonly groups:AdvancedFilterGroup[];readonly stages:{value:string;label:string}[];readonly users:{email:string;displayName:string}[];readonly currentUser?:boolean;readonly className?:string;readonly onChange:(groups:AdvancedFilterGroup[])=>void}

/** Gestiones quick filters (Etapa, Responsable, Próximo paso); «Tipo de gestión» is not a supported filter field of the leads search. */
export function ManagementQuickFilters({groups,stages,users,currentUser,className,onChange}:ManagementQuickFiltersProps){
 const responsible=[...(currentUser?[{value:CURRENT_USER_FILTER_VALUE,label:'Yo'}]:[]),...users.filter(user=>user.email).map(user=>({value:user.email,label:user.displayName||user.email}))];
 return <ListQuickFilters groups={groups} className={className} onChange={onChange}
  fields={[{key:'estado',options:stages},{key:'assignedUserEmail',options:responsible}]}
  categories={[{field:'estado',label:'Etapa'},{field:'assignedUserEmail',label:'Responsable'}]}
  date={{field:'fechaProximaAccion',label:'Próximo paso',operators:NEXT_STEP_OPERATORS,presets:presets.map(([key,label])=>({key,label,build:()=>nextStepPreset(key)}))}}/>;
}
