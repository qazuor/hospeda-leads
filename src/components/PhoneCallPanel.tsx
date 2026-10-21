import React,{useEffect,useRef,useState,type MutableRefObject} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {Button as ChannelLink} from '@mantine/core';
import {Copy,Phone} from 'lucide-react';
import {CrmButton as Button} from './ui/CrmButton';
import {CrmNativeSelect} from './ui/CrmNativeSelect';
import {Textarea} from './Textarea';
import {OutcomeAfterContact} from './OutcomeAfterContact';
import {getCommunication,postCommunication,type Message} from '../endpoints/communication.schema';
import {useGuardedMutation} from '../helpers/useGuardedMutation';
import {useMediaQuery} from '../helpers/useMediaQuery';
import {channelRecipientChoice} from '../helpers/communicationRecipient';
import {callSummary,isDialable,telHref} from '../helpers/phoneCall';
import {canLogContactOutcome} from '../helpers/contactOutcome';
import type {ContactPurpose} from '../helpers/contactPurpose';
import {VOCAB} from '../content/vocabulary';
import {PersonPhoneDncNotice} from './PersonPhoneDncWarning';
import styles from './PhoneCallPanel.module.css';

type Person={id:string|number;name:string;phone:string|null;deletedAt?:Date|string|null;dncPhoneBusinesses?:{nombre:string;ciudad:string|null}[]};
/** State that must outlive the panel (it unmounts when the channel or a block reason changes): the saved call and the request key of the attempt in progress. */
export type CallSession={logged:Message|null;setLogged:(message:Message|null)=>void;attempt:MutableRefObject<string|null>;reset:()=>void};
/** Owner-side state of a call: keep it in the component that mounts the panel so a saved call stays saved and an uncertain save is retried with the same key. */
export function useCallSession():CallSession{
 const [logged,setLogged]=useState<Message|null>(null),attempt=useRef<string|null>(null);
 return {logged,setLogged:message=>{setLogged(message);if(message)attempt.current=null},attempt,reset:()=>{setLogged(null);attempt.current=null}};
}
type PanelProps={session?:CallSession;account:{id:string|number;nombre:string;telefono:string|null};contacts:Person[];leadId:string|null;purpose?:{purpose:ContactPurpose;otherPurpose:string}|null;blockedReason?:string;initialContactId?:string;fixedRecipient?:{id:string;mustChoose:boolean};/** The caller already shows the No contactar phone notice for this person. */hideDncNotice?:boolean;onLog?:(contactId:string,channel:string)=>void;onFinished:()=>void};

/**
 * One way to call, for a management or for the business alone. Showing, copying or opening the number never records anything:
 * only "Ya llamé" does, and it ends in "¿Cómo salió?" → "¿Cómo sigue?". `fixedRecipient` is for a caller that already asked who to call (a task): the panel then shows no person picker. With `onLog` (a task's own completion path) it hands over to that path instead of saving a call.
 */
