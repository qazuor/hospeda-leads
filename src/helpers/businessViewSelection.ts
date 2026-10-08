import {z} from 'zod';
import {availableListPreferences,listPreferencesSchema,type ListPreferences} from './businessListPreferences';

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
export function readBusinessViewSelection(userId:number):BusinessViewSelection|null{
 try{const parsed=selectionSchema.safeParse(JSON.parse(localStorage.getItem(businessViewSelectionKey(userId))??'null'));return parsed.success?parsed.data:null;}catch{return null;}
}
export function saveBusinessViewSelection(userId:number,selection:BusinessViewSelection|null):boolean{
 try{if(selection)localStorage.setItem(businessViewSelectionKey(userId),JSON.stringify(selection));else localStorage.removeItem(businessViewSelectionKey(userId));return true;}catch{return false;}
}
