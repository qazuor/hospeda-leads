import {z} from 'zod';
import {advancedFilterGroup, schema as leadsSchema} from '../endpoints/leads_GET.schema';
const TABLE_COLUMNS=[
  {key:"id",label:"ID"},
  {key:"nombre",label:"Gestión / negocio"},
  {key:"assignedUserEmail",label:"Responsable"},
  {key:"contactName",label:"Persona de contacto"},
  {key:"tipo",label:"Vertical"},
  {key:"subtipo",label:"Subtipo"},
  {key:"commercialProfile",label:"Perfil comercial"},
  {key:"ciudad",label:"Ciudad"},
  {key:"estado",label:"Estado"},
  {key:"suscripcion",label:"Suscripción"},
  {key:"email",label:"Email"},
  {key:"telefono",label:"Teléfono"},
  {key:"sitioWeb",label:"Sitio web"},
  {key:"urlGmap",label:"Google Maps"},
  {key:"perfilInstagram",label:"Instagram"},
  {key:"perfilFacebook",label:"Facebook"},
  {key:"perfilAirbnb",label:"Airbnb"},
  {key:"perfilBooking",label:"Booking"},
  {key:"perfilTurismoEntreRios",label:"Turismo Entre Ríos"},
  {key:"origen",label:"Origen"},
  {key:"quienCargo",label:"Quién cargó"},
  {key:"fechaCreacion",label:"Fecha creación"},
  {key:"fechaUltimoContacto",label:"Último contacto"},
  {key:"medioContactoPreferido",label:"Medio preferido"},
  {key:"resultadoUltimoContacto",label:"Resultado último contacto"},
  {key:"prioridad",label:"Prioridad"},
  {key:"fechaProximaAccion",label:"Próxima acción"},
  {key:"fuenteReferencia",label:"Fuente de referencia"},
  {key:"clientePotencialRecurrente",label:"Potencial recurrente"},
  {key:"archivoAdjunto",label:"Archivo adjunto"},
  {key:"creadoPor",label:"Creado por"},
  {key:"createdAt",label:"Creado en sistema"},
  {key:"updatedAt",label:"Actualizado"}
];
const DEFAULT_WIDTHS:Record<string,number>={nombre:220,assignedUserEmail:190,ciudad:170,telefono:150,email:220,fechaProximaAccion:180};
export const BUSINESS_FILTER_COLUMNS=[...TABLE_COLUMNS.map(c=>({...c,label:c.key==='nombre'?'Nombre del negocio':c.key==='id'?'ID de entrada original':c.key==='estado'?'Etapas de gestiones':c.label})),{key:'notes',label:'Notas'}];
export const BUSINESS_COLUMNS=TABLE_COLUMNS.filter(c=>!['id','estado','suscripcion','prioridad','resultadoUltimoContacto','archivoAdjunto'].includes(c.key)).map(c=>({...c,label:c.key==='nombre'?'Nombre':c.key==='fechaProximaAccion'?'Próximo paso':c.label}));
const field=z.string().refine(key=>BUSINESS_COLUMNS.some(c=>c.key===key),'Campo desconocido');
const legacyFiltersSchema=leadsSchema.omit({anchorAccountId:true,alignAnchorPage:true,entity:true,q:true,filterGroups:true,view:true,page:true,pageSize:true,sortBy:true,sortDir:true});
export const listPreferencesSchema=z.object({
 presentation:z.enum(['table','grid']),columns:z.array(field).min(1).max(40).refine(v=>v.includes('nombre')&&new Set(v).size===v.length),
 widths:z.record(field,z.number().min(100).max(600)),pins:z.record(field,z.enum(['left','right'])),
 query:z.string().max(1000),filters:z.array(advancedFilterGroup).max(20).refine(groups=>!groups.some(g=>g.rules.some(r=>r.field==='deletedAt'))),
 sortBy:leadsSchema.shape.sortBy.unwrap().default('nombre'),sortDir:z.enum(['asc','desc']),pageSize:z.number().int().min(10).max(100),loadMode:z.enum(['pages','continuous']),legacyFilters:legacyFiltersSchema.optional()
});
export type ListPreferences=z.infer<typeof listPreferencesSchema>;
// Restore this switch to expose pagination again; schema, queries and return context support both modes.
export const BUSINESS_PAGINATION_CONTROLS_ENABLED=false;
export function availableListPreferences(preferences:ListPreferences):ListPreferences{
 return BUSINESS_PAGINATION_CONTROLS_ENABLED?preferences:{...preferences,loadMode:'continuous'};
}
export const basePreferences=(mobile=false):ListPreferences=>({presentation:mobile?'grid':'table',columns:['nombre','assignedUserEmail','ciudad','telefono','email','fechaProximaAccion'],widths:{...DEFAULT_WIDTHS},pins:{},query:'',filters:[],sortBy:'nombre',sortDir:'asc',pageSize:25,loadMode:'continuous'});
export const teamDefaultsSchema=z.object({preferences:listPreferencesSchema,presets:z.array(z.object({id:z.string().min(1).max(80),name:z.string().min(1).max(80),query:z.string().max(1000).optional(),filters:listPreferencesSchema.shape.filters})).max(30),initialPresetId:z.string().nullable()}).refine(v=>new Set(v.presets.map(p=>p.id)).size===v.presets.length&&(!v.initialPresetId||v.presets.some(p=>p.id===v.initialPresetId)));
export type TeamDefaults=z.infer<typeof teamDefaultsSchema>;
export const initialPreferences=(team:TeamDefaults|undefined,mobile:boolean):ListPreferences=>team?{...team.preferences,presentation:mobile?'grid':team.preferences.presentation,query:team.initialPresetId?(team.presets.find(p=>p.id===team.initialPresetId)!.query??team.preferences.query):team.preferences.query,filters:team.initialPresetId?team.presets.find(p=>p.id===team.initialPresetId)!.filters:team.preferences.filters}:basePreferences(mobile);
export const preferenceKey=(userId:number)=>`hospeda-business-list-v1-user-${userId}`;
export type ListContext={page:number;scrollY:number;scrollX:number;anchorId?:string;anchorOffset?:number};
export const contextSchema=z.object({page:z.number().int().min(1).max(100000),scrollY:z.number().min(0),scrollX:z.number().min(0),anchorId:z.string().regex(/^[0-9]+$/).optional(),anchorOffset:z.number().optional()});
export function readPersonalPreferences(userId:number){try{const raw=localStorage.getItem(preferenceKey(userId));if(!raw)return null;return z.object({preferences:listPreferencesSchema,context:contextSchema}).parse(JSON.parse(raw));}catch{return null;}}
export function savePersonalPreferences(userId:number,preferences:ListPreferences,context:ListContext){try{localStorage.setItem(preferenceKey(userId),JSON.stringify({preferences,context}));return true;}catch{return false;}}
// Keep at least half the viewport available to the scrolling center. Mobile never pins.
export function effectivePins(prefs:ListPreferences,viewportWidth:number){const pins:Record<string,{side:'left'|'right';offset:number}>={};if(viewportWidth<768)return pins;let occupied=0;const offsets={left:0,right:0};for(const side of ['left','right'] as const){for(const key of side==='right'?[...prefs.columns].reverse():prefs.columns){if(prefs.pins[key]!==side)continue;const width=prefs.widths[key]??160;if(occupied+width>viewportWidth*.5)continue;pins[key]={side,offset:offsets[side]};offsets[side]+=width;occupied+=width;}}return pins;}

