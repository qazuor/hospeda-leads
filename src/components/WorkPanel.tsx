import {QueryLoadingNotice} from './QueryLoadingNotice';
import { Disclosure, DisclosureSummary } from './Disclosure';
import {QueryErrorNotice} from './QueryErrorNotice';
import {purposeNames} from '../helpers/nextStep';
import React,{useEffect,useId,useState} from 'react';
import {Link} from 'react-router-dom';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {toast} from 'sonner';
import {MoreHorizontal,Check,Phone,CalendarClock} from 'lucide-react';
import {getWork,type WorkTask,type WorkActivity,type WorkData} from '../endpoints/work.schema';
import {taskBucket,prettyInstant} from '../helpers/workDates';
import {formatDate,overdueLabel} from '../helpers/crmDates';
import {VOCAB} from '../content/vocabulary';
import type {SaleOrigin} from '../helpers/saleOrigin';
import {TaskPostponeMenu} from './TaskPostponeMenu';
import {useAuth} from '../helpers/useAuth';
import {Button} from './Button';
import {TaskContactDialog} from './TaskContactDialog';
import {DropdownMenu,DropdownMenuTrigger,DropdownMenuContent,DropdownMenuItem,DropdownMenuSeparator} from './DropdownMenu';
import {WorkEditor,type WorkTarget} from './WorkEditor';
import styles from './Commercial.module.css';
import ws from './Work.module.css';

