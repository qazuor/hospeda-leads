import {getCommunication} from '../endpoints/communication.schema';
import React,{useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from './Dialog';
import {Button} from './Button';
import {getCommercialDetail} from '../endpoints/commercial.schema';
import type {WorkTask} from '../endpoints/work.schema';
import styles from './Commercial.module.css';
/** General business tasks can contact the business without inventing an opportunity. */
export function TaskContactDialog({task,onClose,onLog}:{task:WorkTask;onClose:()=>void;onLog:()=>void}){
 const q=useQuery({queryKey:['commercial-detail',task.accountId,''],queryFn:()=>getCommercialDetail(task.accountId)});
 const restrictions=useQuery({queryKey:['communication','account',task.accountId],queryFn:()=>getCommunication('',task.accountId)});
 const [contactId,setContact]=useState('');
 const contact=q.data?.contacts.find(c=>c.id===contactId&&!c.deletedAt);
 const phone=contactId?contact?.phone:q.data?.account.telefono;
 const email=contactId?contact?.email:q.data?.account.email;
 const digits=(phone||'').replace(/\D/g,'');
 const blocked=(channel:string)=>!!q.data?.account.doNotContact||!restrictions.data||restrictions.data.restrictions.some(r=>!r.liftedAt&&['all',channel].includes(r.channel)&&contactId&&String(r.contactId)===contactId);
 return <Dialog open onOpenChange={open=>{if(!open)onClose();}}><DialogContent className={styles.editor}><DialogHeader><DialogTitle>Contactar negocio</DialogTitle><DialogDescription>Elegí los datos genéricos o una persona. Abrir un canal no marca la comunicación como realizada; registrá después el resultado.</DialogDescription></DialogHeader>
  {q.isPending&&<p>Cargando canales…</p>}{q.error&&<p role="alert">{q.error.message}</p>}
  {q.data&&<div className={styles.form}><label>Destinatario<select value={contactId} onChange={e=>setContact(e.target.value)}><option value="">Datos genéricos de {q.data.account.nombre}</option>{q.data.contacts.filter(c=>!c.deletedAt).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>{(blocked('whatsapp')||blocked('email'))&&<p>No contactar o restricciones pendientes de comprobar. Revisá Comunicación en la oportunidad.</p>}<p>Teléfono: {phone||'Sin datos'} · Email: {email||'Sin datos'}</p><div className={styles.actions}>{digits&&!blocked('whatsapp')&&<Button variant="outline" asChild><a href={'https://wa.me/'+digits} target="_blank" rel="noopener noreferrer">WhatsApp</a></Button>}{phone&&!blocked('all')&&<Button variant="outline" asChild><a href={'tel:'+phone}>Llamar</a></Button>}{email&&!blocked('email')&&<Button variant="outline" asChild><a href={'mailto:'+encodeURIComponent(email)}>Email</a></Button>}<Button onClick={onLog}>Registrar actividad</Button></div></div>}
 </DialogContent></Dialog>;
}
