import React,{useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {Link} from 'react-router-dom';
import {Loader,Button as ChannelLink} from '@mantine/core';
import {Mail,MessageCircle,Phone} from 'lucide-react';
import {CrmDialog} from './ui/CrmDialog';
import {CrmButton as Button} from './ui/CrmButton';
import {CrmNativeSelect} from './ui/CrmNativeSelect';
import {WorkFlowSteps} from './WorkFlowSteps';
import {ContactTemplateDialog} from './ContactTemplateDialog';
import {BusinessContactDialog} from './BusinessContactDialog';
import {getSettings} from '../endpoints/settings_GET.schema';
import {getCommunication} from '../endpoints/communication.schema';
import {getCommercialDetail} from '../endpoints/commercial.schema';
import type {WorkTask} from '../endpoints/work.schema';
import styles from './Commercial.module.css';

/** A task keeps its scope, including closed managements and general business work. */
export function TaskContactDialog({task,onClose,onLog}:{task:WorkTask;onClose:()=>void;onLog:(contactId:string,channel:string)=>void}){
 const q=useQuery({queryKey:['commercial-detail',task.accountId,''],queryFn:()=>getCommercialDetail(task.accountId)});
 const restrictions=useQuery({queryKey:['communication','account',task.accountId],queryFn:()=>getCommunication('',task.accountId)});
 const settings=useQuery({queryKey:['settings'],queryFn:getSettings,enabled:!!task.leadId});
 const [messageChannel,setMessageChannel]=useState<'email'|'whatsapp'|null>(null);
 const [contactId,setContact]=useState(''),[usedChannel,setUsedChannel]=useState('');
 const opportunity=q.data?.opportunities.find(o=>String(o.id)===String(task.leadId)&&!o.deletedAt);
 const preferredId=task.contactIds.find(id=>q.data?.contacts.some(c=>String(c.id)===id&&!c.deletedAt))||opportunity?.primaryContactId||q.data?.contacts.find(c=>!c.deletedAt&&c.isPrimary)?.id||'';
 const effective=contactId==='__business'?'':contactId||String(preferredId);
 const contact=q.data?.contacts.find(c=>String(c.id)===effective&&!c.deletedAt);
 const phone=effective?contact?.phone:q.data?.account.telefono;
 const email=effective?contact?.email:q.data?.account.email;
 const blocked=(channel:string)=>!!q.data?.account.doNotContact||!restrictions.data||!!restrictions.error||restrictions.data.restrictions.some(r=>!r.liftedAt&&['all',channel].includes(r.channel)&&((effective&&String(r.contactId)===effective)||(!r.contactId&&String(r.leadId)===String(task.leadId))));
 const loading=q.isPending||restrictions.isPending||(!!task.leadId&&settings.isPending);
 const error=q.error||restrictions.error||(task.leadId?settings.error:null);
 const closeMessage=()=>setMessageChannel(null);
 if(messageChannel&&q.data){
  if(!task.leadId)return <BusinessContactDialog detail={q.data} initialChannel={messageChannel} initialContactId={effective} onLog={onLog} onClose={closeMessage}/>;
  if(opportunity)return <ContactTemplateDialog open channel={messageChannel} initialContactId={effective} lead={{...q.data.account,...opportunity,nombre:q.data.account.nombre,email:q.data.account.email,telefono:q.data.account.telefono}} templates={settings.data?.templates??[]} onLog={onLog} onOpenChange={v=>{if(!v)closeMessage()}}/>;
 }
 return <CrmDialog opened onClose={onClose} title="Contactar negocio" description="Elegí el destinatario y prepará el mensaje antes de abrir el canal. Después registrá qué pasó y cómo continuar.">
  <WorkFlowSteps current={0}/>
  <p className={styles.contextNote}><strong>{task.accountName}</strong> · {task.leadId?(task.opportunityName||'Esta gestión'):'Seguimiento general del negocio'}</p>
  {loading&&<p role="status"><Loader size="sm"/> Cargando contactos y restricciones…</p>}
  {error&&<><p role="alert">{error.message}</p><Button variant="default" disabled={q.isFetching||restrictions.isFetching||settings.isFetching} onClick={()=>{void q.refetch();void restrictions.refetch();if(task.leadId)void settings.refetch()}}>Reintentar carga</Button></>}
  {q.data&&!loading&&!error&&<div className={styles.form}>
   <CrmNativeSelect label="Destinatario" value={effective||'__business'} onChange={e=>{setContact(e.target.value);setUsedChannel('')}} data={[{value:'__business',label:'Canal general de '+q.data.account.nombre},...q.data.contacts.filter(c=>!c.deletedAt).map(c=>({value:String(c.id),label:c.name}))]}/>
   <p>Teléfono: {phone||'Sin datos'} · Email: {email||'Sin datos'}</p>
   {(blocked('whatsapp')||blocked('email')||blocked('phone'))&&<p role="status">Algunos canales están restringidos. Solo mostramos las acciones permitidas.</p>}
   {task.leadId&&!opportunity&&<p role="alert">La gestión de esta tarea ya no está disponible. Revisá la tarea antes de preparar un mensaje.</p>}
   {!task.leadId&&<p>Para escribir usarás el recorrido de Contactar: elegí una gestión o prepará una explícitamente. Esta tarea seguirá siendo general.</p>}
   <div className={styles.actions}>
    {!!phone?.replace(/\D/g,'')&&!blocked('whatsapp')&&<Button variant="default" leftSection={<MessageCircle size={18} aria-hidden="true"/>} disabled={!!task.leadId&&!opportunity} onClick={()=>{setUsedChannel('whatsapp');setMessageChannel('whatsapp')}}>Preparar WhatsApp con un mensaje modelo</Button>}
    {email&&!blocked('email')&&<Button variant="default" leftSection={<Mail size={18} aria-hidden="true"/>} disabled={!!task.leadId&&!opportunity} onClick={()=>{setUsedChannel('email');setMessageChannel('email')}}>Preparar email con un mensaje modelo</Button>}
    {phone&&!blocked('phone')&&<ChannelLink component="a" variant="default" leftSection={<Phone size={18} aria-hidden="true"/>} href={'tel:'+phone} onClick={()=>setUsedChannel('phone')}>Llamar</ChannelLink>}
   </div>
   {!phone&&!email&&<p>Este destinatario no tiene teléfono ni email. <Link to={'/accounts/'+task.accountId}>Agregar o revisar contacto</Link></p>}
   <section className={styles.conversationContinue}><h3>Después de hablar o intentar contactar</h3><p>Abrir un canal no confirma un envío. También podés registrar una llamada o un intento sin respuesta.</p><Button onClick={()=>onLog(effective,usedChannel)}>Registrar qué pasó</Button></section>
  </div>}
  <Button mt="md" variant="subtle" onClick={onClose}>Volver</Button>
 </CrmDialog>;
}