export function preferencesFromSavedView(current:ListPreferences,config:Record<string,unknown>):ListPreferences|null{
 const modern=listPreferencesSchema.safeParse(config.preferences);if(modern.success)return modern.data;
 const inline=(config.inline??{}) as Record<string,any>;
 const legacy:Record<string,unknown>={classification:config.classification};
 for(const [old,include,exclude] of [['cityFilter','ciudades','excludeCiudades'],['statusFilter','estados','excludeEstados'],['typeFilter','tipos','excludeTipos'],['subtypeFilter','subtipos','excludeSubtipos'],['commercialProfileFilter','commercialProfiles','excludeCommercialProfiles'],['priorityFilter','prioridades','excludePrioridades'],['assignedUserFilter','assignedUsers','excludeAssignedUsers'],['subscriptionFilter','suscripciones','excludeSuscripciones'],['originFilter','origenes','excludeOrigenes'],['loadedByFilter','quienesCargaron','excludeQuienesCargaron'],['contactMethodFilter','mediosContacto','excludeMediosContacto'],['createdByFilter','creadosPor','excludeCreadosPor']]){legacy[include]=inline[old]?.include;legacy[exclude]=inline[old]?.exclude;}
 legacy.textFilters=Object.entries(inline.textFilters??{}).filter(([,v])=>(v as any).mode!=='none').map(([field,v])=>({field,...v as object}));
 legacy.dateFilters=Object.entries(inline.dateFilters??{}).map(([field,v])=>({field,...v as object}));
 legacy.idExact=inline.idFilter?.exact||undefined;legacy.idMin=inline.idFilter?.min||undefined;legacy.idMax=inline.idFilter?.max||undefined;
 legacy.recurrent=inline.recurrentFilter==='all'?undefined:inline.recurrentFilter;
 legacy.notesMode=inline.notesFilter?.mode==='none'?undefined:inline.notesFilter?.mode;legacy.notesText=inline.notesFilter?.value||undefined;
 legacy.nextAction=inline.nextAction==='_all'?undefined:inline.nextAction;
 const result=listPreferencesSchema.safeParse({...current,query:config.query??'',filters:config.filterGroups??[],sortBy:config.sortBy??current.sortBy,sortDir:config.sortDir??current.sortDir,legacyFilters:legacy});return result.success?result.data:null;
}

