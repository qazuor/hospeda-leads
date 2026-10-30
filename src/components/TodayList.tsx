import React,{useState} from 'react';
import type {ReactNode} from 'react';
import {Link} from 'react-router-dom';
import {Button} from './Button';
import {HelpLink} from './HelpLink';
import {Disclosure,DisclosureSummary} from './Disclosure';
import {QueryErrorNotice} from './QueryErrorNotice';
import {PendingOutcomes} from './PendingOutcomes';
import {TaskRow} from './WorkPanel';
import {TodayReplies} from './TodayReplies';
import type {WorkTarget} from './WorkEditor';
import type {WorkData} from '../endpoints/work.schema';
import type {InboundReview} from '../endpoints/communication.schema';
import {URGENT_CAP} from '../endpoints/work.schema';
import {taskBucket} from '../helpers/workDates';
import {urgentCapNotice} from '../helpers/dayProgress';
import {upcomingDayLabel} from '../helpers/upcomingDays';
import {VOCAB} from '../content/vocabulary';
import styles from './Commercial.module.css';
import ws from './Work.module.css';
import ls from './TodayList.module.css';

/** Props of {@link TodayList}. */
export interface TodayListProps{data:WorkData;now:Date;admin:boolean;filtered:boolean;inboundRows:InboundReview[];inboundError:Error|null;inboundBusy:boolean;onInboundRetry:()=>void;firstSteps:ReactNode;calendar?:ReactNode;onEdit:(target:WorkTarget)=>void;onClearFilters:()=>void;onFocusFilters:()=>void}
const bucketMeta={overdue:{title:'Vencidas',id:'today-overdue',empty:'No tenés tareas vencidas.'},today:{title:'Para hoy',id:'today-due-today',empty:'No hay tareas para hoy. Revisá las próximas o planificá una.'},upcoming:{title:'Próximas tareas',id:undefined,empty:'Todavía no agendaste tareas para otros días.'}} as const;
/** One reading order for both widths: desktop splits it into the work (left) and context (right) columns, narrow screens interleave them. */
const order={outcomes:1,notice:2,overdue:3,today:4,replies:5,upcoming:6,calendar:7,attention:8,empty:9,firstSteps:10} as const;
const at=(key:keyof typeof order):React.CSSProperties=>({order:order[key]});