export function PhoneCallPanel({account,contacts,leadId,purpose=null,blockedReason='',initialContactId,fixedRecipient,hideDncNotice,onLog,onFinished,session}:PanelProps){
 const own=useCallSession(),{logged,setLogged,attempt}=session??own;
 const qc=useQueryClient(),touch=useMediaQuery('(pointer: coarse)');
 const people=contacts.filter(c=>!c.deletedAt);
 const history=useQuery({queryKey:['communication','account',String(account.id)],queryFn:()=>getCommunication('',String(account.id))});
 const [picked,setPicked]=useState<string|null>(null),[note,setNote]=useState(''),[notice,setNotice]=useState(''),[outcomeOpen,setOutcomeOpen]=useState(false);
 useEffect(()=>{if(!logged){setNote('');setNotice('')}},[logged]);
 const choice=channelRecipientChoice({contacts:people,channel:'whatsapp',requestedId:initialContactId,generalValue:account.telefono});
 const effective=fixedRecipient?fixedRecipient.id:picked??choice.recipientId,mustChoose=fixedRecipient?fixedRecipient.mustChoose:choice.mustChoose&&picked===null;
 const person=people.find(c=>String(c.id)===effective);
 const phone=mustChoose?'':((effective?person?.phone:account.telefono)??'').trim();
 const who=person?.name??account.nombre;
 const restricted=history.data?.restrictions.some(r=>!r.liftedAt&&['all','call'].includes(r.channel)&&((effective&&String(r.contactId)===effective)||(!r.contactId&&(r.leadId==null||String(r.leadId)===String(leadId??'')))));
 // Rules that stop any use of the number (also on a task's own completion path); purpose only matters when this panel saves the call.
 const base=blockedReason||(history.isPending?'Esperá a que se carguen las restricciones de contacto.':history.error?'No pudimos revisar las restricciones. Reintentá antes de llamar.':restricted?'Este destinatario tiene una restricción activa para llamadas.':mustChoose?'Elegí a quién vas a llamar.':'');
 const callBlock=base||(!onLog&&!leadId&&!purpose?'Elegí el propósito del contacto.':'');
 // Without a stored number she can still say she called (an incoming call, another number); only showing, copying and opening need one.
 const dialBlock=base||(!isDialable(phone)?'Esta persona no tiene un teléfono cargado. Agregalo en «Agregar o editar teléfono o email».':'');
 const mutation=useGuardedMutation({mutationFn:postCommunication,onSuccess:data=>{const created=data as Message;setLogged(created);setOutcomeOpen(canLogContactOutcome(created?.status));for(const key of ['communication','global-journal','lead-journal'])void qc.invalidateQueries({queryKey:[key]});}});
 const register=(result:'manual_sent'|'manual_no_contact')=>{
  if(onLog){onLog(effective,'phone');return}
  const body=callSummary({result,who,phone,note});
  // One key per attempt, not per content: after an uncertain failure a retry (even with another note) must not create a second call.
  attempt.current??=crypto.randomUUID();
  mutation.mutate({action:'manual_start',id:attempt.current,accountId:String(account.id),leadId,contactId:effective||null,channel:'call',purpose:leadId?null:purpose!.purpose,otherPurpose:!leadId&&purpose!.purpose==='other'?purpose!.otherPurpose:null,recipient:who,recipientName:who,destination:phone||null,body,result,templateId:null});
 };
 const copy=async()=>{try{await navigator.clipboard.writeText(phone);setNotice('Número copiado. Todavía no se anotó ninguna llamada.')}catch{setNotice('No se pudo copiar. Seleccioná el número y copialo a mano.')}};
 const done=!!logged,dial=dialBlock||(done?'Esta llamada ya quedó anotada.':''),reason=mutation.isPending?'Estamos guardando. Esperá a que termine.':done?'Esta llamada ya quedó anotada.':callBlock;
 return <div className={styles.panel} aria-busy={mutation.isPending}>
  {!fixedRecipient&&<CrmNativeSelect label="¿A quién llamás?" value={mustChoose?'':effective||'__business'} disabled={mutation.isPending||done} onChange={e=>{setNotice('');setPicked(e.target.value===''?null:e.target.value==='__business'?'':e.target.value)}} data={[...(mustChoose?[{value:'',label:'Elegí una persona o el teléfono del negocio'}]:[]),{value:'__business',label:'Teléfono del negocio'},...people.map(c=>({value:String(c.id),label:c.name+(c.phone?.trim()?' · '+c.phone.trim():' · sin teléfono')}))]}/>}
  {mustChoose?<p className={styles.numberHint}>Elegí a quién llamar para ver el número.</p>:phone?<p className={styles.number} aria-label="Número a llamar">{phone}</p>:<p role="status">Esta persona no tiene un teléfono cargado.</p>}
  {!mustChoose&&!hideDncNotice&&<PersonPhoneDncNotice businesses={person?.dncPhoneBusinesses}/>}
  <p className={styles.numberHint}>Mostrar, copiar o abrir el número no anota nada: llamá y después tocá «Ya llamé».</p>
  <div className={styles.actions}>
   {touch?(dial?<Button variant="default" leftSection={<Phone size={18} aria-hidden="true"/>} disabled disabledReason={dial}>Llamar ahora</Button>:<ChannelLink component="a" variant="default" leftSection={<Phone size={18} aria-hidden="true"/>} href={telHref(phone)}>Llamar ahora</ChannelLink>):<Button variant="default" leftSection={<Copy size={18} aria-hidden="true"/>} disabled={!!dial} disabledReason={dial} onClick={()=>void copy()}>Copiar número</Button>}
  </div>
  {notice&&<p role="status">{notice}</p>}
  {!onLog&&<label className={styles.note}>Nota de la llamada (opcional)<Textarea rows={3} value={note} disabled={mutation.isPending||done} onChange={e=>setNote(e.target.value)}/></label>}
  {mutation.error&&<p role="alert">{mutation.error.message}</p>}
  {done&&<p role="status">Llamada anotada. Falta contar cómo salió.</p>}
  <div className={styles.actions}>
   <Button disabled={!!reason} disabledReason={reason} onClick={()=>register('manual_sent')}>{mutation.isPending?'Guardando…':'Ya llamé: anotar cómo salió'}</Button>
   {!onLog&&<Button variant="outline" disabled={!!reason} disabledReason={reason} onClick={()=>register('manual_no_contact')}>No me atendieron</Button>}
   {logged&&canLogContactOutcome(logged.status)&&<Button onClick={()=>setOutcomeOpen(true)}>{VOCAB.logOutcome}</Button>}
  </div>
  {outcomeOpen&&logged&&<OutcomeAfterContact contact={{accountId:String(logged.accountId),leadId:logged.leadId==null?null:String(logged.leadId),contactIds:logged.contactId?[String(logged.contactId)]:[],channel:logged.channel,purpose:logged.purpose,messageId:logged.id,messageStatus:logged.status}} onDone={end=>{setOutcomeOpen(false);if(end==='saved')onFinished()}}/>}
 </div>;
}