export function legacyFilterLabels(filters:NonNullable<ListPreferences['legacyFilters']>):string[]{
 const labels:Record<string,string>={classification:'Clasificación comercial',ciudades:'Ciudad',excludeCiudades:'Excluir ciudad',estados:'Etapa',excludeEstados:'Excluir etapa',tipos:'Vertical',excludeTipos:'Excluir vertical',subtipos:'Subtipo',excludeSubtipos:'Excluir subtipo',commercialProfiles:'Perfil comercial',excludeCommercialProfiles:'Excluir perfil',prioridades:'Prioridad',excludePrioridades:'Excluir prioridad',assignedUsers:'Responsable',excludeAssignedUsers:'Excluir responsable',suscripciones:'Suscripción',excludeSuscripciones:'Excluir suscripción',origenes:'Origen',excludeOrigenes:'Excluir origen',quienesCargaron:'Quién cargó',excludeQuienesCargaron:'Excluir quién cargó',mediosContacto:'Medio de contacto',excludeMediosContacto:'Excluir medio',creadosPor:'Creado por',excludeCreadosPor:'Excluir creador',idExact:'ID exacto',idMin:'ID mínimo',idMax:'ID máximo',recurrent:'Potencial recurrente',notesMode:'Condición sobre notas',notesText:'Texto en notas',nextAction:'Próximo paso'};
 const mode:Record<string,string>={contains:'contiene',not_contains:'no contiene',equals:'es',not_equals:'no es',empty:'sin valor',not_empty:'con valor',with:'con fecha',without:'sin fecha',overdue:'atrasado',open:'abierta',won:'ganada',lost:'perdida'};
 return Object.entries(filters).flatMap(([key,v])=>{if(v===undefined||v===''||Array.isArray(v)&&!v.length)return [];
 if(key==='textFilters')return filters.textFilters.map(f=>`${BUSINESS_FILTER_COLUMNS.find(c=>c.key===f.field)?.label??f.field} ${mode[f.mode]??f.mode} ${f.value??''}`);
 if(key==='dateFilters')return filters.dateFilters.filter(f=>f.from||f.to||f.presence!=='all').map(f=>`${BUSINESS_FILTER_COLUMNS.find(c=>c.key===f.field)?.label??f.field}: ${f.from?'desde '+f.from:''} ${f.to?'hasta '+f.to:''} ${f.presence==='all'?'':mode[f.presence]??f.presence}`);
 return [`${labels[key]??key}: ${Array.isArray(v)?v.join(', '):mode[String(v)]??String(v)}`];});
}
