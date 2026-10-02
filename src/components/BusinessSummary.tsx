import {useAuth} from '../helpers/useAuth';
import React,{useState} from 'react';
import {Link} from 'react-router-dom';
import {useQuery} from '@tanstack/react-query';
import {getWork,type WorkTask} from '../endpoints/work.schema';
import type {CommercialDetail} from '../endpoints/commercial.schema';
import {getPipeline} from '../endpoints/pipeline.schema';
import {localDay,prettyInstant} from '../helpers/workDates';
import {formatDate} from '../helpers/crmDates';
import {Button} from './Button';
import {TaskRow} from './WorkPanel';
import {WorkEditor,type WorkTarget} from './WorkEditor';
import {TaskContactDialog} from './TaskContactDialog';
import {ContactPolicy} from './ContactPolicy';
import styles from './Commercial.module.css';
export function BusinessSummary({detail,onContact,onSale,readOnly=false}:{detail:CommercialDetail;onContact:()=>void;onSale:()=>void;readOnly?:boolean}){
 const {authState}=useAuth();const canWork=authState.type==='authenticated'&&(authState.user.role==='admin'||detail.account.assignedUserEmail===authState.user.email);
 const id=detail.account.id;
 const q=useQuery({queryKey:['work','summary',id],queryFn:()=>getWork({accountId:id,mode:'detail',responsible:authState.type==='authenticated'&&authState.user.role==='admin'?'all':undefined})});
 const stages=useQuery({queryKey:['pipeline','config-summary'],queryFn:()=>getPipeline({mode:'config'})});
 const [editor,setEditor]=useState<WorkTarget|null>(null),[contacting,setContacting]=useState(false);
 const person=detail.contacts.find(c=>!c.deletedAt&&c.isPrimary)||detail.contacts.find(c=>!c.deletedAt);
 const pending=q.data?.tasks.filter(t=>t.status==='pending')??[];
 const last=q.data?.activities[0];
 const sales=detail.opportunities.filter(o=>!o.deletedAt);
 const open=sales.filter(o=>(stages.data?.stages.find(s=>s.name===o.estado)?.classification??'open')==='open');
 const contactTask:WorkTask={id:'',accountId:id,leadId:null,title:'Conversación con '+detail.account.nombre,description:null,typeId:'call',assignedUserEmail:detail.account.assignedUserEmail,dueDate:localDay(),dueAt:null,priority:'media',status:'pending',result:null,completedAt:null,legacy:false,participants:'',contactIds:person?[person.id]:[],accountName:detail.account.nombre,city:detail.account.ciudad,opportunityName:null,deletedAt:null};
 return <div className={styles.section}>
  {!readOnly&&<div className={styles.primaryActions}><Button disabled={detail.account.doNotContact} onClick={()=>setContacting(true)}>Contactar</Button><Button variant="outline" disabled={!q.data||!canWork} onClick={()=>setEditor({kind:'activity',accountId:id})}>Registrar qué pasó</Button><Button variant="outline" disabled={!q.data||!canWork} onClick={()=>setEditor({kind:'task',accountId:id})}>Planificar próximo paso</Button></div>}
  {!readOnly&&!canWork&&<p>El seguimiento general está a cargo de {detail.users?.find(u=>u.email===detail.account.assignedUserEmail)?.displayName||'otro responsable'}. Podés trabajar las tareas que tengas asignadas.</p>}
  <div className={styles.overviewGrid}><section className={styles.panel}><h2>Con quién hablamos</h2>{person?<><strong>{person.name}</strong><p>{person.position||'Cargo sin informar'}</p><p>{person.phone||person.email||'Falta un teléfono o email'}</p>{person.preferredChannel&&<p>Prefiere {person.preferredChannel}</p>}</>:<><p>No hay una persona registrada todavía.</p><p>{detail.account.email||detail.account.telefono||'Agregá una persona o un canal para poder contactar.'}</p></>}{!readOnly&&<Button variant="outline" onClick={onContact}>{person?'Ver o editar personas':'Agregar persona'}</Button>}</section>
  <section className={styles.panel}><h2>Última conversación o acción</h2>{q.isPending?<p role="status">Cargando historial…</p>:last?<><strong>{last.title}</strong><p>{prettyInstant(last.occurredAt)}</p><p>{last.result||'Sin resultado detallado'}</p></>:<p>Todavía no se registraron actividades.</p>}</section></div>
  <section className={styles.panel}><div className={styles.heading}><div><h2>Qué hacemos después</h2><p className={styles.muted}>Incluye las tareas de este negocio y de sus ventas que podés gestionar.</p></div></div>{q.error&&<p role="alert">{q.error.message}</p>}{q.data&&pending.slice(0,3).map(t=><TaskRow key={t.id} task={t} data={q.data!} onEdit={setEditor}/>)}{q.data&&!pending.length&&<div className={styles.empty}><p>No hay un próximo paso planificado.</p><p>{detail.account.commercialStatus==='client'?'Dejá una fecha para acompañar al cliente y revisar lo acordado.':'Podés planificar un primer contacto o abrir una venta.'}</p></div>}{pending.length>3&&<p>{pending.length-3} tareas más disponibles en Seguimiento.</p>}</section>
  <section className={styles.panel}><div className={styles.heading}><div><h2>Ventas de este negocio</h2><p className={styles.muted}>{open.length} en curso · {sales.length} en total. Cada propuesta conserva su propio resultado.</p></div>{!readOnly&&<Button variant="outline" onClick={onSale}>{detail.account.commercialStatus==='client'?'Ofrecer otra venta':'Crear una venta'}</Button>}</div>{!sales.length?<p>Todavía no hay ventas registradas. Una venta es algo concreto que queremos ofrecer.</p>:sales.slice(0,4).map(o=><div key={o.id} className={styles.summarySale}><Link to={'/opportunities?leadId='+o.id}>{o.opportunityName||'Propuesta inicial'}</Link><span>{o.estado||'Sin etapa'}</span></div>)}</section>
  <ContactPolicy accountId={id} blocked={detail.account.doNotContact} readOnly={readOnly}/>
  {contacting&&<TaskContactDialog task={contactTask} onClose={()=>setContacting(false)} onLog={(contactId,channel)=>{setContacting(false);setEditor({kind:'activity',accountId:id,contactIds:contactId?[contactId]:[],channel});}}/>}
  {editor&&q.data&&<WorkEditor target={editor} data={q.data} onClose={()=>setEditor(null)}/>}
 </div>;
}
