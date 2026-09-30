import React, { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle, ArrowDownAZ, ArrowUpAZ, CheckCircle2, ChevronDown, Clock3,
  ExternalLink, Filter, Mail, Maximize2, MessageCircle, Minimize2, Pencil, Phone, Plus, Search, Target, Trash2, Users, X
} from "lucide-react";
import { AppHeader } from "../components/AppHeader";
import { Badge } from "../components/Badge";
import { BadgeSelect } from "../components/BadgeSelect";
import { Button } from "../components/Button";
import { Checkbox } from "../components/Checkbox";
import { ColumnPicker, type TableColumnOption } from "../components/ColumnPicker";
import { ContactTemplateDialog } from "../components/ContactTemplateDialog";
import { FilterBuilderDialog, FilterLegend, type FilterFieldDefinition } from "../components/FilterBuilderDialog";
import { LeadDetailDialog } from "../components/LeadDetailDialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../components/Dialog";
import { Input } from "../components/Input";
import { Popover, PopoverContent, PopoverTrigger } from "../components/Popover";
import { Skeleton } from "../components/Skeleton";
import { SmartMultiFilter, emptySmartFilter, type SmartFilterOption, type SmartFilterState } from "../components/SmartMultiFilter";
import {
  BooleanFilterEditor, DateFilterEditor, IdFilterEditor, TextFilterEditor, TextFilterPopover,
  describeTextFilter, emptyDateFilter, emptyIdFilter, emptyTextFilter,
  type DateFilterState, type IdFilterState, type TextFilterState
} from "../components/FieldFilterEditors";
import { Textarea } from "../components/Textarea";
import { UserBadgeSelect } from "../components/UserBadgeSelect";
import { getLeadDuplicates } from "../endpoints/leads_duplicates_GET.schema";
import { advancedFilterGroup, getLeads, type AdvancedFilterGroup } from "../endpoints/leads_GET.schema";
import { postLeadsDelete } from "../endpoints/leads_delete_POST.schema";
import { postLeadsQuick } from "../endpoints/leads_quick_POST.schema";
import { postLeadsSave, type DuplicateCandidate, type InputType } from "../endpoints/leads_save_POST.schema";
import { getLeadStats } from "../endpoints/leads_stats_GET.schema";
import { getSettings } from "../endpoints/settings_GET.schema";
import { useDebounce } from "../helpers/useDebounce";
import styles from "./_index.module.css";

const QUERY_KEY=["leads"] as const;
const STATUS_OPTIONS=["Cargado","Filtrado","1er contacto","En tratativas","Suscripto","Promocionado a Leandro","Rechazado","No interesado","Re contactar mas adelante"];
const PRIORITY_OPTIONS=["alta","media","baja"];
const PROFILE_OPTIONS=["Independiente","Consolidado","Referente"];
const CONTACT_OPTIONS=["email","teléfono","WhatsApp","otro"];
const TEXT_FILTER_FIELDS=[
  "nombre","contactName","email","telefono","sitioWeb","urlGmap","perfilInstagram","perfilFacebook",
  "perfilAirbnb","perfilBooking","perfilTurismoEntreRios","resultadoUltimoContacto","fuenteReferencia","archivoAdjunto"
] as const;
type TextFilterField=typeof TEXT_FILTER_FIELDS[number];
const DATE_FILTER_FIELDS=["fechaCreacion","fechaUltimoContacto","fechaProximaAccion","createdAt","updatedAt"] as const;
type DateFilterField=typeof DATE_FILTER_FIELDS[number];
const TEXT_FILTER_LABELS:Record<TextFilterField,string>={
  nombre:"Lead",contactName:"Persona de contacto",email:"Email",telefono:"Teléfono",sitioWeb:"Sitio web",
  urlGmap:"Google Maps",perfilInstagram:"Instagram",perfilFacebook:"Facebook",perfilAirbnb:"Airbnb",
  perfilBooking:"Booking",perfilTurismoEntreRios:"Turismo Entre Ríos",resultadoUltimoContacto:"Resultado último contacto",
  fuenteReferencia:"Fuente de referencia",archivoAdjunto:"Archivo adjunto"
};
const DATE_FILTER_LABELS:Record<DateFilterField,string>={
  fechaCreacion:"Fecha creación",fechaUltimoContacto:"Último contacto",fechaProximaAccion:"Próxima acción",
  createdAt:"Creado en sistema",updatedAt:"Actualizado"
};
const createTextFilters=()=>Object.fromEntries(TEXT_FILTER_FIELDS.map(field=>[field,emptyTextFilter()])) as Record<TextFilterField,TextFilterState>;
const createDateFilters=()=>Object.fromEntries(DATE_FILTER_FIELDS.map(field=>[field,emptyDateFilter()])) as Record<DateFilterField,DateFilterState>;

type SortBy=
  |"id"|"nombre"|"contactName"|"tipo"|"subtipo"|"commercialProfile"|"ciudad"|"estado"|"suscripcion"|"email"|"telefono"|"assignedUserEmail"
  |"sitioWeb"|"urlGmap"|"perfilInstagram"|"perfilFacebook"|"perfilAirbnb"|"perfilBooking"
  |"perfilTurismoEntreRios"|"origen"|"quienCargo"|"asignadoA"|"fechaCreacion"|"fechaUltimoContacto"
  |"medioContactoPreferido"|"resultadoUltimoContacto"|"prioridad"|"fechaProximaAccion"
  |"fuenteReferencia"|"clientePotencialRecurrente"|"archivoAdjunto"|"creadoPor"|"createdAt"|"updatedAt";

