import {useOperationGuard} from '../helpers/useOperationGuard';
import { Table } from '@mantine/core';
import { Disclosure, DisclosureSummary } from '../components/Disclosure';
import { NativeSelect } from '../components/NativeSelect';
import { UnstyledButton } from '@mantine/core';
import {localDay} from '../helpers/workDates';
import {BulkChangeReview} from "../components/BulkChangeReview";
import type {InputType as BulkInput} from "../endpoints/leads_bulk_POST.schema";
import {useUnsavedChanges} from "../components/UnsavedChanges";
import {DataImportDialog} from '../components/DataImportDialog';
import {AccountMergeDialog} from '../components/AccountMergeDialog';
import {PipelineBoard} from "../components/Pipeline";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle, ArrowDownAZ, ArrowUpAZ, BookmarkPlus, Building2, CalendarClock, CheckCircle2, ChevronDown, Clock3,
  ExternalLink, Filter, Globe2, LoaderCircle, Mail, Maximize2, MessageCircle, Minimize2, Pencil, Phone, Plus, Search, StickyNote,
  Target, Trash2, UserRound, Users, UsersRound, X
} from "lucide-react";
import { OpportunityStart } from "../components/OpportunityStart";
import { CommercialEditor } from "../components/CommercialEditor";
import type { Account } from "../endpoints/commercial.schema";
import { CommercialHelp } from "../components/CommercialHelp";
import { getCommercialDetail } from "../endpoints/commercial.schema";
import { AppHeader } from "../components/AppHeader";
import { Badge } from "../components/Badge";
import { BadgeSelect } from "../components/BadgeSelect";
import { Button } from "../components/Button";
import { Checkbox } from "../components/Checkbox";
import { ColumnPicker, type TableColumnOption } from "../components/ColumnPicker";
import { ContactTemplateDialog } from "../components/ContactTemplateDialog";
import { FilterBuilderDialog, FilterLegend, type FilterFieldDefinition } from "../components/FilterBuilderDialog";
import { LeadDetailDialog } from "../components/LeadDetailDialog";
import { NextActionPicker } from "../components/NextActionPicker";
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
import { ValueBadge } from "../components/ValueBadge";
import { getLeadDuplicates } from "../endpoints/leads_duplicates_GET.schema";
import { advancedFilterGroup, getLeads, type AdvancedFilterGroup } from "../endpoints/leads_GET.schema";
import { postLeadsDelete } from "../endpoints/leads_delete_POST.schema";
import { postLeadsBulk } from "../endpoints/leads_bulk_POST.schema";
import { postLeadsBulkDelete } from "../endpoints/leads_bulk_delete_POST.schema";
import { postLeadsQuick } from "../endpoints/leads_quick_POST.schema";
import { postLeadsSave, type DuplicateCandidate, type InputType } from "../endpoints/leads_save_POST.schema";
import { getLeadStats } from "../endpoints/leads_stats_GET.schema";
import { getSettings } from "../endpoints/settings_GET.schema";
import { getSavedLeadViews } from "../endpoints/saved_views_GET.schema";
import { postSavedLeadView } from "../endpoints/saved_views_POST.schema";
import { useDebounce } from "../helpers/useDebounce";
import { nextActionInfo, dateOnlyInput, toDateInput } from "../helpers/crmDates";
import { useAuth } from "../helpers/useAuth";
import styles from "./_index.module.css";

import {QUERY_KEY, PRIORITY_OPTIONS, PROFILE_OPTIONS, CONTACT_OPTIONS, TEXT_FILTER_FIELDS, TextFilterField, DATE_FILTER_FIELDS, DateFilterField, TEXT_FILTER_LABELS, DATE_FILTER_LABELS, createTextFilters, createDateFilters, SortBy, TABLE_COLUMNS, DEFAULT_COLUMNS, DEFAULT_WIDTHS, TABLE_QUERY_STORAGE_KEY, TABLE_FILTERS_STORAGE_KEY, TABLE_SORT_STORAGE_KEY, readStoredQuery, readStoredFilterGroups, readStoredSort, emptyForm, str, dateInput, displayDate, isUrl} from "../helpers/leadsTableModel";

import {HeaderMenu} from "../components/LeadsTableHeader";

