import type {TableColumnOption} from "../components/ColumnPicker";
import {emptyTextFilter,emptyDateFilter,type TextFilterState,type DateFilterState} from "../components/FieldFilterEditors";
import {advancedFilterGroup,type AdvancedFilterGroup} from "../endpoints/leads_GET.schema";
import type {InputType} from "../endpoints/leads_save_POST.schema";
import {toDateInput} from "./crmDates";
export const QUERY_KEY=["leads"] as const;
export const PRIORITY_OPTIONS=["alta","media","baja"];
export const PROFILE_OPTIONS=["Independiente","Consolidado","Referente"];
export const CONTACT_OPTIONS=["email","teléfono","WhatsApp","otro"];
export const TEXT_FILTER_FIELDS=[
  "nombre","contactName","email","telefono","sitioWeb","urlGmap","perfilInstagram","perfilFacebook",
  "perfilAirbnb","perfilBooking","perfilTurismoEntreRios","resultadoUltimoContacto","fuenteReferencia","archivoAdjunto"
] as const;
export type TextFilterField=typeof TEXT_FILTER_FIELDS[number];
export const DATE_FILTER_FIELDS=["fechaCreacion","fechaUltimoContacto","fechaProximaAccion","createdAt","updatedAt"] as const;
export type DateFilterField=typeof DATE_FILTER_FIELDS[number];
export const TEXT_FILTER_LABELS:Record<TextFilterField,string>={
  nombre:"Nombre del negocio",contactName:"Persona de contacto",email:"Email",telefono:"Teléfono",sitioWeb:"Sitio web",
  urlGmap:"Google Maps",perfilInstagram:"Instagram",perfilFacebook:"Facebook",perfilAirbnb:"Airbnb",
  perfilBooking:"Booking",perfilTurismoEntreRios:"Turismo Entre Ríos",resultadoUltimoContacto:"Resultado último contacto",
  fuenteReferencia:"Fuente de referencia",archivoAdjunto:"Archivo adjunto"
};
export const DATE_FILTER_LABELS:Record<DateFilterField,string>={
  fechaCreacion:"Fecha creación",fechaUltimoContacto:"Último contacto",fechaProximaAccion:"Próxima acción",
  createdAt:"Creado en sistema",updatedAt:"Actualizado"
};
export const createTextFilters=()=>Object.fromEntries(TEXT_FILTER_FIELDS.map(field=>[field,emptyTextFilter()])) as Record<TextFilterField,TextFilterState>;
export const createDateFilters=()=>Object.fromEntries(DATE_FILTER_FIELDS.map(field=>[field,emptyDateFilter()])) as Record<DateFilterField,DateFilterState>;

export type SortBy=
  |"id"|"nombre"|"contactName"|"tipo"|"subtipo"|"commercialProfile"|"ciudad"|"estado"|"suscripcion"|"email"|"telefono"|"assignedUserEmail"
  |"sitioWeb"|"urlGmap"|"perfilInstagram"|"perfilFacebook"|"perfilAirbnb"|"perfilBooking"
  |"perfilTurismoEntreRios"|"origen"|"quienCargo"|"fechaCreacion"|"fechaUltimoContacto"
  |"medioContactoPreferido"|"resultadoUltimoContacto"|"prioridad"|"fechaProximaAccion"
  |"fuenteReferencia"|"clientePotencialRecurrente"|"archivoAdjunto"|"creadoPor"|"createdAt"|"updatedAt";

