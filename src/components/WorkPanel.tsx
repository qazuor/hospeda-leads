import React,{useState} from 'react';
import {Link} from 'react-router-dom';
import {useQuery} from '@tanstack/react-query';
import {getWork,type WorkTask,type WorkActivity,type WorkData} from '../endpoints/work.schema';
import {taskBucket,prettyInstant,localDay} from '../helpers/workDates';
import {formatDate} from '../helpers/crmDates';
import {useAuth} from '../helpers/useAuth';
import {Button} from './Button';
import {WorkEditor,type WorkTarget} from './WorkEditor';
import styles from './Commercial.module.css';
import workStyles from './Work.module.css';
const bucketNames={overdue:'Vencidas',today:'Hoy',upcoming:'Próximas'};
export function TaskRow({task,data,onEdit}:{task:WorkTask;data:WorkData;onEdit:(t:WorkTarget)=>void}){
 const pending=task.status==='pending';
 const {authState}=useAuth();const editable=authState.type==='authenticated'&&(authState.user.role==='admin'||task.assignedUserEmail===authState.user.email);
 return <article className={workStyles.row} data-tone={pending?taskBucket(task.dueDate,task.dueAt):task.status}>
  <div><strong>{task.title}</strong><span>{data.types.find(t=>t.id===task.typeId)?.name} · {task.priority==='alta'?'Prioridad alta':task.priority==='baja'?'Prioridad baja':'Prioridad media'} · {pending?bucketNames[taskBucket(task.dueDate,task.dueAt)]:task.status==='completed'?'Completada':'Cancelada'}</span>
   <Link to={task.leadId?'/opportunities?leadId='+task.leadId:'/accounts/'+task.accountId}>{task.accountName}{task.opportunityName?' · '+task.opportunityName:''}</Link>
   <span>{task.dueAt?prettyInstant(task.dueAt):formatDate(task.dueDate)+' · Sin hora'} · {task.city||'Sin localidad'} · {data.users.find(u=>u.email===task.assignedUserEmail)?.displayName||'Sin responsable'}</span>
   {task.description&&<p>{task.description}</p>}{task.participants&&<span>Participantes: {task.participants}</span>}{task.result&&<p>Resultado: {task.result}</p>}
  </div>
  {editable&&<div className={styles.actions}>
   {task.leadId&&<Button size="sm" variant="outline" asChild><Link to={'/opportunities?leadId='+task.leadId+'&contact=whatsapp'}>Contactar</Link></Button>}
   {pending&&<><Button size="sm" onClick={()=>onEdit({kind:'complete',item:task})}>Completar</Button><Button size="sm" variant="outline" onClick={()=>onEdit({kind:'task',item:task})}>Editar / reprogramar</Button><Button size="sm" variant="ghost" onClick={()=>onEdit({kind:'cancel',item:task})}>Cancelar</Button></>}
   <Button size="sm" variant="ghost" onClick={()=>onEdit({kind:'activity',accountId:task.accountId,leadId:task.leadId||undefined})}>Registrar actividad</Button>
   <Button size="sm" variant="ghost" onClick={()=>onEdit({kind:'delete_task',item:task})}>Dar de baja</Button>
  </div>}
 </article>;
}
export function ActivityRow({activity,data,onEdit}:{activity:WorkActivity;data:WorkData;onEdit:(t:WorkTarget)=>void}){
 return <article className={workStyles.row}><div><strong>{activity.title}</strong><span>{prettyInstant(activity.occurredAt)} · {data.types.find(t=>t.id===activity.typeId)?.name} · {activity.channel||'Canal sin especificar'}</span><Link to={activity.leadId?'/opportunities?leadId='+activity.leadId:'/accounts/'+activity.accountId}>{activity.accountName}</Link>{activity.participants&&<p>Participantes: {activity.participants}</p>}{activity.result&&<p>Resultado: {activity.result}</p>}{activity.notes&&<p>{activity.notes}</p>}</div><div className={styles.actions}><Button size="sm" variant="outline" onClick={()=>onEdit({kind:'activity',item:activity})}>Editar actividad</Button><Button size="sm" variant="ghost" onClick={()=>onEdit({kind:'delete_activity',item:activity})}>Dar de baja</Button></div></article>;
}
export function WorkPanel({accountId,leadId}:{accountId:string;leadId?:string}){
 const {authState}=useAuth();const admin=authState.type==='authenticated'&&authState.user.role==='admin';
 const [editor,setEditor]=useState<WorkTarget|null>(null);const [page,setPage]=useState(1);
 const params={accountId,leadId,responsible:admin?'all':undefined,mode:'detail',page:String(page)};
 const q=useQuery({queryKey:['work',params],queryFn:()=>getWork(params)});
 if(q.isPending)return <p>Cargando tareas y actividades…</p>;
 if(q.error)return <p role="alert">{q.error.message}</p>;
 const d=q.data;const pending=d.tasks.filter(t=>t.status==='pending');
 return <details className={styles.relatedSection} open><summary>Tareas y actividades comerciales</summary><p className={styles.muted}>Planificá varias acciones para el mismo negocio. Las actividades muestran lo que ocurrió, con su fecha real. Hoy: {formatDate(localDay())} · Argentina.</p>
  <div className={styles.actions}><Button size="sm" onClick={()=>setEditor({kind:'task',accountId,leadId})}>Nueva tarea</Button><Button size="sm" variant="outline" onClick={()=>setEditor({kind:'activity',accountId,leadId})}>Registrar actividad</Button><Link to="/my-day">Abrir Mi día</Link></div>
  <h4>Pendientes ({pending.length} en esta página)</h4><div className={styles.rows}>{pending.map(t=><TaskRow key={t.id} task={t} data={d} onEdit={setEditor}/>)}{!pending.length&&<p>Sin tareas pendientes.</p>}</div>
  <h4>Actividades realizadas</h4><div className={styles.rows}>{d.activities.map(a=><ActivityRow key={a.id} activity={a} data={d} onEdit={setEditor}/>)}{!d.activities.length&&<p>Sin actividades registradas.</p>}</div>
  <details><summary>Tareas finalizadas o canceladas</summary><div className={styles.rows}>{d.tasks.filter(t=>t.status!=='pending').map(t=><TaskRow key={t.id} task={t} data={d} onEdit={setEditor}/>)}</div></details>
  <WorkPagination data={d} page={page} onPage={setPage}/>
  <details className={styles.history}><summary>Auditoría de tareas y actividades (últimos 200 cambios)</summary>{d.journal.map(j=><details key={j.id}><summary>{prettyInstant(j.createdAt)} · {j.entity==='crm_tasks'?'Tarea':'Actividad'} #{j.entityId} · {j.action==='INSERT'?'Creada':j.action==='UPDATE'?'Editada':'Eliminada'} · {j.actorEmail||'Migración / sistema'}</summary><pre>{JSON.stringify({antes:j.beforeValue,despues:j.afterValue},null,2)}</pre></details>)}</details>
  {editor&&<WorkEditor key={editor.kind+('item' in editor?editor.item?.id||'new':'new')} target={editor} data={d} onClose={()=>setEditor(null)}/>}
 </details>;
}
export function WorkPagination({data,page,onPage}:{data:WorkData;page:number;onPage:(n:number)=>void}){
 const pages=Math.max(1,Math.ceil(Math.max(data.totalTasks,data.totalActivities)/100));
 return pages>1?<div className={styles.actions}><Button size="sm" variant="outline" disabled={page===1} onClick={()=>onPage(page-1)}>Anterior</Button><span>Página {page} de {pages}</span><Button size="sm" variant="outline" disabled={page>=pages} onClick={()=>onPage(page+1)}>Siguiente</Button></div>:null;
}
