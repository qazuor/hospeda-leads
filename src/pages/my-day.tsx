import {QueryLoadingNotice} from '../components/QueryLoadingNotice';
import {QueryErrorNotice} from '../components/QueryErrorNotice';
import { UnstyledButton } from '@mantine/core';
import React,{useState,useEffect} from 'react';
import {Link,useSearchParams} from 'react-router-dom';
import {useQuery} from '@tanstack/react-query';
import {Button} from '../components/Button';
import {TaskRow,ActivityRow,WorkPagination} from '../components/WorkPanel';
import {WorkEditor,type WorkTarget} from '../components/WorkEditor';
import {FirstStepsChecklist} from '../components/FirstStepsChecklist';
import {firstStepItems,showFirstSteps,useFirstStepsStorage} from '../helpers/firstSteps';
import {getWork} from '../endpoints/work.schema';
import {getInboundReview} from '../endpoints/communication.schema';
import {localDay} from '../helpers/workDates';
import {formatDate,formatTime} from '../helpers/crmDates';
import {useAuth} from '../helpers/useAuth';
import {VOCAB} from '../content/vocabulary';
import {usePageHelp} from '../components/AppLayout';
import {WorkFilters} from '../components/WorkFilters';
import {TodayStatTiles} from '../components/TodayStatTiles';
import {TodayHelp} from '../components/TodayHelp';
import {TodayList} from '../components/TodayList';
import {TodayMiniCalendar} from '../components/TodayMiniCalendar';
import {parseTodayView,todayViews,type TodayView} from '../helpers/appNavigation';
import {SectionTabs,SectionTabList,SectionTab,SectionTabPanel} from '../components/SectionTabs';
import styles from '../components/Commercial.module.css';
import ws from '../components/Work.module.css';
const ReactivationContent=React.lazy(()=>import('./reactivation').then(m=>({default:m.ReactivationContent})));
/** Hoy (owner decision 5A): tabs Lista / Calendario (was /agenda) / Para retomar (was /reactivation), driven by `?view`. */
export default function MyDayPage(){
 const [searchParams,setSearchParams]=useSearchParams();const view=parseTodayView({value:searchParams.get('view')}),agenda=view==='calendar',retomar=view==='retomar';const requestedTask=searchParams.get('taskId'),requestedAccount=searchParams.get('accountId');const selected=!!requestedTask&&!!requestedAccount&&view==='list';
 const {authState}=useAuth();const admin=authState.type==='authenticated'&&authState.user.role==='admin';
 const first=useFirstStepsStorage({email:authState.type==='authenticated'?authState.user.email:undefined});
 const [now,setNow]=useState(()=>new Date());
 useEffect(()=>{const timer=window.setInterval(()=>setNow(new Date()),30000);return ()=>window.clearInterval(timer);},[]);
 const [responsible,setResponsible]=useState('');const [city,setCity]=useState('');const [vertical,setVertical]=useState('');const [page,setPage]=useState(1);
 const [editor,setEditor]=useState<WorkTarget|null>(null);const [calendar,setCalendar]=useState(true);
 const [shownView,setShownView]=useState<TodayView>(view);if(shownView!==view){setShownView(view);setPage(1);setEditor(null);setCalendar(true);}const [month,setMonth]=useState(localDay().slice(0,7));
 const monthEnd=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0)).toISOString().slice(0,10);
 const params={responsible:responsible||undefined,city:city||undefined,vertical:vertical||undefined,mode:agenda?'agenda':'day',calendar:agenda&&calendar?'true':undefined,page:String(page),from:agenda?month+'-01':undefined,to:agenda?monthEnd:undefined};
 const queryParams=selected?{mode:'detail',accountId:requestedAccount!,taskId:requestedTask!,responsible:admin?'all':undefined}:params;
 const q=useQuery({queryKey:['work',queryParams],queryFn:()=>getWork(queryParams),enabled:!retomar});const d=q.data;
 const inbound=useQuery({queryKey:['communication','inbound-review'],queryFn:getInboundReview,enabled:!agenda&&!retomar});const inboundRows=Array.isArray(inbound.data?.rows)?inbound.data.rows:[];
 useEffect(()=>setEditor(null),[requestedTask,requestedAccount]);
 const {markOpened}=first;useEffect(()=>{if(editor?.kind==='task'&&'item' in editor&&editor.item)markOpened();},[editor,markOpened]);useEffect(()=>{if(selected&&d?.tasks.length)markOpened();},[selected,d,markOpened]);
 useEffect(()=>{if(!selected||q.isPending)return;const frame=requestAnimationFrame(()=>{const node=document.querySelector<HTMLElement>('[data-work-task="'+requestedTask!.replace(/[^0-9]/g,'')+'"]');node?.scrollIntoView({block:'center'});node?.focus({preventScroll:true})});return()=>cancelAnimationFrame(frame)},[selected,requestedTask,q.isPending]);
 const reset=(fn:()=>void)=>{fn();setPage(1);};const clearFilters=()=>reset(()=>{setResponsible('');setCity('');setVertical('');});
 const help=React.useMemo(()=>retomar?null:{label:'Ayuda sobre Hoy',content:<TodayHelp calendar={agenda}/>},[retomar,agenda]);usePageHelp(help);
 const focusFilters=()=>{const node=document.getElementById('today-work-filters');node?.scrollIntoView({block:'center',behavior:'smooth'});node?.focus({preventScroll:true})};
 const days=Array.from({length:Number(monthEnd.slice(8))},(_,i)=>month+'-'+String(i+1).padStart(2,'0'));
 const firstWeekday=(new Date(month+'-01T12:00:00Z').getUTCDay()+6)%7;
 return <><main className={styles.shell}>
  <div className={styles.heading+" "+ws.pageHeading}><div>{!retomar&&<span className={styles.eyebrow}>{agenda?"ENCUENTROS COMERCIALES":"TRABAJO DIARIO"}</span>}<h1>Hoy</h1>{!retomar&&<p className={styles.muted}>{agenda?"Visitas y reuniones planificadas y realizadas":formatDate(localDay(now))+" · Priorizá lo vencido y lo que toca hoy"} · Horarios de Argentina</p>}</div>{!retomar&&<div className={styles.actions}><Button onClick={()=>setEditor({kind:'task'})}>{agenda?"Agendar encuentro":VOCAB.scheduleTask}</Button><Button variant="outline" onClick={()=>setEditor({kind:'activity'})}>{agenda?"Anotar encuentro realizado":VOCAB.logWhatHappened}</Button></div>}</div>
  <SectionTabs value={view} onValueChange={next=>setSearchParams(next==='list'?{}:{view:next})}><SectionTabList aria-label="Vistas de Hoy">{todayViews.map(item=><SectionTab key={item.view} value={item.view}>{item.label}</SectionTab>)}</SectionTabList>{todayViews.map(item=><SectionTabPanel key={item.view} value={item.view}>{item.view===view&&(
  retomar?<React.Suspense fallback={<QueryLoadingNotice/>}><ReactivationContent/></React.Suspense>:<>
  {!selected&&<WorkFilters data={d} admin={admin} agenda={agenda} responsible={responsible} city={city} vertical={vertical} month={month} calendar={calendar} onResponsible={value=>reset(()=>setResponsible(value))} onCity={value=>reset(()=>setCity(value))} onVertical={value=>reset(()=>setVertical(value))} onMonth={value=>reset(()=>setMonth(value))} onCalendar={setCalendar} onClear={clearFilters}/>}
  {!agenda&&d?.bucketCounts&&<TodayStatTiles counts={d.bucketCounts} inbound={inbound.isPending||inbound.error?undefined:inboundRows.length} attention={d.attention.length} done={d.doneToday??0} waiting={d.pendingOutcomes?.length??0}/>}
    {q.isPending&&<QueryLoadingNotice/>}{q.error&&<QueryErrorNotice error={q.error} onRetry={q.refetch} busy={q.isFetching} backTo="/my-day"/> }
  {d&&selected&&<section className={styles.panel} aria-label="Pendiente seleccionado"><h2>Pendiente seleccionado</h2>{d.tasks.length?d.tasks.map(task=><TaskRow key={task.id} task={task} data={d} onEdit={setEditor} from="my-day"/>):<p>Este pendiente no está disponible para vos. Puede haberse retirado o corresponder a otra persona.</p>}<Link to="/my-day">Ver todos mis pendientes</Link>{editor&&<WorkEditor key={editor.kind+('item' in editor?editor.item?.id||'new':'new')} target={editor} data={d} onClose={()=>setEditor(null)}/>}</section>}
  {d&&!selected&&<>
   {!agenda&&<TodayList data={d} now={now} admin={admin} filtered={!!(city||vertical||responsible)} inboundRows={inboundRows} inboundError={inbound.error} inboundBusy={inbound.isFetching} onInboundRetry={inbound.refetch} onEdit={setEditor} onClearFilters={clearFilters} onFocusFilters={focusFilters} calendar={<TodayMiniCalendar tasks={d.tasks} now={now}/>} firstSteps={d.firstSteps&&(()=>{const items=firstStepItems({flags:d.firstSteps,opened:first.opened});return showFirstSteps({items,dismissed:first.dismissed})?<FirstStepsChecklist items={items} onDismiss={first.dismiss}/>:null;})()}/>}
   {agenda&&!calendar&&<div className={ws.agendaSections}><section className={styles.panel}><h2>Planificadas ({d.totalTasks})</h2><p className={styles.muted}>Encuentros pendientes de realizar.</p><div className={styles.rows}>{d.tasks.map(t=><TaskRow key={t.id} task={t} data={d} onEdit={setEditor} from="my-day"/>)}</div>{!d.tasks.length&&<p className={styles.empty}>Sin visitas o reuniones planificadas este mes.</p>}</section><section className={styles.panel}><h2>Realizadas ({d.totalActivities})</h2><p className={styles.muted}>Encuentros registrados por su fecha real.</p><div className={styles.rows}>{d.activities.map(a=><ActivityRow key={a.id} activity={a} data={d} onEdit={setEditor}/>)}</div>{!d.activities.length&&<p className={styles.empty}>Sin visitas o reuniones realizadas este mes.</p>}</section></div>}
   {agenda&&calendar&&<section className={styles.panel}><h2>{new Date(month+"-01T12:00:00Z").toLocaleDateString("es-AR",{month:"long",year:"numeric",timeZone:"UTC"})}</h2><p className={styles.muted}>Todos los encuentros del mes seleccionado.</p><div className={ws.calendarWrap}><div className={ws.calendar}>{['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'].map(day=><strong className={ws.weekLabel} key={day}>{day}</strong>)}{Array.from({length:firstWeekday},(_,i)=><div className={ws.day} key={'blank'+i}/>)}{days.map(day=><div className={ws.day} data-today={day===localDay()} key={day}><strong>{Number(day.slice(8))}</strong>{d.tasks.filter(t=>t.dueDate===day).map(t=><UnstyledButton className={ws.event} key={'t'+t.id} onClick={()=>setEditor({kind:'task',item:t})}><span className={ws.eventTime}>{t.dueAt?formatTime(t.dueAt):'Sin hora'}</span><span className={ws.eventSeparator}> · </span><span className={ws.eventTitle} title={t.title}>{t.title}</span><span className={ws.eventAccount}>{t.accountName}</span></UnstyledButton>)}{d.activities.filter(a=>localDay(new Date(a.occurredAt))===day).map(a=><UnstyledButton className={ws.event} data-done="true" key={'a'+a.id} onClick={()=>setEditor({kind:'activity',item:a})}><span className={ws.eventTime}>Realizada</span><span className={ws.eventSeparator}> · </span><span className={ws.eventTitle} title={a.title}>{a.title}</span><span className={ws.eventAccount}>{a.accountName}</span></UnstyledButton>)}</div> )}</div></div><div className={ws.calendarLegend}><span>Planificadas</span><span>Realizadas</span></div></section>}
   {!(agenda&&calendar)&&<WorkPagination data={d} page={page} onPage={setPage}/>}
   {editor&&<WorkEditor key={editor.kind+('item' in editor?editor.item?.id||'new':'new')} target={editor} data={d} onClose={()=>setEditor(null)}/>}
  </>}
  </>)}</SectionTabPanel>)}</SectionTabs>
 </main></>;
}
