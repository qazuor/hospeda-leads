import { Table } from '@mantine/core';
import { NativeSelect } from '../components/NativeSelect';
import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { History, Search } from "lucide-react";
import { Link } from "react-router-dom";
import { AppHeader } from "../components/AppHeader";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { Input } from "../components/Input";
import { SearchSelect } from "../components/SearchSelect";
import { Skeleton } from "../components/Skeleton";
import { getLeadJournal } from "../endpoints/lead_journal_GET.schema";
import { formatDate, journalValue, toDateInput } from "../helpers/crmDates";
import { useDebounce } from "../helpers/useDebounce";
import styles from "./history.module.css";

const actionLabel:Record<string,string>={
  created:"Creado",updated:"Editado",inline_updated:"Cambio rápido",bulk_updated:"Edición masiva",
  note_added:"Nota agregada",bulk_assigned:"Asignación inicial",email_sent:"Email enviado",contact_logged:"Contacto registrado",
  soft_deleted:"Enviado a papelera",restored:"Restaurado",hard_deleted:"Eliminado definitivamente",deleted:"Eliminado"
};
const fieldLabel:Record<string,string>={
  nombre:"Nombre",contactName:"Persona de contacto",tipo:"Vertical",subtipo:"Subtipo",commercialProfile:"Perfil comercial",ciudad:"Ciudad",
  estado:"Estado",suscripcion:"Suscripción",email:"Email",telefono:"Teléfono",sitioWeb:"Sitio web",urlGmap:"Google Maps",
  perfilInstagram:"Instagram",perfilFacebook:"Facebook",perfilAirbnb:"Airbnb",perfilBooking:"Booking",perfilTurismoEntreRios:"Turismo Entre Ríos",
  origen:"Origen",quienCargo:"Quién cargó",asignadoA:"Responsable",assignedUserEmail:"Responsable",fechaCreacion:"Fecha creación",
  fechaUltimoContacto:"Último contacto",medioContactoPreferido:"Medio preferido",resultadoUltimoContacto:"Resultado último contacto",
  prioridad:"Prioridad",fechaProximaAccion:"Próxima acción",fuenteReferencia:"Fuente de referencia",
  clientePotencialRecurrente:"Potencial recurrente",archivoAdjunto:"Archivo adjunto",note:"Nota"
};
const dateAgo=(days:number)=>{const d=new Date();d.setDate(d.getDate()-days);return toDateInput(d)};

