import {CrmEmptyState} from '../components/ui/CrmEmptyState';
import {QueryLoadingNotice} from '../components/QueryLoadingNotice';
import {QueryErrorNotice} from '../components/QueryErrorNotice';
import { NativeSelect } from '../components/NativeSelect';
import { UnstyledButton } from '@mantine/core';
import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, CheckCircle2, Clock3, ContactRound, Sparkles, Target, UserRoundCheck, Users, Webhook, Zap } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AppHeader } from "../components/AppHeader";
import { Button } from "../components/Button";
import { Input } from "../components/Input";
import { Skeleton } from "../components/Skeleton";
import { getAnalytics } from "../endpoints/analytics_GET.schema";
import { getSettings } from "../endpoints/settings_GET.schema";
import { toDateInput } from "../helpers/crmDates";
import styles from "./analytics.module.css";

const ago=(days:number)=>{const d=new Date();d.setDate(d.getDate()-days);return toDateInput(d)};

export default function AnalyticsPage(){
  const navigate=useNavigate();
  const [period,setPeriod]=useState("all"),[from,setFrom]=useState(""),[to,setTo]=useState("");
  const [responsible,setResponsible]=useState(""),[type,setType]=useState(""),[city,setCity]=useState("");
  const effectiveFrom=period==="30"?ago(29):period==="90"?ago(89):period==="custom"?from:"";
  const effectiveTo=period==="30"||period==="90"?toDateInput(new Date()):period==="custom"?to:"";
  const settings=useQuery({queryKey:["settings"],queryFn:getSettings});
  const q=useQuery({queryKey:["analytics",effectiveFrom,effectiveTo,responsible,type,city],queryFn:()=>getAnalytics({from:effectiveFrom||undefined,to:effectiveTo||undefined,responsible:responsible||undefined,type:type||undefined,city:city||undefined})});
  const cohort=new URLSearchParams({...(effectiveFrom?{cohortFrom:effectiveFrom}:{}),...(effectiveTo?{cohortTo:effectiveTo}:{}),...(responsible?{cohortOwner:responsible}:{}),...(type?{cohortType:type}:{}),...(city?{cohortCity:city}:{})}).toString();
  const drill=(field:string,value:string)=>navigate("/opportunities?"+cohort+"&filterField="+encodeURIComponent(field)+"&filterValue="+encodeURIComponent(value));
  const quick=(name:string)=>navigate("/opportunities?"+cohort+"&quick="+encodeURIComponent(name));
  if(q.isPending)return <><AppHeader/><main className={styles.shell}><QueryLoadingNotice>Cargando informe…</QueryLoadingNotice></main></>;
  if(!q.data)return <><AppHeader/><main className={styles.shell}><QueryErrorNotice error={q.error!} onRetry={q.refetch} busy={q.isFetching}/></main></>;
  const d=q.data!;
  const coverage=[{name:"Con teléfono",count:d.withPhone},{name:"Con email",count:d.withEmail},{name:"Con web",count:d.withWebsite}];

  return <><AppHeader/><main className={styles.shell}>
 {q.error&&<QueryErrorNotice error={q.error} onRetry={q.refetch} busy={q.isFetching}/>}
    <header className={styles.pageHeader}><div><div className={styles.eyebrow}>REPORTES</div><h1>Estadísticas</h1><p>Pipeline, actividad y conversión con acceso directo a las gestiones que explican cada número; los estados comerciales no acreditan pagos.</p></div><BarChart3 size={28}/></header>
    <section className={styles.filters}>
      <label>Período de alta<NativeSelect value={period} onChange={e=>setPeriod(e.target.value)}><option value="all">Todo el historial</option><option value="30">Últimos 30 días</option><option value="90">Últimos 90 días</option><option value="custom">Personalizado</option></NativeSelect></label>
      {period==="custom"&&<><label>Desde<Input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label><label>Hasta<Input type="date" value={to} onChange={e=>setTo(e.target.value)}/></label></>}
      <label>Responsable<NativeSelect value={responsible} onChange={e=>setResponsible(e.target.value)}><option value="">Todos</option>{settings.data?.users.map(user=><option key={user.id} value={user.email}>{user.displayName}</option>)}</NativeSelect></label>
      <label>Vertical<NativeSelect value={type} onChange={e=>setType(e.target.value)}><option value="">Todas</option>{settings.data?.types.map(item=><option key={item}>{item}</option>)}</NativeSelect></label>
      <label>Ciudad<NativeSelect value={city} onChange={e=>setCity(e.target.value)}><option value="">Todas</option>{settings.data?.cities.map(item=><option key={item.id}>{item.name}</option>)}</NativeSelect></label>
      {(period!=="all"||responsible||type||city)&&<Button variant="ghost" size="sm" onClick={()=>{setPeriod("all");setFrom("");setTo("");setResponsible("");setType("");setCity("")}}>Limpiar</Button>}
    </section>

    <section className={styles.metrics}>
      <UnstyledButton onClick={()=>quick("all")}><Users/><div><strong>{d.total.toLocaleString("es-AR")}</strong><span>Gestiones comerciales del corte</span></div></UnstyledButton>
      <UnstyledButton onClick={()=>quick("pending")}><Target/><div><strong>{d.pending.toLocaleString("es-AR")}</strong><span>Pendientes</span></div></UnstyledButton>
      <UnstyledButton onClick={()=>quick("subscribed")}><CheckCircle2/><div><strong>{d.subscribed.toLocaleString("es-AR")}</strong><span>Suscriptos históricos</span></div></UnstyledButton>
      <UnstyledButton onClick={()=>quick("overdue")}><Clock3/><div><strong>{d.overdue.toLocaleString("es-AR")}</strong><span>Vencidos</span></div></UnstyledButton>
      <UnstyledButton onClick={()=>quick("contacted")}><UserRoundCheck/><div><strong>{d.contacted.toLocaleString("es-AR")}</strong><span>Con contacto registrado</span></div></UnstyledButton>
      <UnstyledButton onClick={()=>quick("noContact")}><Zap/><div><strong>{d.noContact.toLocaleString("es-AR")}</strong><span>Sin contactar</span></div></UnstyledButton>
      <UnstyledButton onClick={()=>quick("inactive30")}><Webhook/><div><strong>{d.inactive30.toLocaleString("es-AR")}</strong><span>Sin actividad 30 días</span></div></UnstyledButton>
      <UnstyledButton onClick={()=>quick("new7")}><Sparkles/><div><strong>{d.new7.toLocaleString("es-AR")}</strong><span>Nuevos últimos 7 días</span></div></UnstyledButton>
      <article title={d.firstContactSamples?d.firstContactSamples+" gestiones con primer contacto observable en el journal":"Todavía no hay muestras suficientes"}><ContactRound/><div><strong>{d.avgDaysToFirstContact===null?"—":d.avgDaysToFirstContact.toLocaleString("es-AR")+" d"}</strong><span>Al 1er contacto observado</span></div></article>
      <article><BarChart3/><div><strong>{d.conversionRate.toLocaleString("es-AR")}%</strong><span>Gestiones comerciales ganadas sobre el total</span></div></article>
    </section>

    <section className={styles.chartCard}><h2>Resultados comerciales explícitos</h2><p>Abiertas: {d.pipelineOpen} · Ganadas: {d.pipelineWon} · Perdidas: {d.pipelineLost}. “Suscripto” histórico conserva su clasificación abierta; no acredita una gestión ni un pago.</p><h3>Motivos de cierre perdido</h3><p>Cuenta cierres observados de las gestiones del corte, aunque luego se reabran; una gestión puede tener varios cierres.</p>{d.lossReasons.map(r=><p key={r.name}>{r.name}: {r.count}</p>)}</section>
    {d.total===0?<CrmEmptyState>No hay actividad comercial para los filtros seleccionados. Los gráficos aparecerán cuando haya gestiones en este período.</CrmEmptyState>:<section className={styles.charts}>
      <article className={styles.chartCard}><h2>Gestiones comerciales por ciudad</h2><p>Hacé clic en una barra para abrir esas gestiones.</p><div className={styles.chart}><ResponsiveContainer width="100%" height="100%"><BarChart data={d.byCity} layout="vertical" margin={{left:20,right:20}}><CartesianGrid strokeDasharray="3 3"/><XAxis type="number"/><YAxis dataKey="name" type="category" width={125} tick={{fontSize:11}}/><Tooltip/><Bar dataKey="count" fill="var(--primary)" radius={[0,5,5,0]} cursor="pointer" onClick={(entry:any)=>entry?.name&&drill("ciudad",entry.name)}/></BarChart></ResponsiveContainer></div></article>
      <article className={styles.chartCard}><h2>Estado del pipeline</h2><p>Distribución comercial actual.</p><div className={styles.chart}><ResponsiveContainer width="100%" height="100%"><BarChart data={d.byStatus}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="name" tick={{fontSize:10}} interval={0} angle={-20} textAnchor="end" height={65}/><YAxis/><Tooltip/><Bar dataKey="count" fill="var(--secondary)" radius={[5,5,0,0]} cursor="pointer" onClick={(entry:any)=>entry?.name&&drill("estado",entry.name)}/></BarChart></ResponsiveContainer></div></article>
      <article className={styles.chartCard}><h2>Gestiones comerciales por vertical</h2><p>Comparación entre las verticales comerciales.</p><div className={styles.chart}><ResponsiveContainer width="100%" height="100%"><BarChart data={d.byType}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="name" tick={{fontSize:10}} interval={0} angle={-15} textAnchor="end" height={60}/><YAxis/><Tooltip/><Bar dataKey="count" fill="var(--primary)" radius={[5,5,0,0]} cursor="pointer" onClick={(entry:any)=>entry?.name&&drill("tipo",entry.name)}/></BarChart></ResponsiveContainer></div></article>
      <article className={styles.chartCard}><h2>Por responsable</h2><p>Carga actual del equipo.</p><div className={styles.chart}><ResponsiveContainer width="100%" height="100%"><BarChart data={d.byResponsible} layout="vertical" margin={{left:20,right:20}}><CartesianGrid strokeDasharray="3 3"/><XAxis type="number"/><YAxis dataKey="name" type="category" width={125} tick={{fontSize:10}}/><Tooltip/><Bar dataKey="count" fill="var(--analytics)" radius={[0,5,5,0]} cursor="pointer" onClick={(entry:any)=>{if(!entry?.name)return;if(entry.name==="Sin responsable")quick("unassigned");else{const email=settings.data?.users.find(user=>user.displayName===entry.name)?.email;if(email)drill("assignedUserEmail",email)}}}/></BarChart></ResponsiveContainer></div></article>
      <article className={styles.chartCard}><h2>Subtipos más frecuentes</h2><p>Top 15 categorías.</p><div className={styles.chart}><ResponsiveContainer width="100%" height="100%"><BarChart data={d.bySubtype} layout="vertical" margin={{left:20,right:20}}><CartesianGrid strokeDasharray="3 3"/><XAxis type="number"/><YAxis dataKey="name" type="category" width={135} tick={{fontSize:10}}/><Tooltip/><Bar dataKey="count" fill="var(--info)" radius={[0,5,5,0]} cursor="pointer" onClick={(entry:any)=>entry?.name&&drill("subtipo",entry.name)}/></BarChart></ResponsiveContainer></div></article>
      <article className={styles.chartCard}><h2>Origen de las gestiones</h2><p>Top fuentes de captación.</p><div className={styles.chart}><ResponsiveContainer width="100%" height="100%"><BarChart data={d.byOrigin} layout="vertical" margin={{left:20,right:20}}><CartesianGrid strokeDasharray="3 3"/><XAxis type="number"/><YAxis dataKey="name" type="category" width={130} tick={{fontSize:10}}/><Tooltip/><Bar dataKey="count" fill="var(--analytics)" radius={[0,5,5,0]} cursor="pointer" onClick={(entry:any)=>entry?.name&&drill("origen",entry.name)}/></BarChart></ResponsiveContainer></div></article>
      <article className={styles.chartCard}><h2>Calidad de contacto</h2><p>Registros con canales accionables.</p><div className={styles.chart}><ResponsiveContainer width="100%" height="100%"><BarChart data={coverage}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="name"/><YAxis/><Tooltip/><Bar dataKey="count" fill="var(--success)" radius={[5,5,0,0]}/></BarChart></ResponsiveContainer></div></article>
      <article className={styles.chartCard}><h2>Altas por fecha</h2><p>Evolución temporal del corte seleccionado.</p><div className={styles.chart}><ResponsiveContainer width="100%" height="100%"><LineChart data={d.createdByDay}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="date" tick={{fontSize:10}}/><YAxis/><Tooltip/><Line type="monotone" dataKey="count" stroke="var(--primary)" strokeWidth={3} dot={{r:3}}/></LineChart></ResponsiveContainer></div></article>
      <article className={styles.chartCard+" "+styles.conversionCard}><h2>Conversión por vertical</h2><p>Gestiones comerciales ganadas sobre el total de gestiones de cada vertical dentro del corte.</p><div className={styles.conversionList}>{d.byTypeConversion.map(row=><UnstyledButton key={row.name} onClick={()=>drill("tipo",row.name)}><span>{row.name}</span><b>{row.subscribed}/{row.total}</b><strong>{row.rate.toLocaleString("es-AR")}%</strong></UnstyledButton>)}</div></article>
      <article className={styles.chartCard}><h2>Conversión por responsable</h2><p>Gestiones comerciales ganadas / todas las propuestas del corte actualmente asignadas a cada integrante.</p><div className={styles.compactList}>{d.byResponsibleConversion.map(row=>{const email=settings.data?.users.find(user=>user.displayName===row.name)?.email;return <UnstyledButton key={row.name} onClick={()=>row.name==="Sin responsable"?quick("unassigned"):email&&drill("assignedUserEmail",email)}><span>{row.name}</span><b>{row.subscribed}/{row.total}</b><strong>{row.rate.toLocaleString("es-AR")}%</strong></UnstyledButton>})}</div></article>
      <article className={styles.chartCard}><h2>Tiempo observado por estado</h2><p>Promedio de días entre cambios de estado registrados en el journal. No inventa historia anterior a la auditoría.</p><div className={styles.compactList}>{d.avgDaysByStatus.map(row=><UnstyledButton key={row.name} onClick={()=>drill("estado",row.name)}><span>{row.name}</span><b>{row.samples} tramos</b><strong>{row.days.toLocaleString("es-AR")} d</strong></UnstyledButton>)}</div></article>
    </section>}
  </main></>;
}