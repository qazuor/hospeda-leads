import React,{useState} from 'react';
import {Link} from 'react-router-dom';
import {useQuery} from '@tanstack/react-query';
import {Loader} from '@mantine/core';
import {CalendarClock,MessageCircle} from 'lucide-react';
import {getBusinessHistory} from '../endpoints/businessHistory.schema';
import {calendarDay,prettyInstant} from '../helpers/workDates';
import {formatDate} from '../helpers/crmDates';
import {workOutcomes,type WorkOutcome} from '../helpers/workOutcomes';
import {messageLabels} from '../helpers/messageLabels';
import {Button} from './Button';
import {Disclosure,DisclosureSummary} from './Disclosure';
import styles from './BusinessHistory.module.css';
const channels:Record<string,string>={phone:'Teléfono',whatsapp:'WhatsApp',email:'Email',presencial:'Presencial',videollamada:'Videollamada',other:'Otro'};
const continuations:Record<string,string>={task:'Se planificó otro paso',wait:'Se acordó esperar hasta una fecha',done:'Se decidió terminar por ahora'};
export function BusinessHistory({accountId,users=[],readOnly=false,onFollow}:{accountId:string;users?:{email:string;displayName:string}[];readOnly?:boolean;onFollow?:()=>void}){
 const [page,setPage]=useState(1);
 // Reuse commercial-detail invalidation after recording work, messages and business changes.
 const q=useQuery({queryKey:['commercial-detail','history',accountId,page],queryFn:()=>getBusinessHistory(accountId,page)});
 const actor=(email:string|null)=>users.find(u=>u.email===email)?.displayName||email||'Sin responsable registrado';
 if(q.isPending)return <p role="status"><Loader size="sm"/> Cargando historial comercial…</p>;
 if(q.error)return <div role="alert"><p>{q.error.message}</p><Button variant="outline" disabled={q.isFetching} onClick={()=>void q.refetch()}>Reintentar historial</Button></div>;
 const d=q.data;
 return <section className={styles.history} aria-label="Historial comercial">
  <div className={styles.commitments}><h3><CalendarClock size={18} aria-hidden="true"/> Compromisos pendientes ({d.totalPending})</h3>
   {!d.pending.length?<p>No hay compromisos pendientes registrados.</p>:<ul>{d.pending.map(t=><li key={t.id}>
    <Link onClick={!t.leadId&&!readOnly?onFollow:undefined} to={t.leadId?'/sales/'+t.leadId:'/accounts/'+accountId+(readOnly?'':'?section=work')}>{t.title}</Link>
    <span>{t.dueAt?prettyInstant(t.dueAt):formatDate(calendarDay(t.dueDate))} · {actor(t.assignedUserEmail)}</span>
    <span>{t.opportunityName||'Seguimiento general del negocio'}{t.continuation==='wait'?' · Recordatorio para retomar':''}</span>
   </li>)}</ul>}
   {d.totalPending>d.pending.length&&<p>Se muestran los primeros {d.pending.length} por fecha. <Link onClick={!readOnly?onFollow:undefined} to={'/accounts/'+accountId+(readOnly?'':'?section=work')}>Ver seguimiento</Link></p>}
  </div>
  <header><h3><MessageCircle size={18} aria-hidden="true"/> Conversaciones y resultados</h3><p>Acciones registradas por fecha real. Los mensajes muestran su estado comprobado; abrir WhatsApp no acredita un envío.</p></header>
  {!d.events.length&&<p>No hay conversaciones ni resultados registrados todavía.</p>}
  <ol className={styles.events}>{d.events.map(e=><li key={e.id}>
   <div className={styles.meta}><time dateTime={new Date(e.occurredAt).toISOString()}>{prettyInstant(e.occurredAt)}</time><span>{actor(e.actorEmail)}</span></div>
   <h4>{e.title}</h4><p className={styles.meta}>{e.opportunityName||'Seguimiento general del negocio'}{e.channel?' · '+(channels[e.channel]||e.channel):''}{e.recipientName?' · '+e.recipientName:''}</p>
   {e.messageStatus&&<p className={styles.status}>{messageLabels[e.messageStatus]||'Estado histórico: '+e.messageStatus}</p>}
   {e.outcome&&<p><strong>Resultado: </strong>{workOutcomes[e.outcome as WorkOutcome]||e.outcome}</p>}
   {e.result&&<p className={styles.text}>{e.result}</p>}
   {e.continuation&&<p className={styles.continuation}>{continuations[e.continuation]||e.continuation}</p>}
   {(e.notes||e.messageText)&&<Disclosure><DisclosureSummary>Ver contenido registrado</DisclosureSummary>{e.notes&&<p className={styles.text}>{e.notes}</p>}{e.messageText&&<p className={styles.text}>{e.messageText}</p>}</Disclosure>}
   {e.leadId&&<Link to={'/sales/'+e.leadId}>Abrir gestión</Link>}
  </li>)}</ol>
  {d.total>50&&<nav className={styles.pagination} aria-label="Páginas del historial comercial"><Button variant="outline" disabled={page===1||q.isFetching} onClick={()=>setPage(p=>p-1)}>Anterior</Button><span>Página {page} de {Math.ceil(d.total/50)}</span><Button variant="outline" disabled={page*50>=d.total||q.isFetching} onClick={()=>setPage(p=>p+1)}>Siguiente</Button></nav>}
 </section>;
}