export default function HistoryPage(){
  const [q,setQ]=useState("");
  const [action,setAction]=useState("_all"),[actor,setActor]=useState("_all"),[city,setCity]=useState("_all"),[type,setType]=useState("_all");
  const [leadLabel,setLeadLabel]=useState("");
  const [datePreset,setDatePreset]=useState("all");
  const [from,setFrom]=useState(""),[to,setTo]=useState("");
  const [page,setPage]=useState(1);
  const debounced=useDebounce(q,300);
  const effectiveFrom=datePreset==="today"?toDateInput(new Date()):datePreset==="7"?dateAgo(6):datePreset==="30"?dateAgo(29):datePreset==="custom"?from:"";
  const effectiveTo=datePreset==="today"||datePreset==="7"||datePreset==="30"?toDateInput(new Date()):datePreset==="custom"?to:"";

  const journal=useQuery({
    queryKey:["global-journal",debounced,action,actor,city,type,leadLabel,effectiveFrom,effectiveTo,page],
    queryFn:()=>getLeadJournal({q:debounced||undefined,action:action==="_all"?undefined:action,actor:actor==="_all"?undefined:actor,city:city==="_all"?undefined:city,type:type==="_all"?undefined:type,from:effectiveFrom||undefined,to:effectiveTo||undefined,page,pageSize:50}),
    placeholderData:previous=>previous
  });
  const data=journal.data;
  const leadOptions=useMemo(()=>data?.filters.leads.map(x=>x.name+" (#"+x.id+")")??[],[data?.filters.leads]);
  const selectedLeadId=useMemo(()=>data?.filters.leads.find(x=>x.name+" (#"+x.id+")"===leadLabel)?.id,[data?.filters.leads,leadLabel]);
  const filteredJournal=useQuery({
    queryKey:["global-journal-filtered",debounced,action,actor,city,type,selectedLeadId,effectiveFrom,effectiveTo,page],
    queryFn:()=>getLeadJournal({q:debounced||undefined,action:action==="_all"?undefined:action,actor:actor==="_all"?undefined:actor,city:city==="_all"?undefined:city,type:type==="_all"?undefined:type,leadId:selectedLeadId||undefined,from:effectiveFrom||undefined,to:effectiveTo||undefined,page,pageSize:50}),
    enabled:!!data&&!!selectedLeadId,placeholderData:previous=>previous
  });
  const shown=selectedLeadId?filteredJournal:journal,shownData=shown.data??data;
  const reset=()=>setPage(1);
  const clear=()=>{setLeadLabel("");setActor("_all");setCity("_all");setType("_all");setAction("_all");setQ("");setDatePreset("all");setFrom("");setTo("");setPage(1)};

  return <><AppHeader/><main className={styles.shell}>
    <header className={styles.pageHeader}><div><div className={styles.eyebrow}>AUDITORÍA</div><h1>Historial global</h1><p>Cambios realizados en todos las gestiones, con usuario, contexto y fecha.</p></div><History size={30}/></header>
    <section className={styles.toolbar}>
      <div className={styles.search}><Search size={17}/><Input value={q} onChange={e=>{setQ(e.target.value);reset()}} placeholder="Buscar campo, valor, gestión o usuario…"/></div>
      <div className={styles.leadFilter}><SearchSelect value={leadLabel} options={leadOptions} onChange={v=>{setLeadLabel(v);reset()}} placeholder="Filtrar por gestión…"/></div>
      <NativeSelect value={datePreset} onChange={e=>{setDatePreset(e.target.value);reset()}}><option value="all">Todo el historial</option><option value="today">Hoy</option><option value="7">Últimos 7 días</option><option value="30">Últimos 30 días</option><option value="custom">Rango personalizado</option></NativeSelect>
      {datePreset==="custom"&&<><Input type="date" value={from} onChange={e=>{setFrom(e.target.value);reset()}}/><Input type="date" value={to} onChange={e=>{setTo(e.target.value);reset()}}/></>}
      <NativeSelect value={actor} onChange={e=>{setActor(e.target.value);reset()}}><option value="_all">Todos los usuarios</option>{data?.filters.actors.map(x=><option key={x}>{x}</option>)}</NativeSelect>
      <NativeSelect value={city} onChange={e=>{setCity(e.target.value);reset()}}><option value="_all">Todas las ciudades</option>{data?.filters.cities.map(x=><option key={x}>{x}</option>)}</NativeSelect>
      <NativeSelect value={type} onChange={e=>{setType(e.target.value);reset()}}><option value="_all">Todas las verticales</option>{data?.filters.types.map(x=><option key={x}>{x}</option>)}</NativeSelect>
      <NativeSelect value={action} onChange={e=>{setAction(e.target.value);reset()}}><option value="_all">Todas las acciones</option>{data?.filters.actions.map(x=><option key={x} value={x}>{actionLabel[x]??x}</option>)}</NativeSelect>
      {(leadLabel||actor!=="_all"||city!=="_all"||type!=="_all"||action!=="_all"||q||datePreset!=="all")&&<Button variant="outline" onClick={clear}>Limpiar</Button>}
    </section>
    <section className={styles.card}>
      <div className={styles.meta}><strong>{(shownData?.total??0).toLocaleString("es-AR")} eventos</strong><span>Página {page} de {Math.max(1,Math.ceil((shownData?.total??0)/50))}</span></div>
      {shown.isLoading?<div className={styles.loading}>{Array.from({length:8}).map((_,i)=><Skeleton key={i} className={styles.skeleton}/>)}</div>:shown.error?<div className={styles.error}>{shown.error.message}</div>:<div className={styles.scroller}><Table><thead><tr><th>Fecha</th><th>Gestión</th><th>Ciudad</th><th>Vertical</th><th>Usuario</th><th>Acción</th><th>Campo</th><th>Cambio</th></tr></thead><tbody>
        {(shownData?.rows??[]).map(row=><tr key={row.id}>
          <td>{formatDate(row.createdAt,true)}</td>
          <td>{row.leadId?<Link className={styles.leadLink} to={"/?leadId="+row.leadId}><strong>{row.leadName}</strong><small>#{row.leadId}</small></Link>:<><strong>{row.leadName}</strong><small>eliminado</small></>}</td>
          <td>{row.leadCity||"Vacío"}</td><td>{row.leadType||"Vacío"}</td>
          <td><strong>{row.actorName}</strong><small>{row.actorEmail??""}</small></td>
          <td><Badge variant={["deleted","soft_deleted","hard_deleted"].includes(row.action)?"destructive":row.action==="created"||row.action==="restored"?"success":"outline"}>{actionLabel[row.action]??row.action}</Badge></td>
          <td>{row.fieldName?fieldLabel[row.fieldName]??row.fieldName:"—"}</td>
          <td className={styles.change}>{row.fieldName?<><span>{journalValue(row.fieldName,row.oldValue)}</span><b>→</b><strong>{journalValue(row.fieldName,row.newValue)}</strong></>:"—"}</td>
        </tr>)}
      </tbody></Table></div>}
      <div className={styles.pagination}><Button variant="outline" disabled={page<=1} onClick={()=>setPage(p=>Math.max(1,p-1))}>Anterior</Button><span>{page} / {Math.max(1,Math.ceil((shownData?.total??0)/50))}</span><Button variant="outline" disabled={page>=Math.ceil((shownData?.total??0)/50)} onClick={()=>setPage(p=>p+1)}>Siguiente</Button></div>
    </section>
  </main></>;
}