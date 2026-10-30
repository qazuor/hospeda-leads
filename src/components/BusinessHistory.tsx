import React,{useState} from 'react';
import {Link} from 'react-router-dom';
import {keepPreviousData,useQuery} from '@tanstack/react-query';
import {Loader} from '@mantine/core';
import {ArrowRightLeft,CalendarClock,MessageCircle,Pencil,Phone,Reply,Mail,MessageSquare,RefreshCw} from 'lucide-react';
import {getBusinessHistory} from '../endpoints/businessHistory.schema';
import {calendarDay,prettyInstant} from '../helpers/workDates';
import {formatDate} from '../helpers/crmDates';
import {outcomeLabel,responseCategoryLabel} from '../helpers/crmLabels';
import {historyActorLabel,historyChannelLabel,historyMessageStatus,historyFilterLabels,historyFilters,type HistoryFilter} from '../helpers/historyLabels';
import {historyPreview} from '../helpers/historyPreview';
import {Button} from './Button';
import {Disclosure,DisclosureSummary} from './Disclosure';
import styles from './BusinessHistory.module.css';
const kindIcons={activity:Phone,message:MessageCircle,communication:Mail,response:Reply,stage:ArrowRightLeft,change:RefreshCw} as const;
const continuations:Record<string,string>={task:'Se planificó otro paso',wait:'Se acordó esperar hasta una fecha',done:'Se decidió terminar por ahora'};
export function BusinessHistory({accountId,users=[],readOnly=false}:{accountId:string;users?:{email:string;displayName:string}[];readOnly?:boolean}){
 const [page,setPage]=useState(1),[filter,setFilter]=useState<HistoryFilter>('all'),[expanded,setExpanded]=useState(false);
 // Pending commitments only show here when the work list below is not rendered (read-only); otherwise they would appear twice.
 // Reuse commercial-detail invalidation after recording work, messages and business changes.
 const q=useQuery({queryKey:['commercial-detail','history',accountId,page,...(filter==='all'?[]:[filter])],queryFn:()=>getBusinessHistory(accountId,page,filter),placeholderData:keepPreviousData});
 const actor=(email:string|null)=>historyActorLabel({email,users});
 if(q.isPending)return <p role="status"><Loader size="sm"/> Cargando historial comercial…</p>;
 if(q.error)return <div role="alert"><p>{q.error.message}</p><Button variant="outline" disabled={q.isFetching} disabledReason="La operación está en curso. Esperá a que termine para continuar." onClick={()=>void q.refetch()}>Reintentar historial</Button></div>;
 const d=q.data;
 return <section className={styles.history} aria-label="Historial comercial">
  {readOnly&&<div className={styles.commitments}><h3><CalendarClock size={18} aria-hidden="true"/> Compromisos pendientes ({d.totalPending})</h3>
   {!d.pending.length?<p>No hay compromisos pendientes registrados.</p>:<ul>{d.pending.map(t=><li key={t.id}>
    <Link state={t.leadId?{from:'business'}:undefined} to={t.leadId?'/sales/'+t.leadId:'/accounts/'+accountId}>{t.title}</Link>
    <span>{t.dueAt?prettyInstant(t.dueAt):formatDate(calendarDay(t.dueDate))} · {actor(t.assignedUserEmail)}</span>
    <span>{t.opportunityName||'Del negocio en general'}{t.continuation==='wait'?' · Recordatorio para retomar':''}</span>
   </li>)}</ul>}
   {d.totalPending>d.pending.length&&<p>Se muestran los primeros {d.pending.length} por fecha.</p>}
  </div>}
  <header><h3><MessageCircle size={18} aria-hidden="true"/> Historial del negocio</h3><p>Contactos, respuestas, cambios de etapa y de datos, por fecha real. Los mensajes muestran su estado comprobado; abrir WhatsApp no acredita un envío.</p></header>
  <div className={styles.filters} role="group" aria-label="Filtrar el historial">{historyFilters.map(f=><Button key={f} size="sm" variant={filter===f?'primary':'outline'} aria-pressed={filter===f} disabled={q.isFetching&&filter!==f} disabledReason="Se está actualizando el historial. Esperá un momento." onClick={()=>{setFilter(f);setPage(1);setExpanded(false)}}>{historyFilterLabels[f]}</Button>)}</div>
  {!d.events.length&&<p>{filter==='all'?'Todavía no hay nada registrado en este negocio.':'No hay nada registrado en esta categoría.'}</p>}
  <ol className={styles.events}>{historyPreview(d.events,expanded).map(e=><li key={e.id} data-kind={e.kind}>
   <div className={styles.eventHead}><h4><span className={styles.eventIcon} data-kind={e.kind} data-channel={e.channel||''}>{React.createElement(e.channel==='call'&&e.kind==='message'?Phone:e.channel==='whatsapp'&&['activity','message'].includes(e.kind)?MessageSquare:e.channel==='email'&&['activity','message'].includes(e.kind)?Mail:kindIcons[e.kind],{size:16,'aria-hidden':true})}</span>{e.title}</h4><time className={styles.eventDate} dateTime={new Date(e.occurredAt).toISOString()}>{prettyInstant(e.occurredAt)}</time></div><p className={styles.meta}><span>{actor(e.actorEmail)}</span><span>{e.opportunityName||'Del negocio en general'}{e.channel?' · '+historyChannelLabel({channel:e.channel,instagram:e.isInstagram}):''}{e.recipientName?' · '+e.recipientName:''}</span></p>
   {e.messageStatus&&<p className={styles.status}>{historyMessageStatus({status:e.messageStatus,channel:e.channel,actorEmail:e.actorEmail})}</p>}
   {e.outcome&&<p><strong>Resultado: </strong>{e.kind==='response'?responseCategoryLabel(e.outcome):outcomeLabel(e.outcome)}</p>}
   {e.result&&<p className={styles.text}>{e.result}</p>}
   {e.continuation&&<p className={styles.continuation}>{continuations[e.continuation]||e.continuation}</p>}
   {(e.notes||e.messageText)&&<Disclosure><DisclosureSummary>Ver contenido registrado</DisclosureSummary>{e.notes&&<p className={styles.text}>{e.notes}</p>}{e.messageText&&<p className={styles.text}>{e.messageText}</p>}</Disclosure>}
   {e.leadId&&<Link to={'/sales/'+e.leadId} state={{from:'business'}}>Abrir gestión</Link>}
  </li>)}</ol>
  {d.events.length>5&&!expanded&&<Button size="sm" variant="outline" style={{justifySelf:'start'}} onClick={()=>setExpanded(true)}>Ver {d.events.length-5} más</Button>}
  {d.total>50&&<nav className={styles.pagination} aria-label="Páginas del historial comercial"><Button variant="outline" disabled={page===1||q.isFetching} disabledReason={(q.isFetching) ? "La operación está en curso. Esperá a que termine para continuar." : "Ya estás en la primera página."} onClick={()=>{setPage(p=>p-1);setExpanded(false)}}>Anterior</Button><span>Página {page} de {Math.ceil(d.total/50)}</span><Button variant="outline" disabled={page*50>=d.total||q.isFetching} disabledReason={(q.isFetching) ? "La operación está en curso. Esperá a que termine para continuar." : "Ya estás en la última página."} onClick={()=>{setPage(p=>p+1);setExpanded(false)}}>Siguiente</Button></nav>}
 </section>;
}
