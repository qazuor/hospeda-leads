import {Link} from 'react-router-dom';
import {getCommunication} from '../endpoints/communication.schema';
import React,{useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from './Dialog';
import {Button} from './Button';
import {getCommercialDetail} from '../endpoints/commercial.schema';
import type {WorkTask} from '../endpoints/work.schema';
import styles from './Commercial.module.css';
/** General business tasks can contact the business without inventing an opportunity. */
export function TaskContactDialog({task,onClose,onLog}:{task:WorkTask;onClose:()=>void;onLog:(contactId:string,channel:string)=>void}){
 const q=useQuery({queryKey:['commercial-detail',task.accountId,''],queryFn:()=>getCommercialDetail(task.accountId)});
 const restrictions=useQuery({queryKey:['communication','account',task.accountId],queryFn:()=>getCommunication('',task.accountId)});
 const [contactId,setContact]=useState(''),[usedChannel,setUsedChannel]=useState('');
 const preferredId=task.contactIds.find(id=>q.data?.contacts.some(c=>c.id===id&&!c.deletedAt))||q.data?.opportunities.find(o=>o.id===task.leadId)?.primaryContactId||q.data?.contacts.find(c=>!c.deletedAt&&c.isPrimary)?.id||'';
 const effective=contactId==='__business'?'':contactId||preferredId;
 const contact=q.data?.contacts.find(c=>c.id===effective&&!c.deletedAt);
 const phone=effective?contact?.phone:q.data?.account.telefono;
 const email=effective?contact?.email:q.data?.account.email;
 const digits=(phone||'').replace(/\D/g,'');
 const blocked=(channel:string)=>!!q.data?.account.doNotContact||!restrictions.data||restrictions.data.restrictions.some(r=>!r.liftedAt&&['all',channel].includes(r.channel)&&((effective&&String(r.contactId)===effective)||(!r.contactId&&String(r.leadId)===String(task.leadId))));
 return <Dialog open onOpenChange={open=>{if(!open)onClose();}}><DialogContent className={styles.editor}><DialogHeader><DialogTitle>Contactar negocio</DialogTitle><DialogDescription>Elegí los datos genéricos o una persona. Abrir un canal no marca la comunicación como realizada; registrá después el resultado.</DialogDescription></DialogHeader>
  {q.isPending&&<p>Cargando canales…</p>}{q.error&&<p role="alert">{q.error.message}</p>}
  {q.data&&<div className={styles.form}><label>Destinatario<select value={effective||'__business'} onChange={e=>{setContact(e.target.value==='__business'?'__business':e.target.value);setUsedChannel('')}}><option value="__business">Canal general de {q.data.account.nombre}</option>{q.data.contacts.filter(c=>!c.deletedAt).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>{(blocked('whatsapp')||blocked('email'))&&<p>Algunos canales están restringidos o todavía se están verificando. Solo mostramos las acciones permitidas.</p>}<p>Teléfono: {phone||'Sin datos'} · Email: {email||'Sin datos'}</p><div className={styles.actions}>{digits&&!blocked('whatsapp')&&<Button variant="outline" asChild><a onClick={()=>setUsedChannel('whatsapp')} href={'https://wa.me/'+digits} target="_blank" rel="noopener noreferrer">WhatsApp</a></Button>}{phone&&!blocked('phone')&&<Button variant="outline" asChild><a onClick={()=>setUsedChannel('phone')} href={'tel:'+phone}>Llamar</a></Button>}{email&&!blocked('email')&&<Button variant="outline" asChild><a onClick={()=>setUsedChannel('email')} href={'mailto:'+encodeURIComponent(email)}>Email</a></Button>}{task.leadId&&!blocked(contact?.preferredChannel?.toLowerCase()==='email'||(!phone&&email)?'email':'whatsapp')&&<Button variant="outline" asChild><Link to={'/opportunities?leadId='+task.leadId+'&contact='+(contact?.preferredChannel?.toLowerCase()==='email'||(!phone&&email)?'email':'whatsapp')}>Preparar mensaje con una plantilla</Link></Button>}<Button onClick={()=>onLog(effective,usedChannel)}>Registrar qué pasó</Button></div></div>}
 </DialogContent></Dialog>;
}