export default function LeadsPage({businessMode=false}:{businessMode?:boolean}){
  const navigate=useNavigate();
  const entity=businessMode?"business":"opportunity";
  const tableColumns=TABLE_COLUMNS.map(column=>({...column,label:businessMode?(column.key==="nombre"?"Negocio":column.key==="id"?"ID de entrada":column.key==="assignedUserEmail"?"Responsable del negocio":column.key==="estado"?"Etapas de gestiones":column.label):column.label}));
  const [businessEditor,setBusinessEditor]=useState<{item?:Account}|null>(null);
  const qc=useQueryClient();
  const [urlParams,setUrlParams]=useSearchParams();
  const {authState}=useAuth();
  const isAdmin=authState.type==="authenticated"&&authState.user.role==="admin";
  const currentUser=authState.type==="authenticated"?authState.user:null;
  const [query,setQuery]=useState(()=>readStoredQuery(entity));
  const [cityFilter,setCityFilter]=useState<SmartFilterState>(emptySmartFilter);
  const [statusFilter,setStatusFilter]=useState<SmartFilterState>(emptySmartFilter);
  const [typeFilter,setTypeFilter]=useState<SmartFilterState>(emptySmartFilter);
  const [subtypeFilter,setSubtypeFilter]=useState<SmartFilterState>(emptySmartFilter);
  const [commercialProfileFilter,setCommercialProfileFilter]=useState<SmartFilterState>(emptySmartFilter);
  const [priorityFilter,setPriorityFilter]=useState<SmartFilterState>(emptySmartFilter);
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
  const storedSort=readStoredSort(entity);
  const [sortBy,setSortBy]=useState<SortBy>(storedSort.sortBy);
  const [sortDir,setSortDir]=useState<"asc"|"desc">(storedSort.sortDir);
  const [page,setPage]=useState(1);
  const [open,setOpen]=useState(false);
  const [advancedTable,setAdvancedTable]=useState(false);
  const [viewOpen,setViewOpen]=useState(false);
  const [duplicatesOpen,setDuplicatesOpen]=useState(false);
  const [importOpen,setImportOpen]=useState(false);
  const [mergePair,setMergePair]=useState<{sourceId:string;destinationId:string}|null>(null);
  const [startingOpportunity,setStartingOpportunity]=useState(false);
  const [form,setForm]=useState<InputType>(emptyForm);
  const editBaseline=useRef<string|null>(null);
  useEffect(()=>{editBaseline.current=open?JSON.stringify(form):null},[open]);
  const legacyGuard=useUnsavedChanges(open&&editBaseline.current!==null&&JSON.stringify(form)!==editBaseline.current,()=>setOpen(false));
  const [selectedLead,setSelectedLead]=useState<any|null>(null);
  const [duplicateCandidates,setDuplicateCandidates]=useState<DuplicateCandidate[]>([]);
  const [contactOpen,setContactOpen]=useState(false);
  const [contactChannel,setContactChannel]=useState<"whatsapp"|"email">("whatsapp");
  const [contactLead,setContactLead]=useState<any|null>(null);
  const [pendingDelete,setPendingDelete]=useState<{id:string|number;nombre:string}|null>(null);
  const [tableFullscreen,setTableFullscreen]=useState(false);
  const [pipelineView,setPipelineView]=useState(!businessMode);
  const [filterDialogOpen,setFilterDialogOpen]=useState(false);
  const [appliedFilterGroups,setAppliedFilterGroups]=useState<AdvancedFilterGroup[]>(()=>readStoredFilterGroups(entity));
  const [selectedIds,setSelectedIds]=useState<Set<string>>(new Set());
  const [lastTouchedId,setLastTouchedId]=useState<string>("");
  const [cellState,setCellState]=useState<Record<string,"saving"|"saved">>({});
  const [bulkField,setBulkField]=useState<"estado"|"prioridad"|"assignedUserEmail"|"fechaProximaAccion"|"tipo"|"commercialProfile"|"ciudad">("estado");
  const [bulkValue,setBulkValue]=useState("");
  const [bulkDeleteOpen,setBulkDeleteOpen]=useState(false);
  const [activeQuick,setActiveQuick]=useState("all");
  const [classification,setClassification]=useState<"open"|"won"|"lost"|undefined>();
  const [saveViewOpen,setSaveViewOpen]=useState(false);
  const [savedViewName,setSavedViewName]=useState("");
  const [savedViews,setSavedViews]=useState<Array<{
    name:string;query:string;filterGroups:AdvancedFilterGroup[];sortBy:SortBy;sortDir:"asc"|"desc";classification?:"open"|"won"|"lost";
    inline?:{
      cityFilter:SmartFilterState;statusFilter:SmartFilterState;typeFilter:SmartFilterState;subtypeFilter:SmartFilterState;
      commercialProfileFilter:SmartFilterState;priorityFilter:SmartFilterState;assignedUserFilter:SmartFilterState;
      subscriptionFilter:SmartFilterState;originFilter:SmartFilterState;loadedByFilter:SmartFilterState;
      contactMethodFilter:SmartFilterState;createdByFilter:SmartFilterState;
      textFilters:Record<TextFilterField,TextFilterState>;dateFilters:Record<DateFilterField,DateFilterState>;
      idFilter:IdFilterState;recurrentFilter:"all"|"true"|"false";notesFilter:TextFilterState;
      nextAction:"_all"|"with"|"without"|"overdue";
    };
  }>>([]);
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
      const saved=window.localStorage.getItem(`hospeda-${entity}-visible-columns-v2`);
      const parsed=saved?JSON.parse(saved):null;
      return Array.isArray(parsed)&&parsed.length?parsed:DEFAULT_COLUMNS;
    }catch{return DEFAULT_COLUMNS}
  });

  useEffect(()=>{
    window.localStorage.setItem(`hospeda-${entity}-visible-columns-v2`,JSON.stringify(visibleColumns));
  },[visibleColumns,entity]);
  useEffect(()=>{
    window.localStorage.setItem("hospeda-leads-column-widths",JSON.stringify(columnWidths));
  },[columnWidths]);
  useEffect(()=>{
    try{window.localStorage.setItem(TABLE_QUERY_STORAGE_KEY+"-"+entity,query)}
    catch{}
  },[query]);
  useEffect(()=>{
    try{window.localStorage.setItem(TABLE_FILTERS_STORAGE_KEY+"-"+entity,JSON.stringify(appliedFilterGroups))}
    catch{}
  },[appliedFilterGroups]);
  useEffect(()=>{
    try{window.localStorage.setItem(TABLE_SORT_STORAGE_KEY+"-"+entity,JSON.stringify({sortBy,sortDir}))}
    catch{}
  },[sortBy,sortDir]);
  useEffect(()=>{
    if(!lastTouchedId)return;
    const timeout=window.setTimeout(()=>setLastTouchedId(""),3500);
    return ()=>window.clearTimeout(timeout);
  },[lastTouchedId]);
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
  const legacyId=urlParams.get("leadId");
  const legacyLeadQ=useQuery({queryKey:["leads","legacy-action",legacyId],queryFn:()=>getLeads({entity:"opportunity",idExact:legacyId!,pageSize:10}),enabled:!!legacyId});
  const businessDetailQ=useQuery({queryKey:["commercial-detail","",String(form.id??"")],queryFn:()=>getCommercialDetail(undefined,String(form.id)),enabled:open&&!!form.id});
  const settingsQ=useQuery({queryKey:["settings"],queryFn:getSettings});
  const savedViewsQ=useQuery({queryKey:["saved-views",currentUser?.id],queryFn:getSavedLeadViews,enabled:!!currentUser});
  const leadsQ=useQuery({
    queryKey:[...QUERY_KEY,entity,debouncedQuery,appliedFilterGroups,cityFilter,statusFilter,typeFilter,subtypeFilter,commercialProfileFilter,priorityFilter,assignedUserFilter,subscriptionFilter,originFilter,loadedByFilter,contactMethodFilter,createdByFilter,textFilters,dateFilters,idFilter,recurrentFilter,notesFilter,nextAction,sortBy,sortDir,page,pipelineView,classification,activeQuick],
    queryFn:()=>getLeads({
      entity,
      q:debouncedQuery.trim()||undefined,
      filterGroups:appliedFilterGroups,
      ciudades:cityFilter.include,excludeCiudades:cityFilter.exclude,
      estados:statusFilter.include,excludeEstados:statusFilter.exclude,
      tipos:typeFilter.include,excludeTipos:typeFilter.exclude,
      subtipos:subtypeFilter.include,excludeSubtipos:subtypeFilter.exclude,
      commercialProfiles:commercialProfileFilter.include,excludeCommercialProfiles:commercialProfileFilter.exclude,
      prioridades:priorityFilter.include,excludePrioridades:priorityFilter.exclude,
      assignedUsers:assignedUserFilter.include,excludeAssignedUsers:assignedUserFilter.exclude,
      suscripciones:subscriptionFilter.include,excludeSuscripciones:subscriptionFilter.exclude,
      origenes:originFilter.include,excludeOrigenes:originFilter.exclude,
      quienesCargaron:loadedByFilter.include,excludeQuienesCargaron:loadedByFilter.exclude,
      mediosContacto:contactMethodFilter.include,excludeMediosContacto:contactMethodFilter.exclude,
      creadosPor:createdByFilter.include,excludeCreadosPor:createdByFilter.exclude,
      textFilters:activeTextFilters,dateFilters:activeDateFilters,
      idExact:idFilter.exact||undefined,idMin:idFilter.min||undefined,idMax:idFilter.max||undefined,
      recurrent:recurrentFilter==="all"?undefined:recurrentFilter,
      notesMode:notesFilter.mode==="none"?undefined:notesFilter.mode,
      notesText:notesFilter.value||undefined,
      nextAction:nextAction==="_all"?undefined:nextAction,
      classification,contactPresence:activeQuick==='contacted'||activeQuick==='noContact'?activeQuick:undefined,sortBy,sortDir,page,inactiveDays:activeQuick==='inactive30'?30:undefined,pageSize:50,view:pipelineView?"board":"table"
    }),
    placeholderData:(previous)=>previous
  });
  const resultsBusy=leadsQ.isFetching||query!==debouncedQuery;
  const statsQ=useQuery({queryKey:["lead-stats",entity],queryFn:()=>getLeadStats(entity)});
  const duplicatesQ=useQuery({queryKey:["lead-duplicates"],queryFn:getLeadDuplicates,enabled:duplicatesOpen});

  const invalidate=async()=>{
    await Promise.all([
      qc.invalidateQueries({queryKey:QUERY_KEY}),
      qc.invalidateQueries({queryKey:["lead-stats"]}),
      qc.invalidateQueries({queryKey:["analytics"]}),
      qc.invalidateQueries({queryKey:["lead-duplicates"]}),
      qc.invalidateQueries({queryKey:["lead-journal"]}),
      qc.invalidateQueries({queryKey:["global-journal"]}),
      qc.invalidateQueries({queryKey:["commercial"]}),
      qc.invalidateQueries({queryKey:["commercial-detail"]})
    ]);
  };
  const runOperation=useOperationGuard(error=>toast.error(error instanceof Error?error.message:'No se pudo guardar'));
  const saveM=useMutation({mutationFn:postLeadsSave});
  const deleteM=useMutation({mutationFn:postLeadsDelete,onSuccess:invalidate});
  const quickM=useMutation({mutationFn:postLeadsQuick,onSuccess:invalidate});
  const bulkM=useMutation({mutationFn:postLeadsBulk,onSuccess:invalidate});
  const bulkDeleteM=useMutation({mutationFn:postLeadsBulkDelete,onSuccess:invalidate});
  const savedViewM=useMutation({mutationFn:postSavedLeadView});

  useEffect(()=>{
    if(!savedViewsQ.data)return;
    setSavedViews(savedViewsQ.data.views.filter(({config})=>!(config as any).entity||(config as any).entity===entity).map(({name,config})=>({name,...(config as any)})));
  },[savedViewsQ.data]);

  const leads=leadsQ.data?.rows??[];
  const filters=leadsQ.data?.filters??{
    ciudades:[],estados:[],tipos:[],asignados:[],suscripciones:[],origenes:[],
    quienesCargaron:[],mediosContacto:[],creadosPor:[]
  };
  const total=leadsQ.data?.total??0;
  const stats=statsQ.data??{total:0,pendientes:0,suscriptos:0,vencidos:0,paraHoy:0,misPendientesHoy:0};
  const settings=settingsQ.data;
  const STATUS_OPTIONS=settings?.opportunityStages??filters.estados;
  const cityOptions=settings?.cities.map(x=>x.name)??filters.ciudades;
  const typeOptions=settings?.types??filters.tipos;
  const peopleOptions=settings?.authorizedEmails.map(x=>x.displayName||x.email)??filters.asignados;
  const userOptions=settings?.users??[];
  const responsibleLabel=(email:string|null|undefined)=>userOptions.find(user=>user.email===email)?.displayName||email||"";
  const subtypeOptions=(settings?.subtypes??[]).filter(x=>!x.typeName||!form.tipo||x.typeName===form.tipo).map(x=>x.name);
  const allSubtypeOptions=Array.from(new Set((settings?.subtypes??[]).map(x=>x.name)));
  const templates=settings?.templates??[];
  const optionList=(values:string[])=>values.map(value=>({value,label:value}));
  const filterFields:FilterFieldDefinition[]=[
    {key:"id",label:businessMode?"ID de entrada original":"ID",kind:"number"},
    {key:"nombre",label:"Nombre del negocio",kind:"text"},
    {key:"assignedUserEmail",label:"Responsable",kind:"category",options:userOptions.map(user=>({value:user.email,label:user.displayName||user.email}))},
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
    ...(isAdmin?[{key:"deletedAt" as const,label:"Gestión eliminada (Papelera)",kind:"boolean" as const}]:[]),
  ];
  const includesDeletedFilter=appliedFilterGroups.some(group=>group.rules.some(rule=>rule.field==="deletedAt"));
  useEffect(()=>{setSelectedIds(new Set());if(includesDeletedFilter)setPipelineView(false);},[includesDeletedFilter,appliedFilterGroups]);
  const appliedRuleCount=appliedFilterGroups.reduce((total,group)=>total+group.rules.length,0)+(query.trim()?1:0);

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
    {key:"assignedUserEmail",label:"Responsable",category:"person",options:[...userOptions.map(user=>({value:user.email,label:user.displayName||user.email})),{value:"__EMPTY__",label:"Sin valor"}],value:assignedUserFilter,setValue:setAssignedUserFilter},
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
  const resetInlineFilters=()=>{
    setClassification(undefined);
    setCityFilter(emptySmartFilter());setStatusFilter(emptySmartFilter());setTypeFilter(emptySmartFilter());
    setSubtypeFilter(emptySmartFilter());setCommercialProfileFilter(emptySmartFilter());setPriorityFilter(emptySmartFilter());
    setAssignedUserFilter(emptySmartFilter());setSubscriptionFilter(emptySmartFilter());setOriginFilter(emptySmartFilter());
    setLoadedByFilter(emptySmartFilter());setContactMethodFilter(emptySmartFilter());setCreatedByFilter(emptySmartFilter());
    setTextFilters(createTextFilters());setDateFilters(createDateFilters());setIdFilter(emptyIdFilter());
    setRecurrentFilter("all");setNotesFilter(emptyTextFilter());setNextAction("_all");
  };
  const clearAllFilters=()=>{resetInlineFilters();resetPage()};
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
  const today=localDay();
  const applyQuickView=(kind:string,value?:string)=>{
    resetInlineFilters();
    setQuery("");
    setActiveQuick(kind);
    let groups:AdvancedFilterGroup[]=[];
    if(kind==="pending"||(!businessMode&&["today","overdue","myToday","inactive30"].includes(kind)))setClassification("open");
    if(kind==="subscribed")groups=[{rules:[{field:"estado",operator:"eq",value:"Suscripto"}]}];
    if(kind==="today")groups=[{rules:[{field:"fechaProximaAccion",operator:"on",value:today}]}];
    if(kind==="overdue")groups=[{rules:[{field:"fechaProximaAccion",operator:"before",value:today}]}];
    if(kind==="mine"&&currentUser)groups=[{rules:[{field:"assignedUserEmail",operator:"eq",value:currentUser.email}]}];
    if(kind==="myToday"&&currentUser)groups=[
      {rules:[{field:"assignedUserEmail",operator:"eq",value:currentUser.email}]},
      {rules:[{field:"fechaProximaAccion",operator:"between",value:"2000-01-01",value2:today}]},
    ];
    if(kind==="unassigned")groups=[{rules:[{field:"assignedUserEmail",operator:"empty"}]}];
    if(kind==="noContact")groups=[];
    if(kind==="contacted")groups=[];
    if(kind==="inactive30"){
      const d=new Date();d.setDate(d.getDate()-30);
      groups=[];
    }
    if(kind==="new7"){
      const d=new Date();d.setDate(d.getDate()-7);
      groups=[{rules:[{field:"createdAt",operator:"after",value:dateInput(d)}]}];
    }
    if(kind==="noNext")groups=[{rules:[{field:"fechaProximaAccion",operator:"empty"}]}];
    if(kind==="field"&&value){
      const [field,raw]=value.split("::");
      if(field&&raw)groups=[{rules:[{field:field as any,operator:"eq",value:raw}]}];
    }
    const cohortFrom=urlParams.get('cohortFrom'),cohortTo=urlParams.get('cohortTo');
    if(cohortFrom||cohortTo)groups.push({rules:[{field:'fechaCreacion',operator:cohortFrom&&cohortTo?'between':cohortFrom?'after':'before',value:cohortFrom||cohortTo||'',...(cohortFrom&&cohortTo?{value2:cohortTo}:{})}]});
    for(const [param,field] of [['cohortOwner','assignedUserEmail'],['cohortType','tipo'],['cohortCity','ciudad']] as const){const v=urlParams.get(param);if(v)groups.push({rules:[{field,operator:'eq',value:v}]})}
    setAppliedFilterGroups(groups);setPage(1);
  };
  useEffect(()=>{
    const quickParam=urlParams.get("quick");
    const field=urlParams.get("filterField"),value=urlParams.get("filterValue");
    const leadId=urlParams.get("leadId");
    if(quickParam)applyQuickView(quickParam);
    else if(field&&value)applyQuickView("field",field+"::"+value);

  },[urlParams]);
  useEffect(()=>{
    const leadId=urlParams.get("leadId");
    if(!leadId)return;
    const target=legacyLeadQ.data?.rows.find(item=>String(item.id)===leadId);
    if(target&&["whatsapp","email"].includes(urlParams.get("contact")??"")){setContactLead(target);setContactChannel(urlParams.get("contact") as "whatsapp"|"email");setContactOpen(true);setUrlParams({}, {replace:true});return;}
    if(target&&urlParams.get("edit")==="true"){editLead(target);setUrlParams({}, {replace:true});return}if(target&&urlParams.get("delete")==="true"){requestDelete(target.id,target.nombre);setUrlParams({}, {replace:true});return}if(target){navigate("/sales/"+leadId,{replace:true})}
  },[legacyLeadQ.data,urlParams]);

  const saveCurrentView=()=>{
    const name=savedViewName.trim();if(!name||!currentUser)return;
    const inline={
      cityFilter,statusFilter,typeFilter,subtypeFilter,commercialProfileFilter,priorityFilter,assignedUserFilter,
      subscriptionFilter,originFilter,loadedByFilter,contactMethodFilter,createdByFilter,
      textFilters,dateFilters,idFilter,recurrentFilter,notesFilter,nextAction
    };
    const view={name,query,filterGroups:appliedFilterGroups,sortBy,sortDir,inline,classification};
    const next=[...savedViews.filter(item=>item.name!==name),view];
    setSavedViews(next);
    void savedViewM.mutateAsync({action:"save",view:{name,config:{entity,query,filterGroups:appliedFilterGroups,sortBy,sortDir,inline,classification}}})
      .then(()=>toast.success("Vista guardada"))
      .catch(error=>{setSavedViews(savedViews);toast.error(error instanceof Error?error.message:"No se pudo guardar la vista")});
    setSavedViewName("");setSaveViewOpen(false);
  };
  const applySavedView=(view:(typeof savedViews)[number])=>{
    resetInlineFilters();setClassification(view.classification);
    if(view.inline){
      setCityFilter(view.inline.cityFilter);setStatusFilter(view.inline.statusFilter);setTypeFilter(view.inline.typeFilter);
      setSubtypeFilter(view.inline.subtypeFilter);setCommercialProfileFilter(view.inline.commercialProfileFilter);
      setPriorityFilter(view.inline.priorityFilter);setAssignedUserFilter(view.inline.assignedUserFilter);
      setSubscriptionFilter(view.inline.subscriptionFilter);setOriginFilter(view.inline.originFilter);
      setLoadedByFilter(view.inline.loadedByFilter);setContactMethodFilter(view.inline.contactMethodFilter);
      setCreatedByFilter(view.inline.createdByFilter);setTextFilters(view.inline.textFilters);setDateFilters(view.inline.dateFilters);
      setIdFilter(view.inline.idFilter);setRecurrentFilter(view.inline.recurrentFilter);setNotesFilter(view.inline.notesFilter);
      setNextAction(view.inline.nextAction);
    }
    setQuery(view.query);setAppliedFilterGroups(view.filterGroups);setSortBy(view.sortBy);setSortDir(view.sortDir);
    setActiveQuick("saved:"+view.name);setPage(1);
  };
  const removeSavedView=(name:string)=>{
    if(!currentUser)return;
    const previous=savedViews;
    setSavedViews(savedViews.filter(view=>view.name!==name));
    void savedViewM.mutateAsync({action:"delete",name}).catch(error=>{
      setSavedViews(previous);toast.error(error instanceof Error?error.message:"No se pudo eliminar la vista");
    });
  };

  const newLead=()=>businessMode?setBusinessEditor({}):setStartingOpportunity(true);
  const editLead=(l:any)=>{if(l.canModify===false){toast.info("Solo el responsable del negocio o un administrador puede modificarlo.");return;}if(businessMode){void getCommercialDetail(String(l.accountId)).then(detail=>setBusinessEditor({item:detail.account})).catch(error=>toast.error(error.message));return}setLastTouchedId(String(l.id));setDuplicateCandidates([]);setForm({
    id:String(l.id),scope:"opportunity",opportunityName:l.opportunityName||"Gestión comercial inicial",serviceInterest:l.serviceInterest,primaryContactId:l.primaryContactId?String(l.primaryContactId):null,estimatedCloseDate:dateOnlyInput(l.estimatedCloseDate)||null,nombre:l.nombre,contactName:l.contactName,tipo:l.tipo,subtipo:l.subtipo,ciudad:l.ciudad,estado:l.estado,suscripcion:l.suscripcion,
    email:l.email,telefono:l.telefono,sitioWeb:l.sitioWeb,urlGmap:l.urlGmap,perfilInstagram:l.perfilInstagram,perfilFacebook:l.perfilFacebook,
    perfilAirbnb:l.perfilAirbnb,perfilBooking:l.perfilBooking,perfilTurismoEntreRios:l.perfilTurismoEntreRios,origen:l.origen,
    quienCargo:l.quienCargo,asignadoA:l.asignadoA,assignedUserEmail:l.assignedUserEmail,commercialProfile:l.commercialProfile,fechaCreacion:dateInput(l.fechaCreacion),fechaUltimoContacto:dateInput(l.fechaUltimoContacto),
    medioContactoPreferido:l.medioContactoPreferido,resultadoUltimoContacto:l.resultadoUltimoContacto,prioridad:l.prioridad,
    fechaProximaAccion:dateInput(l.fechaProximaAccion),fuenteReferencia:l.fuenteReferencia,clientePotencialRecurrente:l.clientePotencialRecurrente,
    archivoAdjunto:l.archivoAdjunto,notas:null,creadoPor:l.creadoPor
  });setOpen(true)};
  const openView=(l:any)=>{if(l.deletedAt){navigate("/trash");return}if(businessMode){navigate("/accounts/"+l.accountId);return}navigate("/sales/"+l.id)};
  const selectedIndex=selectedLead?leads.findIndex(lead=>String(lead.id)===String(selectedLead.id)):-1;
  const moveView=(offset:number)=>{
    const target=leads[selectedIndex+offset];if(target)openView(target);
  };
  const saveLead=async(force=false)=>{
    return runOperation('save',async()=>{
    const result=await saveM.mutateAsync({...form,force});
    if("duplicateCandidates" in result){setDuplicateCandidates(result.duplicateCandidates);return}
    if(form.id)setLastTouchedId(String(form.id));
    setDuplicateCandidates([]);await invalidate();setOpen(false);toast.success("Gestión guardada");
    });
  };
  const requestDelete=(id:string|number,nombre:string)=>setPendingDelete({id,nombre});
  const confirmDelete=async()=>{
    return runOperation('delete',async()=>{
    if(!pendingDelete)return;
    const target=pendingDelete;
    try{
    if(businessMode)await bulkDeleteM.mutateAsync({entity,ids:[target.id]});
    else await deleteM.mutateAsync({id:target.id});
    if(selectedLead&&String(selectedLead.id)===String(target.id)){setViewOpen(false);setSelectedLead(null)}
    if(form.id&&String(form.id)===String(target.id))setOpen(false);
    setPendingDelete(null);toast.success(businessMode?"Gestiones comerciales del negocio enviadas a la papelera":"Gestión enviada a la papelera");
    }catch(error){toast.error(error instanceof Error?error.message:"No se pudo enviar a Papelera")}
    });
  };
  const quick=async(id:string|number,field:"tipo"|"subtipo"|"commercialProfile"|"ciudad"|"estado"|"prioridad"|"quienCargo"|"assignedUserEmail"|"medioContactoPreferido"|"fechaCreacion"|"fechaUltimoContacto"|"fechaProximaAccion",value:string)=>{
    return runOperation('quick:'+id+':'+field,async()=>{
    const key=String(id)+":"+field;
    const lead=leads.find(item=>String(item.id)===String(id));
    const oldRaw=lead?.[field];
    const oldValue=["fechaCreacion","fechaUltimoContacto","fechaProximaAccion"].includes(field)?dateInput(oldRaw):str(oldRaw);
    setCellState(prev=>({...prev,[key]:"saving"}));
    try{
      const mutationId=businessMode?(lead?.opportunityId??id):id;
      const accountId=businessMode?String(lead?.accountId):undefined;
      await quickM.mutateAsync({id:mutationId,accountId,field,value:value||null});
      setLastTouchedId(String(id));setCellState(prev=>({...prev,[key]:"saved"}));
      window.setTimeout(()=>setCellState(prev=>{const next={...prev};delete next[key];return next}),1300);
      toast.success("Cambio guardado",field==="tipo"?undefined:{action:{label:"Deshacer",onClick:()=>quickM.mutate({id:mutationId,accountId,field,value:oldValue||null})}});
    }catch(error){
      setCellState(prev=>{const next={...prev};delete next[key];return next});
      toast.error(error instanceof Error?error.message:"No se pudo guardar");
    }
    });
  };
  const [bulkReview,setBulkReview]=useState<BulkInput|null>(null);
  const applyBulk=async(fingerprint:string)=>{
    return runOperation('bulk',async()=>{
    if(!selectedIds.size)return;
    const changes:any={[bulkField]:bulkValue==="__CLEAR__"?null:(bulkValue||null)};
    try{
    await bulkM.mutateAsync({...bulkReview!,expectedFingerprint:fingerprint});
    setBulkReview(null);
    toast.success(`${selectedIds.size} ${businessMode?"negocios":"gestiones"} actualizados`);setSelectedIds(new Set());setBulkValue("");
    }catch(error){toast.error(error instanceof Error?error.message:"No se pudieron aplicar los cambios")}
    });
  };
  const bulkDeleteSelected=async()=>{
    return runOperation('delete',async()=>{
    if(!selectedIds.size)return;
    const count=selectedIds.size;
    try{
    await bulkDeleteM.mutateAsync({entity,ids:Array.from(selectedIds)});
    setSelectedIds(new Set());setBulkDeleteOpen(false);
    toast.success(count+(businessMode?" negocios: gestiones enviadas a papelera":" gestiones enviadas a la papelera"));
    }catch(error){toast.error(error instanceof Error?error.message:"No se pudo enviar la selección a Papelera")}
    });
  };
  const togglePageSelection=()=>{
    const ids=leads.filter(lead=>!lead.deletedAt&&lead.canModify!==false).map(lead=>String(lead.id));
    const all=ids.length>0&&ids.every(id=>selectedIds.has(id));
    setSelectedIds(prev=>{const next=new Set(prev);ids.forEach(id=>all?next.delete(id):next.add(id));return next});
  };
  const openContact=(lead:any,channel:"whatsapp"|"email")=>{if(lead.canModify===false){toast.info("Solo el responsable del negocio o un administrador puede contactar.");return;}if(businessMode){if(lead.opportunityCount!==1){toast.info("Elegí una gestión del negocio para registrar la comunicación en su historial.");openView(lead);return}lead={...lead,id:lead.opportunityId}}setLastTouchedId(String(lead.id));setContactLead(lead);setContactChannel(channel);setContactOpen(true)};
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
  const shownColumns=businessMode&&!advancedTable?["nombre","contactName","estado","fechaProximaAccion"]:visibleColumns;
  const tableWidth=shownColumns.reduce((total,key)=>total+(columnWidths[key]??DEFAULT_WIDTHS[key]??160),0)+(businessMode&&!advancedTable?124:294);

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
        {field==="fechaProximaAccion"&&<NativeSelect value={nextAction} onChange={e=>{setNextAction(e.target.value as any);resetPage()}}>
          <option value="_all">Sin atajo adicional</option>
          <option value="with">Con fecha</option>
          <option value="without">Sin fecha</option>
          <option value="overdue">Vencidas</option>
        </NativeSelect>}
      </div>;
    }
    if(key==="clientePotencialRecurrente")return <BooleanFilterEditor value={recurrentFilter} onChange={next=>{setRecurrentFilter(next);resetPage()}} labelTrue="Sí, recurrente" labelFalse="No recurrente"/>;
    return undefined;
  };

  const renderCell=(l:any,key:string)=>{
    if(l.deletedAt){if(key==="nombre")return <UnstyledButton className={styles.leadNameButton} onClick={()=>navigate("/trash")}><strong>{businessMode?l.nombre:l.opportunityName||l.nombre}</strong><small>En Papelera · Abrir para restaurar</small></UnstyledButton>;const value=l[key];return value instanceof Date?displayDate(value.toISOString()):value===true?"Sí":value===false?"No":str(value)||"—";}
    if(key==="estado"&&businessMode&&!advancedTable)return <span className={styles.relationship} data-client={l.commercialStatus==="client"}>{l.commercialStatus==="client"?"Cliente":"Potencial cliente"}</span>;
    if(key==="fechaProximaAccion"&&businessMode)return <UnstyledButton className={styles.leadNameButton} onClick={()=>openView(l)}><strong>{nextActionInfo(l.fechaProximaAccion).label}</strong><small>{l.nextActionTitle||(l.fechaProximaAccion?"Acción del equipo · Abrir para revisar":"Elegir próximo paso")}</small></UnstyledButton>;
    if(key==="nombre"&&businessMode)return <UnstyledButton className={styles.leadNameButton} onClick={()=>openView(l)}><strong>{l.nombre}</strong><small>{l.contactCount} {l.contactCount===1?"contacto":"contactos"} · {l.opportunityCount} {l.opportunityCount===1?"gestión":"gestiones"}</small></UnstyledButton>;
    if(businessMode&&!["contactName","fechaProximaAccion","fechaUltimoContacto","id","nombre","ciudad","assignedUserEmail","email","telefono","sitioWeb","urlGmap","perfilInstagram","perfilFacebook","perfilAirbnb","perfilBooking","perfilTurismoEntreRios","createdAt","updatedAt"].includes(key)&&l.opportunityCount!==1){
      const values=l.opportunityValues?.[key]??[];
      const label=values.map((v:string)=>["fechaCreacion","fechaUltimoContacto","fechaProximaAccion"].includes(key)?displayDate(v):v).join(" · ");
      return <UnstyledButton className={styles.leadNameButton} onClick={()=>openView(l)} title="Abrir negocio para elegir la gestión"><span>{label||"—"}</span><small>{l.opportunityCount?"Ver gestiones":"Agregar gestión"}</small></UnstyledButton>;
    }
    if(key==="nombre")return <UnstyledButton className={styles.leadNameButton} onClick={()=>openView(l)}><strong>{l.opportunityName||"Gestión comercial inicial"}</strong><small>{l.nombre+" · "}{l.origen||"Sin origen"}</small></UnstyledButton>;
    if(key==="id")return businessMode?(l.opportunityId||"—"):String(l.id);
    if(key==="ciudad")return <BadgeSelect disabled={l.canModify===false} className={styles.inlineBadgeSelect} value={l.ciudad??""} options={cityOptions} category="city" placeholder="Asignar ciudad" assignWhenEmpty onChange={v=>quick(l.id,"ciudad",v)}/>;
    if(key==="tipo")return <BadgeSelect disabled={l.canModify===false} className={styles.inlineBadgeSelect} value={l.tipo??""} options={typeOptions} category="vertical" placeholder="Asignar vertical" assignWhenEmpty onChange={v=>quick(l.id,"tipo",v)}/>;
    if(key==="subtipo")return l.tipo
      ? <BadgeSelect disabled={l.canModify===false} className={styles.inlineBadgeSelect} value={l.subtipo??""} options={(settings?.subtypes??[]).filter(x=>!x.typeName||x.typeName===l.tipo).map(x=>x.name)} category="subtype" placeholder="Asignar subtipo" emptyLabel="Sin subtipo" assignWhenEmpty onChange={v=>quick(l.id,"subtipo",v)}/>
      : <span className={styles.assignDependency}>Asigná vertical primero</span>;
    if(key==="commercialProfile")return <BadgeSelect disabled={l.canModify===false} className={styles.inlineBadgeSelect} value={l.commercialProfile??""} options={PROFILE_OPTIONS} category="profile" placeholder="Asignar perfil" emptyLabel="Sin perfil" assignWhenEmpty onChange={v=>quick(l.id,"commercialProfile",v)}/>;
    if(key==="estado")return <BadgeSelect disabled={l.canModify===false} className={styles.inlineBadgeSelect} value={l.estado??""} options={STATUS_OPTIONS} category="status" placeholder="Asignar estado" assignWhenEmpty onChange={v=>quick(l.id,"estado",v)}/>;
    if(key==="prioridad")return <BadgeSelect disabled={l.canModify===false} className={styles.inlineBadgeSelect} value={l.prioridad??""} options={PRIORITY_OPTIONS} category="priority" placeholder="Asignar prioridad" emptyLabel="Sin prioridad" assignWhenEmpty onChange={v=>quick(l.id,"prioridad",v)}/>;
    if(key==="quienCargo")return <BadgeSelect disabled={l.canModify===false} className={styles.inlineBadgeSelect} value={l.quienCargo??""} options={peopleOptions} category="person" placeholder="Asignar persona" assignWhenEmpty onChange={v=>quick(l.id,"quienCargo",v)}/>;
    if(key==="assignedUserEmail"){
      const label=responsibleLabel(l.assignedUserEmail)||l.asignadoA||"";
      return isAdmin
        ? <UserBadgeSelect className={styles.inlineBadgeSelect} value={l.assignedUserEmail??""} users={userOptions} placeholder="Asignar responsable" assignWhenEmpty onChange={v=>quick(l.id,"assignedUserEmail",v)}/>
        : label?<ValueBadge value={label} category="person"/>:"—";
    }
    if(key==="medioContactoPreferido")return <BadgeSelect disabled={l.canModify===false} className={styles.inlineBadgeSelect} value={l.medioContactoPreferido??""} options={CONTACT_OPTIONS} category="contact" placeholder="Asignar medio" assignWhenEmpty onChange={v=>quick(l.id,"medioContactoPreferido",v)}/>;
    if(key==="fechaProximaAccion")return <NextActionPicker disabled={l.canModify===false} compact value={l.fechaProximaAccion} onChange={value=>quick(l.id,"fechaProximaAccion",value)}/>;
    if(["fechaCreacion","fechaUltimoContacto"].includes(key))return <Input
      disabled={l.canModify===false} className={styles.inlineDate}
      type="date"
      value={dateInput(l[key])}
      onClick={e=>{e.stopPropagation();e.currentTarget.showPicker?.()}}
      onDoubleClick={e=>e.stopPropagation()}
      onChange={e=>quick(l.id,key as "fechaCreacion"|"fechaUltimoContacto",e.target.value)}
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
        <div><div className={styles.eyebrow}>GESTIÓN COMERCIAL</div><h1>{businessMode?"Negocios":"Gestiones comerciales"}</h1><p>{businessMode?"Cada fila es un negocio. Abrilo para ver sus contactos y las gestiones que estás gestionando.":"Revisá cómo avanzan las gestiones iniciadas. Cargar un negocio no inicia una gestión."}</p></div>
        <div className={styles.pageActions}><Button onClick={newLead}><Plus size={17}/>{businessMode?"Nuevo negocio":"Iniciar gestión"}</Button><Disclosure className={styles.pageTools}><DisclosureSummary>Herramientas adicionales</DisclosureSummary><div>{isAdmin&&<Button variant="outline" onClick={()=>setImportOpen(true)}>Importar CSV</Button>}<Button variant="outline" onClick={()=>setDuplicatesOpen(true)}><AlertTriangle size={16}/>Buscar duplicados</Button></div></Disclosure></div>
      </header>

      <section className={styles.toolbar}>
        <div className={styles.search}><Search size={17}/><Input value={query} onChange={e=>{setQuery(e.target.value);resetPage()}} placeholder={businessMode?"Buscar negocios, gestiones y notas…":"Buscar en gestiones y notas…"}/></div>
        <div className={styles.filters}>
          <Button variant="outline" onClick={()=>setFilterDialogOpen(true)} className={styles.filterButton}>
            <Filter size={15}/>Filtrar{appliedRuleCount>0&&<span className={styles.filterButtonCount}>{appliedRuleCount}</span>}
          </Button>
          {businessMode&&<Button variant="outline" aria-pressed={advancedTable} onClick={()=>setAdvancedTable(v=>!v)}>{advancedTable?'Vista simple':'Vista avanzada'}</Button>}{(businessMode?advancedTable:!pipelineView)&&<ColumnPicker columns={tableColumns} visible={visibleColumns} onChange={setVisibleColumns}/>}
        </div>
      </section>

      <Disclosure className={styles.advancedWorkspace}><DisclosureSummary>Resumen, vistas guardadas y ayuda</DisclosureSummary>      <section className={styles.commercialGuide} aria-label="Ayuda comercial">
      <CommercialHelp>
      {businessMode&&<p>Abrí un negocio para ver su persona de contacto, el próximo paso y sus gestiones. La próxima acción incluye las tareas generales del negocio.</p>}
      </CommercialHelp>
      </section>
      <section className={styles.metrics}>
        <UnstyledButton type="button" onClick={()=>applyQuickView("all")}><Users/><div><strong>{stats.total.toLocaleString("es-AR")}</strong><span>{businessMode?"Total de negocios":"Total de gestiones"}</span></div></UnstyledButton>
        <UnstyledButton type="button" onClick={()=>applyQuickView("pending")}><Target/><div><strong>{stats.pendientes.toLocaleString("es-AR")}</strong><span>{businessMode?"Negocios con gestiones abiertas":"Gestiones comerciales abiertas"}</span></div></UnstyledButton>
        <UnstyledButton type="button" onClick={()=>applyQuickView("today")}><CalendarClock/><div><strong>{stats.paraHoy.toLocaleString("es-AR")}</strong><span>{businessMode?"Negocios con acción hoy":"Gestiones comerciales con acción hoy"}</span></div></UnstyledButton>
        <UnstyledButton type="button" onClick={()=>applyQuickView("overdue")}><Clock3/><div><strong>{stats.vencidos.toLocaleString("es-AR")}</strong><span>{businessMode?"Negocios con acción atrasada":"Gestiones comerciales con acción atrasada"}</span></div></UnstyledButton>
        <UnstyledButton type="button" onClick={()=>applyQuickView("myToday")}><UserRound/><div><strong>{stats.misPendientesHoy.toLocaleString("es-AR")}</strong><span>Mis registros con acción hasta hoy</span></div></UnstyledButton>
        <UnstyledButton type="button" onClick={()=>applyQuickView("subscribed")}><CheckCircle2/><div><strong>{stats.suscriptos.toLocaleString("es-AR")}</strong><span>Suscriptos históricos</span></div></UnstyledButton>
      </section>

      <section className={styles.quickViews}>
        <div className={styles.quickViewList}>
          {[["all","Todos"],["mine",businessMode?"Mis negocios":"Mis gestiones"],["today","Para hoy"],["overdue","Vencidos"],["unassigned","Sin responsable"],["noNext","Sin próxima acción"]].map(([key,label])=><UnstyledButton type="button" key={key} className={activeQuick===key?styles.quickViewActive:""} onClick={()=>applyQuickView(key)}>{label}</UnstyledButton>)}
          {savedViews.map(view=><div className={styles.savedView} key={view.name}><UnstyledButton type="button" className={activeQuick==="saved:"+view.name?styles.quickViewActive:""} onClick={()=>applySavedView(view)}>{view.name}</UnstyledButton><UnstyledButton type="button" className={styles.removeSavedView} onClick={()=>removeSavedView(view.name)} title="Eliminar vista">×</UnstyledButton></div>)}
        </div>
        <Button variant="ghost" size="sm" onClick={()=>setSaveViewOpen(true)}><BookmarkPlus size={15}/>Guardar vista</Button>
      </section>

</Disclosure>
      <FilterLegend
        groups={appliedFilterGroups}
        onChange={(groups,search)=>{setAppliedFilterGroups(groups);setQuery(search);resetPage();}}
        search={query}
        fields={filterFields}
        onEdit={()=>setFilterDialogOpen(true)}
        onClear={()=>{setAppliedFilterGroups([]);setQuery("");setActiveQuick("all");resetPage()}}
      />

      {selectedIds.size>0&&<section className={styles.bulkBar}>
        <strong>{selectedIds.size} seleccionados</strong>
        <NativeSelect value={bulkField} onChange={e=>{setBulkField(e.target.value as typeof bulkField);setBulkValue("")}}>
          <option value="estado">Estado</option><option value="prioridad">Prioridad</option>
          {isAdmin&&<option value="assignedUserEmail">Responsable</option>}
          <option value="fechaProximaAccion">Próxima acción</option><option value="tipo">Vertical</option>
          <option value="commercialProfile">Perfil comercial</option><option value="ciudad">Ciudad</option>
        </NativeSelect>
        {bulkField==="fechaProximaAccion"
          ? <div className={styles.bulkDate}><NextActionPicker value={bulkValue} onChange={setBulkValue}/></div>
          : <NativeSelect value={bulkValue} onChange={e=>setBulkValue(e.target.value)}>
              <option value="">Elegir valor…</option>
              {bulkField==="estado"&&STATUS_OPTIONS.map(item=><option key={item}>{item}</option>)}
              {bulkField==="prioridad"&&<><option value="__CLEAR__">Sin prioridad</option>{PRIORITY_OPTIONS.map(item=><option key={item}>{item}</option>)}</>}
              {bulkField==="assignedUserEmail"&&<><option value="__CLEAR__">Sin responsable</option>{userOptions.map(user=><option key={user.id} value={user.email}>{user.displayName||user.email}</option>)}</>}
              {bulkField==="tipo"&&typeOptions.map(item=><option key={item}>{item}</option>)}
              {bulkField==="commercialProfile"&&<><option value="__CLEAR__">Sin perfil</option>{PROFILE_OPTIONS.map(item=><option key={item}>{item}</option>)}</>}
              {bulkField==="ciudad"&&cityOptions.map(item=><option key={item}>{item}</option>)}
            </NativeSelect>}
        {businessMode&&<span className={styles.tableHint}>{["ciudad","assignedUserEmail"].includes(bulkField)?"Modifica los datos del negocio.":"Modifica TODAS las gestiones activas de estos negocios, incluso las que no coincidan con el filtro."}</span>}
        <Button size="sm" onClick={()=>{bulkM.reset();setBulkReview({entity,ids:Array.from(selectedIds),changes:{[bulkField]:bulkValue==="__CLEAR__"?null:(bulkValue||null)}})}} disabled={bulkM.isPending||(bulkField!=="fechaProximaAccion"&&!bulkValue)}>{bulkM.isPending?"Aplicando…":"Aplicar"}</Button>
        <Button size="sm" variant="destructive" onClick={()=>setBulkDeleteOpen(true)}><Trash2 size={14}/>Enviar a papelera</Button>
        <Button size="sm" variant="ghost" onClick={()=>setSelectedIds(new Set())}>Cancelar selección</Button>
      </section>}

      {bulkReview&&<BulkChangeReview input={bulkReview} onClose={()=>setBulkReview(null)} onConfirm={applyBulk} pending={bulkM.isPending} error={bulkM.error?.message}/>}
      <section className={styles.tableCard+" "+(tableFullscreen?styles.fullscreenTable:"")}>
        <div className={styles.tableMeta}><div><strong>{total.toLocaleString("es-AR")} {businessMode?"negocios":"gestiones"}</strong><span>{pipelineView&&!businessMode?"Tablero con todos los resultados":`Página ${page} de ${Math.max(1,Math.ceil(total/50))}`}</span><span className={styles.resultsStatus} role="status" aria-live="polite" aria-atomic="true">{resultsBusy&&<><LoaderCircle size={15} className={styles.loadingSpinner} aria-hidden="true"/>{leadsQ.data?"Actualizando resultados…":"Cargando resultados…"}</>}</span></div><div className={styles.tableMetaActions}>{!businessMode&&<><Button size="sm" variant={pipelineView?"outline":"primary"} onClick={()=>setPipelineView(false)}>Tabla</Button><Button size="sm" variant={pipelineView?"primary":"outline"} disabled={includesDeletedFilter} onClick={()=>setPipelineView(true)}>Tablero comercial</Button></>}{!pipelineView&&<span className={styles.tableHint}>Los encabezados con ▾ permiten ordenar · arrastrá el borde para redimensionar</span>}<Button variant="outline" size="sm" onClick={()=>setTableFullscreen(v=>!v)}>{tableFullscreen?<Minimize2 size={15}/>:<Maximize2 size={15}/>} {tableFullscreen?"Salir":"Pantalla completa"}</Button></div></div>
        {includesDeletedFilter&&<p className={styles.deletedFilterHint}>El filtro de Papelera se aplica a las gestiones. Los registros eliminados se consultan en la tabla; abrí Papelera para restaurarlos.</p>}
        {!businessMode&&!resultsBusy&&!leadsQ.error&&!leads.length&&<section className={styles.commercialGuide}>
          <h2>{appliedRuleCount||stats.total?"Sin resultados por los filtros actuales":"Sin gestiones iniciadas"}</h2>
          <p>{appliedRuleCount||stats.total?"Revisá los filtros para encontrar la gestión que buscás.":"Cargar un negocio no inicia una gestión. Cuando prepares una propuesta, usá Iniciar gestión."}</p>
          <Button variant="outline" onClick={appliedRuleCount||stats.total?()=>{clearAllFilters();setAppliedFilterGroups([]);setQuery("")}:newLead}>{appliedRuleCount||stats.total?"Limpiar filtros":"Iniciar gestión"}</Button>
        </section>}
        <div className={styles.resultsBody+(resultsBusy&&leadsQ.data?" "+styles.resultsUpdating:"")} aria-busy={resultsBusy}>
        {leadsQ.isFetching&&!leadsQ.data?<div className={styles.loading}>{Array.from({length:8}).map((_,i)=><Skeleton key={i} className={styles.skeleton}/>)}</div>:
        leadsQ.error?<div className={styles.error}>No pude cargar {businessMode?"los negocios":"las gestiones"}: {leadsQ.error.message}</div>:
        pipelineView&&!businessMode&&!includesDeletedFilter?<PipelineBoard leads={leads} onOpen={openView}/>:<div className={styles.scroller}><Table style={{width:"100%",minWidth:tableWidth}}><colgroup>
          <col style={{width:44}}/>{shownColumns.map(key=><col key={key} style={{width:columnWidths[key]??DEFAULT_WIDTHS[key]??160}}/>)}{(!businessMode||advancedTable)&&<col style={{width:120}}/>}<col style={{width:businessMode&&!advancedTable?80:130}}/>
        </colgroup><thead><tr>
          <th className={styles.selectHead}><Checkbox disabled={!leads.some(lead=>!lead.deletedAt&&lead.canModify!==false)} checked={leads.some(lead=>!lead.deletedAt&&lead.canModify!==false)&&leads.filter(lead=>!lead.deletedAt&&lead.canModify!==false).every(lead=>selectedIds.has(String(lead.id)))} onChange={togglePageSelection}/></th>
          {shownColumns.map(key=>{
            const col=tableColumns.find(x=>x.key===key);
            if(!col)return null;
            return <th key={key} className={styles.resizableTh}>{key==="estado"&&businessMode&&!advancedTable?<span>Relación</span>:<HeaderMenu label={key==="nombre"&&businessMode?"Negocio":key==="id"&&businessMode?"ID de entrada":key==="estado"&&businessMode&&!advancedTable?"Relación":key==="fechaProximaAccion"?"Próximo paso":col.label} field={key as SortBy} sortBy={sortBy} sortDir={sortDir} onSort={sort}/>}<span className={styles.resizeHandle} onMouseDown={e=>{e.preventDefault();e.stopPropagation();startResize(key,e.clientX)}}/></th>;
          })}
          {(!businessMode||advancedTable)&&<th>Contacto</th>}<th>Acciones</th>
        </tr></thead><tbody>
          {leads.map(l=>{const id=String(l.id);return <tr key={id} className={(lastTouchedId===id?styles.lastTouchedRow:"")+" "+(selectedIds.has(id)?styles.selectedRow:"")} onDoubleClick={()=>openView(l)}>
            <td className={styles.selectCell} onDoubleClick={e=>e.stopPropagation()}><Checkbox disabled={!!l.deletedAt||l.canModify===false} checked={selectedIds.has(id)} onChange={()=>setSelectedIds(prev=>{const next=new Set(prev);next.has(id)?next.delete(id):next.add(id);return next})}/></td>
            {shownColumns.map(key=><td key={key}><div className={styles.cellClip}>{renderCell(l,key)}{cellState[id+":"+key]&&<span className={styles.cellSaveMark}>{cellState[id+":"+key]==="saving"?"Guardando…":"✓"}</span>}</div></td>)}
            {(!businessMode||advancedTable)&&<td>{!l.deletedAt&&<div className={styles.quick}>{l.telefono&&<a href={"tel:"+l.telefono} title="Llamar"><Phone size={15}/></a>}<UnstyledButton type="button" disabled={l.canModify===false} onClick={()=>openContact(l,"whatsapp")} title="WhatsApp: seleccionar contacto"><MessageCircle size={15}/></UnstyledButton><UnstyledButton type="button" disabled={l.canModify===false} onClick={()=>openContact(l,"email")} title="Email: seleccionar contacto"><Mail size={15}/></UnstyledButton>{l.sitioWeb&&<a href={l.sitioWeb} target="_blank" rel="noreferrer" title="Web"><ExternalLink size={15}/></a>}</div>}</td>}
            <td>{l.deletedAt?<Button size="sm" variant="outline" onClick={()=>navigate("/trash")}>Papelera</Button>:<div className={styles.rowActions}><Button variant="outline" size="sm" onClick={()=>openView(l)}>Abrir</Button>{(!businessMode||advancedTable)&&<><Button variant="ghost" size="icon-sm" disabled={l.canModify===false} onClick={()=>editLead(l)} title="Editar"><Pencil size={15}/></Button><Button variant="ghost" size="icon-sm" onClick={()=>requestDelete(l.id,l.nombre)} title={businessMode?"Retirar todas las gestiones de este negocio":"Enviar gestión a papelera"} disabled={l.canModify===false||(businessMode&&!l.opportunityCount)}><Trash2 size={15}/></Button></>}</div>}</td>
          </tr>})}
        </tbody></Table></div>}
        </div>
        {!(pipelineView&&!businessMode)&&<div className={styles.pagination}><Button variant="outline" disabled={page<=1} onClick={()=>setPage(p=>Math.max(1,p-1))}>Anterior</Button><span>{page} / {Math.max(1,Math.ceil(total/50))}</span><Button variant="outline" disabled={page>=Math.ceil(total/50)} onClick={()=>setPage(p=>p+1)}>Siguiente</Button></div>}
      </section>

      <Dialog open={open} onOpenChange={v=>v?setOpen(true):legacyGuard.requestClose()}>
        <DialogContent className={styles.leadEditDialog}>
          <div className={styles.editStickyHeader}>
            <div className={styles.editIdentityRow}>
              <div className={styles.editIdentity}>
                <div className={styles.editTitleLine}>
                  <DialogTitle className={styles.editTitle}>{form.id?(form.opportunityName||"Gestión comercial inicial"):"Nueva gestión"}</DialogTitle>
                  <div className={styles.editTitleBadges}>
                    {form.tipo&&<ValueBadge value={str(form.tipo)} category="vertical"/>}
                    {form.subtipo&&<ValueBadge value={str(form.subtipo)} category="subtype"/>}
                    {form.estado&&<ValueBadge value={str(form.estado)} category="status"/>}
                  </div>
                </div>
                <div className={styles.editMetaLine}>
                  <DialogDescription className={styles.editDescription}>
                    {form.id?"Editá esta gestión y su seguimiento. Para cambiar dirección, canales o personas, abrí el negocio desde el detalle.":"Completá los datos principales para crear la gestión."}
                  </DialogDescription>
                  <div className={styles.editSecondaryBadges}>
                    {form.commercialProfile&&<ValueBadge value={str(form.commercialProfile)} category="profile"/>}
                    {form.prioridad&&<ValueBadge value={str(form.prioridad)} category="priority"/>}
                  </div>
                </div>
              </div>
            </div>

            <div className={styles.editActionBar}>
              {form.id&&<Button size="sm" variant="destructive" onClick={()=>requestDelete(form.id!,form.nombre)} disabled={deleteM.isPending||bulkDeleteM.isPending}><Trash2 size={15}/>Eliminar</Button>}
              <div className={styles.editActionSpacer}/>
              <Button size="sm" variant="ghost" onClick={legacyGuard.requestClose}><X size={15}/>Cancelar</Button>
              {duplicateCandidates.length>0
                ? <Button size="sm" variant="secondary" onClick={()=>saveLead(true)} disabled={saveM.isPending}>Guardar de todas formas</Button>
                : <Button size="sm" onClick={()=>saveLead(false)} disabled={saveM.isPending||!form.opportunityName?.trim()}>{saveM.isPending?"Guardando…":"Guardar gestión"}</Button>}
            </div>
          </div>

          <div className={styles.editScrollBody}>
            <section className={styles.editSection}>
              <div className={styles.editSectionHeader}>
                <div className={styles.editSectionIcon}><Building2 size={17}/></div>
                <div><h3>Identidad y clasificación</h3><p>Cómo se identifica y cómo lo clasificamos comercialmente.</p></div>
              </div>
              <div className={styles.editGrid}>
                <label className={styles.editField+" "+styles.editSpan2}><span>Nombre de gestión</span><Input value={str(form.opportunityName)} onChange={e=>set("opportunityName",e.target.value)} placeholder="Ej: Publicación de cabañas"/></label>
                <p className={styles.editSpan2}>Negocio: <strong>{form.nombre}</strong> · Sus datos se editan por separado.</p>
                <label className={styles.editField}><span>Servicio de interés</span><Input value={str(form.serviceInterest)} onChange={e=>set("serviceInterest",e.target.value)}/></label>
                <label className={styles.editField}><span>Cierre estimado (opcional)</span><Input type="date" value={str(form.estimatedCloseDate)} onChange={e=>set("estimatedCloseDate",e.target.value||null)}/></label>
                <label className={styles.editField+" "+styles.editSpan2}><span>Persona para esta gestión</span><NativeSelect aria-label="Persona para esta gestión" value={str(form.primaryContactId)} onChange={e=>set("primaryContactId",e.target.value||null)}><option value="">Sin persona elegida</option>{businessDetailQ.data?.contacts.filter(c=>!c.deletedAt).map(c=><option key={c.id} value={String(c.id)}>{c.name}</option>)}</NativeSelect></label>
                <label className={styles.editField}><span>Vertical</span><BadgeSelect className={styles.editBadgeSelect} value={str(form.tipo)} options={typeOptions} category="vertical" onChange={v=>{set("tipo",v);set("subtipo","")}} placeholder="Seleccionar vertical…"/></label>
                <label className={styles.editField}><span>Subtipo</span><BadgeSelect className={styles.editBadgeSelect} value={str(form.subtipo)} options={subtypeOptions} category="subtype" onChange={v=>set("subtipo",v)} placeholder="Seleccionar subtipo…" emptyLabel="Sin subtipo"/></label>
                <label className={styles.editField}><span>Perfil comercial</span><BadgeSelect className={styles.editBadgeSelect} value={str(form.commercialProfile)} options={PROFILE_OPTIONS} category="profile" onChange={v=>set("commercialProfile",v||null)} placeholder="Seleccionar perfil…" emptyLabel="Sin perfil"/></label>
                <label className={styles.editField}><span>Estado</span><BadgeSelect className={styles.editBadgeSelect} value={str(form.estado)} options={STATUS_OPTIONS} category="status" onChange={v=>set("estado",v)} placeholder="Seleccionar estado…"/></label>
                <label className={styles.editField}><span>Prioridad</span><BadgeSelect className={styles.editBadgeSelect} value={form.prioridad??""} options={PRIORITY_OPTIONS} category="priority" onChange={v=>set("prioridad",v||null)} placeholder="Sin prioridad" emptyLabel="Sin prioridad"/></label>
                <label className={styles.editField+" "+styles.editSpan2}><span>Suscripción</span><Input value={str(form.suscripcion)} onChange={e=>set("suscripcion",e.target.value)}/></label>
              </div>
            </section>

            <section className={styles.editSection}>
              <div className={styles.editSectionHeader}>
                <div className={styles.editSectionIcon}><UsersRound size={17}/></div>
                <div><h3>Gestión interna</h3><p>Asignación, origen y responsables dentro del equipo.</p></div>
              </div>
              <div className={styles.editGrid}>
                <label className={styles.editField}><span>Quién cargó</span><BadgeSelect className={styles.editBadgeSelect} value={str(form.quienCargo)} options={peopleOptions} category="person" onChange={v=>set("quienCargo",v)} placeholder="Seleccionar persona…"/></label>
                <label className={styles.editField}><span>Responsable</span>{isAdmin
                  ? <UserBadgeSelect className={styles.editBadgeSelect} value={str(form.assignedUserEmail)} users={userOptions} onChange={v=>set("assignedUserEmail",v)} placeholder="Seleccionar responsable…"/>
                  : <div className={styles.readOnlyResponsible}>{form.assignedUserEmail
                      ? <ValueBadge value={responsibleLabel(form.assignedUserEmail)} category="person"/>
                      : <span>Sin asignar</span>}<small>Solo un administrador puede modificarlo</small></div>
                }</label>
                <label className={styles.editField+" "+styles.editSpan2}><span>Origen</span><Input value={str(form.origen)} onChange={e=>set("origen",e.target.value)}/></label>
                <label className={styles.editField+" "+styles.editSpan2+" "+styles.editCheckbox}><Checkbox checked={!!form.clientePotencialRecurrente} onChange={e=>set("clientePotencialRecurrente",e.target.checked)}/><span>Cliente potencial recurrente</span></label>
              </div>
            </section>

            <section className={styles.editSection}>
              <div className={styles.editSectionHeader}>
                <div className={styles.editSectionIcon}><CalendarClock size={17}/></div>
                <div><h3>Seguimiento</h3><p>Historial reciente, próxima acción y contexto de referencia.</p></div>
              </div>
              <div className={styles.editGrid}>
                <label className={styles.editField}><span>Último contacto</span><Input type="date" value={str(form.fechaUltimoContacto)} onChange={e=>set("fechaUltimoContacto",e.target.value)}/></label>
                <label className={styles.editField}><span>Próxima acción</span><NextActionPicker value={form.fechaProximaAccion} onChange={value=>set("fechaProximaAccion",value)}/></label>
                <label className={styles.editField+" "+styles.editSpan2}><span>Resultado último contacto</span><Input value={str(form.resultadoUltimoContacto)} onChange={e=>set("resultadoUltimoContacto",e.target.value)}/></label>
                <label className={styles.editField+" "+styles.editSpan2}><span>Canal preferido para esta gestión</span><BadgeSelect className={styles.editBadgeSelect} value={str(form.medioContactoPreferido)} options={CONTACT_OPTIONS} category="contact" onChange={v=>set("medioContactoPreferido",v)} placeholder="Sin definir" emptyLabel="Sin definir"/></label>
                <label className={styles.editField+" "+styles.editSpan2}><span>Archivo adjunto / URL</span><Input value={str(form.archivoAdjunto)} onChange={e=>set("archivoAdjunto",e.target.value)}/></label>
                <label className={styles.editField+" "+styles.editSpan2}><span>Fuente de referencia</span><Input value={str(form.fuenteReferencia)} onChange={e=>set("fuenteReferencia",e.target.value)}/></label>
              </div>
            </section>

            <section className={styles.editSection+" "+styles.editWideSection}>
              <div className={styles.editSectionHeader}>
                <div className={styles.editSectionIcon}><StickyNote size={17}/></div>
                <div><h3>Nueva nota</h3><p>Se agrega al historial sin reemplazar las notas anteriores.</p></div>
              </div>
              <Textarea value={str(form.notas)} onChange={e=>set("notas",e.target.value)} rows={4} placeholder="Escribí contexto, acuerdos o próximos pasos…"/>
            </section>

            {duplicateCandidates.length>0&&<div className={styles.duplicateWarning+" "+styles.editWideSection}>
              <strong><AlertTriangle size={16}/>Posible negocio duplicado</strong>
              <p>Encontré coincidencias antes de crear el registro:</p>
              {duplicateCandidates.map(d=><div key={d.id}><b>{d.nombre}</b> · {d.ciudad||"sin ciudad"} · {d.reasons.join(", ")}</div>)}
            </div>}
            {saveM.error&&<div className={styles.error+" "+styles.editWideSection}>{saveM.error.message}</div>}
          </div>
        </DialogContent>
      </Dialog>

      {importOpen&&<DataImportDialog onClose={()=>setImportOpen(false)}/>}
      {mergePair&&<AccountMergeDialog {...mergePair} onClose={()=>setMergePair(null)}/>}
      <Dialog open={duplicatesOpen} onOpenChange={setDuplicatesOpen}><DialogContent className={styles.duplicatesDialog}>
        <DialogHeader><DialogTitle>Duplicados potenciales</DialogTitle><DialogDescription>Candidatos explicados. Teléfono o email compartido puede ser una persona que atiende varios negocios. Fusionar requiere verificar identidad y permiso admin.</DialogDescription></DialogHeader>
        {duplicatesQ.isFetching?<Skeleton className={styles.duplicatesSkeleton}/>:duplicatesQ.error?<div className={styles.error}>{duplicatesQ.error.message}</div>:<div className={styles.duplicateGroups}>{(duplicatesQ.data?.groups??[]).length===0?<p>No encontré duplicados.</p>:(duplicatesQ.data?.groups??[]).map((g,i)=><section key={g.reason+g.key+i}><div className={styles.duplicateGroupTitle}><Badge variant="warning">{g.reason}</Badge><span>{g.leads.length} registros</span></div>{g.leads.map(l=><div className={styles.duplicateRow} key={l.id}><div><strong>{l.nombre}</strong><span>{l.ciudad||"—"} · {l.telefono||"sin teléfono"} · {l.email||"sin email"}</span></div>{authState.type==="authenticated"&&authState.user.role==="admin"&&g.leads.length>1&&<Button size="sm" variant="outline" onClick={()=>{setDuplicatesOpen(false);setMergePair({sourceId:l.accountId,destinationId:g.leads.find(x=>x.accountId!==l.accountId)!.accountId});}}>Revisar fusión</Button>}<Button size="sm" variant="outline" onClick={()=>{setAppliedFilterGroups([]);setQuery(l.nombre);setPage(1);setDuplicatesOpen(false)}}>Ver en tabla</Button></div>)}</section>)}</div>}
      </DialogContent></Dialog>

      <FilterBuilderDialog
        open={filterDialogOpen}
        onOpenChange={setFilterDialogOpen}
        fields={filterFields}
        value={appliedFilterGroups}
        search={query}
        title={businessMode?"Filtrar negocios":"Filtrar gestiones"}
        onApply={(groups,search)=>{setAppliedFilterGroups(groups);setQuery(search);setActiveQuick("custom");setPage(1)}}
      />
      <Dialog open={saveViewOpen} onOpenChange={setSaveViewOpen}><DialogContent className={styles.confirmDialog}>
        <DialogHeader><DialogTitle>Guardar vista</DialogTitle><DialogDescription>Conserva la búsqueda, filtros y orden actuales para volver a usarlos con un clic.</DialogDescription></DialogHeader>
        <Input value={savedViewName} onChange={e=>setSavedViewName(e.target.value)} placeholder="Ej: Alojamientos de Colón sin contactar" autoFocus/>
        <DialogFooter><Button variant="outline" onClick={()=>setSaveViewOpen(false)}>Cancelar</Button><Button onClick={saveCurrentView} disabled={!savedViewName.trim()}>Guardar vista</Button></DialogFooter>
      </DialogContent></Dialog>
      <LeadDetailDialog open={viewOpen} onOpenChange={setViewOpen} lead={selectedLead} users={userOptions} onEdit={editLead} onDelete={lead=>requestDelete(lead.id,lead.nombre)} onWhatsApp={lead=>openContact(lead,"whatsapp")} onEmail={lead=>openContact(lead,"email")} position={selectedIndex>=0?{current:selectedIndex+1,total:leads.length}:undefined} onPrevious={selectedIndex>0?()=>moveView(-1):undefined} onNext={selectedIndex>=0&&selectedIndex<leads.length-1?()=>moveView(1):undefined}/>
      {legacyGuard.confirmation}
      {businessEditor&&<CommercialEditor target={{kind:"account",item:businessEditor.item}} onClose={()=>setBusinessEditor(null)} onSaved={id=>navigate("/accounts/"+id)}/>}
      {startingOpportunity&&<OpportunityStart onClose={()=>setStartingOpportunity(false)} onCreated={id=>navigate("/sales/"+id)}/>}
      <ContactTemplateDialog open={contactOpen} onOpenChange={setContactOpen} channel={contactChannel} lead={contactLead} templates={templates.filter(x=>x.channel===contactChannel)}/>
      <Dialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}><DialogContent className={styles.confirmDialog}>
        <DialogHeader><DialogTitle>Enviar {selectedIds.size} {businessMode?"grupos de gestiones":"gestiones"} a la papelera</DialogTitle><DialogDescription>{businessMode?"Todas las gestiones activas de los negocios seleccionados irán a Papelera, incluso las que no coincidan con el filtro actual.":"Los seleccionados dejarán de aparecer en la operación normal."}</DialogDescription></DialogHeader>
        <div className={styles.confirmWarning}><AlertTriangle size={20}/><span>Sus datos, notas y journal se conservarán y podrán restaurarse desde Papelera.</span></div>
        <DialogFooter><Button variant="outline" onClick={()=>setBulkDeleteOpen(false)} disabled={bulkDeleteM.isPending}>Cancelar</Button><Button variant="destructive" onClick={bulkDeleteSelected} disabled={bulkDeleteM.isPending}>{bulkDeleteM.isPending?"Enviando…":"Enviar a papelera"}</Button></DialogFooter>
      </DialogContent></Dialog>
      <Dialog open={!!pendingDelete} onOpenChange={next=>{if(!next&&!deleteM.isPending&&!bulkDeleteM.isPending)setPendingDelete(null)}}><DialogContent className={styles.confirmDialog}>
        <DialogHeader><DialogTitle>{businessMode?"Enviar gestiones del negocio a papelera":"Enviar gestión a la papelera"}</DialogTitle><DialogDescription><strong>{pendingDelete?.nombre}</strong>: {businessMode?"todas sus gestiones activas irán a Papelera. El negocio y sus contactos conservarán su historial.":"dejará de aparecer en la tabla y en la operación normal."}</DialogDescription></DialogHeader>
        <div className={styles.confirmWarning}><AlertTriangle size={20}/><span>Sus datos, notas y journal se conservarán. El administrador podrá restaurarlo o eliminarlo definitivamente desde Papelera.</span></div>
        <DialogFooter><Button variant="outline" onClick={()=>setPendingDelete(null)} disabled={deleteM.isPending||bulkDeleteM.isPending}>Cancelar</Button><Button variant="destructive" onClick={confirmDelete} disabled={deleteM.isPending||bulkDeleteM.isPending}>{deleteM.isPending||bulkDeleteM.isPending?"Enviando…":"Enviar a papelera"}</Button></DialogFooter>
      </DialogContent></Dialog>
    </main>
  </>;
}
