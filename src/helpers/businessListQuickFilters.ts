import type {AdvancedFilterGroup,AdvancedFilterRule} from '../endpoints/leads_GET.schema';
import {calendarDay,localDay} from './workDates';

/** Date operators a quick filter owns by default; a field can opt into more (e.g. `before` for overdue next steps). */
export const QUICK_DATE_OPERATORS:readonly AdvancedFilterRule['operator'][]=['on','between','empty'];
/** Whether a group belongs to a quick filter: one `eq`-only group for category fields, or exactly one rule with an owned operator for date fields. */
export function quickFilterOwns(field:AdvancedFilterRule['field'],dateOperators?:readonly AdvancedFilterRule['operator'][]){
 return (group:AdvancedFilterGroup)=>group.rules.length>0&&(dateOperators?group.rules.length===1&&group.rules[0]!.field===field&&dateOperators.includes(group.rules[0]!.operator):group.rules.every(rule=>rule.field===field&&rule.operator==='eq'));
}
/** Replace only the quick filter's own group (see {@link quickFilterOwns}); with several candidate groups nothing changes. */
export function setOwnedQuickFilter(groups:AdvancedFilterGroup[],field:AdvancedFilterRule['field'],rules:AdvancedFilterRule[],dateOperators:readonly AdvancedFilterRule['operator'][]|undefined=field==='fechaUltimoContacto'||field==='fechaProximaAccion'?QUICK_DATE_OPERATORS:undefined):AdvancedFilterGroup[]{
 const owns=quickFilterOwns(field,dateOperators),owned=groups.filter(owns);
 if(owned.length>1)return groups;
 const rest=groups.filter(group=>!owned.includes(group));
 return rules.length?[...rest,{rules}]:rest;
}

/** Build Argentina calendar date rules for the business list's last-contact shortcuts. */
export function lastContactPreset(preset:'today'|'yesterday'|'week'|'7days'|'30days'|'never',now=new Date(),field:AdvancedFilterRule['field']='fechaUltimoContacto'):AdvancedFilterRule[]{
 const today=localDay(now),shift=(day:string,amount:number)=>{const value=new Date(`${day}T12:00:00Z`);value.setUTCDate(value.getUTCDate()+amount);return value.toISOString().slice(0,10);};
 if(preset==='never')return [{field,operator:'empty',value:'',value2:''}];
 if(preset==='today')return [{field,operator:'on',value:today,value2:''}];
 if(preset==='yesterday')return [{field,operator:'on',value:shift(today,-1),value2:''}];
 const start=preset==='week'?shift(today,-((new Date(`${today}T12:00:00Z`).getUTCDay()+6)%7)):shift(today,preset==='7days'?-6:-29);
 return [{field,operator:'between',value:start,value2:today}];
}

/** Assign a next-step date to its Argentina calendar bucket while preserving the input order. */
export function groupBusinessRows<T extends {fechaProximaAccion?:Date|string|null}>(rows:T[],now=new Date()):{label:string;rows:T[]}[]{
 const buckets=[{label:'Vencidos',rows:[] as T[]},{label:'Hoy',rows:[] as T[]},{label:'Próximos',rows:[] as T[]},{label:'Sin próximo paso',rows:[] as T[]}],today=localDay(now);
 for(const row of rows){const raw=row.fechaProximaAccion,date=raw instanceof Date?calendarDay(raw):typeof raw==='string'?(raw.match(/^\d{4}-\d{2}-\d{2}$/)?.[0]??(Number.isNaN(Date.parse(raw))?'':localDay(new Date(raw)))):'';const index=!date?3:date<today?0:date===today?1:2;buckets[index]!.rows.push(row);}
 return buckets.filter(bucket=>bucket.rows.length>0);
}

/** Health tone for a last-contact day; null means the business has never been contacted. */
export function lastContactHealth(day:string|null|undefined,now=new Date()):'green'|'orange'|'red'|'slate'{
 if(!day)return 'slate';const today=localDay(now),a=new Date(`${day}T12:00:00Z`),b=new Date(`${today}T12:00:00Z`),days=Math.max(0,Math.floor((b.getTime()-a.getTime())/86400000));return days<=7?'green':days<=30?'orange':'red';
}
