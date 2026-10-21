import {CrmMonthInput} from '../components/ui/CrmDateInput';
import {QueryLoadingNotice} from '../components/QueryLoadingNotice';
import {QueryErrorNotice} from '../components/QueryErrorNotice';
import { Disclosure, DisclosureSummary } from '../components/Disclosure';
import { NativeSelect } from '../components/NativeSelect';
import { Input } from '../components/Input';
import { UnstyledButton } from '@mantine/core';
import React,{useState,useEffect} from 'react';
import {Link,useSearchParams} from 'react-router-dom';
import {useQuery} from '@tanstack/react-query';
import {AppHeader} from '../components/AppHeader';
import {Button} from '../components/Button';
import {TaskRow,ActivityRow,WorkPagination} from '../components/WorkPanel';
import {WorkEditor,type WorkTarget} from '../components/WorkEditor';
import {PendingOutcomes} from '../components/PendingOutcomes';
import {getWork} from '../endpoints/work.schema';
import {localDay,taskBucket} from '../helpers/workDates';
import {formatDate,formatTime} from '../helpers/crmDates';
import {useAuth} from '../helpers/useAuth';
import {VOCAB} from '../content/vocabulary';
import {dayProgress} from '../helpers/dayProgress';
import {parseTodayView,todayViews,type TodayView} from '../helpers/appNavigation';
import {SectionTabs,SectionTabList,SectionTab,SectionTabPanel} from '../components/SectionTabs';
import styles from '../components/Commercial.module.css';
import ws from '../components/Work.module.css';
const ReactivationContent=React.lazy(()=>import('./reactivation').then(m=>({default:m.ReactivationContent})));
/** Hoy (owner decision 5A): tabs Lista / Calendario (was /agenda) / Para retomar (was /reactivation), driven by `?view`. */
export default function MyDayPage(){
 const [searchParams,setSearchParams]=useSearchParams();const view=parseTodayView({value:searchParams.get('view')}),agenda=view==='calendar',retomar=view==='retomar';const requestedTask=searchParams.get('taskId'),requestedAccount=searchParams.get('accountId');const selected=!!requestedTask&&!!requestedAccount&&view==='list';
 const {authState}=useAuth();const admin=authState.type==='authenticated'&&authState.user.role==='admin';
 const [now,setNow]=useState(()=>new Date());
 useEffect(()=>{const timer=window.setInterval(()=>setNow(new Date()),30000);return ()=>window.clearInterval(timer);},[]);
 const [responsible,setResponsible]=useState('');const [city,setCity]=useState('');const [vertical,setVertical]=useState('');const [page,setPage]=useState(1);
 const [editor,setEditor]=useState<WorkTarget|null>(null);const [calendar,setCalendar]=useState(true);const [panel,setPanel]=useState<'help'|'filters'|null|undefined>(undefined);const [allAttention,setAllAttention]=useState(false);
 const [shownView,setShownView]=useState<TodayView>(view);if(shownView!==view){setShownView(view);setPage(1);setEditor(null);setCalendar(true);setPanel(undefined);}const [month,setMonth]=useState(localDay().slice(0,7));
 const monthEnd=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0)).toISOString().slice(0,10);
 const params={responsible:responsible||undefined,city:city||undefined,vertical:vertical||undefined,mode:agenda?'agenda':'day',calendar:agenda&&calendar?'true':undefined,page:String(page),from:agenda?month+'-01':undefined,to:agenda?monthEnd:undefined};
 const queryParams=selected?{mode:'detail',accountId:requestedAccount!,taskId:requestedTask!,responsible:admin?'all':undefined}:params;
 const q=useQuery({queryKey:['work',queryParams],queryFn:()=>getWork(queryParams),enabled:!retomar});const d=q.data;
 useEffect(()=>setEditor(null),[requestedTask,requestedAccount]);
 useEffect(()=>{if(!selected||q.isPending)return;const frame=requestAnimationFrame(()=>{const node=document.querySelector<HTMLElement>('[data-work-task="'+requestedTask!.replace(/[^0-9]/g,'')+'"]');node?.scrollIntoView({block:'center'});node?.focus({preventScroll:true})});return()=>cancelAnimationFrame(frame)},[selected,requestedTask,q.isPending]);
 const reset=(fn:()=>void)=>{fn();setPage(1);};
 const days=Array.from({length:Number(monthEnd.slice(8))},(_,i)=>month+'-'+String(i+1).padStart(2,'0'));
 const firstWeekday=(new Date(month+'-01T12:00:00Z').getUTCDay()+6)%7;
 return <><AppHeader/><main className={styles.shell}>
  <div className={styles.heading+" "+ws.pageHeading}><div>{!retomar&&<span className={styles.eyebrow}>{agenda?"ENCUENTROS COMERCIALES":"TRABAJO DIARIO"}</span>}<h1>Hoy</h1>{!retomar&&<p className={styles.muted}>{agenda?"Visitas y reuniones planificadas y realizadas":formatDate(localDay(now))+" · Priorizá lo vencido y lo que toca hoy"} · Horarios de Argentina</p>}</div>{!retomar&&<div className={styles.actions}><Button onClick={()=>setEditor({kind:'task'})}>{agenda?"Agendar encuentro":VOCAB.scheduleTask}</Button><Button variant="outline" onClick={()=>setEditor({kind:'activity'})}>{agenda?"Anotar encuentro realizado":VOCAB.logWhatHappened}</Button></div>}</div>
  <SectionTabs value={view} onValueChange={next=>setSearchParams(next==='list'?{}:{view:next})}><SectionTabList aria-label="Vistas de Hoy">{todayViews.map(item=><SectionTab key={item.view} value={item.view}>{item.label}</SectionTab>)}</SectionTabList>{todayViews.map(item=><SectionTabPanel key={item.view} value={item.view}>{item.view===view&&(
  retomar?<React.Suspense fallback={<QueryLoadingNotice/>}><ReactivationContent/></React.Suspense>:<>
  {(()=>{const shown=panel===undefined?(agenda?'filters':null):panel;const active=!!(city||vertical||responsible);return <>
  <div className={ws.toolbar}>{!selected&&<p className={styles.scopeLine}>{responsible==='all'?'Trabajo de todo el equipo':responsible?'Trabajo de '+(d?.users.find(u=>u.email===responsible)?.displayName||responsible):'Mi trabajo'}{city?' · '+city:''}{vertical?' · '+vertical:''}</p>}<div className={ws.toolbarButtons}><Button size="sm" variant="ghost" aria-expanded={shown==='help'} onClick={()=>setPanel(shown==='help'?null:'help')}>Cómo usar {agenda?"el calendario":"esta lista"}</Button>{!selected&&<Button size="sm" variant="ghost" aria-expanded={shown==='filters'} onClick={()=>setPanel(shown==='filters'?null:'filters')}>Filtros de trabajo{active?' · activos':''}</Button>}</div></div>
  {shown==='help'&&<section className={ws.guide}>{!agenda&&!selected&&<section className={styles.conversationContinue} aria-label="Cómo trabajar hoy"><h2>Una tarea por vez</h2><p>1. Revisá lo que corresponde hoy. 2. Contactá o hacé la tarea. 3. Anotá cómo salió y elegí cómo sigue.</p><Link to="/guide?topic=start&article=routine">Ver el recorrido con ejemplos →</Link></section>}<p>{agenda?'Agendá una visita o reunión como tarea y completala cuando ocurra. Las realizadas aparecen como actividades, sin duplicar el evento en el calendario.':'Atendé primero las vencidas, después las de hoy. Podés agendar llamada y visita simultáneamente; completar una conserva la otra. Anotar lo que pasó guarda lo ocurrido y permite cargar fechas anteriores.'}</p></section>}
  {shown==='filters'&&!selected&&<section className={ws.filterBar} aria-label="Filtros de trabajo"><div className={ws.filters}>
   {admin&&<label>Responsable<NativeSelect value={responsible} onChange={e=>reset(()=>setResponsible(e.target.value))}><option value="">Mi trabajo</option><option value="all">Todo el equipo</option>{d?.users.map(u=><option key={u.email} value={u.email}>{u.displayName}</option>)}</NativeSelect></label>}
   <label>Localidad<NativeSelect value={city} onChange={e=>reset(()=>setCity(e.target.value))}><option value="">Todas</option>{(d?.cities??[]).map(c=><option key={c} value={c!}>{c}</option>)}</NativeSelect></label>
   <label>Rubro<NativeSelect value={vertical} onChange={e=>reset(()=>setVertical(e.target.value))}><option value="">Todos (incluye negocio general)</option>{(d?.verticals??[]).map(t=><option key={t} value={t!}>{t}</option>)}</NativeSelect></label>
   {agenda&&<label>Mes<CrmMonthInput required value={month} onValueChange={value=>{if(value)reset(()=>setMonth(value));}}/></label>}
  </div>{(responsible||city||vertical)&&<Button size="sm" variant="ghost" onClick={()=>reset(()=>{setResponsible('');setCity('');setVertical('');})}>Limpiar filtros</Button>}{agenda&&<div className={ws.viewSwitch} aria-label="Vista del calendario"><Button size="sm" variant={calendar?'secondary':'ghost'} aria-pressed={calendar} onClick={()=>setCalendar(true)}>Ver como calendario</Button><Button size="sm" variant={!calendar?'secondary':'ghost'} aria-pressed={!calendar} onClick={()=>setCalendar(false)}>Ver como lista</Button></div>}</section>}
  </>})()}
  {q.isPending&&<QueryLoadingNotice/>}{q.error&&<QueryErrorNotice error={q.error} onRetry={q.refetch} busy={q.isFetching} backTo="/my-day"/> }
  {d&&selected&&<section className={styles.panel} aria-label="Pendiente seleccionado"><h2>Pendiente seleccionado</h2>{d.tasks.length?d.tasks.map(task=><TaskRow key={task.id} task={task} data={d} onEdit={setEditor} from="my-day"/>):<p>Este pendiente no está disponible en tu alcance. Puede haberse retirado o corresponder a otra persona.</p>}<Link to="/my-day">Ver todos mis pendientes</Link>{editor&&<WorkEditor key={editor.kind+('item' in editor?editor.item?.id||'new':'new')} target={editor} data={d} onClose={()=>setEditor(null)}/>}</section>}
  {d&&!selected&&<>
   {!agenda&&<PendingOutcomes items={d.pendingOutcomes}/>}
   {!agenda&&d.bucketCounts&&(()=>{const p=dayProgress({overdue:d.bucketCounts.overdue,today:d.bucketCounts.today,done:d.doneToday??0,waiting:d.pendingOutcomes?.length??0});
    if(p.kind==='finished')return <section className={ws.progress} role="status"><strong>¡Terminaste por hoy!</strong><span>Hoy: {p.done} de {p.total} hechas. Lo que sigue está en «Próximas tareas».</span></section>;
    return p.kind==='progress'?<section className={ws.progress} role="status"><strong>Hoy: {p.done} de {p.total} hechas</strong><progress value={p.done} max={p.total} aria-label="Avance de hoy"/></section>:null;})()}
   {!agenda&&d.truncated&&<p className={styles.muted} role="status">Mostramos las primeras 300 tareas vencidas o de hoy. Usá los filtros para ver el resto.</p>}
   {!agenda&&<><div className={ws.queue}>{(['overdue','today','upcoming'] as const).map((bucket,i)=>{
    const tasks=d.tasks.filter(t=>taskBucket(t.dueDate,t.dueAt,now)===bucket);
    if(!tasks.length&&!(d.bucketCounts?.[bucket]??0))return null;
    const content=<section key={bucket} className={styles.panel+' '+ws.column} data-tone={bucket}><header className={ws.columnHeader}><h2>{['Vencidas','Para hoy','Próximas tareas'][i]}</h2><span aria-label="Total de tareas">{d.bucketCounts?.[bucket]??tasks.length}</span></header>{bucket==='upcoming'&&(d.bucketCounts?.upcoming??0)>25&&<p className={styles.muted}>{tasks.length} tareas en esta página</p>}<div className={styles.rows}>{tasks.map(t=><TaskRow key={t.id} task={t} data={d} onEdit={setEditor} from="my-day"/>)}{!tasks.length&&<p className={styles.muted}>{(d.bucketCounts?.[bucket]??0)>0?"No hay más tareas en esta página.":bucket==='overdue'?"No tenés tareas vencidas.":bucket==='today'?"No hay tareas para hoy. Revisá las próximas o planificá una.":"Todavía no hay tareas futuras."}</p>}</div></section>;
    return bucket==='upcoming'?<Disclosure key={bucket} className={ws.upcoming}><DisclosureSummary>Próximas acciones ({d.bucketCounts?.upcoming??tasks.length})</DisclosureSummary>{content}</Disclosure>:content;
   })}{!d.totalTasks&&<section className={styles.panel}><h2>No hay tareas pendientes en este alcance</h2><p>Podés revisar los negocios o agregar un próximo paso.</p><Link to="/accounts">Revisar negocios</Link></section>}</div>
   {d.attention.length>0&&<section className={styles.panel+' '+ws.attention} aria-label="Gestiones sin tarea agendada"><header className={ws.attentionHeading}><h2>Gestiones sin tarea agendada ({d.attention.length})</h2><p>Gestiones que necesitan un próximo paso. Agendá una tarea para atenderlas.</p></header><Disclosure className={ws.guide}><DisclosureSummary>Qué gestiones aparecen aquí</DisclosureSummary><p>Nuevas asignadas en los últimos {d.newAssignmentDays} días sin contacto, e interesadas ({d.followupStages.join(", ")||"sin etapas configuradas"}) sin tarea pendiente.</p></Disclosure><div className={styles.rows}>{(allAttention?d.attention:d.attention.slice(0,8)).map(a=><article key={a.id}><div><Link to={'/opportunities?leadId='+a.id}><strong>{a.nombre}</strong></Link><span>{a.opportunityName||'Gestión sin nombre'} · {a.reason}</span></div><div className={styles.actions}><Button size="sm" aria-label={VOCAB.scheduleTask+' para '+a.nombre} onClick={()=>setEditor({kind:'task',accountId:a.accountId,leadId:a.id})}>{VOCAB.scheduleTask}</Button><Button size="sm" variant="outline" asChild><Link to={'/opportunities?leadId='+a.id+'&contact=email'}>{VOCAB.contact}</Link></Button></div></article>)}</div>{d.attention.length>8&&<Button size="sm" variant="ghost" onClick={()=>setAllAttention(!allAttention)}>{allAttention?'Ver menos':'Ver las '+d.attention.length}</Button>}</section>}</>}
   {agenda&&!calendar&&<div className={ws.agendaSections}><section className={styles.panel}><h2>Planificadas ({d.totalTasks})</h2><p className={styles.muted}>Encuentros pendientes de realizar.</p><div className={styles.rows}>{d.tasks.map(t=><TaskRow key={t.id} task={t} data={d} onEdit={setEditor} from="my-day"/>)}</div>{!d.tasks.length&&<p className={styles.empty}>Sin visitas o reuniones planificadas este mes.</p>}</section><section className={styles.panel}><h2>Realizadas ({d.totalActivities})</h2><p className={styles.muted}>Encuentros registrados por su fecha real.</p><div className={styles.rows}>{d.activities.map(a=><ActivityRow key={a.id} activity={a} data={d} onEdit={setEditor}/>)}</div>{!d.activities.length&&<p className={styles.empty}>Sin visitas o reuniones realizadas este mes.</p>}</section></div>}
   {agenda&&calendar&&<section className={styles.panel}><h2>{new Date(month+"-01T12:00:00Z").toLocaleDateString("es-AR",{month:"long",year:"numeric",timeZone:"UTC"})}</h2><p className={styles.muted}>Todos los encuentros del mes seleccionado.</p><div className={ws.calendarWrap}><div className={ws.calendar}>{['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'].map(day=><strong className={ws.weekLabel} key={day}>{day}</strong>)}{Array.from({length:firstWeekday},(_,i)=><div className={ws.day} key={'blank'+i}/>)}{days.map(day=><div className={ws.day} data-today={day===localDay()} key={day}><strong>{Number(day.slice(8))}</strong>{d.tasks.filter(t=>t.dueDate===day).map(t=><UnstyledButton className={ws.event} key={'t'+t.id} onClick={()=>setEditor({kind:'task',item:t})}><span className={ws.eventTime}>{t.dueAt?formatTime(t.dueAt):'Sin hora'}</span><span className={ws.eventSeparator}> · </span><span className={ws.eventTitle} title={t.title}>{t.title}</span><span className={ws.eventAccount}>{t.accountName}</span></UnstyledButton>)}{d.activities.filter(a=>localDay(new Date(a.occurredAt))===day).map(a=><UnstyledButton className={ws.event} data-done="true" key={'a'+a.id} onClick={()=>setEditor({kind:'activity',item:a})}><span className={ws.eventTime}>Realizada</span><span className={ws.eventSeparator}> · </span><span className={ws.eventTitle} title={a.title}>{a.title}</span><span className={ws.eventAccount}>{a.accountName}</span></UnstyledButton>)}</div> )}</div></div><div className={ws.calendarLegend}><span>Planificadas</span><span>Realizadas</span></div></section>}
   {!(agenda&&calendar)&&<WorkPagination data={d} page={page} onPage={setPage}/>}
   {editor&&<WorkEditor key={editor.kind+('item' in editor?editor.item?.id||'new':'new')} target={editor} data={d} onClose={()=>setEditor(null)}/>}
  </>}
  </>)}</SectionTabPanel>)}</SectionTabs>
 </main></>;
}
