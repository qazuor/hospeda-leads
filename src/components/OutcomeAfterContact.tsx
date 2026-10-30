import React,{useRef,useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {CrmDialog} from './ui/CrmDialog';
import {CrmButton as Button} from './ui/CrmButton';
import {WorkEditor} from './WorkEditor';
import {useUnsavedChanges,type LeaveCopy} from './UnsavedChanges';
import {getWork} from '../endpoints/work.schema';
import {postCommunication} from '../endpoints/communication.schema';
import {useGuardedMutation} from '../helpers/useGuardedMutation';
import {crmSuccess} from '../helpers/crmFeedback';
import {contactTitle,contactWorkChannel,contactWorkPurpose,needsSentAnswer} from '../helpers/contactOutcome';
import {VOCAB} from '../content/vocabulary';

/** The contact that just happened: its business, management, people, channel and, when there is one, its prepared message. */
export type ContactOutcomeTarget={accountId:string;leadId?:string|null;contactIds?:string[];channel:string;purpose?:string|null;messageId?:string;messageStatus?:string};

/**
 * Leaving the outcome step is allowed, but never silently (decision 2B); the contact stays in Hoy under "Anotá cómo salió".
 * An opened WhatsApp or a started manual attempt is not a confirmed send, so the copy never says the contact was registered.
 */
export function leaveWithoutOutcome(status:string|null|undefined):LeaveCopy{return {title:'¿Salir sin anotar cómo salió?',description:(needsSentAnswer(status)?'El envío todavía no está confirmado. Podés confirmarlo después.':'El contacto ya quedó registrado, pero falta anotar cómo salió y cómo sigue.')+' Lo vas a encontrar en Hoy, en «Anotá cómo salió».',stay:'Volver',leave:'Salir sin anotar'};}
/** How the outcome step ended: an outcome was saved, the message was marked as not sent, or the seller left it for later. */
export type OutcomeEnd='saved'|'not_sent'|'left';

/**
 * Decision 2B: every contact ends in "¿Cómo salió?" → "¿Cómo sigue?". Loads the business work detail and opens the work editor for a new activity linked to the
 * contact's message. When opening the channel proved nothing (WhatsApp opened, manual attempt started) it first asks
 * "¿Lo enviaste?": "No" marks the message as not sent and ends without logging a contact. Every exit asks first. `onDone` runs once at the end.
 */
export function OutcomeAfterContact({contact,onDone}:{contact:ContactOutcomeTarget;onDone:(end:OutcomeEnd)=>void}){
 const qc=useQueryClient();
 // The editor needs work types and people, which the business detail carries (same cache as the editor's own context query).
 const lookup=useQuery({queryKey:['work','pending-context',contact.accountId],queryFn:()=>getWork({mode:'detail',accountId:contact.accountId})});
 const [sent,setSent]=useState<boolean|null>(contact.messageId&&needsSentAnswer(contact.messageStatus)?null:true);
 const saved=useRef(false);
 const notSent=useGuardedMutation({mutationFn:postCommunication,onSuccess:()=>{for(const key of ['communication','work','commercial-detail','lead-journal','global-journal'])void qc.invalidateQueries({queryKey:[key]});crmSuccess('Marcado como no enviado');onDone('not_sent');}});
 const leaving=sent===null||!lookup.data;
 const guard=useUnsavedChanges(leaving,()=>onDone('left'),notSent.isPending,leaveWithoutOutcome(contact.messageStatus));
 const markNotSent=()=>{if(!contact.messageId)return;notSent.mutate(contact.messageStatus==='manual_pending'?{action:'manual_complete',id:contact.messageId,result:'manual_not_done',summary:'No se envió'}:{action:'outcome',id:contact.messageId,event:'manual_not_sent',notes:''});};
 if(sent===null)return <CrmDialog opened busy={notSent.isPending} onClose={guard.requestClose} title="¿Lo enviaste?" description="Abrir el canal no confirma el envío. Contanos qué pasó para anotarlo bien.">
  {notSent.isPending&&<p role="status">Guardando…</p>}
  {notSent.error&&<p role="alert">{notSent.error.message}</p>}
  <div style={{display:'flex',gap:'0.5rem',flexWrap:'wrap'}}>
   <Button disabled={notSent.isPending} disabledReason="Estamos guardando. Esperá a que termine." onClick={()=>setSent(true)}>Sí, lo envié</Button>
   <Button variant="outline" disabled={notSent.isPending} disabledReason="Estamos guardando. Esperá a que termine." onClick={markNotSent}>{notSent.isPending?'Guardando…':'No, no lo envié'}</Button>
  </div>
  <Button mt="md" variant="subtle" disabled={notSent.isPending} disabledReason="Estamos guardando. Esperá a que termine." onClick={guard.requestClose}>Todavía no sé, lo anoto después</Button>
  {guard.confirmation}
 </CrmDialog>;
 if(!lookup.data)return <CrmDialog opened onClose={guard.requestClose} title={VOCAB.howDidItGo}>
  {lookup.error?<><p role="alert">{lookup.error.message}</p><Button disabled={lookup.isFetching} disabledReason="Estamos cargando. Esperá a que termine." onClick={()=>void lookup.refetch()}>Reintentar</Button></>:<p role="status">Cargando el negocio…</p>}
  <Button mt="md" variant="subtle" onClick={guard.requestClose}>Salir sin anotar</Button>
  {guard.confirmation}
 </CrmDialog>;
 return <WorkEditor data={lookup.data} leaveCopy={leaveWithoutOutcome(contact.messageStatus)} onSaved={()=>{saved.current=true}} onClose={()=>onDone(saved.current?'saved':'left')}
  target={{kind:'activity',accountId:contact.accountId,leadId:contact.leadId??undefined,contactIds:contact.contactIds,channel:contactWorkChannel(contact.channel),purpose:contactWorkPurpose(contact.purpose),title:contactTitle(contact.channel),...(contact.messageStatus==='manual_no_contact'?{outcome:'no_answer' as const}:{}),...(contact.messageId?{messageId:contact.messageId,messageSent:needsSentAnswer(contact.messageStatus)?sent:undefined}:{})}}/>;
}