/** Lista tab of Hoy (Phase 5): work on the left; replies, mini calendar and Primeros pasos on the right. */
export function TodayList({data:d,now,admin,filtered,inboundRows,inboundError,inboundBusy,onInboundRetry,firstSteps,calendar,onEdit,onClearFilters,onFocusFilters}:TodayListProps){
 const [allAttention,setAllAttention]=useState(false);
 const bucket=(key:keyof typeof bucketMeta)=>{
  const tasks=d.tasks.filter(t=>taskBucket(t.dueDate,t.dueAt,now)===key),total=d.bucketCounts?.[key]??tasks.length,meta=bucketMeta[key];
  if(!tasks.length&&!(d.bucketCounts?.[key]??0))return null;
  const content=<section className={styles.panel+' '+ws.column} id={meta.id} tabIndex={meta.id?-1:undefined} data-tone={key} style={key==='upcoming'?undefined:at(key)}><header className={ws.columnHeader}><h2>{meta.title}</h2><span aria-label="Total de tareas">{total}</span></header>{key==='upcoming'&&(d.bucketCounts?.upcoming??0)>25&&<p className={styles.muted}>{tasks.length} tareas en esta página</p>}<div className={styles.rows}>{tasks.map((t,index)=><React.Fragment key={t.id}>{key==='upcoming'&&(!index||tasks[index-1].dueDate!==t.dueDate)&&<h3 className={ws.dayGroup}>{upcomingDayLabel(t.dueDate,t.dueAt,now)}</h3>}<TaskRow task={t} data={d} onEdit={onEdit} from="my-day"/></React.Fragment>)}{!tasks.length&&<p className={styles.muted}>{total>0?'No hay más tareas en esta página.':meta.empty}</p>}</div></section>;
  return key==='upcoming'?<Disclosure className={ws.upcoming} style={at('upcoming')}><DisclosureSummary>Próximas acciones ({total})</DisclosureSummary>{content}</Disclosure>:content;
 };
 return <div className={ls.layout}>
  <div className={ws.queue+' '+ls.work}>
   {!!d.pendingOutcomes?.length&&<div style={at('outcomes')} className={ls.slot}><PendingOutcomes items={d.pendingOutcomes} className={ws.outcomeCard}/></div>}
   {d.truncated&&d.bucketCounts&&<section className={styles.muted} style={at('notice')} role="status" aria-label="Tareas que no entran en la lista">{urgentCapNotice({overdue:d.bucketCounts.overdue,today:d.bucketCounts.today,cap:URGENT_CAP,admin}).map(line=><p key={line}>{line}</p>)}<Button size="sm" variant="outline" onClick={onFocusFilters}>Abrir filtros de trabajo</Button></section>}
   {bucket('overdue')}{bucket('today')}{bucket('upcoming')}
   {d.attention.length>0&&<section className={styles.panel+' '+ws.attention} style={at('attention')} id="today-attention" tabIndex={-1} aria-label="Gestiones sin tarea agendada"><header className={ws.attentionHeading}><h2>Gestiones sin tarea agendada ({d.attention.length}) <HelpLink topic="managements" hint="attention"/></h2><p>Gestiones que necesitan un próximo paso. Agendá una tarea para atenderlas.</p></header><Disclosure className={ws.guide}><DisclosureSummary>Qué gestiones aparecen aquí</DisclosureSummary><p>Nuevas asignadas en los últimos {d.newAssignmentDays} días sin contacto, e interesadas ({d.followupStages.join(', ')||'sin etapas configuradas'}) sin tarea pendiente.</p></Disclosure><div className={styles.rows}>{(allAttention?d.attention:d.attention.slice(0,8)).map(a=><article key={a.id}><div><Link to={'/opportunities?leadId='+a.id}><strong>{a.nombre}</strong></Link><span>{a.opportunityName||'Gestión sin nombre'} · {a.reason}</span></div><div className={styles.actions}><Button size="sm" aria-label={VOCAB.scheduleTask+' para '+a.nombre} onClick={()=>onEdit({kind:'task',accountId:a.accountId,leadId:a.id})}>{VOCAB.scheduleTask}</Button><Button size="sm" variant="outline" asChild><Link to={'/opportunities?leadId='+a.id+'&contact=email'}>{VOCAB.contact}</Link></Button></div></article>)}</div>{d.attention.length>8&&<Button size="sm" variant="ghost" onClick={()=>setAllAttention(!allAttention)}>{allAttention?'Ver menos':'Ver las '+d.attention.length}</Button>}</section>}
   {!d.totalTasks&&filtered&&<section className={styles.panel} style={at('empty')} aria-label="Sin tareas con filtros"><h2>No hay tareas con estos filtros</h2><p>Probá con otra localidad, rubro o responsable.</p><div className={styles.actions}><Button variant="outline" onClick={onClearFilters}>Limpiar filtros</Button></div></section>}
   {!d.totalTasks&&!filtered&&<section className={styles.panel+' '+ws.emptyDay} style={at('empty')} aria-label="Todavía no hay tareas"><h2>Todavía no tenés tareas pendientes</h2><dl><div><dt>Vencidas</dt><dd>Acá aparece lo que se te pasó de fecha, para que lo retomes primero.</dd></div><div><dt>Para hoy</dt><dd>Las tareas que tocan hoy. Ejemplo: «Llamar a la panadería para ofrecerle el plan».</dd></div><div><dt>Próximas tareas</dt><dd>Lo que agendaste para los próximos días.</dd></div></dl><div className={styles.actions}><Button onClick={()=>onEdit({kind:'task'})}>Agendar mi primera tarea</Button><Button variant="outline" asChild><Link to="/accounts">Revisar negocios</Link></Button></div></section>}
  </div>
  <div className={ls.context}>
   {inboundError&&!inboundRows.length&&<section className={styles.panel+' '+ws.unifiedCard} style={at('replies')} data-tone="sky" aria-label="Respuestas nuevas"><header className={ws.unifiedHeader}><h2>Respuestas nuevas <HelpLink topic="inbox" hint="newReplies"/></h2></header><QueryErrorNotice error={inboundError} onRetry={onInboundRetry} busy={inboundBusy}/></section>}
   {/* Shown only when there is something new: no loading panel, so Hoy does not jump on every load. */}
   {!!inboundRows.length&&<section className={styles.panel+' '+ws.unifiedCard} style={at('replies')} data-tone="sky" id="today-inbound" tabIndex={-1} aria-label="Respuestas nuevas"><header className={ws.unifiedHeader}><h2>Respuestas nuevas <HelpLink topic="inbox" hint="newReplies"/></h2><span>{inboundRows.length}</span></header><TodayReplies rows={inboundRows}/></section>}
   {calendar&&<div style={at('calendar')} className={ls.slot}>{calendar}</div>}
   {firstSteps&&<div style={at('firstSteps')} className={ls.slot}>{firstSteps}</div>}
  </div>
 </div>;
}
