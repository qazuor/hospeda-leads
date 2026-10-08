import { Disclosure, DisclosureSummary } from './Disclosure';
import React,{useState} from 'react';
import {Link} from 'react-router-dom';
import {useQuery} from '@tanstack/react-query';
import {getWork,type WorkTask} from '../endpoints/work.schema';
import {getCommercialDetail,type CommercialDetail} from '../endpoints/commercial.schema';
import {nextStep,pendingWork,type WorkPurpose} from '../helpers/nextStep';
import {localDay} from '../helpers/workDates';
import {useAuth} from '../helpers/useAuth';
import {Button} from './Button';
import {TaskRow} from './WorkPanel';
import {TaskContactDialog} from './TaskContactDialog';
import {WorkEditor,type WorkTarget} from './WorkEditor';
import styles from './Commercial.module.css';

export function NextWork({accountId,leadId,classification='open',detail,onAddContact,onContact,onAddChannel,readOnly=false}:{accountId:string;leadId?:string;classification?:string;detail?:CommercialDetail;onAddContact?:()=>void;onContact?:()=>void;onAddChannel?:()=>void;readOnly?:boolean}){
 const {authState}=useAuth();const user=authState.type==='authenticated'?authState.user:null;
 const scope=user?.role==='admin'?'all':undefined;
 const work=useQuery({queryKey:['work','next',accountId,scope],queryFn:()=>getWork({accountId,mode:'detail',responsible:scope})});
 const business=useQuery({queryKey:['commercial-detail',accountId,''],queryFn:()=>getCommercialDetail(accountId),enabled:!detail});
 const d=detail??business.data;
 const [editor,setEditor]=useState<WorkTarget|null>(null),[contacting,setContacting]=useState(false);
 if(work.isPending||(!d&&business.isPending))return <section className={styles.nextWork} role="status">Buscando el próximo paso…</section>;
 if(work.error||(!d&&business.error))return <section className={styles.nextWork} role="alert"><p>{work.error?.message||business.error?.message}</p><Button variant="outline" onClick={()=>{void work.refetch();void business.refetch()}}>Volver a intentar</Button></section>;
 if(!d||!work.data)return null;
 const person=d.contacts.find(c=>!c.deletedAt&&(c.phone||c.email)&&(c.id===d.opportunities.find(o=>o.id===leadId)?.primaryContactId))||d.contacts.find(c=>!c.deletedAt&&c.isPrimary&&(c.phone||c.email))||d.contacts.find(c=>!c.deletedAt&&(c.phone||c.email));
 const can=user&&(user.role==='admin'||(leadId?d.opportunities.find(o=>o.id===leadId)?.assignedUserEmail:d.account.assignedUserEmail)===user.email)&&!readOnly;
 const step=nextStep({tasks:work.data.tasks,leadId,classification,blocked:d.account.doNotContact,finished:work.data.activities.find(a=>!leadId||a.leadId===leadId||(classification==='won'&&!a.leadId))?.continuation==='done',hasContact:!!(person?.phone||person?.email||d.account.telefono||d.account.email)});
 const purpose:WorkPurpose=classification==='won'?'care':classification==='lost'?'reactivation':'commercial';
 const tasks=pendingWork(work.data.tasks,leadId,classification==='won');
 const synthetic:WorkTask={id:'',accountId,leadId:leadId??null,title:'Conversación con '+d.account.nombre,purpose,description:null,typeId:'call',assignedUserEmail:d.account.assignedUserEmail,dueDate:localDay(),dueAt:null,priority:'media',status:'pending',result:null,completedAt:null,legacy:false,participants:'',contactIds:person?[person.id]:[],accountName:d.account.nombre,city:d.account.ciudad,opportunityName:null,deletedAt:null};
 return <section className={styles.nextWork} data-state={step.kind==='blocked'?'blocked':classification} aria-label="Próximo paso">
  <div><span className={styles.eyebrow}>{classification==='won'?(leadId?'VENTA CONCRETADA':'CLIENTE'):classification==='lost'?'VENTA CERRADA SIN VENTA':'AHORA CORRESPONDE'}</span><h2>{step.kind==='task'?'Tu próximo paso':step.title}</h2><p>{step.help}</p><p className={styles.muted}>{scope==='all'?'Trabajo del equipo':'Trabajo visible para vos'}{leadId?' · Esta gestión'+(classification==='won'?' y acompañamiento general':''):' · Este negocio y sus gestiones'}</p></div>
  {!step.task&&<p>Sin próximo paso programado.</p>}
  {step.kind==='task'&&<><TaskRow task={step.task!} data={work.data} onEdit={setEditor}/>{step.task&&!step.task.leadId&&leadId&&<p className={styles.muted}>Esta tarea acompaña al negocio en general.</p>}{tasks.length>1&&<Disclosure><DisclosureSummary>Otros próximos pasos ({tasks.length-1})</DisclosureSummary><div className={styles.rows}>{tasks.slice(1,4).map(t=><TaskRow key={t.id} task={t} data={work.data!} onEdit={setEditor}/>)}</div><p>El resto está en Seguimiento.</p></Disclosure>}</>}
  {step.kind==='blocked'&&tasks.length>0&&<Disclosure><DisclosureSummary>Compromisos pendientes ({tasks.length})</DisclosureSummary><p>La restricción de contacto se conserva. Podés revisar y registrar tareas internas.</p><div className={styles.rows}>{tasks.slice(0,4).map(t=><TaskRow key={t.id} task={t} data={work.data!} onEdit={setEditor}/>)}</div></Disclosure>}
  {can&&step.kind==='contact'&&onAddChannel&&<Button onClick={onAddChannel}>Agregar teléfono o email</Button>}
  {can&&step.kind==='contact'&&(onAddContact?<Button onClick={onAddContact}>Agregar persona de contacto</Button>:<Button asChild><Link to={'/accounts/'+accountId}>Agregar o revisar contacto</Link></Button>)}
  {can&&(step.kind==='plan'||step.kind==='done')&&<Button variant={step.kind==='done'?'outline':'primary'} onClick={()=>setEditor({kind:'task',accountId,leadId,purpose,title:classification==='won'?'Consultar cómo le fue':classification==='lost'?'Retomar conversación':''})}>Planificar próximo paso</Button>}
  {can&&step.kind!=='blocked'&&step.kind!=='contact'&&<Disclosure><DisclosureSummary>Otras acciones</DisclosureSummary><div className={styles.actions}><Button variant="outline" onClick={()=>onContact?onContact():setContacting(true)}>Contactar ahora</Button><Button variant="outline" onClick={()=>setEditor({kind:'activity',accountId,leadId,purpose,title:'Conversación con '+d.account.nombre})}>Registrar una conversación realizada</Button>{step.kind==='task'&&<Button variant="outline" onClick={()=>setEditor({kind:'task',accountId,leadId,purpose})}>Agregar otro próximo paso</Button>}</div></Disclosure>}
  {!can&&<p className={styles.muted}>Responsable: {d.users?.find(u=>u.email===(leadId?d.opportunities.find(o=>o.id===leadId)?.assignedUserEmail:d.account.assignedUserEmail))?.displayName||'Sin asignar'}. Las tareas que tengas asignadas conservan sus propias acciones.</p>}
  {contacting&&<TaskContactDialog task={synthetic} onClose={()=>setContacting(false)} onLog={(id,channel)=>{setContacting(false);setEditor({kind:'activity',accountId,leadId,purpose,title:'Conversación con '+d.account.nombre,contactIds:id?[id]:[],channel})}}/>}
  {editor&&<WorkEditor target={editor} data={work.data} onClose={()=>setEditor(null)}/>}
 </section>;
}
