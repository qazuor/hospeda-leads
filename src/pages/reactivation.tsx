import {QueryLoadingNotice} from '../components/QueryLoadingNotice';
import {QueryErrorNotice} from '../components/QueryErrorNotice';
import { Input } from '../components/Input';
import { NativeSelect } from '../components/NativeSelect';
import React,{useState} from 'react';
import {Link} from 'react-router-dom';
import {useQuery} from '@tanstack/react-query';
import {AppHeader} from '../components/AppHeader';
import {Button} from '../components/Button';
import {PipelineEditor} from '../components/Pipeline';
import {getPipeline,type ReactivationRow} from '../endpoints/pipeline.schema';
import {formatDate} from '../helpers/crmDates';
import {localDay} from '../helpers/workDates';
import {useAuth} from '../helpers/useAuth';
import styles from '../components/Commercial.module.css';
export default function ReactivationPage(){
 const {authState}=useAuth();const admin=authState.type==='authenticated'&&authState.user.role==='admin';
 const [from,setFrom]=useState(''),[to,setTo]=useState(localDay()),[reason,setReason]=useState(''),[vertical,setVertical]=useState(''),[responsible,setResponsible]=useState(''),[handled,setHandled]=useState('no'),[page,setPage]=useState(1);
 const [target,setTarget]=useState<ReactivationRow|null>(null);const params={mode:'reactivation',...(from?{from}:{}),...(to?{to}:{}),...(reason?{reasonId:reason}:{}),...(vertical?{vertical}:{}),...(responsible?{responsible}:{}),handled,page:String(page)};
 const q=useQuery({queryKey:['pipeline','reactivation',params],queryFn:()=>getPipeline(params)});const d=q.data;
 const change=(fn:()=>void)=>{fn();setPage(1);};
 return <><AppHeader/><main className={styles.shell}><header className={styles.heading}><div><h1>Reactivación</h1><p>Gestiones comerciales perdidas con fecha para retomar. Planificá el próximo paso cuando corresponda.</p></div><Link to="/opportunities">Abrir seguimiento</Link></header><section className={styles.panel}><div className={styles.filters}>
 <label>Desde<Input type="date" value={from} onChange={e=>change(()=>setFrom(e.target.value))}/></label><label>Hasta<Input type="date" value={to} onChange={e=>change(()=>setTo(e.target.value))}/></label>
 <label>Motivo<NativeSelect value={reason} onChange={e=>change(()=>setReason(e.target.value))}><option value="">Todos</option>{d?.lossReasons.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</NativeSelect></label><label>Vertical<NativeSelect value={vertical} onChange={e=>change(()=>setVertical(e.target.value))}><option value="">Todas</option>{d?.verticals.map(v=><option key={v}>{v}</option>)}</NativeSelect></label>
 {admin&&<label>Responsable<NativeSelect value={responsible} onChange={e=>change(()=>setResponsible(e.target.value))}><option value="">Todo el equipo</option>{d?.users.map(u=><option key={u.email} value={u.email}>{u.displayName}</option>)}</NativeSelect></label>}
 <label>Seguimiento generado<NativeSelect value={handled} onChange={e=>change(()=>setHandled(e.target.value))}><option value="no">Sin planificar</option><option value="yes">Ya planificado</option><option value="all">Todos</option></NativeSelect></label></div><p className={styles.muted}>No se contacta ni se reabre automáticamente. “No contactar” bloquea las acciones de reactivación.</p></section>
 {q.error&&<QueryErrorNotice error={q.error} onRetry={q.refetch} busy={q.isFetching}/> }{q.isPending&&<QueryLoadingNotice/>}{d&&<section className={styles.panel}><h2>{d.total} gestiones para retomar</h2>{!d.reactivations.length&&<p>No hay resultados con estos filtros.</p>}<div className={styles.rows}>{d.reactivations.map(r=><article key={r.eventId}><div><Link to={'/opportunities?leadId='+r.id}><strong>{r.nombre}</strong> · {r.opportunityName||'Gestión comercial inicial'}</Link><span>{formatDate(r.recontactDate)} · {d.lossReasons.find(x=>x.id===r.reasonId)?.name} · {r.tipo||'Sin vertical'}</span><span>{d.users.find(u=>u.email===r.assignedUserEmail)?.displayName||'Sin responsable'}</span>{r.comment&&<p>{r.comment}</p>}{r.doNotContact&&<strong>No contactar</strong>}{r.taskId&&<Link to="/my-day">Seguimiento #{r.taskId}</Link>}</div><Button size="sm" disabled={r.doNotContact||!!r.taskId} onClick={()=>setTarget(r)}>Planificar</Button></article>)}</div><div className={styles.actions}><Button variant="outline" disabled={page===1} onClick={()=>setPage(p=>p-1)}>Anterior</Button><span>{page} / {Math.max(1,Math.ceil(d.total/50))}</span><Button variant="outline" disabled={page*50>=d.total} onClick={()=>setPage(p=>p+1)}>Siguiente</Button></div></section>}{target&&d&&<PipelineEditor target={{kind:'reactivate',row:target}} data={d} onClose={()=>setTarget(null)}/>}</main></>;
}
