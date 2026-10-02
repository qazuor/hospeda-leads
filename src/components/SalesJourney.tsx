import React from 'react';
import {useQuery} from '@tanstack/react-query';
import {getWork} from '../endpoints/work.schema';
import {prettyInstant} from '../helpers/workDates';
import styles from './Commercial.module.css';
const steps=[['Contacto','Identificá a la persona que decide y preguntá si quiere conversar.','Contactos y canales del negocio'],['Necesidad','Escuchá qué necesita y dejá sus palabras en una actividad o nota.','Seguimiento y Notas'],['Propuesta','Prepará qué ofrecés, condiciones y material. Acordá una fecha para revisarlo.','Documentos y Mensajes'],['Decisión','Resolvé las dudas. Registrá Ganada si acepta o Perdida con el motivo real.','Cambiar etapa y acompañamiento']];
export function SalesJourney({accountId,leadId}:{accountId:string;leadId:string}){
 const q=useQuery({queryKey:['work','sales-guide',leadId],queryFn:()=>getWork({accountId,leadId,mode:'detail'})});
 const activity=q.data?.activities.filter(a=>String(a.leadId)===leadId).sort((a,b)=>new Date(b.occurredAt).getTime()-new Date(a.occurredAt).getTime())[0];
 const tasks=q.data?.tasks.filter(t=>String(t.leadId)===leadId&&t.status==='pending'&&!t.deletedAt).sort((a,b)=>a.dueDate.localeCompare(b.dueDate));
 return <section className={styles.panel} aria-label="Guía del avance comercial"><h3>Cómo avanzar con esta venta</h3><p>Contacto → Necesidad → Propuesta → Decisión. Es una guía: podés volver a un paso y las etapas del equipo se conservan. Abrí el paso que necesitás entender.</p>
 <div className={styles.journey}>{steps.map(([name,help,where],i)=><details key={name}><summary>{i+1}. {name}</summary><p>{help}</p><p className={styles.muted}>Dónde hacerlo: {where}.</p></details>)}</div>
 {q.isPending?<p role="status">Buscando la última acción y el próximo paso…</p>:q.error?<p role="alert">{q.error.message}</p>:<><p><strong>Última acción de esta venta:</strong> {activity?activity.title+' · '+prettyInstant(activity.occurredAt):'Todavía no hay una acción registrada.'}</p>{activity?.result&&<p>{activity.result}</p>}<p><strong>Próximo paso:</strong> {tasks?.[0]?tasks[0].title+' · '+tasks[0].dueDate:'No hay una tarea pendiente de esta venta. En Seguimiento podés planificarla.'}</p></>}
 </section>;
}
