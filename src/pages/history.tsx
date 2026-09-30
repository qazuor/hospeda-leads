import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { History, Search } from "lucide-react";
import { AppHeader } from "../components/AppHeader";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { Input } from "../components/Input";
import { SearchSelect } from "../components/SearchSelect";
import { Skeleton } from "../components/Skeleton";
import { getLeadJournal } from "../endpoints/lead_journal_GET.schema";
import { useDebounce } from "../helpers/useDebounce";
import styles from "./history.module.css";

const actionLabel:Record<string,string>={
  created:"Creado",
  updated:"Editado",
  inline_updated:"Cambio rápido",
  note_added:"Nota agregada",
  bulk_assigned:"Asignación inicial",
  email_sent:"Email enviado",
  soft_deleted:"Enviado a papelera",
  restored:"Restaurado",
  hard_deleted:"Eliminado definitivamente",
  deleted:"Eliminado"
};
const fieldLabel:Record<string,string>={
  nombre:"Nombre",contactName:"Persona de contacto",tipo:"Vertical",subtipo:"Subtipo",commercialProfile:"Perfil comercial",ciudad:"Ciudad",
  estado:"Estado",suscripcion:"Suscripción",email:"Email",telefono:"Teléfono",sitioWeb:"Sitio web",
  urlGmap:"Google Maps",perfilInstagram:"Instagram",perfilFacebook:"Facebook",perfilAirbnb:"Airbnb",
  perfilBooking:"Booking",perfilTurismoEntreRios:"Turismo Entre Ríos",origen:"Origen",quienCargo:"Quién cargó",
  asignadoA:"Responsable",assignedUserEmail:"Asignado a usuario",fechaCreacion:"Fecha creación",fechaUltimoContacto:"Último contacto",
  medioContactoPreferido:"Medio preferido",resultadoUltimoContacto:"Resultado último contacto",
  prioridad:"Prioridad",fechaProximaAccion:"Próxima acción",fuenteReferencia:"Fuente de referencia",
  clientePotencialRecurrente:"Potencial recurrente",archivoAdjunto:"Archivo adjunto",note:"Nota"
};
const value=(v:string|null)=>v===null||v===""?"—":v;

