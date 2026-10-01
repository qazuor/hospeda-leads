import React,{useState,useEffect} from 'react';
import {Link} from 'react-router-dom';
import {useQuery} from '@tanstack/react-query';
import {AppHeader} from '../components/AppHeader';
import {Button} from '../components/Button';
import {TaskRow,ActivityRow,WorkPagination} from '../components/WorkPanel';
import {WorkEditor,type WorkTarget} from '../components/WorkEditor';
import {getWork} from '../endpoints/work.schema';
import {localDay,taskBucket} from '../helpers/workDates';
import {formatDate} from '../helpers/crmDates';
import {useAuth} from '../helpers/useAuth';
import styles from '../components/Commercial.module.css';
import ws from '../components/Work.module.css';
export default function MyDayPage({agenda=false}:{agenda?:boolean}){
 const {authState}=useAuth();const admin=authState.type==='authenticated'&&authState.user.role==='admin';
 const [now,setNow]=useState(()=>new Date());
 useEffect(()=>{const timer=window.setInterval(()=>setNow(new Date()),30000);return ()=>window.clearInterval(timer);},[]);
 const [responsible,setResponsible]=useState('');const [city,setCity]=useState('');const [vertical,setVertical]=useState('');const [page,setPage]=useState(1);
 const [editor,setEditor]=useState<WorkTarget|null>(null);const [calendar,setCalendar]=useState(false);const [month,setMonth]=useState(localDay().slice(0,7));
 const monthEnd=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0)).toISOString().slice(0,10);
 const params={responsible:responsible||undefined,city:city||undefined,vertical:vertical||undefined,mode:agenda?'agenda':'day',page:String(page),from:agenda?month+'-01':undefined,to:agenda?monthEnd:undefined};
 const q=useQuery({queryKey:['work',params],queryFn:()=>getWork(params)});const d=q.data;
 const reset=(fn:()=>void)=>{fn();setPage(1);};
 const days=Array.from({length:Number(monthEnd.slice(8))},(_,i)=>month+'-'+String(i+1).padStart(2,'0'));
 const firstWeekday=(new Date(month+'-01T12:00:00Z').getUTCDay()+6)%7;
 const heading=agenda?'Agenda de visitas y reuniones':'Mi día';
 return <><AppHeader/><main className={styles.shell}>
  <div className={styles.heading+" "+ws.pageHeading}><div><span className={styles.eyebrow}>{agenda?"ENCUENTROS COMERCIALES":"TRABAJO DIARIO"}</span><h1>{heading}</h1><p className={styles.muted}>{agenda?"Visitas y reuniones planificadas y realizadas":formatDate(localDay(now))+" · Priorizá lo vencido y lo que toca hoy"} · Horarios de Argentina</p></div><div className={styles.actions}><Button onClick={()=>setEditor({kind:'task'})}>Nueva tarea</Button><Button variant="outline" onClick={()=>setEditor({kind:'activity'})}>Registrar actividad</Button></div></div>
  <details className={ws.guide}><summary>Cómo usar {agenda?"la agenda":"Mi día"}</summary><p>{agenda?'Planificá una visita o reunión como tarea y completala cuando ocurra. Las realizadas aparecen como actividades, sin duplicar el evento en el calendario.':'Atendé primero las vencidas, después las de hoy. Podés planificar llamada y visita simultáneamente; completar una conserva la otra. Registrar actividad guarda lo ocurrido y permite cargar fechas anteriores.'}</p></details>
  <section className={ws.filterBar} aria-label="Filtros de trabajo"><div className={styles.filters}>
   {admin&&<label>Responsable<select value={responsible} onChange={e=>reset(()=>setResponsible(e.target.value))}><option value="">Mi trabajo</option><option value="all">Todo el equipo</option>{d?.users.map(u=><option key={u.email} value={u.email}>{u.displayName}</option>)}</select></label>}
   <label>Localidad<select value={city} onChange={e=>reset(()=>setCity(e.target.value))}><option value="">Todas</option>{[...new Set(d?.accounts.map(a=>a.ciudad).filter(Boolean))].sort().map(c=><option key={c} value={c!}>{c}</option>)}</select></label>
   <label>Vertical<select value={vertical} onChange={e=>reset(()=>setVertical(e.target.value))}><option value="">Todos (incluye negocio general)</option>{[...new Set(d?.opportunities.map(o=>o.tipo).filter(Boolean))].sort().map(t=><option key={t} value={t!}>{t}</option>)}</select></label>
   {agenda&&<label>Mes<input type="month" required value={month} onChange={e=>{if(e.target.value)reset(()=>setMonth(e.target.value));}}/></label>}
  </div>{(responsible||city||vertical)&&<Button size="sm" variant="ghost" onClick={()=>reset(()=>{setResponsible('');setCity('');setVertical('');})}>Limpiar filtros</Button>}{agenda&&<div className={ws.viewSwitch} aria-label="Vista de agenda"><Button size="sm" variant={!calendar?'secondary':'ghost'} aria-pressed={!calendar} onClick={()=>setCalendar(false)}>Ver lista</Button><Button size="sm" variant={calendar?'secondary':'ghost'} aria-pressed={calendar} onClick={()=>setCalendar(true)}>Ver calendario</Button></div>}</section>
  {q.isPending&&<p>Cargando…</p>}{q.error&&<p role="alert">{q.error.message}</p>}
  {d&&<>
   {!agenda&&<><div className={ws.columns}>{(['overdue','today','upcoming'] as const).map((bucket,i)=>{
    const tasks=d.tasks.filter(t=>taskBucket(t.dueDate,t.dueAt,now)===bucket);
    return <section key={bucket} className={styles.panel+' '+ws.column} data-tone={bucket}><header className={ws.columnHeader}><h2>{['Vencidas','Para hoy','Próximas tareas'][i]}</h2><span aria-label="Total de tareas">{d.bucketCounts?.[bucket]??tasks.length}</span></header>{(d.bucketCounts?.[bucket]??0)>25&&<p className={styles.muted}>{tasks.length} tareas en esta página</p>}<div className={styles.rows}>{tasks.map(t=><TaskRow key={t.id} task={t} data={d} onEdit={setEditor}/>)}{!tasks.length&&<p className={styles.muted}>Sin tareas en esta página.</p>}</div></section>;
   })}</div>
   <section className={styles.panel}><header className={ws.attentionHeading}><h2>Sin seguimiento planificado ({d.attention.length})</h2><p>Oportunidades que necesitan un próximo paso. Planificá una tarea para atenderlas.</p></header><details className={ws.guide}><summary>Qué oportunidades aparecen aquí</summary><p>Nuevas asignadas en los últimos {d.newAssignmentDays} días sin contacto, e interesadas ({d.followupStages.join(", ")||"sin etapas configuradas"}) sin tarea pendiente.</p></details><div className={styles.rows}>{d.attention.map(a=><article key={a.id}><div><Link to={'/opportunities?leadId='+a.id}><strong>{a.nombre}</strong></Link><span>{a.opportunityName||'Gestión comercial inicial'} · {a.reason}</span></div><div className={styles.actions}><Button size="sm" onClick={()=>setEditor({kind:'task',accountId:a.accountId,leadId:a.id})}>Planificar seguimiento</Button><Button size="sm" variant="outline" asChild><Link to={'/opportunities?leadId='+a.id+'&contact=whatsapp'}>Contactar</Link></Button></div></article>)}</div>{!d.attention.length&&<p className={styles.muted}>Sin oportunidades pendientes de planificar.</p>}</section></>}
   {agenda&&!calendar&&<div className={ws.agendaSections}><section className={styles.panel}><h2>Planificadas ({d.totalTasks})</h2><p className={styles.muted}>Encuentros pendientes de realizar.</p><div className={styles.rows}>{d.tasks.map(t=><TaskRow key={t.id} task={t} data={d} onEdit={setEditor}/>)}</div>{!d.tasks.length&&<p className={styles.empty}>Sin visitas o reuniones planificadas este mes.</p>}</section><section className={styles.panel}><h2>Realizadas ({d.totalActivities})</h2><p className={styles.muted}>Encuentros registrados por su fecha real.</p><div className={styles.rows}>{d.activities.map(a=><ActivityRow key={a.id} activity={a} data={d} onEdit={setEditor}/>)}</div>{!d.activities.length&&<p className={styles.empty}>Sin visitas o reuniones realizadas este mes.</p>}</section></div>}
   {agenda&&calendar&&<section className={styles.panel}><h2>{new Date(month+"-01T12:00:00Z").toLocaleDateString("es-AR",{month:"long",year:"numeric",timeZone:"UTC"})}</h2>{Math.max(d.totalTasks,d.totalActivities)>100&&<p>El calendario muestra la página actual. Usá los controles inferiores para ver los demás eventos.</p>}<div className={ws.calendarWrap}><div className={ws.calendar}>{['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'].map(day=><strong className={ws.weekLabel} key={day}>{day}</strong>)}{Array.from({length:firstWeekday},(_,i)=><div className={ws.day} key={'blank'+i}/>)}{days.map(day=><div className={ws.day} data-today={day===localDay()} key={day}><strong>{Number(day.slice(8))}</strong>{d.tasks.filter(t=>t.dueDate===day).map(t=><button className={ws.event} key={'t'+t.id} onClick={()=>setEditor({kind:'task',item:t})}>{t.dueAt?new Date(t.dueAt).toLocaleTimeString('es-AR',{timeZone:'America/Argentina/Buenos_Aires',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}):'Sin hora'} · {t.title}<br/>{t.accountName}</button>)}{d.activities.filter(a=>localDay(new Date(a.occurredAt))===day).map(a=><button className={ws.event} data-done="true" key={'a'+a.id} onClick={()=>setEditor({kind:'activity',item:a})}>Realizada · {a.title}<br/>{a.accountName}</button>)}</div> )}</div></div><div className={ws.calendarLegend}><span>Planificadas</span><span>Realizadas</span></div></section>}
   <WorkPagination data={d} page={page} onPage={setPage}/>
   {editor&&<WorkEditor key={editor.kind+('item' in editor?editor.item?.id||'new':'new')} target={editor} data={d} onClose={()=>setEditor(null)}/>}
  </>}
 </main></>;
}
