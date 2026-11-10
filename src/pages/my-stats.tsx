import {useEffect,useMemo,type ReactNode} from 'react';
import {useQuery} from '@tanstack/react-query';
import {Bar,BarChart,CartesianGrid,Legend,ResponsiveContainer,Tooltip,XAxis,YAxis} from 'recharts';
import {BarChart3,BriefcaseBusiness,Building2,CheckCheck,ContactRound,Target} from 'lucide-react';
import {useSearchParams} from 'react-router-dom';
import {PageHeader} from '../components/PageHeader';
import {Button} from '../components/Button';
import {CrmDateInput} from '../components/ui/CrmDateInput';
import {CrmEmptyState} from '../components/ui/CrmEmptyState';
import {QueryLoadingNotice} from '../components/QueryLoadingNotice';
import {QueryErrorNotice} from '../components/QueryErrorNotice';
import {getMyStats} from '../endpoints/my_stats_GET.schema';
import {businessStatusLabels} from '../helpers/businessStatus';
import {localDay} from '../helpers/workDates';
import {parseStatsPeriod,serializeStatsPeriod,validateStatsRange,type StatsPeriod,type StatsPreset} from '../helpers/myStatsPeriod';
import styles from './my-stats.module.css';

const number=(value:number)=>value.toLocaleString('es-AR');
const presets:{value:StatsPreset;label:string}[]=[{value:'today',label:'Hoy'},{value:'week',label:'Esta semana'},{value:'month',label:'Este mes'},{value:'range',label:'Rango'}];
function Stat({label,value,help}:{label:string;value:string|number;help:string}){return <div className={styles.stat} title={help}><strong>{value}</strong><span>{label}</span><small>{help}</small></div>}
function Card({title,icon:Icon,children}:{title:string;icon:typeof Target;children:ReactNode}){return <article className={styles.card}><h2><Icon size={19}/>{title}</h2>{children}</article>}
/** Seller-only statistics for the selected Argentina calendar period. */
export default function MyStatsPage(){
 const [params,setParams]=useSearchParams();
 const period=useMemo(()=>parseStatsPeriod(params),[params]);
 const rangeError=period.preset==='range'?validateStatsRange(period.from,period.to):null;
 useEffect(()=>{const raw=params.get('period');if((!params.has('period')&&!params.has('from')&&!params.has('to'))||(raw!==null&&!['today','week','month'].includes(raw))||(!period.valid&&period.preset==='month'))setParams(new URLSearchParams('period=month'),{replace:true});},[params,period,setParams]);
 const query=useQuery({queryKey:['myStats',period.from,period.to],queryFn:()=>getMyStats({from:period.from,to:period.to}),enabled:period.valid&&!rangeError});
 const selectPreset=(preset:StatsPreset)=>{
  if(preset==='range'){
   const today=localDay(),initial:StatsPeriod={preset:'range',from:`${today.slice(0,7)}-01`,to:today,valid:true,message:null};
   setParams(new URLSearchParams(serializeStatsPeriod(initial)));
  }else setParams(new URLSearchParams(serializeStatsPeriod({...period,preset,valid:true,message:null})));
 };
 const setRange=(key:'from'|'to',value:string)=>{const next={...period,[key]:value,valid:true,message:null};setParams(new URLSearchParams(serializeStatsPeriod(next)));};
 const data=query.data;
 const empty=data&&data.work.completed===0&&data.managements.won===0&&data.managements.lost===0&&data.contacts.events===0&&data.series.points.every(point=>point.contacts===0&&point.won===0);
 return <main className={styles.shell}>
  <PageHeader eyebrow="TRABAJO" title="Mis estadísticas" description="Tus números del período elegido" topic="myStats"/>
  <section className={styles.period} aria-label="Período"><div className={styles.presets}>{presets.map(item=><Button key={item.value} variant={period.preset===item.value?'primary':'outline'} size="sm" aria-pressed={period.preset===item.value} onClick={()=>selectPreset(item.value)}>{item.label}</Button>)}</div>
   {period.preset==='range'&&<div className={styles.range}><label>Desde<CrmDateInput value={period.from} onValueChange={value=>setRange('from',value)}/></label><label>Hasta<CrmDateInput value={period.to} onValueChange={value=>setRange('to',value)}/></label></div>}
  </section>
  {rangeError&&<p className={styles.validation} role="alert">{rangeError}</p>}
  {query.isPending&&period.valid&&!rangeError&&<QueryLoadingNotice>Cargando tus estadísticas…</QueryLoadingNotice>}
  {query.error&&<QueryErrorNotice error={query.error} onRetry={query.refetch} busy={query.isFetching} backTo="/my-day"/>}
  {data&&<>
   {empty&&<CrmEmptyState>Todavía no hay movimientos en este período</CrmEmptyState>}
   <section className={styles.grid}>
    <Card title="Mi trabajo" icon={CheckCheck}><div className={styles.stats}><Stat label="Tareas completadas" value={number(data.work.completed)} help="Tareas tuyas completadas durante el período."/><Stat label="Vencidas · ahora" value={number(data.work.overdue)} help="Tareas pendientes vencidas al día de hoy."/><Stat label="Para hoy · ahora" value={number(data.work.today)} help="Tareas pendientes con vencimiento hoy."/></div></Card>
    <Card title="Mis negocios" icon={Building2}><p className={styles.now}>Foto actual · ahora, sin importar el período</p><div className={styles.stats}><Stat label="Total" value={number(data.businesses.total)} help="Negocios activos asignados a vos."/><Stat label="No contactar" value={number(data.businesses.doNotContact)} help="Negocios marcados para no contactar."/></div><p className={styles.help}>Distribución actual por estado del negocio:</p><ul className={styles.rows}>{data.businesses.byStatus.map(row=><li key={row.status}><span>{businessStatusLabels[row.status as keyof typeof businessStatusLabels]??row.status}</span><b>{number(row.count)}</b></li>)}</ul></Card>
    <Card title="Mis gestiones" icon={BriefcaseBusiness}><p className={styles.now}>Abiertas y sin movimiento: foto actual · ahora</p><div className={styles.stats}><Stat label="Abiertas" value={number(data.managements.open)} help="Gestiones abiertas que hoy están asignadas a vos."/><Stat label="Ganadas" value={number(data.managements.won)} help="Gestiones con último cierre ganado por vos en el período."/><Stat label="Perdidas" value={number(data.managements.lost)} help="Gestiones con último cierre perdido por vos en el período."/><Stat label="Tasa de cierre" value={data.managements.closeRate===null?'—':`${data.managements.closeRate.toLocaleString('es-AR',{minimumFractionDigits:1,maximumFractionDigits:1})}%`} help="Ganadas sobre ganadas más perdidas."/><Stat label="Sin movimiento · ahora" value={number(data.managements.stale)} help="Gestiones abiertas sin actividad por más de 30 días."/></div><h3>Motivos de pérdida</h3><p className={styles.help}>Distribución de las gestiones cuyo último cierre del período fue perdido.</p><ul className={styles.rows}>{data.managements.lossReasons.length?data.managements.lossReasons.map(row=><li key={row.reason}><span>{row.reason}</span><b>{number(row.count)}</b></li>):<li>Sin pérdidas en el período</li>}</ul></Card>
    <Card title="Mis contactos" icon={ContactRound}><div className={styles.stats}><Stat label="Eventos reales" value={number(data.contacts.events)} help="Envío confirmado, respuesta o resultado registrado. No cuenta abrir WhatsApp ni un borrador."/><Stat label="Negocios distintos" value={number(data.contacts.businesses)} help="Cantidad de negocios únicos con contacto real tuyo."/><Stat label="Días hasta el primer contacto" value={data.contacts.firstContactAverageDays===null?'—':data.contacts.firstContactSamples<3?'Pocos datos':`${data.contacts.firstContactAverageDays.toLocaleString('es-AR',{maximumFractionDigits:1})} días`} help={`Promedio en ${number(data.contacts.firstContactSamples)} gestiones con primer contacto observable.`}/></div><p className={styles.help}>{data.contacts.firstContactSamples<3?'Pocos datos: se necesitan al menos 3 casos.':`${number(data.contacts.firstContactSamples)} casos incluidos en el promedio.`}</p><p className={styles.help}><strong>Contacto real:</strong> envío confirmado, respuesta o resultado registrado. No cuenta abrir WhatsApp ni un borrador.</p></Card>
    <Card title="Evolución" icon={BarChart3}><p>Contactos reales y gestiones ganadas por {data.series.granularity==='day'?'día':'semana'}.</p><div className={styles.chart}><ResponsiveContainer width="100%" height="100%"><BarChart data={data.series.points}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="period" tick={{fontSize:10}}/><YAxis allowDecimals={false}/><Tooltip/><Legend/><Bar dataKey="contacts" name="Contactos reales" fill="var(--primary)"/><Bar dataKey="won" name="Ganadas" fill="var(--success)"/></BarChart></ResponsiveContainer></div></Card>
   </section>
  </>}
 </main>;
}