export default function HistoryPage(){
  const [q,setQ]=useState("");
  const [action,setAction]=useState("_all");
  const [actor,setActor]=useState("_all");
  const [city,setCity]=useState("_all");
  const [type,setType]=useState("_all");
  const [leadLabel,setLeadLabel]=useState("");
  const [page,setPage]=useState(1);
  const debounced=useDebounce(q,300);

  const journal=useQuery({
    queryKey:["global-journal",debounced,action,actor,city,type,leadLabel,page],
    queryFn:()=>getLeadJournal({
      q:debounced||undefined,
      action:action==="_all"?undefined:action,
      actor:actor==="_all"?undefined:actor,
      city:city==="_all"?undefined:city,
      type:type==="_all"?undefined:type,
      leadId:undefined,
      page,pageSize:50
    }),
    placeholderData:previous=>previous
  });
  const data=journal.data;
  const leadOptions=useMemo(
    ()=>data?.filters.leads.map(x=>x.name+" (#"+x.id+")")??[],
    [data?.filters.leads]
  );
  const selectedLeadId=useMemo(()=>{
    const match=data?.filters.leads.find(x=>x.name+" (#"+x.id+")"===leadLabel);
    return match?.id;
  },[data?.filters.leads,leadLabel]);

  const filteredJournal=useQuery({
    queryKey:["global-journal-filtered",debounced,action,actor,city,type,selectedLeadId,page],
    queryFn:()=>getLeadJournal({
      q:debounced||undefined,
      action:action==="_all"?undefined:action,
      actor:actor==="_all"?undefined:actor,
      city:city==="_all"?undefined:city,
      type:type==="_all"?undefined:type,
      leadId:selectedLeadId||undefined,
      page,pageSize:50
    }),
    enabled:!!data&&!!selectedLeadId,
    placeholderData:previous=>previous
  });
  const shown=selectedLeadId?filteredJournal:journal;
  const shownData=shown.data??data;
  const reset=()=>setPage(1);

  return <>
    <AppHeader/>
    <main className={styles.shell}>
      <header className={styles.pageHeader}>
        <div><div className={styles.eyebrow}>AUDITORÍA</div><h1>Historial global</h1><p>Cambios realizados en todos los leads, con usuario, ciudad, vertical y fecha.</p></div>
        <History size={30}/>
      </header>

      <section className={styles.toolbar}>
        <div className={styles.search}><Search size={17}/><Input value={q} onChange={e=>{setQ(e.target.value);reset()}} placeholder="Buscar campo, valor, lead o usuario…"/></div>
        <div className={styles.leadFilter}><SearchSelect value={leadLabel} options={leadOptions} onChange={v=>{setLeadLabel(v);reset()}} placeholder="Filtrar por lead…"/></div>
        <select value={actor} onChange={e=>{setActor(e.target.value);reset()}}><option value="_all">Todos los usuarios</option>{data?.filters.actors.map(x=><option key={x}>{x}</option>)}</select>
        <select value={city} onChange={e=>{setCity(e.target.value);reset()}}><option value="_all">Todas las ciudades</option>{data?.filters.cities.map(x=><option key={x}>{x}</option>)}</select>
        <select value={type} onChange={e=>{setType(e.target.value);reset()}}><option value="_all">Todas las verticales</option>{data?.filters.types.map(x=><option key={x}>{x}</option>)}</select>
        <select value={action} onChange={e=>{setAction(e.target.value);reset()}}><option value="_all">Todas las acciones</option>{data?.filters.actions.map(x=><option key={x} value={x}>{actionLabel[x]??x}</option>)}</select>
        {(leadLabel||actor!=="_all"||city!=="_all"||type!=="_all"||action!=="_all"||q)&&<Button variant="outline" onClick={()=>{setLeadLabel("");setActor("_all");setCity("_all");setType("_all");setAction("_all");setQ("");setPage(1)}}>Limpiar</Button>}
      </section>

      <section className={styles.card}>
        <div className={styles.meta}><strong>{(shownData?.total??0).toLocaleString("es-AR")} eventos</strong><span>Página {page} de {Math.max(1,Math.ceil((shownData?.total??0)/50))}</span></div>
        {shown.isLoading?<div className={styles.loading}>{Array.from({length:8}).map((_,i)=><Skeleton key={i} className={styles.skeleton}/>)}</div>:shown.error?<div className={styles.error}>{shown.error.message}</div>:<div className={styles.scroller}><table><thead><tr><th>Fecha</th><th>Lead</th><th>Ciudad</th><th>Vertical</th><th>Usuario</th><th>Acción</th><th>Campo</th><th>Anterior</th><th>Nuevo</th></tr></thead><tbody>
          {(shownData?.rows??[]).map(row=><tr key={row.id}>
            <td>{new Date(row.createdAt).toLocaleString("es-AR")}</td>
            <td><strong>{row.leadName}</strong>{row.leadId?<small>#{row.leadId}</small>:<small>eliminado</small>}</td>
            <td>{row.leadCity||"—"}</td>
            <td>{row.leadType||"—"}</td>
            <td><strong>{row.actorName}</strong><small>{row.actorEmail??""}</small></td>
            <td><Badge variant={["deleted","soft_deleted","hard_deleted"].includes(row.action)?"destructive":row.action==="created"||row.action==="restored"?"success":"outline"}>{actionLabel[row.action]??row.action}</Badge></td>
            <td>{row.fieldName?fieldLabel[row.fieldName]??row.fieldName:"—"}</td>
            <td className={styles.value}>{value(row.oldValue)}</td>
            <td className={styles.value}>{value(row.newValue)}</td>
          </tr>)}
        </tbody></table></div>}
        <div className={styles.pagination}><Button variant="outline" disabled={page<=1} onClick={()=>setPage(p=>Math.max(1,p-1))}>Anterior</Button><span>{page} / {Math.max(1,Math.ceil((shownData?.total??0)/50))}</span><Button variant="outline" disabled={page>=Math.ceil((shownData?.total??0)/50)} onClick={()=>setPage(p=>p+1)}>Siguiente</Button></div>
      </section>
    </main>
  </>;
}