const TABLE_COLUMNS:TableColumnOption[]=[
  {key:"id",label:"ID"},
  {key:"nombre",label:"Lead"},
  {key:"assignedUserEmail",label:"Asignado a usuario"},
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
  {key:"asignadoA",label:"Responsable"},
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
const DEFAULT_COLUMNS=["nombre","assignedUserEmail","contactName","ciudad","tipo","subtipo","commercialProfile","estado","prioridad","fechaProximaAccion"];
const DEFAULT_WIDTHS:Record<string,number>={
  id:90,nombre:220,contactName:190,tipo:170,subtipo:180,commercialProfile:170,ciudad:170,estado:180,suscripcion:170,
  email:220,telefono:150,assignedUserEmail:190,sitioWeb:230,urlGmap:230,perfilInstagram:220,perfilFacebook:220,
  perfilAirbnb:220,perfilBooking:220,perfilTurismoEntreRios:240,origen:170,quienCargo:180,
  asignadoA:180,fechaCreacion:150,fechaUltimoContacto:160,medioContactoPreferido:170,
  resultadoUltimoContacto:260,prioridad:130,fechaProximaAccion:160,fuenteReferencia:230,
  clientePotencialRecurrente:170,archivoAdjunto:230,creadoPor:180,createdAt:160,updatedAt:160
};

const TABLE_QUERY_STORAGE_KEY="hospeda-leads-table-query-v1";
const TABLE_FILTERS_STORAGE_KEY="hospeda-leads-table-filters-v1";
const TABLE_SORT_STORAGE_KEY="hospeda-leads-table-sort-v1";

const readStoredQuery=()=>{
  if(typeof window==="undefined")return "";
  try{return window.localStorage.getItem(TABLE_QUERY_STORAGE_KEY)??""}
  catch{return ""}
};

const readStoredFilterGroups=():AdvancedFilterGroup[]=>{
  if(typeof window==="undefined")return [];
  try{
    const raw=window.localStorage.getItem(TABLE_FILTERS_STORAGE_KEY);
    if(!raw)return [];
    const parsed=advancedFilterGroup.array().safeParse(JSON.parse(raw));
    return parsed.success?parsed.data:[];
  }catch{return []}
};

const readStoredSort=():{sortBy:SortBy;sortDir:"asc"|"desc"}=>{
  const fallback={sortBy:"fechaCreacion" as SortBy,sortDir:"desc" as const};
  if(typeof window==="undefined")return fallback;
  try{
    const raw=window.localStorage.getItem(TABLE_SORT_STORAGE_KEY);
    if(!raw)return fallback;
    const parsed=JSON.parse(raw);
    const validField=typeof parsed?.sortBy==="string"&&TABLE_COLUMNS.some(column=>column.key===parsed.sortBy);
    const validDirection=parsed?.sortDir==="asc"||parsed?.sortDir==="desc";
    return validField&&validDirection
      ? {sortBy:parsed.sortBy as SortBy,sortDir:parsed.sortDir}
      : fallback;
  }catch{return fallback}
};

const emptyForm:InputType={
  nombre:"",contactName:"",tipo:"Alojamiento",subtipo:"",commercialProfile:null,ciudad:"",estado:"Cargado",suscripcion:"",
  email:"",telefono:"",sitioWeb:"",urlGmap:"",perfilInstagram:"",perfilFacebook:"",
  perfilAirbnb:"",perfilBooking:"",perfilTurismoEntreRios:"",origen:"",quienCargo:"",
  asignadoA:"",assignedUserEmail:"",fechaUltimoContacto:"",medioContactoPreferido:"",resultadoUltimoContacto:"",
  prioridad:null,fechaProximaAccion:"",fuenteReferencia:"",clientePotencialRecurrente:false,
  archivoAdjunto:"",notas:null
};

const str=(v:unknown)=>v==null?"":String(v);
const dateInput=(v:unknown)=>{
  if(!v)return "";
  const d=new Date(v as string);
  return Number.isNaN(d.getTime())?"":d.toISOString().slice(0,10);
};
const displayDate=(v:unknown)=>{
  if(!v)return "—";
  const d=new Date(v as string);
  return Number.isNaN(d.getTime())?"—":d.toLocaleDateString("es-AR");
};
const isUrl=(key:string)=>["sitioWeb","urlGmap","perfilInstagram","perfilFacebook","perfilAirbnb","perfilBooking","perfilTurismoEntreRios","archivoAdjunto"].includes(key);

function HeaderMenu({
  label,field,sortBy,sortDir,onSort,children
}:{
  label:string;field:SortBy;sortBy:SortBy;sortDir:"asc"|"desc";
  onSort:(field:SortBy,dir:"asc"|"desc")=>void;children?:React.ReactNode;
}){
  return <Popover>
    <PopoverTrigger asChild>
      <button className={styles.headerButton} title={"Ordenar por "+label}>
        <span>{label}</span>
        {sortBy===field?(sortDir==="asc"?<ArrowUpAZ size={14}/>:<ArrowDownAZ size={14}/>):<ChevronDown size={14}/>}
      </button>
    </PopoverTrigger>
    <PopoverContent align="start" className={styles.headerPopover}>
      <div className={styles.headerPopoverTitle}>{label}</div>
      <div className={styles.sortButtons}>
        <Button size="sm" variant={sortBy===field&&sortDir==="asc"?"secondary":"outline"} onClick={()=>onSort(field,"asc")}><ArrowUpAZ size={14}/>Ascendente</Button>
        <Button size="sm" variant={sortBy===field&&sortDir==="desc"?"secondary":"outline"} onClick={()=>onSort(field,"desc")}><ArrowDownAZ size={14}/>Descendente</Button>
      </div>
      {children&&<div className={styles.headerFilter}>{children}</div>}
    </PopoverContent>
  </Popover>;
}

export default function LeadsPage(){
  const qc=useQueryClient();
  const [query,setQuery]=useState(readStoredQuery);
  const [cityFilter,setCityFilter]=useState<SmartFilterState>(emptySmartFilter);
  const [statusFilter,setStatusFilter]=useState<SmartFilterState>(emptySmartFilter);
  const [typeFilter,setTypeFilter]=useState<SmartFilterState>(emptySmartFilter);
  const [subtypeFilter,setSubtypeFilter]=useState<SmartFilterState>(emptySmartFilter);
  const [commercialProfileFilter,setCommercialProfileFilter]=useState<SmartFilterState>(emptySmartFilter);
  const [priorityFilter,setPriorityFilter]=useState<SmartFilterState>(emptySmartFilter);
  const [assignedFilter,setAssignedFilter]=useState<SmartFilterState>(emptySmartFilter);
  const [assignedUserFilter,setAssignedUserFilter]=useState<SmartFilterState>(emptySmartFilter);
  const [subscriptionFilter,setSubscriptionFilter]=useState<SmartFilterState>(emptySmartFilter);
  const [originFilter,setOriginFilter]=useState<SmartFilterState>(emptySmartFilter);
  const [loadedByFilter,setLoadedByFilter]=useState<SmartFilterState>(emptySmartFilter);
  const [contactMethodFilter,setContactMethodFilter]=useState<SmartFilterState>(emptySmartFilter);
  const [createdByFilter,setCreatedByFilter]=useState<SmartFilterState>(emptySmartFilter);
  const [textFilters,setTextFilters]=useState<Record<TextFilterField,TextFilterState>>(createTextFilters);
  const [dateFilters,setDateFilters]=useState<Record<DateFilterField,DateFilterState>>(createDateFilters);
  const [idFilter,setIdFilter]=useState<IdFilterState>(emptyIdFilter);
  const [recurrentFilter,setRecurrentFilter]=useState<"all"|"true"|"false">("all");
  const [notesFilter,setNotesFilter]=useState<TextFilterState>(emptyTextFilter);
  const [nextAction,setNextAction]=useState<"_all"|"with"|"without"|"overdue">("_all");
  const storedSort=readStoredSort();
  const [sortBy,setSortBy]=useState<SortBy>(storedSort.sortBy);
  const [sortDir,setSortDir]=useState<"asc"|"desc">(storedSort.sortDir);
  const [page,setPage]=useState(1);
  const [open,setOpen]=useState(false);
  const [viewOpen,setViewOpen]=useState(false);
  const [duplicatesOpen,setDuplicatesOpen]=useState(false);
  const [form,setForm]=useState<InputType>(emptyForm);
  const [selectedLead,setSelectedLead]=useState<any|null>(null);
  const [duplicateCandidates,setDuplicateCandidates]=useState<DuplicateCandidate[]>([]);
  const [contactOpen,setContactOpen]=useState(false);
  const [contactChannel,setContactChannel]=useState<"whatsapp"|"email">("whatsapp");
  const [contactLead,setContactLead]=useState<any|null>(null);
  const [pendingDelete,setPendingDelete]=useState<{id:string|number;nombre:string}|null>(null);
  const [tableFullscreen,setTableFullscreen]=useState(false);
  const [filterDialogOpen,setFilterDialogOpen]=useState(false);
  const [appliedFilterGroups,setAppliedFilterGroups]=useState<AdvancedFilterGroup[]>(readStoredFilterGroups);
  const [columnWidths,setColumnWidths]=useState<Record<string,number>>(()=>{
    if(typeof window==="undefined")return DEFAULT_WIDTHS;
    try{
      const saved=window.localStorage.getItem("hospeda-leads-column-widths");
      return saved?{...DEFAULT_WIDTHS,...JSON.parse(saved)}:DEFAULT_WIDTHS;
    }catch{return DEFAULT_WIDTHS}
  });
  const [visibleColumns,setVisibleColumns]=useState<string[]>(()=>{
    if(typeof window==="undefined")return DEFAULT_COLUMNS;
    try{
      const saved=window.localStorage.getItem("hospeda-leads-visible-columns");
      const parsed=saved?JSON.parse(saved):null;
      const base=Array.isArray(parsed)&&parsed.length?parsed:DEFAULT_COLUMNS;
      let next=[...base];
      let changed=false;
      const assignedMigration="hospeda-leads-assigned-user-column-after-name-v1";
      if(window.localStorage.getItem(assignedMigration)!=="1"){
        next=next.filter((key:string)=>key!=="assignedUserEmail");
        const leadIndex=next.indexOf("nombre");
        next.splice(leadIndex>=0?leadIndex+1:0,0,"assignedUserEmail");
        window.localStorage.setItem(assignedMigration,"1");
        changed=true;
      }
      const profileMigration="hospeda-leads-commercial-profile-column-v1";
      if(window.localStorage.getItem(profileMigration)!=="1"){
        next=next.filter((key:string)=>key!=="commercialProfile");
        const subtypeIndex=next.indexOf("subtipo");
        next.splice(subtypeIndex>=0?subtypeIndex+1:Math.min(6,next.length),0,"commercialProfile");
        window.localStorage.setItem(profileMigration,"1");
        changed=true;
      }
      if(changed)window.localStorage.setItem("hospeda-leads-visible-columns",JSON.stringify(next));
      return next;
    }catch{return DEFAULT_COLUMNS}
  });

  useEffect(()=>{
    window.localStorage.setItem("hospeda-leads-visible-columns",JSON.stringify(visibleColumns));
  },[visibleColumns]);
  useEffect(()=>{
    window.localStorage.setItem("hospeda-leads-column-widths",JSON.stringify(columnWidths));
  },[columnWidths]);
  useEffect(()=>{
    try{window.localStorage.setItem(TABLE_QUERY_STORAGE_KEY,query)}
    catch{}
  },[query]);
  useEffect(()=>{
    try{window.localStorage.setItem(TABLE_FILTERS_STORAGE_KEY,JSON.stringify(appliedFilterGroups))}
    catch{}
  },[appliedFilterGroups]);
  useEffect(()=>{
    try{window.localStorage.setItem(TABLE_SORT_STORAGE_KEY,JSON.stringify({sortBy,sortDir}))}
    catch{}
  },[sortBy,sortDir]);
  useEffect(()=>{
    if(!tableFullscreen)return;
    const previous=document.body.style.overflow;
    document.body.style.overflow="hidden";
    const onKey=(event:KeyboardEvent)=>{if(event.key==="Escape")setTableFullscreen(false)};
    window.addEventListener("keydown",onKey);
    return ()=>{document.body.style.overflow=previous;window.removeEventListener("keydown",onKey)};
  },[tableFullscreen]);

  const debouncedQuery=useDebounce(query,300);
  const activeTextFilters=TEXT_FILTER_FIELDS.flatMap(field=>{
    const filter=textFilters[field];
    if(filter.mode==="none")return [];
    return [{field,mode:filter.mode,value:filter.value||undefined}];
  });
  const activeDateFilters=DATE_FILTER_FIELDS.flatMap(field=>{
    const filter=dateFilters[field];
    if(filter.presence==="all"&&!filter.from&&!filter.to)return [];
    return [{field,presence:filter.presence,from:filter.from||undefined,to:filter.to||undefined}];
  });
  const settingsQ=useQuery({queryKey:["settings"],queryFn:getSettings});
  const leadsQ=useQuery({
    queryKey:[...QUERY_KEY,debouncedQuery,appliedFilterGroups,sortBy,sortDir,page],
    queryFn:()=>getLeads({
      q:debouncedQuery||undefined,
      filterGroups:appliedFilterGroups,
      sortBy,sortDir,page,pageSize:50
    }),
    placeholderData:(previous)=>previous
  });
  const statsQ=useQuery({queryKey:["lead-stats"],queryFn:getLeadStats});
  const duplicatesQ=useQuery({queryKey:["lead-duplicates"],queryFn:getLeadDuplicates,enabled:duplicatesOpen});

  const invalidate=async()=>{
    await Promise.all([
      qc.invalidateQueries({queryKey:QUERY_KEY}),
      qc.invalidateQueries({queryKey:["lead-stats"]}),
      qc.invalidateQueries({queryKey:["analytics"]}),
      qc.invalidateQueries({queryKey:["lead-duplicates"]}),
      qc.invalidateQueries({queryKey:["lead-journal"]}),
      qc.invalidateQueries({queryKey:["global-journal"]})
    ]);
  };
  const saveM=useMutation({mutationFn:postLeadsSave});
  const deleteM=useMutation({mutationFn:postLeadsDelete,onSuccess:invalidate});
  const quickM=useMutation({mutationFn:postLeadsQuick,onSuccess:invalidate});

  const leads=leadsQ.data?.rows??[];
  const filters=leadsQ.data?.filters??{
    ciudades:[],estados:[],tipos:[],asignados:[],suscripciones:[],origenes:[],
    quienesCargaron:[],mediosContacto:[],creadosPor:[]
  };
  const total=leadsQ.data?.total??0;
  const stats=statsQ.data??{total:0,pendientes:0,suscriptos:0,vencidos:0};
  const settings=settingsQ.data;
  const cityOptions=settings?.cities.map(x=>x.name)??filters.ciudades;
  const typeOptions=settings?.types??filters.tipos;
  const peopleOptions=settings?.authorizedEmails.map(x=>x.displayName||x.email)??filters.asignados;
  const userOptions=settings?.users??[];
  const subtypeOptions=(settings?.subtypes??[]).filter(x=>!x.typeName||!form.tipo||x.typeName===form.tipo).map(x=>x.name);
  const allSubtypeOptions=Array.from(new Set((settings?.subtypes??[]).map(x=>x.name)));
  const templates=settings?.templates??[];
  const optionList=(values:string[])=>values.map(value=>({value,label:value}));
  const filterFields:FilterFieldDefinition[]=[
    {key:"id",label:"ID",kind:"number"},
    {key:"nombre",label:"Lead",kind:"text"},
    {key:"assignedUserEmail",label:"Asignado a usuario",kind:"category",options:userOptions.map(user=>({value:user.email,label:user.displayName||user.email}))},
    {key:"contactName",label:"Persona de contacto",kind:"text"},
    {key:"tipo",label:"Vertical",kind:"category",options:optionList(typeOptions)},
    {key:"subtipo",label:"Subtipo",kind:"category",options:optionList(allSubtypeOptions)},
    {key:"commercialProfile",label:"Perfil comercial",kind:"category",options:optionList(PROFILE_OPTIONS)},
    {key:"ciudad",label:"Ciudad",kind:"category",options:optionList(cityOptions)},
    {key:"estado",label:"Estado",kind:"category",options:optionList(STATUS_OPTIONS)},
    {key:"suscripcion",label:"Suscripción",kind:"category",options:optionList(filters.suscripciones)},
    {key:"email",label:"Email",kind:"text"},
    {key:"telefono",label:"Teléfono",kind:"text"},
    {key:"sitioWeb",label:"Sitio web",kind:"text"},
    {key:"urlGmap",label:"Google Maps",kind:"text"},
    {key:"perfilInstagram",label:"Instagram",kind:"text"},
    {key:"perfilFacebook",label:"Facebook",kind:"text"},
    {key:"perfilAirbnb",label:"Airbnb",kind:"text"},
    {key:"perfilBooking",label:"Booking",kind:"text"},
    {key:"perfilTurismoEntreRios",label:"Turismo Entre Ríos",kind:"text"},
    {key:"origen",label:"Origen",kind:"category",options:optionList(filters.origenes)},
    {key:"quienCargo",label:"Quién cargó",kind:"category",options:optionList(filters.quienesCargaron)},
    {key:"asignadoA",label:"Responsable",kind:"category",options:optionList(peopleOptions)},
    {key:"fechaCreacion",label:"Fecha creación",kind:"date"},
    {key:"fechaUltimoContacto",label:"Último contacto",kind:"date"},
    {key:"medioContactoPreferido",label:"Medio preferido",kind:"category",options:optionList(filters.mediosContacto.length?filters.mediosContacto:CONTACT_OPTIONS)},
    {key:"resultadoUltimoContacto",label:"Resultado último contacto",kind:"text"},
    {key:"prioridad",label:"Prioridad",kind:"category",options:optionList(PRIORITY_OPTIONS)},
    {key:"fechaProximaAccion",label:"Próxima acción",kind:"date"},
    {key:"fuenteReferencia",label:"Fuente de referencia",kind:"text"},
    {key:"clientePotencialRecurrente",label:"Potencial recurrente",kind:"boolean"},
    {key:"archivoAdjunto",label:"Archivo adjunto",kind:"text"},
    {key:"creadoPor",label:"Creado por",kind:"category",options:optionList(filters.creadosPor)},
    {key:"createdAt",label:"Creado en sistema",kind:"date"},
    {key:"updatedAt",label:"Actualizado",kind:"date"},
    {key:"notes",label:"Notas",kind:"notes"},
  ];
  const appliedRuleCount=appliedFilterGroups.reduce((total,group)=>total+group.rules.length,0);

  const asOptions=(values:string[]):SmartFilterOption[]=>[
    ...values.map(value=>({value,label:value})),
    {value:"__EMPTY__",label:"Sin valor"}
  ];
  type FilterGroup={
    key:string;
    label:string;
    category:React.ComponentProps<typeof SmartMultiFilter>["category"];
    options:SmartFilterOption[];
    value:SmartFilterState;
    setValue:React.Dispatch<React.SetStateAction<SmartFilterState>>;
  };
  const filterGroups:FilterGroup[]=[
    {key:"ciudad",label:"Ciudad",category:"city",options:asOptions(cityOptions),value:cityFilter,setValue:setCityFilter},
    {key:"tipo",label:"Vertical",category:"vertical",options:asOptions(typeOptions),value:typeFilter,setValue:setTypeFilter},
    {key:"subtipo",label:"Subtipo",category:"subtype",options:asOptions(allSubtypeOptions),value:subtypeFilter,setValue:setSubtypeFilter},
    {key:"commercialProfile",label:"Perfil",category:"profile",options:asOptions(PROFILE_OPTIONS),value:commercialProfileFilter,setValue:setCommercialProfileFilter},
    {key:"estado",label:"Estado",category:"status",options:asOptions(STATUS_OPTIONS),value:statusFilter,setValue:setStatusFilter},
    {key:"prioridad",label:"Prioridad",category:"priority",options:asOptions(PRIORITY_OPTIONS),value:priorityFilter,setValue:setPriorityFilter},
    {key:"asignadoA",label:"Responsable",category:"person",options:asOptions(peopleOptions),value:assignedFilter,setValue:setAssignedFilter},
    {key:"assignedUserEmail",label:"Usuario",category:"person",options:[...userOptions.map(user=>({value:user.email,label:user.displayName||user.email})),{value:"__EMPTY__",label:"Sin valor"}],value:assignedUserFilter,setValue:setAssignedUserFilter},
    {key:"suscripcion",label:"Suscripción",category:"generic",options:asOptions(filters.suscripciones),value:subscriptionFilter,setValue:setSubscriptionFilter},
    {key:"origen",label:"Origen",category:"generic",options:asOptions(filters.origenes),value:originFilter,setValue:setOriginFilter},
    {key:"quienCargo",label:"Quién cargó",category:"person",options:asOptions(filters.quienesCargaron),value:loadedByFilter,setValue:setLoadedByFilter},
    {key:"medioContactoPreferido",label:"Medio preferido",category:"contact",options:asOptions(filters.mediosContacto.length?filters.mediosContacto:CONTACT_OPTIONS),value:contactMethodFilter,setValue:setContactMethodFilter},
    {key:"creadoPor",label:"Creado por",category:"person",options:asOptions(filters.creadosPor),value:createdByFilter,setValue:setCreatedByFilter},
  ];
  const hasSmartFilters=filterGroups.some(group=>group.value.include.length||group.value.exclude.length);
  const hasTextFilters=TEXT_FILTER_FIELDS.some(field=>textFilters[field].mode!=="none");
  const hasDateFilters=DATE_FILTER_FIELDS.some(field=>{
    const filter=dateFilters[field];
    return filter.presence!=="all"||!!filter.from||!!filter.to;
  });
  const hasIdFilter=!!(idFilter.exact||idFilter.min||idFilter.max);
  const hasAnyFilters=hasSmartFilters||hasTextFilters||hasDateFilters||hasIdFilter||recurrentFilter!=="all"||notesFilter.mode!=="none"||nextAction!=="_all";
  const clearAllFilters=()=>{
    filterGroups.forEach(group=>group.setValue(emptySmartFilter()));
    setTextFilters(createTextFilters());
    setDateFilters(createDateFilters());
    setIdFilter(emptyIdFilter());
    setRecurrentFilter("all");
    setNotesFilter(emptyTextFilter());
    setNextAction("_all");
    resetPage();
  };
  const removeFilterValue=(group:FilterGroup,mode:"include"|"exclude",value:string)=>{
    group.setValue(prev=>({...prev,[mode]:prev[mode].filter(item=>item!==value)}));
    resetPage();
  };

  useEffect(()=>{
    if(!selectedLead)return;
    const fresh=leads.find(lead=>String(lead.id)===String(selectedLead.id));
    if(fresh)setSelectedLead(fresh);
  },[leads,selectedLead?.id]);

  const resetPage=()=>setPage(1);
  const sort=(field:SortBy,dir:"asc"|"desc")=>{setSortBy(field);setSortDir(dir);resetPage()};
  const set=(key:keyof InputType,value:any)=>setForm(prev=>({...prev,[key]:value}));
  const newLead=()=>{setForm(emptyForm);setDuplicateCandidates([]);setOpen(true)};
  const editLead=(l:any)=>{setDuplicateCandidates([]);setForm({
    id:String(l.id),nombre:l.nombre,contactName:l.contactName,tipo:l.tipo,subtipo:l.subtipo,ciudad:l.ciudad,estado:l.estado,suscripcion:l.suscripcion,
    email:l.email,telefono:l.telefono,sitioWeb:l.sitioWeb,urlGmap:l.urlGmap,perfilInstagram:l.perfilInstagram,perfilFacebook:l.perfilFacebook,
    perfilAirbnb:l.perfilAirbnb,perfilBooking:l.perfilBooking,perfilTurismoEntreRios:l.perfilTurismoEntreRios,origen:l.origen,
    quienCargo:l.quienCargo,asignadoA:l.asignadoA,assignedUserEmail:l.assignedUserEmail,commercialProfile:l.commercialProfile,fechaCreacion:dateInput(l.fechaCreacion),fechaUltimoContacto:dateInput(l.fechaUltimoContacto),
    medioContactoPreferido:l.medioContactoPreferido,resultadoUltimoContacto:l.resultadoUltimoContacto,prioridad:l.prioridad,
    fechaProximaAccion:dateInput(l.fechaProximaAccion),fuenteReferencia:l.fuenteReferencia,clientePotencialRecurrente:l.clientePotencialRecurrente,
    archivoAdjunto:l.archivoAdjunto,notas:null,creadoPor:l.creadoPor
  });setOpen(true)};
  const openView=(l:any)=>{setSelectedLead(l);setViewOpen(true)};
  const saveLead=async(force=false)=>{
    const result=await saveM.mutateAsync({...form,force});
    if("duplicateCandidates" in result){setDuplicateCandidates(result.duplicateCandidates);return}
    setDuplicateCandidates([]);await invalidate();setOpen(false);
  };
  const requestDelete=(id:string|number,nombre:string)=>setPendingDelete({id,nombre});
  const confirmDelete=async()=>{
    if(!pendingDelete)return;
    const target=pendingDelete;
    await deleteM.mutateAsync({id:target.id});
    if(selectedLead&&String(selectedLead.id)===String(target.id)){setViewOpen(false);setSelectedLead(null)}
    if(form.id&&String(form.id)===String(target.id))setOpen(false);
    setPendingDelete(null);
  };
  const quick=(id:string|number,field:"tipo"|"subtipo"|"commercialProfile"|"ciudad"|"estado"|"prioridad"|"quienCargo"|"asignadoA"|"assignedUserEmail"|"medioContactoPreferido"|"fechaCreacion"|"fechaUltimoContacto"|"fechaProximaAccion",value:string)=>quickM.mutate({id,field,value:value||null});
  const openContact=(lead:any,channel:"whatsapp"|"email")=>{setContactLead(lead);setContactChannel(channel);setContactOpen(true)};
  const startResize=(key:string,startX:number)=>{
    const startWidth=columnWidths[key]??DEFAULT_WIDTHS[key]??160;
    const onMove=(event:MouseEvent)=>{
      const next=Math.max(80,Math.min(600,startWidth+(event.clientX-startX)));
      setColumnWidths(prev=>({...prev,[key]:next}));
    };
    const onUp=()=>{
      document.removeEventListener("mousemove",onMove);
      document.removeEventListener("mouseup",onUp);
    };
    document.addEventListener("mousemove",onMove);
    document.addEventListener("mouseup",onUp);
  };
  const tableWidth=visibleColumns.reduce((total,key)=>total+(columnWidths[key]??DEFAULT_WIDTHS[key]??160),0)+250;

  const headerFilter=(key:string)=>{
    const group=filterGroups.find(item=>item.key===key);
    if(group)return <SmartMultiFilter label={group.label} options={group.options} value={group.value} onChange={next=>{group.setValue(next);resetPage()}} category={group.category}/>;
    if(key==="id")return <IdFilterEditor value={idFilter} onChange={next=>{setIdFilter(next);resetPage()}}/>;
    if(TEXT_FILTER_FIELDS.includes(key as TextFilterField)){
      const field=key as TextFilterField;
      return <TextFilterEditor value={textFilters[field]} onChange={next=>{setTextFilters(prev=>({...prev,[field]:next}));resetPage()}} placeholder={"Filtrar "+TEXT_FILTER_LABELS[field].toLowerCase()+"…"}/>;
    }
    if(DATE_FILTER_FIELDS.includes(key as DateFilterField)){
      const field=key as DateFilterField;
      return <div className={styles.headerFilterStack}>
        <DateFilterEditor value={dateFilters[field]} onChange={next=>{setDateFilters(prev=>({...prev,[field]:next}));resetPage()}}/>
        {field==="fechaProximaAccion"&&<select value={nextAction} onChange={e=>{setNextAction(e.target.value as any);resetPage()}}>
          <option value="_all">Sin atajo adicional</option>
          <option value="with">Con fecha</option>
          <option value="without">Sin fecha</option>
          <option value="overdue">Vencidas</option>
        </select>}
      </div>;
    }
    if(key==="clientePotencialRecurrente")return <BooleanFilterEditor value={recurrentFilter} onChange={next=>{setRecurrentFilter(next);resetPage()}} labelTrue="Sí, recurrente" labelFalse="No recurrente"/>;
    return undefined;
  };

  const renderCell=(l:any,key:string)=>{
    if(key==="nombre")return <button className={styles.leadNameButton} onClick={()=>openView(l)}><strong>{l.nombre}</strong><small>{l.origen||"Sin origen"}</small></button>;
    if(key==="id")return String(l.id);
    if(key==="ciudad")return <BadgeSelect className={styles.inlineBadgeSelect} value={l.ciudad??""} options={cityOptions} category="city" placeholder="Asignar ciudad" assignWhenEmpty onChange={v=>quick(l.id,"ciudad",v)}/>;
    if(key==="tipo")return <BadgeSelect className={styles.inlineBadgeSelect} value={l.tipo??""} options={typeOptions} category="vertical" placeholder="Asignar vertical" assignWhenEmpty onChange={v=>quick(l.id,"tipo",v)}/>;
    if(key==="subtipo")return l.tipo
      ? <BadgeSelect className={styles.inlineBadgeSelect} value={l.subtipo??""} options={(settings?.subtypes??[]).filter(x=>!x.typeName||x.typeName===l.tipo).map(x=>x.name)} category="subtype" placeholder="Asignar subtipo" emptyLabel="Sin subtipo" assignWhenEmpty onChange={v=>quick(l.id,"subtipo",v)}/>
      : <span className={styles.assignDependency}>Asigná vertical primero</span>;
    if(key==="commercialProfile")return <BadgeSelect className={styles.inlineBadgeSelect} value={l.commercialProfile??""} options={PROFILE_OPTIONS} category="profile" placeholder="Asignar perfil" emptyLabel="Sin perfil" assignWhenEmpty onChange={v=>quick(l.id,"commercialProfile",v)}/>;
    if(key==="estado")return <BadgeSelect className={styles.inlineBadgeSelect} value={l.estado??""} options={STATUS_OPTIONS} category="status" placeholder="Asignar estado" assignWhenEmpty onChange={v=>quick(l.id,"estado",v)}/>;
    if(key==="prioridad")return <BadgeSelect className={styles.inlineBadgeSelect} value={l.prioridad??""} options={PRIORITY_OPTIONS} category="priority" placeholder="Asignar prioridad" emptyLabel="Sin prioridad" assignWhenEmpty onChange={v=>quick(l.id,"prioridad",v)}/>;
    if(key==="quienCargo")return <BadgeSelect className={styles.inlineBadgeSelect} value={l.quienCargo??""} options={peopleOptions} category="person" placeholder="Asignar persona" assignWhenEmpty onChange={v=>quick(l.id,"quienCargo",v)}/>;
    if(key==="asignadoA")return <BadgeSelect className={styles.inlineBadgeSelect} value={l.asignadoA??""} options={peopleOptions} category="person" placeholder="Asignar responsable" assignWhenEmpty onChange={v=>quick(l.id,"asignadoA",v)}/>;
    if(key==="assignedUserEmail")return <UserBadgeSelect className={styles.inlineBadgeSelect} value={l.assignedUserEmail??""} users={userOptions} placeholder="Asignar usuario" assignWhenEmpty onChange={v=>quick(l.id,"assignedUserEmail",v)}/>;
    if(key==="medioContactoPreferido")return <BadgeSelect className={styles.inlineBadgeSelect} value={l.medioContactoPreferido??""} options={CONTACT_OPTIONS} category="contact" placeholder="Asignar medio" assignWhenEmpty onChange={v=>quick(l.id,"medioContactoPreferido",v)}/>;
    if(["fechaCreacion","fechaUltimoContacto","fechaProximaAccion"].includes(key))return <input
      className={styles.inlineDate}
      type="date"
      value={dateInput(l[key])}
      onClick={e=>{e.stopPropagation();e.currentTarget.showPicker?.()}}
      onDoubleClick={e=>e.stopPropagation()}
      onChange={e=>quick(l.id,key as "fechaCreacion"|"fechaUltimoContacto"|"fechaProximaAccion",e.target.value)}
    />;
    if(["createdAt","updatedAt"].includes(key))return displayDate(l[key]);
    if(key==="clientePotencialRecurrente")return l[key]?"Sí":"No";
    if(key==="email")return l.email?<a className={styles.tableLink} href={"mailto:"+l.email}>{l.email}</a>:"—";
    if(key==="telefono")return l.telefono?<a className={styles.tableLink} href={"tel:"+l.telefono}>{l.telefono}</a>:"—";
    if(isUrl(key)){
      const value=str(l[key]);
      return value?<a className={styles.urlCell} href={value} target="_blank" rel="noreferrer"><span>{value}</span><ExternalLink size={13}/></a>:"—";
    }
    return str(l[key])||"—";
  };

  return <>
    <AppHeader/>
    <main className={styles.shell}>
      <header className={styles.pageHeader}>
        <div><div className={styles.eyebrow}>PIPELINE COMERCIAL</div><h1>Leads</h1><p>Alta, seguimiento y conversión de potenciales clientes de Hospeda.</p></div>
        <div className={styles.pageActions}><Button variant="outline" onClick={()=>setDuplicatesOpen(true)}><AlertTriangle size={16}/>Buscar duplicados</Button><Button onClick={newLead}><Plus size={17}/>Nuevo lead</Button></div>
      </header>

      <section className={styles.metrics}>
        <article><Users/><div><strong>{stats.total.toLocaleString("es-AR")}</strong><span>Total leads</span></div></article>
        <article><Target/><div><strong>{stats.pendientes.toLocaleString("es-AR")}</strong><span>Pendientes</span></div></article>
        <article><Clock3/><div><strong>{stats.vencidos.toLocaleString("es-AR")}</strong><span>Acciones vencidas</span></div></article>
        <article><CheckCircle2/><div><strong>{stats.suscriptos.toLocaleString("es-AR")}</strong><span>Suscriptos</span></div></article>
      </section>

      <section className={styles.toolbar}>
        <div className={styles.search}><Search size={17}/><Input value={query} onChange={e=>{setQuery(e.target.value);resetPage()}} placeholder="Buscar en leads y notas…"/></div>
        <div className={styles.filters}>
          <Button variant="outline" onClick={()=>setFilterDialogOpen(true)} className={styles.filterButton}>
            <Filter size={15}/>Filtrar{appliedRuleCount>0&&<span className={styles.filterButtonCount}>{appliedRuleCount}</span>}
          </Button>
          <ColumnPicker columns={TABLE_COLUMNS} visible={visibleColumns} onChange={setVisibleColumns}/>
        </div>
      </section>

      <FilterLegend
        groups={appliedFilterGroups}
        fields={filterFields}
        onEdit={()=>setFilterDialogOpen(true)}
        onClear={()=>{setAppliedFilterGroups([]);resetPage()}}
      />

      <section className={styles.tableCard+" "+(tableFullscreen?styles.fullscreenTable:"")}>
        <div className={styles.tableMeta}><div><strong>{total.toLocaleString("es-AR")} leads</strong><span>Página {page} de {Math.max(1,Math.ceil(total/50))}</span></div><div className={styles.tableMetaActions}><span className={styles.tableHint}>Los encabezados con ▾ permiten ordenar · arrastrá el borde para redimensionar</span><Button variant="outline" size="sm" onClick={()=>setTableFullscreen(v=>!v)}>{tableFullscreen?<Minimize2 size={15}/>:<Maximize2 size={15}/>} {tableFullscreen?"Salir":"Pantalla completa"}</Button></div></div>
        {leadsQ.isFetching&&!leadsQ.data?<div className={styles.loading}>{Array.from({length:8}).map((_,i)=><Skeleton key={i} className={styles.skeleton}/>)}</div>:
        leadsQ.error?<div className={styles.error}>No pude cargar los leads: {leadsQ.error.message}</div>:
        <div className={styles.scroller}><table style={{width:tableWidth,minWidth:tableWidth}}><colgroup>
          {visibleColumns.map(key=><col key={key} style={{width:columnWidths[key]??DEFAULT_WIDTHS[key]??160}}/>)}<col style={{width:120}}/><col style={{width:130}}/>
        </colgroup><thead><tr>
          {visibleColumns.map(key=>{
            const col=TABLE_COLUMNS.find(x=>x.key===key);
            if(!col)return null;
            return <th key={key} className={styles.resizableTh}><HeaderMenu label={col.label} field={key as SortBy} sortBy={sortBy} sortDir={sortDir} onSort={sort}/><span className={styles.resizeHandle} onMouseDown={e=>{e.preventDefault();e.stopPropagation();startResize(key,e.clientX)}}/></th>;
          })}
          <th>Contacto</th><th>Acciones</th>
        </tr></thead><tbody>
          {leads.map(l=><tr key={String(l.id)} onDoubleClick={()=>openView(l)}>
            {visibleColumns.map(key=><td key={key}><div className={styles.cellClip}>{renderCell(l,key)}</div></td>)}
            <td><div className={styles.quick}>{l.telefono&&<><a href={"tel:"+l.telefono} title="Llamar"><Phone size={15}/></a><button type="button" onClick={()=>openContact(l,"whatsapp")} title="WhatsApp"><MessageCircle size={15}/></button></>}{l.email&&<button type="button" onClick={()=>openContact(l,"email")} title="Email"><Mail size={15}/></button>}{l.sitioWeb&&<a href={l.sitioWeb} target="_blank" rel="noreferrer" title="Web"><ExternalLink size={15}/></a>}</div></td>
            <td><div className={styles.rowActions}><Button variant="ghost" size="icon-sm" onClick={()=>openView(l)} title="Ver"><Search size={15}/></Button><Button variant="ghost" size="icon-sm" onClick={()=>editLead(l)} title="Editar"><Pencil size={15}/></Button><Button variant="ghost" size="icon-sm" onClick={()=>requestDelete(l.id,l.nombre)} title="Borrar"><Trash2 size={15}/></Button></div></td>
          </tr>)}
        </tbody></table></div>}
        <div className={styles.pagination}><Button variant="outline" disabled={page<=1} onClick={()=>setPage(p=>Math.max(1,p-1))}>Anterior</Button><span>{page} / {Math.max(1,Math.ceil(total/50))}</span><Button variant="outline" disabled={page>=Math.ceil(total/50)} onClick={()=>setPage(p=>p+1)}>Siguiente</Button></div>
      </section>

      <Dialog open={open} onOpenChange={setOpen}><DialogContent className={styles.dialog}>
        <DialogHeader><DialogTitle>{form.id?"Editar lead":"Nuevo lead"}</DialogTitle><DialogDescription>Todos los datos comerciales y de contacto del lead.</DialogDescription></DialogHeader>
        <div className={styles.formGrid}>
          <label className={styles.span2}>Nombre / razón social<Input value={form.nombre} onChange={e=>set("nombre",e.target.value)}/></label>
          <label className={styles.span2}>Persona de contacto<Input value={str(form.contactName)} onChange={e=>set("contactName",e.target.value)} placeholder="Ej: Leandro Asrilevich"/></label>
          <label>Vertical<BadgeSelect value={str(form.tipo)} options={typeOptions} category="vertical" onChange={v=>{set("tipo",v);set("subtipo","")}} placeholder="Seleccionar vertical…"/></label>
          <label>Subtipo<BadgeSelect value={str(form.subtipo)} options={subtypeOptions} category="subtype" onChange={v=>set("subtipo",v)} placeholder="Seleccionar subtipo…" emptyLabel="Sin subtipo"/></label>
          <label>Perfil comercial<BadgeSelect value={str(form.commercialProfile)} options={PROFILE_OPTIONS} category="profile" onChange={v=>set("commercialProfile",v||null)} placeholder="Seleccionar perfil…" emptyLabel="Sin perfil"/></label>
          <label>Ciudad<BadgeSelect value={str(form.ciudad)} options={cityOptions} category="city" onChange={v=>set("ciudad",v)} placeholder="Seleccionar ciudad…"/></label>
          <label>Estado<BadgeSelect value={str(form.estado)} options={STATUS_OPTIONS} category="status" onChange={v=>set("estado",v)} placeholder="Seleccionar estado…"/></label>
          <label>Prioridad<BadgeSelect value={form.prioridad??""} options={PRIORITY_OPTIONS} category="priority" onChange={v=>set("prioridad",v||null)} placeholder="Sin prioridad" emptyLabel="Sin prioridad"/></label>
          <label>Suscripción<Input value={str(form.suscripcion)} onChange={e=>set("suscripcion",e.target.value)}/></label>
          <label>Quién cargó<BadgeSelect value={str(form.quienCargo)} options={peopleOptions} category="person" onChange={v=>set("quienCargo",v)} placeholder="Seleccionar persona…"/></label>
          <label>Responsable<BadgeSelect value={str(form.asignadoA)} options={peopleOptions} category="person" onChange={v=>set("asignadoA",v)} placeholder="Seleccionar responsable…"/></label>
          <label>Asignado a usuario<UserBadgeSelect value={str(form.assignedUserEmail)} users={userOptions} onChange={v=>set("assignedUserEmail",v)} placeholder="Seleccionar usuario…"/></label>
          <label>Teléfono<Input value={str(form.telefono)} onChange={e=>set("telefono",e.target.value)}/></label>
          <label>Email<Input type="email" value={str(form.email)} onChange={e=>set("email",e.target.value)}/></label>
          <label>Medio preferido<BadgeSelect value={str(form.medioContactoPreferido)} options={CONTACT_OPTIONS} category="contact" onChange={v=>set("medioContactoPreferido",v)} placeholder="Sin definir" emptyLabel="Sin definir"/></label>
          <label>Origen<Input value={str(form.origen)} onChange={e=>set("origen",e.target.value)}/></label>
          <label className={styles.span2}>Fuente de referencia<Input value={str(form.fuenteReferencia)} onChange={e=>set("fuenteReferencia",e.target.value)}/></label>
          <label>Sitio web<Input value={str(form.sitioWeb)} onChange={e=>set("sitioWeb",e.target.value)}/></label>
          <label>Google Maps<Input value={str(form.urlGmap)} onChange={e=>set("urlGmap",e.target.value)}/></label>
          <label>Instagram<Input value={str(form.perfilInstagram)} onChange={e=>set("perfilInstagram",e.target.value)}/></label>
          <label>Facebook<Input value={str(form.perfilFacebook)} onChange={e=>set("perfilFacebook",e.target.value)}/></label>
          <label>Airbnb<Input value={str(form.perfilAirbnb)} onChange={e=>set("perfilAirbnb",e.target.value)}/></label>
          <label>Booking<Input value={str(form.perfilBooking)} onChange={e=>set("perfilBooking",e.target.value)}/></label>
          <label className={styles.span2}>Turismo Entre Ríos<Input value={str(form.perfilTurismoEntreRios)} onChange={e=>set("perfilTurismoEntreRios",e.target.value)}/></label>
          <label>Último contacto<Input type="date" value={str(form.fechaUltimoContacto)} onChange={e=>set("fechaUltimoContacto",e.target.value)}/></label>
          <label>Próxima acción<Input type="date" value={str(form.fechaProximaAccion)} onChange={e=>set("fechaProximaAccion",e.target.value)}/></label>
          <label className={styles.span2}>Resultado último contacto<Input value={str(form.resultadoUltimoContacto)} onChange={e=>set("resultadoUltimoContacto",e.target.value)}/></label>
          <label className={styles.span2}>Archivo adjunto / URL<Input value={str(form.archivoAdjunto)} onChange={e=>set("archivoAdjunto",e.target.value)}/></label>
          <label className={styles.span2+" "+styles.checkboxLabel}><Checkbox checked={!!form.clientePotencialRecurrente} onChange={e=>set("clientePotencialRecurrente",e.target.checked)}/><span>Cliente potencial recurrente</span></label>
          <label className={styles.span2}>Nueva nota<Textarea value={str(form.notas)} onChange={e=>set("notas",e.target.value)} rows={3} placeholder="Se agregará al historial de notas; no reemplaza las anteriores."/></label>
        </div>
        {duplicateCandidates.length>0&&<div className={styles.duplicateWarning}><strong><AlertTriangle size={16}/>Posible lead duplicado</strong><p>Encontré coincidencias antes de crear el registro:</p>{duplicateCandidates.map(d=><div key={d.id}><b>{d.nombre}</b> · {d.ciudad||"sin ciudad"} · {d.reasons.join(", ")}</div>)}</div>}
        {saveM.error&&<div className={styles.error}>{saveM.error.message}</div>}
        <DialogFooter>{form.id&&<Button variant="destructive" onClick={()=>requestDelete(form.id!,form.nombre)} disabled={deleteM.isPending}><Trash2 size={16}/>Eliminar</Button>}<div className={styles.grow}/><Button variant="outline" onClick={()=>setOpen(false)}>Cancelar</Button>{duplicateCandidates.length>0?<Button variant="secondary" onClick={()=>saveLead(true)} disabled={saveM.isPending}>Guardar de todas formas</Button>:<Button onClick={()=>saveLead(false)} disabled={saveM.isPending||!form.nombre.trim()}>{saveM.isPending?"Guardando…":"Guardar lead"}</Button>}</DialogFooter>
      </DialogContent></Dialog>

      <Dialog open={duplicatesOpen} onOpenChange={setDuplicatesOpen}><DialogContent className={styles.duplicatesDialog}>
        <DialogHeader><DialogTitle>Duplicados potenciales</DialogTitle><DialogDescription>Coincidencias por nombre + ciudad, email o teléfono. Revisalas antes de borrar registros.</DialogDescription></DialogHeader>
        {duplicatesQ.isFetching?<Skeleton className={styles.duplicatesSkeleton}/>:duplicatesQ.error?<div className={styles.error}>{duplicatesQ.error.message}</div>:<div className={styles.duplicateGroups}>{(duplicatesQ.data?.groups??[]).length===0?<p>No encontré duplicados.</p>:(duplicatesQ.data?.groups??[]).map((g,i)=><section key={g.reason+g.key+i}><div className={styles.duplicateGroupTitle}><Badge variant="warning">{g.reason}</Badge><span>{g.leads.length} registros</span></div>{g.leads.map(l=><div className={styles.duplicateRow} key={l.id}><div><strong>{l.nombre}</strong><span>{l.ciudad||"—"} · {l.telefono||"sin teléfono"} · {l.email||"sin email"}</span></div><Button size="sm" variant="outline" onClick={()=>{setAppliedFilterGroups([]);setQuery(l.nombre);setPage(1);setDuplicatesOpen(false)}}>Ver en tabla</Button></div>)}</section>)}</div>}
      </DialogContent></Dialog>

      <FilterBuilderDialog
        open={filterDialogOpen}
        onOpenChange={setFilterDialogOpen}
        fields={filterFields}
        value={appliedFilterGroups}
        onApply={groups=>{setAppliedFilterGroups(groups);setPage(1)}}
      />
      <LeadDetailDialog open={viewOpen} onOpenChange={setViewOpen} lead={selectedLead} users={userOptions} onEdit={editLead} onDelete={lead=>requestDelete(lead.id,lead.nombre)} onWhatsApp={lead=>openContact(lead,"whatsapp")} onEmail={lead=>openContact(lead,"email")}/>
      <ContactTemplateDialog open={contactOpen} onOpenChange={setContactOpen} channel={contactChannel} lead={contactLead} templates={templates.filter(x=>x.channel===contactChannel)}/>
      <Dialog open={!!pendingDelete} onOpenChange={next=>{if(!next&&!deleteM.isPending)setPendingDelete(null)}}><DialogContent className={styles.confirmDialog}>
        <DialogHeader><DialogTitle>Enviar lead a la papelera</DialogTitle><DialogDescription><strong>{pendingDelete?.nombre}</strong> dejará de aparecer en la tabla y en la operación normal.</DialogDescription></DialogHeader>
        <div className={styles.confirmWarning}><AlertTriangle size={20}/><span>Sus datos, notas y journal se conservarán. El administrador podrá restaurarlo o eliminarlo definitivamente desde Papelera.</span></div>
        <DialogFooter><Button variant="outline" onClick={()=>setPendingDelete(null)} disabled={deleteM.isPending}>Cancelar</Button><Button variant="destructive" onClick={confirmDelete} disabled={deleteM.isPending}>{deleteM.isPending?"Enviando…":"Enviar a papelera"}</Button></DialogFooter>
      </DialogContent></Dialog>
    </main>
  </>;
}