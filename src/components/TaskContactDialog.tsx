import React,{useEffect,useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {Link} from 'react-router-dom';
import {Loader} from '@mantine/core';
import {Mail,MessageCircle} from 'lucide-react';
import {CrmDialog} from './ui/CrmDialog';
import {CrmButton as Button} from './ui/CrmButton';
import {CrmNativeSelect} from './ui/CrmNativeSelect';
import {WorkFlowSteps} from './WorkFlowSteps';
import {ContactTemplateDialog} from './ContactTemplateDialog';
import {BusinessContactDialog} from './BusinessContactDialog';
import {PhoneCallPanel} from './PhoneCallPanel';
import {PersonPhoneDncNotice} from './PersonPhoneDncWarning';
import {getSettings} from '../endpoints/settings_GET.schema';
import {getCommunication} from '../endpoints/communication.schema';
import {getCommercialDetail} from '../endpoints/commercial.schema';
import type {WorkTask} from '../endpoints/work.schema';
import {useAuth} from '../helpers/useAuth';
import {canModifyBusiness,canModifyManagement} from '../helpers/crmPermissions';
import {canPrepareDelegatedMessage} from '../helpers/delegatedMessagePolicy';
import {initialCommunicationRecipient} from '../helpers/communicationRecipient';
import {userLabel} from '../helpers/crmLabels';
import {VOCAB} from '../content/vocabulary';
import styles from './Commercial.module.css';
import {useFloatingComposer} from './FloatingComposerContext';

/** A task keeps its scope, including closed managements and general business work. */
export function TaskContactDialog({task,onClose,onLog}:{task:WorkTask;onClose:()=>void;onLog:(contactId:string,channel:string)=>void}){
 const {authState}=useAuth();const user=authState.type==='authenticated'?authState.user:undefined;const floatingComposer=useFloatingComposer();
 const restoreExisting=floatingComposer?.active&&task.typeId==='message'&&String(task.leadId)===floatingComposer.leadId;
 // Restore after render: calling the parent's state setters while rendering triggers React warnings.
 useEffect(()=>{if(!restoreExisting)return;floatingComposer?.restore();onClose()},[restoreExisting]);
 const q=useQuery({queryKey:['commercial-detail',task.accountId,''],queryFn:()=>getCommercialDetail(task.accountId)});
 const restrictions=useQuery({queryKey:['communication','account',task.accountId],queryFn:()=>getCommunication('',task.accountId)});
 const settings=useQuery({queryKey:['settings'],queryFn:getSettings,enabled:!!task.leadId});
 const [messageChannel,setMessageChannel]=useState<'email'|'whatsapp'|null>(null);
 const [contactId,setContact]=useState(''),[usedChannel,setUsedChannel]=useState('');
 const opportunity=q.data?.opportunities.find(o=>String(o.id)===String(task.leadId)&&!o.deletedAt);
 const canPrepare=task.leadId?(canModifyManagement(user,opportunity,q.data?.account)||canPrepareDelegatedMessage({taskPending:task.status==='pending',taskAssigneeEmail:task.assignedUserEmail,managementOwnerEmail:opportunity?.assignedUserEmail??null,userEmail:user?.email??null,admin:user?.role==='admin',doNotContact:q.data?.account.doNotContact===true})):canModifyBusiness(user,q.data?.account)||!!q.data?.opportunities.some(o=>canModifyManagement(user,o,q.data?.account));
 const availableContacts=q.data?.contacts.filter(c=>!c.deletedAt)??[];
 const initialRecipient=initialCommunicationRecipient(availableContacts.map(c=>String(c.id)));
 const effective=contactId==='__business'?'':contactId||initialRecipient;
 const mustChooseRecipient=availableContacts.length>1&&!contactId;
 const contact=q.data?.contacts.find(c=>String(c.id)===effective&&!c.deletedAt);
 const phone=effective?contact?.phone:q.data?.account.telefono;
 const email=effective?contact?.email:q.data?.account.email;
 const blocked=(channel:string)=>!!q.data?.account.doNotContact||!restrictions.data||!!restrictions.error||restrictions.data.restrictions.some(r=>!r.liftedAt&&['all',channel].includes(r.channel)&&((effective&&String(r.contactId)===effective)||(!r.contactId&&String(r.leadId)===String(task.leadId))));
 const loading=q.isPending||restrictions.isPending||(!!task.leadId&&settings.isPending);
 const error=q.error||restrictions.error||(task.leadId?settings.error:null);
 const closeMessage=()=>setMessageChannel(null);
 if(restoreExisting)return null;
 if(messageChannel&&q.data){
  if(!task.leadId)return <BusinessContactDialog detail={q.data} initialChannel={messageChannel} initialContactId={effective} onLog={onLog} onClose={closeMessage}/>;
  if(opportunity)return <ContactTemplateDialog open taskId={task.leadId&&user&&user.role!=='admin'&&opportunity?.assignedUserEmail!==user.email?task.id:undefined} channel={messageChannel} initialContactId={effective} lead={{...q.data.account,...opportunity,nombre:q.data.account.nombre,email:q.data.account.email,telefono:q.data.account.telefono}} templates={settings.data?.templates??[]} onLog={onLog} onOpenChange={v=>{if(!v)closeMessage()}}/>;
 }
 return <CrmDialog opened onClose={onClose} title="Contactar negocio" description="Elegí el destinatario y prepará el mensaje antes de abrir el canal. Después registrá qué pasó y cómo continuar.">
  <WorkFlowSteps current={0}/>
  <p className={styles.contextNote}><strong>{task.accountName}</strong> · {task.leadId?(task.opportunityName||'Esta gestión'):'Del negocio en general'}<br/>{VOCAB.assignedTo}: {userLabel(q.data?.users,task.assignedUserEmail)} · {VOCAB.businessOwner}: {userLabel(q.data?.users,q.data?.account.assignedUserEmail)}{opportunity&&<> · {VOCAB.managementOwner}: {userLabel(q.data?.users,opportunity.assignedUserEmail)}</>}</p>
  {loading&&<p role="status"><Loader size="sm"/> Cargando contactos y restricciones…</p>}
  {error&&<><p role="alert">{error.message}</p><Button variant="default" disabled={q.isFetching||restrictions.isFetching||settings.isFetching} disabledReason={(q.isFetching || restrictions.isFetching || settings.isFetching) ? "La operación está en curso. Esperá a que termine para continuar." : "Estamos cargando. Esperá a que termine."} onClick={()=>{void q.refetch();void restrictions.refetch();if(task.leadId)void settings.refetch()}}>Reintentar carga</Button></>}
  {q.data&&!loading&&!error&&<div className={styles.form}>
   <CrmNativeSelect label="Destinatario" value={mustChooseRecipient?'':effective||'__business'} onChange={e=>{setContact(e.target.value);setUsedChannel('')}} data={[...(mustChooseRecipient?[{value:'',label:'Elegí una persona o el canal general'}]:[]),{value:'__business',label:'Canal general de '+q.data.account.nombre},...availableContacts.map(c=>({value:String(c.id),label:c.name}))]}/>
   <p>{mustChooseRecipient?'Elegí explícitamente a quién contactar.':<>Teléfono: {phone||'Sin datos'} · Email: {email||'Sin datos'}</>}</p>
   {!mustChooseRecipient&&<PersonPhoneDncNotice businesses={contact?.dncPhoneBusinesses}/>}
   {(blocked('whatsapp')||blocked('email')||blocked('call'))&&<p role="status">Algunos canales están restringidos. Solo mostramos las acciones permitidas.</p>}
   {task.leadId&&!opportunity&&<p role="alert">La gestión de esta tarea ya no está disponible. Revisá la tarea antes de preparar un mensaje.</p>}
   {!canPrepare&&<p>Para preparar mensajes, necesitás ser responsable de la gestión o admin. Si sos delegado, usá la tarea pendiente que está asignada a vos.</p>}
   {!task.leadId&&<p>Para escribir abrimos Contactar: podés hacerlo sin gestión o elegir una. Esta tarea sigue siendo general.</p>}
   <div className={styles.actions}>
    {!!phone?.replace(/\D/g,'')&&!blocked('whatsapp')&&<Button variant="default" leftSection={<MessageCircle size={18} aria-hidden="true"/>} disabled={!canPrepare||mustChooseRecipient} disabledReason={mustChooseRecipient?'Elegí explícitamente a quién contactar.':'Solo el responsable de esta gestión o un administrador puede preparar mensajes; la tarea asignada no otorga ese permiso.'} onClick={()=>{setUsedChannel('whatsapp');setMessageChannel('whatsapp')}}>Preparar WhatsApp con un mensaje modelo</Button>}
    {email&&!blocked('email')&&<Button variant="default" leftSection={<Mail size={18} aria-hidden="true"/>} disabled={!canPrepare||mustChooseRecipient} disabledReason={mustChooseRecipient?'Elegí explícitamente a quién contactar.':'Solo el responsable de esta gestión o un administrador puede preparar mensajes; la tarea asignada no otorga ese permiso.'} onClick={()=>{setUsedChannel('email');setMessageChannel('email')}}>Preparar email con un mensaje modelo</Button>}
   </div>
   {!blocked('call')&&<PhoneCallPanel key={effective+(mustChooseRecipient?':choose':'')} account={q.data.account} contacts={q.data.contacts} leadId={task.leadId?String(task.leadId):null} fixedRecipient={{id:effective,mustChoose:mustChooseRecipient}} hideDncNotice onLog={onLog} onFinished={onClose}/>}
   {!phone&&!email&&<p>Este destinatario no tiene teléfono ni email. <Link to={'/accounts/'+task.accountId}>Agregar o revisar personas</Link></p>}
   <section className={styles.conversationContinue}><h3>Después de hablar o intentar contactar</h3><p>Abrir un canal no confirma un envío. También podés registrar una llamada o un intento sin respuesta.</p><Button onClick={()=>onLog(effective,usedChannel)}>{VOCAB.logWhatHappened}</Button></section>
  </div>}
  <Button mt="md" variant="subtle" onClick={onClose}>Volver</Button>
 </CrmDialog>;
}
