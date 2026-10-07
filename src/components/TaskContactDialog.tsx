import {WorkFlowSteps} from './WorkFlowSteps';
import {ContactTemplateDialog} from './ContactTemplateDialog';
import {getSettings} from '../endpoints/settings_GET.schema';
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
 const settings=useQuery({queryKey:['settings'],queryFn:getSettings,enabled:!!task.leadId});
 const [messageChannel,setMessageChannel]=useState<'email'|'whatsapp'|null>(null);
 const [contactId,setContact]=useState(''),[usedChannel,setUsedChannel]=useState('');
 const preferredId=task.contactIds.find(id=>q.data?.contacts.some(c=>c.id===id&&!c.deletedAt))||q.data?.opportunities.find(o=>o.id===task.leadId)?.primaryContactId||q.data?.contacts.find(c=>!c.deletedAt&&c.isPrimary)?.id||'';
 const effective=contactId==='__business'?'':contactId||preferredId;
 const contact=q.data?.contacts.find(c=>c.id===effective&&!c.deletedAt);
 const phone=effective?contact?.phone:q.data?.account.telefono;
 const email=effective?contact?.email:q.data?.account.email;
 const digits=(phone||'').replace(/\D/g,'');
 const blocked=(channel:string)=>!!q.data?.account.doNotContact||!restrictions.data||restrictions.data.restrictions.some(r=>!r.liftedAt&&['all',channel].includes(r.channel)&&((effective&&String(r.contactId)===effective)||(!r.contactId&&String(r.leadId)===String(task.leadId))));
 return <><Dialog open={!messageChannel} onOpenChange={open=>{if(!open)onClose();}}><DialogContent className={styles.editor}><DialogHeader><DialogTitle>Contactar negocio</DialogTitle><DialogDescription>Primero hablá con la persona. Después registrá qué pasó y elegí cómo continuar. Abrir un canal no confirma que hayas enviado un mensaje.</DialogDescription></DialogHeader>
  <WorkFlowSteps current={0}/>
  {q.isPending&&<p>Cargando canales…</p>}{q.error&&<p role="alert">{q.error.message}</p>}
  {q.data&&<div className={styles.form}><label>Destinatario<select value={effective||'__business'} onChange={e=>{setContact(e.target.value==='__business'?'__business':e.target.value);setUsedChannel('')}}><option value="__business">Canal general de {q.data.account.nombre}</option>{q.data.contacts.filter(c=>!c.deletedAt).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>{(blocked('whatsapp')||blocked('email'))&&<p>Algunos canales están restringidos o todavía se están verificando. Solo mostramos las acciones permitidas.</p>}<p>Teléfono: {phone||'Sin datos'} · Email: {email||'Sin datos'}</p><div className={styles.actions}>{digits&&!blocked('whatsapp')&&<Button variant="outline" asChild><a onClick={()=>setUsedChannel('whatsapp')} href={'https://wa.me/'+digits} target="_blank" rel="noopener noreferrer">WhatsApp</a></Button>}{phone&&!blocked('phone')&&<Button variant="outline" asChild><a onClick={()=>setUsedChannel('phone')} href={'tel:'+phone}>Llamar</a></Button>}{email&&!blocked('email')&&<Button variant="outline" asChild><a onClick={()=>setUsedChannel('email')} href={'mailto:'+encodeURIComponent(email)}>Email</a></Button>}{task.leadId&&email&&!blocked('email')&&<Button variant="outline" onClick={()=>{setUsedChannel('email');setMessageChannel('email')}}>Preparar email con un mensaje modelo</Button>}{task.leadId&&digits&&!blocked('whatsapp')&&<Button variant="outline" onClick={()=>{setUsedChannel('whatsapp');setMessageChannel('whatsapp')}}>Preparar WhatsApp con un mensaje modelo</Button>}</div></div>}
 {q.data&&<section className={styles.conversationContinue}><h3>Después de hablar o intentar contactar</h3><p>Registrá el resultado y decidí el próximo paso en el mismo formulario.</p><Button onClick={()=>onLog(effective,usedChannel)}>Registrar qué pasó</Button></section>}
 {q.data&&!phone&&!email&&<p>Esta persona no tiene teléfono ni email. <Link to={'/accounts/'+task.accountId}>Agregar o revisar contacto</Link></p>}{!task.leadId&&email&&<p className={styles.muted}>Email abre tu aplicación de correo. Los mensajes modelo están disponibles al trabajar una gestión.</p>}<Button variant="ghost" onClick={onClose}>Volver</Button></DialogContent></Dialog>{messageChannel&&<ContactTemplateDialog open channel={messageChannel} initialContactId={effective} lead={{...q.data?.account,...q.data?.opportunities.find(o=>o.id===task.leadId),id:task.leadId,nombre:q.data?.account.nombre,email:q.data?.account.email,telefono:q.data?.account.telefono}} templates={settings.data?.templates??[]} onLog={onLog} onOpenChange={v=>{if(!v)setMessageChannel(null)}}/>}</>;
}
