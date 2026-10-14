import {z} from 'zod';
import type {AdvancedFilterGroup} from '../endpoints/leads_GET.schema';
import {availableListPreferences,legacyFilterLabels,listPreferencesSchema,type ListPreferences} from './businessListPreferences';

const selectionSchema=z.object({kind:z.enum(['system','personal']),id:z.string().min(1).max(100),name:z.string().min(1).max(80),baseline:listPreferencesSchema});
export type BusinessViewSelection=z.infer<typeof selectionSchema>;
export const businessViewSelectionKey=(userId:number)=>`hospeda-business-view-v1-user-${userId}`;

function canonical(value:unknown):unknown{
 if(Array.isArray(value))return value.map(canonical);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([key,v])=>[key,canonical(v)]));
 return value;
}
export function viewPreferencesFingerprint(preferences:ListPreferences):string{
 const value=availableListPreferences(listPreferencesSchema.parse(preferences));
 // AND groups and OR rules are commutative. Object insertion order is irrelevant.
 const filters=value.filters.filter(group=>group.rules.length).map(group=>({rules:group.rules.map(rule=>canonical({field:rule.field,operator:rule.operator,value:['empty','not_empty','is_true','is_false'].includes(rule.operator)?undefined:rule.value,value2:rule.operator==='between'?rule.value2:undefined})).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))})).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
 const widths=Object.fromEntries(value.columns.map(column=>[column,value.widths[column]??160]));
 const pins=Object.fromEntries(value.columns.filter(column=>value.pins[column]).map(column=>[column,value.pins[column]]));
 const legacyFilters=Object.fromEntries(Object.entries(value.legacyFilters??{}).filter(([,v])=>v!==undefined&&v!==''&&(!Array.isArray(v)||v.length)));
 return JSON.stringify(canonical({...value,query:value.query.trim(),filters,widths,pins,legacyFilters}));
}
export function manualViewFilterDelta(current:ListPreferences,baseline:ListPreferences){
 const remaining=new Map<string,number>();
 for(const group of baseline.filters)for(const rule of group.rules){const key=JSON.stringify(canonical(rule));remaining.set(key,(remaining.get(key)??0)+1);}
 const visibleRuleIndexes:{groupIndex:number;ruleIndex:number}[]=[];
 const filters:AdvancedFilterGroup[]=current.filters.map((group,groupIndex)=>({rules:group.rules.filter((rule,ruleIndex)=>{const key=JSON.stringify(canonical(rule)),count=remaining.get(key)??0;if(count){remaining.set(key,count-1);return false;}visibleRuleIndexes.push({groupIndex,ruleIndex});return true;})})).filter(group=>group.rules.length>0);
 const baselineLegacy=baseline.legacyFilters??{};
 const legacyFilters=Object.fromEntries(Object.entries(current.legacyFilters??{}).filter(([key,value])=>JSON.stringify(canonical(value))!==JSON.stringify(canonical((baselineLegacy as Record<string,unknown>)[key])))) as ListPreferences['legacyFilters'];
 const extraLabels=legacyFilters?legacyFilterLabels(legacyFilters):[];
 return {filters,visibleRuleIndexes,query:current.query===baseline.query?'':current.query,legacyFilters:Object.keys(legacyFilters??{}).length?legacyFilters:undefined,extraLabels};
}
export function readBusinessViewSelection(userId:number):BusinessViewSelection|null{
 try{const parsed=selectionSchema.safeParse(JSON.parse(localStorage.getItem(businessViewSelectionKey(userId))??'null'));return parsed.success?{...parsed.data,baseline:availableListPreferences(parsed.data.baseline)}:null;}catch{return null;}
}
export function saveBusinessViewSelection(userId:number,selection:BusinessViewSelection|null):boolean{
 try{if(selection)localStorage.setItem(businessViewSelectionKey(userId),JSON.stringify(selection));else localStorage.removeItem(businessViewSelectionKey(userId));return true;}catch{return false;}
}