export const TABLE_COLUMNS:TableColumnOption[]=[
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
export const DEFAULT_COLUMNS=["nombre","contactName","assignedUserEmail","estado","fechaProximaAccion"];
export const DEFAULT_WIDTHS:Record<string,number>={
  id:90,nombre:220,contactName:190,tipo:170,subtipo:180,commercialProfile:170,ciudad:170,estado:180,suscripcion:170,
  email:220,telefono:150,assignedUserEmail:190,sitioWeb:230,urlGmap:230,perfilInstagram:220,perfilFacebook:220,
  perfilAirbnb:220,perfilBooking:220,perfilTurismoEntreRios:240,origen:170,quienCargo:180,
  fechaCreacion:150,fechaUltimoContacto:160,medioContactoPreferido:170,
  resultadoUltimoContacto:260,prioridad:130,fechaProximaAccion:160,fuenteReferencia:230,
  clientePotencialRecurrente:170,archivoAdjunto:230,creadoPor:180,createdAt:160,updatedAt:160
};

export const TABLE_QUERY_STORAGE_KEY="hospeda-leads-table-query-v1";
export const TABLE_FILTERS_STORAGE_KEY="hospeda-leads-table-filters-v1";
export const TABLE_SORT_STORAGE_KEY="hospeda-leads-table-sort-v1";

export const readStoredQuery=(entity:string)=>{
  if(typeof window==="undefined")return "";
  try{return window.localStorage.getItem(TABLE_QUERY_STORAGE_KEY+"-"+entity)??""}
  catch{return ""}
};

export const readStoredFilterGroups=(entity:string):AdvancedFilterGroup[]=>{
  if(typeof window==="undefined")return [];
  try{
    const raw=window.localStorage.getItem(TABLE_FILTERS_STORAGE_KEY+"-"+entity);
    if(!raw)return [];
    const parsed=advancedFilterGroup.array().safeParse(JSON.parse(raw));
    if(!parsed.success)return [];
    return parsed.data
      .map(group=>({rules:group.rules.filter(rule=>rule.field!=="asignadoA")}))
      .filter(group=>group.rules.length);
  }catch{return []}
};

export const readStoredSort=(entity:string):{sortBy:SortBy;sortDir:"asc"|"desc"}=>{
  const fallback={sortBy:"fechaCreacion" as SortBy,sortDir:"desc" as const};
  if(typeof window==="undefined")return fallback;
  try{
    const raw=window.localStorage.getItem(TABLE_SORT_STORAGE_KEY+"-"+entity);
    if(!raw)return fallback;
    const parsed=JSON.parse(raw);
    if(parsed?.sortBy==="asignadoA"&&(parsed?.sortDir==="asc"||parsed?.sortDir==="desc")){
      return {sortBy:"assignedUserEmail",sortDir:parsed.sortDir};
    }
    const validField=typeof parsed?.sortBy==="string"&&TABLE_COLUMNS.some(column=>column.key===parsed.sortBy);
    const validDirection=parsed?.sortDir==="asc"||parsed?.sortDir==="desc";
    return validField&&validDirection
      ? {sortBy:parsed.sortBy as SortBy,sortDir:parsed.sortDir}
      : fallback;
  }catch{return fallback}
};

export const emptyForm:InputType={
  nombre:"",contactName:"",tipo:"Alojamiento",subtipo:"",commercialProfile:null,ciudad:"",estado:"Cargado",suscripcion:"",
  email:"",telefono:"",sitioWeb:"",urlGmap:"",perfilInstagram:"",perfilFacebook:"",
  perfilAirbnb:"",perfilBooking:"",perfilTurismoEntreRios:"",origen:"",quienCargo:"",
  asignadoA:"",assignedUserEmail:"",fechaUltimoContacto:"",medioContactoPreferido:"",resultadoUltimoContacto:"",
  prioridad:null,fechaProximaAccion:"",fuenteReferencia:"",clientePotencialRecurrente:false,
  archivoAdjunto:"",notas:null
};

export const str=(v:unknown)=>v==null?"":String(v);
export const dateInput=toDateInput;
export const displayDate=(v:unknown)=>{
  if(!v)return "—";
  const d=new Date(v as string);
  return Number.isNaN(d.getTime())?"—":d.toLocaleDateString("es-AR");
};
export const isUrl=(key:string)=>["sitioWeb","urlGmap","perfilInstagram","perfilFacebook","perfilAirbnb","perfilBooking","perfilTurismoEntreRios","archivoAdjunto"].includes(key);