const statusNames={pending:'Pendiente',completed:'Completada',cancelled:'Cancelada'};
const channelNames:Record<string,string>={phone:'Teléfono',whatsapp:'WhatsApp',email:'Email',presencial:'Presencial',videollamada:'Videollamada',other:'Otro'};
/** Opens the activity a completed task created, so its result can be corrected. Looks in the loaded page first, then asks the server. */
async function findCompletionActivity({qc,task,data,admin}:{qc:ReturnType<typeof useQueryClient>;task:WorkTask;data:WorkData;admin:boolean}):Promise<WorkActivity|undefined>{
 const loaded=data.activities.find(a=>a.id===task.activityId);
 if(loaded)return loaded;
 const fresh=await qc.fetchQuery({queryKey:['work','completion',task.id],queryFn:()=>getWork({mode:'detail',accountId:task.accountId,taskId:task.id,...(admin?{responsible:'all'}:{})}),staleTime:0,gcTime:0});
 return fresh.activities.find(a=>a.id===task.activityId);
}
/** Decision 1C: a No contactar business is read-only for non-admins, so its tasks and activities show no edit actions. */
export const dncLocked=(data:WorkData,accountId:string,admin:boolean)=>!admin&&!!data.accounts.find(a=>a.id===accountId)?.doNotContact;
/** `from` is the section the management link is opened from, so the management page can offer the right "Volver". */
export function TaskRow({task,data,onEdit,readOnly=false,from}:{task:WorkTask;data:WorkData;onEdit:(t:WorkTarget)=>void;readOnly?:boolean;from?:SaleOrigin}){
 const [contactOpen,setContactOpen]=useState(false);const [loadingFix,setLoadingFix]=useState(false);const qc=useQueryClient();
 const pending=task.status==='pending';
 const {authState}=useAuth();const admin=authState.type==='authenticated'&&authState.user.role==='admin';const editable=!readOnly&&!dncLocked(data,task.accountId,admin)&&authState.type==='authenticated'&&(admin||task.assignedUserEmail===authState.user.email);
 const needsContact=['call','message','followup'].includes(task.typeId);
 const bucket=taskBucket(task.dueDate,task.dueAt);
 const late=pending&&bucket==='overdue'?(overdueLabel(task.dueDate)??'Venció hoy'):null;
 const fixResult=async()=>{if(loadingFix)return;setLoadingFix(true);try{const activity=await findCompletionActivity({qc,task,data,admin});if(activity)onEdit({kind:'activity',item:activity});else toast.error('No encontramos lo que se anotó al completar esta tarea.');}catch(e){toast.error(e instanceof Error?e.message:'No se pudo abrir el resultado.');}finally{setLoadingFix(false);}};
 return <article data-work-task={task.id} tabIndex={-1} className={ws.row} data-tone={pending?bucket:task.status}>
  <div className={ws.rowBody}>
   <div className={ws.rowHeading}><strong>{task.title}</strong>{task.priority==='alta'&&<span className={ws.priority}>Alta prioridad</span>}{!pending&&<span className={ws.status}>{statusNames[task.status]}</span>}</div>
   <Link className={ws.context} to={task.leadId?'/sales/'+task.leadId:'/accounts/'+task.accountId} state={task.leadId&&from?{from}:undefined}>{task.accountName}{task.opportunityName?' · '+task.opportunityName:''}</Link>
   {pending&&task.continuation==='wait'&&<p className={ws.metadata}>{bucket==='upcoming'?'Esperando hasta la fecha acordada para retomar':'Ya corresponde retomar la conversación'}</p>}
   <div className={ws.due}><CalendarClock size={14} aria-hidden="true"/>{late&&<strong>{late} · </strong>}{task.dueAt?prettyInstant(task.dueAt):formatDate(task.dueDate)}</div>
   <div className={ws.metadata}><span>{task.purpose?purposeNames[task.purpose]:data.types.find(t=>t.id===task.typeId)?.name}</span><span>{data.users.find(u=>u.email===task.assignedUserEmail)?.displayName||'Sin responsable'}</span>{task.city&&<span>{task.city}</span>}</div>
   {(task.description||task.participants||task.result)&&<Disclosure className={ws.extra}><DisclosureSummary>Ver detalles</DisclosureSummary>{task.description&&<p>{task.description}</p>}{task.participants&&<p>Participantes: {task.participants}</p>}{task.result&&<p>Resultado: {task.result}</p>}</Disclosure>}
  </div>
  {editable&&<div className={ws.rowActions}>
   {pending&&<Button size="sm" onClick={()=>onEdit({kind:'complete',item:task})}><Check size={14}/>{VOCAB.logOutcome}</Button>}
   {pending&&<Button size="sm" variant="outline" onClick={()=>setContactOpen(true)}><Phone size={14}/>{VOCAB.contact}</Button>}
   {pending&&<TaskPostponeMenu task={task}/>}
   <DropdownMenu><DropdownMenuTrigger asChild><Button size="icon-sm" variant="ghost" aria-label={'Más acciones de '+task.title}><MoreHorizontal size={18}/></Button></DropdownMenuTrigger><DropdownMenuContent align="end">
    {pending&&<><DropdownMenuItem onSelect={()=>onEdit({kind:'task',item:task})}>Cambiar fecha o datos</DropdownMenuItem><DropdownMenuItem onSelect={()=>onEdit({kind:'cancel',item:task})}>{VOCAB.noLongerNeeded}</DropdownMenuItem></>}
    {task.status==='completed'&&task.activityId&&<DropdownMenuItem disabled={loadingFix} onSelect={()=>void fixResult()}>Corregir cómo salió</DropdownMenuItem>}
    <DropdownMenuItem onSelect={()=>onEdit({kind:'activity',accountId:task.accountId,leadId:task.leadId||undefined})}>{VOCAB.logWhatHappened}</DropdownMenuItem>
    <DropdownMenuSeparator/><DropdownMenuItem color="red" onSelect={()=>onEdit({kind:'delete_task',item:task})}>{VOCAB.deleteMistake}</DropdownMenuItem>
   </DropdownMenuContent></DropdownMenu>
  </div>}
  {contactOpen&&<TaskContactDialog task={task} onClose={()=>setContactOpen(false)} onLog={(contactId,channel)=>{setContactOpen(false);onEdit({kind:'complete',item:task,contactIds:contactId?[contactId]:[],channel});}}/>}
 </article>;
}
export function ActivityRow({activity,data,onEdit}:{activity:WorkActivity;data:WorkData;onEdit:(t:WorkTarget)=>void}){
 const {authState}=useAuth();const locked=dncLocked(data,activity.accountId,authState.type==='authenticated'&&authState.user.role==='admin');
 const opportunityName=data.opportunities.find(o=>o.id===activity.leadId)?.opportunityName;
 return <article className={ws.row} data-tone="completed"><div className={ws.rowBody}><div className={ws.rowHeading}><strong>{activity.title}</strong><span className={ws.status}>Realizada</span></div><Link className={ws.context} to={activity.leadId?'/opportunities?leadId='+activity.leadId:'/accounts/'+activity.accountId}>{activity.accountName}{opportunityName?' · '+opportunityName:''}</Link><div className={ws.due}>{prettyInstant(activity.occurredAt)}</div><div className={ws.metadata}><span>{data.types.find(t=>t.id===activity.typeId)?.name}</span>{activity.channel&&<span>{channelNames[activity.channel]||activity.channel}</span>}</div>{activity.result&&<p className={ws.result}>{activity.result}</p>}{(activity.participants||activity.notes)&&<Disclosure className={ws.extra}><DisclosureSummary>Ver detalles</DisclosureSummary>{activity.participants&&<p>Participantes: {activity.participants}</p>}{activity.notes&&<p>{activity.notes}</p>}</Disclosure>}</div>{!locked&&<div className={ws.rowActions}><Button size="sm" variant="outline" onClick={()=>onEdit({kind:'activity',item:activity})}>Editar actividad</Button><DropdownMenu><DropdownMenuTrigger asChild><Button size="icon-sm" variant="ghost" aria-label={'Más acciones de '+activity.title}><MoreHorizontal size={18}/></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onSelect={()=>onEdit({kind:'delete_activity',item:activity})}>{VOCAB.deleteMistake}</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div>}</article>;
}
const auditFields:Record<string,string>={title:'Título',description:'Descripción',type_id:'Tipo',assigned_user_email:'Responsable',due_date:'Vencimiento',due_at:'Horario',priority:'Prioridad',status:'Estado',result:'Cómo salió',completed_at:'Finalización real',occurred_at:'Fecha real',participants:'Participantes',contact_ids:'Personas',channel:'Canal',notes:'Notas',deleted_at:'Fecha de borrado'};
function auditValue(key:string,value:unknown,data:WorkData):string{
 if(value==null||value==='')return 'Vacío';
 if(key==='contact_ids'&&Array.isArray(value))return value.map(id=>data.contacts.find(c=>c.id===String(id))?.name||'Persona que ya no está').join(', ')||'Vacío';
 if(key==='type_id')return data.types.find(t=>t.id===value)?.name||String(value);
 if(key==='assigned_user_email')return data.users.find(u=>u.email===value)?.displayName||'Otra persona';
 if(key==='due_date')return formatDate(String(value).slice(0,10));
 if(['due_at','completed_at','occurred_at','deleted_at'].includes(key))return prettyInstant(String(value));
 if(key==='status')return statusNames[value as keyof typeof statusNames]||String(value);
 if(key==='channel')return channelNames[String(value)]||String(value);
 return String(value);
}
export function WorkPanel({accountId,leadId}:{accountId:string;leadId?:string}){
 const {authState}=useAuth();const admin=authState.type==='authenticated'&&authState.user.role==='admin';
 const [editor,setEditor]=useState<WorkTarget|null>(null);const [page,setPage]=useState(1),[showActivities,setShowActivities]=useState(false);const id=useId();const pendingHeading=id+'-pending',completedHeading=id+'-completed';useEffect(()=>setShowActivities(false),[accountId,leadId,page]);
 const params={accountId,leadId,responsible:admin?'all':undefined,mode:'detail',page:String(page)};
 const q=useQuery({queryKey:['work',params],queryFn:()=>getWork(params)});
 if(!q.data&&q.isPending)return <QueryLoadingNotice>Cargando tareas y actividades…</QueryLoadingNotice>;
 if(!q.data)return <QueryErrorNotice error={q.error!} onRetry={q.refetch} busy={q.isFetching}/>;
 const d=q.data;const pending=d.tasks.filter(t=>t.status==='pending');const finished=d.tasks.filter(t=>t.status!=='pending');
 return <section className={styles.section}>{q.error&&<QueryErrorNotice error={q.error} onRetry={q.refetch} busy={q.isFetching}/>}
  <header className={styles.heading}><div><h3>Tareas y actividades comerciales</h3><p className={styles.muted}>Tareas: lo que falta hacer. Actividades: lo que ya ocurrió.</p></div><div className={styles.actions}><Button size="sm" onClick={()=>setEditor({kind:'task',accountId,leadId})}>Agendar otra tarea</Button><Button size="sm" variant="outline" onClick={()=>setEditor({kind:'activity',accountId,leadId})}>{VOCAB.logWhatHappened}</Button></div></header>
  {Math.max(d.totalTasks,d.totalActivities)>100&&<p className={styles.muted}>Conteos de tareas correspondientes a esta página. Usá los controles inferiores para consultar el resto.</p>}
  <section aria-labelledby={pendingHeading}><h4 id={pendingHeading}>Pendientes · {pending.length}</h4><div className={styles.rows}>{pending.map(t=><TaskRow key={t.id} task={t} data={d} onEdit={setEditor} from="business"/>)}{!pending.length&&<p className={styles.empty}>Sin tareas pendientes. Creá una para planificar el próximo paso.</p>}</div><Disclosure className={styles.relatedSection}><DisclosureSummary>Tareas finalizadas o canceladas ({finished.length} en esta página)</DisclosureSummary><div className={styles.rows}>{finished.map(t=><TaskRow key={t.id} task={t} data={d} onEdit={setEditor} from="business"/>)}</div></Disclosure></section>
  <section aria-labelledby={completedHeading}><h4 id={completedHeading}>Realizadas · {d.totalActivities}</h4><p className={styles.muted}>Registro por fecha real. Podés cargar acciones anteriores.</p><div className={styles.rows}>{(showActivities?d.activities:d.activities.slice(0,5)).map(a=><ActivityRow key={a.id} activity={a} data={d} onEdit={setEditor}/>)}{!d.activities.length&&<p className={styles.empty}>Sin actividades registradas.</p>}</div>{d.activities.length>5&&<Button size="sm" variant="outline" onClick={()=>setShowActivities(value=>!value)}>{showActivities?'Ver menos':'Ver '+(d.activities.length-5)+' más'}</Button>}</section>
  <WorkPagination data={d} page={page} onPage={setPage}/>
  <footer className={ws.workFooter}><Link to="/my-day">Abrir Hoy</Link><Disclosure className={styles.history}><DisclosureSummary>Cambios registrados de tareas y actividades (últimos 200)</DisclosureSummary>{d.journal.map(j=>{
   const before=(j.beforeValue||{}) as Record<string,unknown>;const after=(j.afterValue||{}) as Record<string,unknown>;
   return <Disclosure key={j.id}><DisclosureSummary>{prettyInstant(j.createdAt)} · {j.entity==='crm_tasks'?'Tarea':'Actividad'} «{auditTitle(j.beforeValue,j.afterValue)}» · {j.action==='INSERT'?'Creada':j.action==='UPDATE'?'Editada':'Eliminada'} · {dataActor(d,j.actorEmail)}</DisclosureSummary><dl className={ws.auditChanges}>{Object.entries(auditFields).filter(([key])=>JSON.stringify(before[key])!==JSON.stringify(after[key])).map(([key,label])=><div key={key}><dt>{label}</dt><dd>{auditValue(key,before[key],d)} → {auditValue(key,after[key],d)}</dd></div>)}</dl></Disclosure>;
  })}</Disclosure></footer>
  {editor&&<WorkEditor key={editor.kind+('item' in editor?editor.item?.id||'new':'new')} target={editor} data={d} onClose={()=>setEditor(null)}/>}
 </section>;
}
function dataActor(data:WorkData,email:string|null){return data.users.find(u=>u.email===email)?.displayName||(email?'Otra persona':'Migración / sistema');}
/** Title of the audited task or activity, so the log never shows an internal id. */
function auditTitle(before:unknown,after:unknown):string{const title=[after,before].map(v=>v&&typeof v==='object'?(v as {title?:unknown}).title:undefined).find(v=>typeof v==='string'&&v.trim());return typeof title==='string'?title:'sin título';}
export function WorkPagination({data,page,onPage}:{data:WorkData;page:number;onPage:(n:number)=>void}){
 const pages=data.bucketCounts?Math.max(1,Math.ceil(data.bucketCounts.upcoming/25)):Math.max(1,Math.ceil(Math.max(data.totalTasks,data.totalActivities)/100));
 return pages>1?<div className={styles.actions}><Button size="sm" variant="outline" disabled={page===1} disabledReason={"Ya estás en la primera página."} onClick={()=>onPage(page-1)}>Anterior</Button><span>Página {page} de {pages}</span><Button size="sm" variant="outline" disabled={page>=pages} disabledReason={"Ya estás en la última página."} onClick={()=>onPage(page+1)}>Siguiente</Button></div>:null;
}
