import { Disclosure, DisclosureSummary } from './Disclosure';
import {purposeNames} from '../helpers/nextStep';
import React,{useState} from 'react';
import {Link} from 'react-router-dom';
import {useQuery} from '@tanstack/react-query';
import {MoreHorizontal,Check,Phone,CalendarClock} from 'lucide-react';
import {getWork,type WorkTask,type WorkActivity,type WorkData} from '../endpoints/work.schema';
import {taskBucket,prettyInstant} from '../helpers/workDates';
import {formatDate} from '../helpers/crmDates';
import {useAuth} from '../helpers/useAuth';
import {Button} from './Button';
import {TaskContactDialog} from './TaskContactDialog';
import {DropdownMenu,DropdownMenuTrigger,DropdownMenuContent,DropdownMenuItem,DropdownMenuSeparator} from './DropdownMenu';
import {SectionTabs,SectionTabList,SectionTab,SectionTabPanel} from './SectionTabs';
import {WorkEditor,type WorkTarget} from './WorkEditor';
import styles from './Commercial.module.css';
import ws from './Work.module.css';

const statusNames={pending:'Pendiente',completed:'Completada',cancelled:'Cancelada'};
const channelNames:Record<string,string>={phone:'Teléfono',whatsapp:'WhatsApp',email:'Email',presencial:'Presencial',videollamada:'Videollamada',other:'Otro'};
export function TaskRow({task,data,onEdit}:{task:WorkTask;data:WorkData;onEdit:(t:WorkTarget)=>void}){
 const [contactOpen,setContactOpen]=useState(false);
 const pending=task.status==='pending';
 const {authState}=useAuth();const editable=authState.type==='authenticated'&&(authState.user.role==='admin'||task.assignedUserEmail===authState.user.email);
 const needsContact=['call','message','followup'].includes(task.typeId);
 const bucket=taskBucket(task.dueDate,task.dueAt);
 return <article data-work-task={task.id} tabIndex={-1} className={ws.row} data-tone={pending?bucket:task.status}>
  <div className={ws.rowBody}>
   <div className={ws.rowHeading}><strong>{task.title}</strong>{task.priority==='alta'&&<span className={ws.priority}>Alta prioridad</span>}{!pending&&<span className={ws.status}>{statusNames[task.status]}</span>}</div>
   <Link className={ws.context} to={task.leadId?'/sales/'+task.leadId:'/accounts/'+task.accountId}>{task.accountName}{task.opportunityName?' · '+task.opportunityName:''}</Link>
   {pending&&task.continuation==='wait'&&<p className={ws.metadata}>{bucket==='upcoming'?'Esperando hasta la fecha acordada para retomar':'Ya corresponde retomar la conversación'}</p>}
   <div className={ws.due}><CalendarClock size={14} aria-hidden="true"/>{task.dueAt?prettyInstant(task.dueAt):formatDate(task.dueDate)}</div>
   <div className={ws.metadata}><span>{task.purpose?purposeNames[task.purpose]:data.types.find(t=>t.id===task.typeId)?.name}</span><span>{data.users.find(u=>u.email===task.assignedUserEmail)?.displayName||'Sin responsable'}</span>{task.city&&<span>{task.city}</span>}</div>
   {(task.description||task.participants||task.result)&&<Disclosure className={ws.extra}><DisclosureSummary>Ver detalles</DisclosureSummary>{task.description&&<p>{task.description}</p>}{task.participants&&<p>Participantes: {task.participants}</p>}{task.result&&<p>Resultado: {task.result}</p>}</Disclosure>}
  </div>
  {editable&&<div className={ws.rowActions}>
   {pending&&<Button size="sm" variant={needsContact?"primary":"outline"} onClick={()=>setContactOpen(true)}><Phone size={14}/>Contactar</Button>}
   {pending&&<Button size="sm" variant={needsContact?"outline":"primary"} onClick={()=>onEdit({kind:'complete',item:task})}><Check size={14}/>Registrar qué pasó</Button>}
   <DropdownMenu><DropdownMenuTrigger asChild><Button size="icon-sm" variant="ghost" aria-label={'Más acciones de '+task.title}><MoreHorizontal size={18}/></Button></DropdownMenuTrigger><DropdownMenuContent align="end">
    {pending&&<><DropdownMenuItem onSelect={()=>onEdit({kind:'task',item:task})}>Editar / reprogramar</DropdownMenuItem><DropdownMenuItem onSelect={()=>onEdit({kind:'cancel',item:task})}>Cancelar tarea</DropdownMenuItem></>}
    <DropdownMenuItem onSelect={()=>onEdit({kind:'activity',accountId:task.accountId,leadId:task.leadId||undefined})}>Registrar actividad</DropdownMenuItem>
    <DropdownMenuSeparator/><DropdownMenuItem onSelect={()=>onEdit({kind:'delete_task',item:task})}>Dar de baja</DropdownMenuItem>
   </DropdownMenuContent></DropdownMenu>
  </div>}
  {contactOpen&&<TaskContactDialog task={task} onClose={()=>setContactOpen(false)} onLog={(contactId,channel)=>{setContactOpen(false);onEdit({kind:'complete',item:task,contactIds:contactId?[contactId]:[],channel});}}/>}
 </article>;
}
export function ActivityRow({activity,data,onEdit}:{activity:WorkActivity;data:WorkData;onEdit:(t:WorkTarget)=>void}){
 const opportunityName=data.opportunities.find(o=>o.id===activity.leadId)?.opportunityName;
 return <article className={ws.row} data-tone="completed"><div className={ws.rowBody}><div className={ws.rowHeading}><strong>{activity.title}</strong><span className={ws.status}>Realizada</span></div><Link className={ws.context} to={activity.leadId?'/opportunities?leadId='+activity.leadId:'/accounts/'+activity.accountId}>{activity.accountName}{opportunityName?' · '+opportunityName:''}</Link><div className={ws.due}>{prettyInstant(activity.occurredAt)}</div><div className={ws.metadata}><span>{data.types.find(t=>t.id===activity.typeId)?.name}</span>{activity.channel&&<span>{channelNames[activity.channel]||activity.channel}</span>}</div>{activity.result&&<p className={ws.result}>{activity.result}</p>}{(activity.participants||activity.notes)&&<Disclosure className={ws.extra}><DisclosureSummary>Ver detalles</DisclosureSummary>{activity.participants&&<p>Participantes: {activity.participants}</p>}{activity.notes&&<p>{activity.notes}</p>}</Disclosure>}</div><div className={ws.rowActions}><Button size="sm" variant="outline" onClick={()=>onEdit({kind:'activity',item:activity})}>Editar actividad</Button><DropdownMenu><DropdownMenuTrigger asChild><Button size="icon-sm" variant="ghost" aria-label={'Más acciones de '+activity.title}><MoreHorizontal size={18}/></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onSelect={()=>onEdit({kind:'delete_activity',item:activity})}>Dar de baja</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div></article>;
}
const auditFields:Record<string,string>={title:'Título',description:'Descripción',type_id:'Tipo',assigned_user_email:'Responsable',due_date:'Vencimiento',due_at:'Horario',priority:'Prioridad',status:'Estado',result:'Resultado',completed_at:'Finalización real',occurred_at:'Fecha real',participants:'Participantes',contact_ids:'Contactos',channel:'Canal',notes:'Notas',deleted_at:'Fecha de baja'};
function auditValue(key:string,value:unknown,data:WorkData):string{
 if(value==null||value==='')return 'Vacío';
 if(key==='contact_ids'&&Array.isArray(value))return value.map(id=>data.contacts.find(c=>c.id===String(id))?.name||'Contacto #'+id).join(', ')||'Vacío';
 if(key==='type_id')return data.types.find(t=>t.id===value)?.name||String(value);
 if(key==='assigned_user_email')return data.users.find(u=>u.email===value)?.displayName||String(value);
 if(key==='due_date')return formatDate(String(value).slice(0,10));
 if(['due_at','completed_at','occurred_at','deleted_at'].includes(key))return prettyInstant(String(value));
 if(key==='status')return statusNames[value as keyof typeof statusNames]||String(value);
 if(key==='channel')return channelNames[String(value)]||String(value);
 return String(value);
}
export function WorkPanel({accountId,leadId}:{accountId:string;leadId?:string}){
 const {authState}=useAuth();const admin=authState.type==='authenticated'&&authState.user.role==='admin';
 const [editor,setEditor]=useState<WorkTarget|null>(null);const [page,setPage]=useState(1);
 const params={accountId,leadId,responsible:admin?'all':undefined,mode:'detail',page:String(page)};
 const q=useQuery({queryKey:['work',params],queryFn:()=>getWork(params)});
 if(q.isPending)return <p>Cargando tareas y actividades…</p>;
 if(q.error)return <p role="alert">{q.error.message}</p>;
 const d=q.data;const pending=d.tasks.filter(t=>t.status==='pending');const finished=d.tasks.filter(t=>t.status!=='pending');
 return <section className={styles.section}>
  <header className={styles.heading}><div><h3>Tareas y actividades comerciales</h3><p className={styles.muted}>Tareas: lo que falta hacer. Actividades: lo que ya ocurrió.</p></div><div className={styles.actions}><Button size="sm" onClick={()=>setEditor({kind:'task',accountId,leadId})}>Nueva tarea</Button><Button size="sm" variant="outline" onClick={()=>setEditor({kind:'activity',accountId,leadId})}>Registrar actividad</Button></div></header>
  {Math.max(d.totalTasks,d.totalActivities)>100&&<p className={styles.muted}>Conteos de tareas correspondientes a esta página. Usá los controles inferiores para consultar el resto.</p>}
  <SectionTabs defaultValue="tasks"><SectionTabList aria-label="Seguimiento comercial"><SectionTab value="tasks">Tareas pendientes ({pending.length})</SectionTab><SectionTab value="activities">Actividades realizadas ({d.totalActivities})</SectionTab></SectionTabList>
   <SectionTabPanel value="tasks"><div className={styles.rows}>{pending.map(t=><TaskRow key={t.id} task={t} data={d} onEdit={setEditor}/>)}{!pending.length&&<p className={styles.empty}>Sin tareas pendientes. Creá una para planificar el próximo paso.</p>}</div><Disclosure className={styles.relatedSection}><DisclosureSummary>Tareas finalizadas o canceladas ({finished.length} en esta página)</DisclosureSummary><div className={styles.rows}>{finished.map(t=><TaskRow key={t.id} task={t} data={d} onEdit={setEditor}/>)}</div></Disclosure></SectionTabPanel>
   <SectionTabPanel value="activities"><p className={styles.muted}>Registro por fecha real. Podés cargar acciones anteriores.</p><div className={styles.rows}>{d.activities.map(a=><ActivityRow key={a.id} activity={a} data={d} onEdit={setEditor}/>)}{!d.activities.length&&<p className={styles.empty}>Sin actividades registradas.</p>}</div></SectionTabPanel>
  </SectionTabs>
  <WorkPagination data={d} page={page} onPage={setPage}/>
  <footer className={ws.workFooter}><Link to="/my-day">Abrir Mi día</Link><Disclosure className={styles.history}><DisclosureSummary>Auditoría de tareas y actividades (últimos 200 cambios)</DisclosureSummary>{d.journal.map(j=>{
   const before=(j.beforeValue||{}) as Record<string,unknown>;const after=(j.afterValue||{}) as Record<string,unknown>;
   return <Disclosure key={j.id}><DisclosureSummary>{prettyInstant(j.createdAt)} · {j.entity==='crm_tasks'?'Tarea':'Actividad'} #{j.entityId} · {j.action==='INSERT'?'Creada':j.action==='UPDATE'?'Editada':'Eliminada'} · {dataActor(d,j.actorEmail)}</DisclosureSummary><dl className={ws.auditChanges}>{Object.entries(auditFields).filter(([key])=>JSON.stringify(before[key])!==JSON.stringify(after[key])).map(([key,label])=><div key={key}><dt>{label}</dt><dd>{auditValue(key,before[key],d)} → {auditValue(key,after[key],d)}</dd></div>)}</dl></Disclosure>;
  })}</Disclosure></footer>
  {editor&&<WorkEditor key={editor.kind+('item' in editor?editor.item?.id||'new':'new')} target={editor} data={d} onClose={()=>setEditor(null)}/>}
 </section>;
}
function dataActor(data:WorkData,email:string|null){return data.users.find(u=>u.email===email)?.displayName||email||'Migración / sistema';}
export function WorkPagination({data,page,onPage}:{data:WorkData;page:number;onPage:(n:number)=>void}){
 const pages=data.bucketCounts?Math.max(1,...Object.values(data.bucketCounts).map(n=>Math.ceil(n/25))):Math.max(1,Math.ceil(Math.max(data.totalTasks,data.totalActivities)/100));
 return pages>1?<div className={styles.actions}><Button size="sm" variant="outline" disabled={page===1} onClick={()=>onPage(page-1)}>Anterior</Button><span>Página {page} de {pages}</span><Button size="sm" variant="outline" disabled={page>=pages} onClick={()=>onPage(page+1)}>Siguiente</Button></div>:null;
}
