import React from 'react';
import { Link } from 'react-router-dom';
import type { CommercialDetail } from '../endpoints/commercial.schema';
import type { CommercialHistoryData } from '../endpoints/businessHistory.schema';
import type { WorkTask } from '../endpoints/work.schema';
import { prettyInstant, taskBucket } from '../helpers/workDates';
import { formatDate, relativeAgo } from '../helpers/crmDates';
import { stageLabel } from '../helpers/crmLabels';
import { VOCAB, managementDisplayName } from '../content/vocabulary';
import { Button } from './Button';
import { ValueBadge } from './ValueBadge';
import { QueryErrorNotice } from './QueryErrorNotice';
import { QueryLoadingNotice } from './QueryLoadingNotice';
import type { BusinessWorkState } from './BusinessSidebar';
import styles from './Commercial.module.css';

/** Minimal view of a TanStack query result used by the summary cards. */
interface QueryView<T> {readonly data:T|undefined;readonly isPending:boolean;readonly error:Error|null;readonly isFetching:boolean;readonly refetch:()=>unknown}

/** Props of {@link BusinessSummaryTab}. */
export interface BusinessSummaryTabProps {
  readonly detail:CommercialDetail;
  readonly opportunities:CommercialDetail['opportunities'];
  /** Pending tasks of the business, already loaded by the record. */
  readonly openTasks:readonly WorkTask[];
  readonly workQuery:QueryView<unknown>;
  readonly history:QueryView<CommercialHistoryData>;
  readonly readOnly:boolean;
  readonly canDoWork:boolean;
  readonly work:BusinessWorkState;
  readonly onOpenWork:()=>void;
  readonly onSection:(section:'gestiones'|'historial')=>void;
  readonly onLogActivity:()=>void;
}

/** «Resumen» tab of the business record: open tasks, managements, recent activity and notes, without new requests. */
export function BusinessSummaryTab({detail:d,opportunities,openTasks,workQuery,history,readOnly,canDoWork,work,onOpenWork,onSection,onLogActivity}:BusinessSummaryTabProps){
  const notes=d.leadJournal.filter(item=>item.action==='note_added').slice(0,5);
  return <div className={styles.summaryGrid}>
    <section className={styles.section}>
      <h3>Tareas abiertas</h3>
      {workQuery.isPending?<QueryLoadingNotice>Cargando tareas…</QueryLoadingNotice>
        :workQuery.error?<QueryErrorNotice error={workQuery.error} onRetry={workQuery.refetch} busy={workQuery.isFetching}/>
        :openTasks.length?openTasks.map(task=>{const overdue=taskBucket(task.dueDate,task.dueAt)==='overdue';return <p key={task.id} className={overdue?styles.overdueTask:undefined}>
          <strong>{task.title}</strong><br/>
          <span>{task.opportunityName||'Negocio'} · {overdue?'Vencida · ':''}{task.dueAt?prettyInstant(task.dueAt):formatDate(task.dueDate)}</span>
        </p>})
        :<p className={styles.muted}>No hay tareas abiertas para este negocio.</p>}
      {!readOnly&&<Button variant="outline" onClick={onOpenWork}>Ver todas</Button>}
    </section>
    <section className={styles.section}>
      <h3>Gestiones</h3>
      {opportunities.slice(0,5).map(o=><p key={o.id}><Link to={'/sales/'+o.id} state={{from:'business'}}>{managementDisplayName(o)}</Link> · <ValueBadge category="status" value={stageLabel(o.estado)}/></p>)}
      {!opportunities.length&&<p className={styles.muted}>Todavía no hay gestiones.</p>}
      <Button variant="outline" onClick={()=>onSection('gestiones')}>Ver todas</Button>
    </section>
    <section className={styles.section}>
      <h3>Actividad reciente</h3>
      {history.isPending?<QueryLoadingNotice>Cargando actividad…</QueryLoadingNotice>
        :history.error?<QueryErrorNotice error={history.error} onRetry={history.refetch} busy={history.isFetching}/>
        :history.data?.events.slice(0,5).map(event=><p key={event.id}><strong>{event.title}</strong>{(event.result||event.notes)&&<> · {event.result||event.notes}</>} · {relativeAgo(event.occurredAt)}</p>)}
      {history.data&&!history.data.events.length&&<p className={styles.muted}>Todavía no hay actividad registrada.</p>}
      <Button variant="outline" onClick={()=>onSection('historial')}>Ver historial completo</Button>
    </section>
    {notes.length>0&&<section className={styles.section}>
      <h3>Notas</h3>
      {notes.map(item=><p key={item.id}>{String(item.newValue||'Nota registrada')}</p>)}
      {canDoWork&&<Button variant="outline" disabled={!work.ready} disabledReason={work.blockedReason} onClick={onLogActivity}>{VOCAB.logWhatHappened}</Button>}
    </section>}
  </div>;
}
