import {z} from 'zod';
import {localDay} from './workDates';
import type {ListPreferences} from './businessListPreferences';
const builtinSystemViewIds=['all','mine','today','overdue','unassigned','noNext'] as const;
export const systemViewId=z.string().min(1).max(100).refine(id=>builtinSystemViewIds.includes(id as typeof builtinSystemViewIds[number])||/^custom:[0-9a-f-]{36}$/i.test(id),'ID de vista del sistema inválido');
export const systemViewsSchema=z.array(z.object({id:systemViewId,name:z.string().trim().min(1).max(80),enabled:z.boolean(),preferences:z.record(z.unknown()).optional()}).refine(view=>view.id.startsWith('custom:')===!!view.preferences,'Las vistas personalizadas requieren una configuración')).max(36).refine(views=>new Set(views.map(v=>v.id)).size===views.length,'Las vistas del sistema no pueden repetirse');
export type BusinessSystemView=z.infer<typeof systemViewsSchema>[number];
export const defaultSystemViews=():BusinessSystemView[]=>[
 {id:'all',name:'Todos',enabled:true},{id:'mine',name:'Mis negocios',enabled:true},
 {id:'today',name:'Para hoy',enabled:true},{id:'overdue',name:'Vencidos',enabled:true},
 {id:'unassigned',name:'Sin responsable',enabled:true},{id:'noNext',name:'Sin próxima acción',enabled:true}
];
export const systemViewHelp:Record<BusinessSystemView['id'],string>={all:'Todos los negocios disponibles.',mine:'Negocios del usuario que aplica la vista.',today:'Próximo paso con fecha de hoy.',overdue:'Próximo paso con fecha anterior a hoy.',unassigned:'Negocios sin responsable.',noNext:'Negocios sin fecha de próxima acción.'};
export function applyBusinessSystemView(current:ListPreferences,idOrView:BusinessSystemView['id']|BusinessSystemView,email:string,now=new Date()):ListPreferences{
 const view=typeof idOrView==='string'?undefined:idOrView;
 const id=typeof idOrView==='string'?idOrView:idOrView.id;
 if(id.startsWith('custom:'))return view?.preferences?view.preferences as ListPreferences:current;
 let filters:ListPreferences['filters']=[];
 if(id==='mine')filters=[{rules:[{field:'assignedUserEmail',operator:'eq',value:email}]}];
 if(id==='today'||id==='overdue')filters=[{rules:[{field:'fechaProximaAccion',operator:id==='today'?'on':'before',value:localDay(now)}]}];
 if(id==='unassigned')filters=[{rules:[{field:'assignedUserEmail',operator:'empty'}]}];
 if(id==='noNext')filters=[{rules:[{field:'fechaProximaAccion',operator:'empty'}]}];
 return {...current,query:'',filters,legacyFilters:undefined};
}
