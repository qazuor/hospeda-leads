import {useState} from 'react';
import {useMutation,useQueryClient,type QueryClient} from '@tanstack/react-query';
import {postCommunication,type InboundMessage} from '../endpoints/communication.schema';
import type {CommercialDetail} from '../endpoints/commercial.schema';
import {useAuth} from '../helpers/useAuth';
import {useGuardedMutation} from '../helpers/useGuardedMutation';
import {formatDateTime} from '../helpers/crmDates';
import {inboundNoun} from '../helpers/crmLabels';
import {crmSuccess} from '../helpers/crmFeedback';
import {Button} from './Button';
import {Input} from './Input';
import {DialogFooter} from './Dialog';
import {CrmDialog} from './ui/CrmDialog';
import {RichTemplateEditor} from './RichTemplateEditor';
import {AutoRegistrationVoidButton,canVoidAutoRegistration} from './AutoRegistrationVoid';
import styles from './Communication.module.css';

/** Shown wherever a reply is offered to a business that asked not to be contacted: replying to its own message stays allowed. */
export const INBOUND_REPLY_RESTRICTED='Este negocio pidió no ser contactado. Solo podés responder a su mensaje.';
const UNCERTAIN_REPLY='El resultado es incierto. No reenvíes este email; revisá la actividad antes de continuar.';

/** Refreshes every view that lists inbound messages: Comunicación and Hoy («Respuestas nuevas» lives under `communication`), the Bandeja, work and journals. */
export function invalidateInboundViews({queryClient}:{queryClient:QueryClient}):void{
 for(const queryKey of [['communication'],['inbox'],['work'],['global-journal'],['lead-journal']])void queryClient.invalidateQueries({queryKey});
}

/**
 * Client mirror of who may register or dismiss an inbound message (the server checks again): an admin, or the owner of the
 * management when the context is a management, otherwise the owner of the business.
 */
export function canWriteInbound({admin,userEmail,detail,leadId}:{admin:boolean;userEmail:string;detail:CommercialDetail|undefined;leadId?:string|null}):boolean{
 if(admin)return true;
 if(!detail)return false;
 return leadId?detail.opportunities.find(o=>String(o.id)===leadId)?.assignedUserEmail===userEmail:detail.account.assignedUserEmail===userEmail;
}

/**
 * Per-inbound actions shared by the business «Comunicación» tab and the Bandeja: «Responder» (only when the server offers a
 * reply), «Registrar respuesta» (the host opens its response dialog through `onRegister`), the dismissal and «Anular registro»
 * for an automatic registration (same rule as the panel's outbound rows). The reply never
 * auto-retries: an uncertain outcome blocks a second send, and a retry after a failure reuses the same attempt id.
 */
export function InboundMessageActions({item,readOnly=false,canWrite,onRegister,dismissLabel='No es una respuesta',registerLabel='Registrar respuesta'}:{item:InboundMessage;readOnly?:boolean;canWrite:boolean;onRegister:(item:InboundMessage)=>void;dismissLabel?:string;registerLabel?:string}){
 const {authState}=useAuth(),qc=useQueryClient();
 const admin=authState.type==='authenticated'&&authState.user.role==='admin',userEmail=authState.type==='authenticated'?authState.user.email:'';
 const noun=inboundNoun(item.channel);
 const [replyOpen,setReplyOpen]=useState(false),[replyBody,setReplyBody]=useState(''),[replyRecipient,setReplyRecipient]=useState(''),[replyAttempt,setReplyAttempt]=useState<string|null>(null),[replyError,setReplyError]=useState(''),[replyUncertain,setReplyUncertain]=useState(false);
 const [dismissOpen,setDismissOpen]=useState(false),[dismissReason,setDismissReason]=useState('');
 const reply=useMutation({mutationFn:postCommunication,onSuccess:(data)=>{void qc.invalidateQueries({queryKey:['communication']});void qc.invalidateQueries({queryKey:['inbox']});if(data.error){setReplyError(data.error);setReplyUncertain(data.message?.status!=='failed');if(data.message?.status==='failed')setReplyAttempt(null);return;}if(data.message&&data.message.status!=='accepted'&&data.message.status!=='delivery_confirmed'){setReplyError(UNCERTAIN_REPLY);setReplyUncertain(true);return;}setReplyOpen(false);setReplyBody('');setReplyAttempt(null);crmSuccess('Email aceptado por el proveedor · entrega no confirmada');},onError:(error)=>{setReplyError(error instanceof Error?error.message:'No pudimos confirmar la respuesta del servidor. Podés reintentar con el mismo intento.');}});
 const dismiss=useGuardedMutation({mutationFn:postCommunication,onSuccess:()=>{invalidateInboundViews({queryClient:qc});setDismissOpen(false);setDismissReason('');crmSuccess(noun==='mensaje'?'Mensaje descartado':'Email descartado')}});
 const canReview=!readOnly&&canWrite&&item.status==='pending_review';
 const canVoid=canVoidAutoRegistration({readOnly,canWrite,admin,userEmail,registrationId:item.autoRegistrationId,registrationUserEmail:item.autoRegistrationUserEmail,status:item.status});
 if(readOnly||(!item.canReply&&!canReview&&!canVoid))return null;
 return <>
  {item.canReply&&<Button size="sm" onClick={()=>{setReplyBody('');setReplyRecipient(item.fromAddress);setReplyAttempt(crypto.randomUUID());setReplyError('');setReplyUncertain(false);setReplyOpen(true)}}>Responder</Button>}
  {canReview&&<><Button size="sm" disabled={dismiss.isPending} onClick={()=>onRegister(item)}>{registerLabel}</Button><Button size="sm" variant="outline" disabled={dismiss.isPending} onClick={()=>{setDismissReason('');setDismissOpen(true)}}>{dismissLabel}</Button></>}
  {canVoid&&item.autoRegistrationId&&<AutoRegistrationVoidButton registrationId={item.autoRegistrationId}/>}
  <CrmDialog opened={replyOpen} onClose={()=>{if(!reply.isPending)setReplyOpen(false)}} title="Responder email" description="Tu respuesta se envía dentro del mismo hilo." busy={reply.isPending}>
   {replyOpen&&<div className={styles.panel}>
    {item.replyRestricted&&<p role="note">{INBOUND_REPLY_RESTRICTED}</p>}
    <label>Para{admin?<Input value={replyRecipient} onChange={e=>setReplyRecipient(e.target.value)} disabled={reply.isPending}/>:<Input value={item.fromAddress} readOnly/>}</label>
    <label>Asunto<Input value={/^re\s*:/i.test(item.subject||'')?(item.subject||'').replace(/^re\s*:/i,'Re:'):`Re: ${item.subject||'(sin asunto)'}`} readOnly/></label>
    <div inert={reply.isPending}><RichTemplateEditor channel="email" value={replyBody} onChange={setReplyBody} showVariables={false} ariaLabel="Respuesta"/></div>
    <details><summary>Ver mensaje citado</summary><p>El {formatDateTime(item.receivedAt)}, {item.fromName||item.fromAddress} escribió:</p><blockquote style={{whiteSpace:'pre-wrap'}}>{item.textBody}</blockquote></details>
    {replyError&&<p role="alert">{replyError}</p>}{replyUncertain&&<p role="status">{UNCERTAIN_REPLY}</p>}
    <DialogFooter><Button variant="outline" disabled={reply.isPending} onClick={()=>setReplyOpen(false)}>Cerrar</Button><Button disabled={reply.isPending||replyUncertain||!replyBody.replace(/<[^>]*>/g,'').trim()||!replyRecipient.trim()} disabledReason={reply.isPending?'La operación está en curso. Esperá a que termine.':'Completá el mensaje antes de enviarlo.'} onClick={()=>{const id=replyAttempt??crypto.randomUUID();setReplyAttempt(id);setReplyError('');reply.mutate({action:'inbound_reply',id,inboundId:item.id,bodyHtml:replyBody,...(admin?{recipient:replyRecipient.trim()}:{})})}}>{reply.isPending?'Enviando…':'Enviar respuesta'}</Button></DialogFooter>
   </div>}
  </CrmDialog>
  <CrmDialog opened={dismissOpen} onClose={()=>{if(!dismiss.isPending)setDismissOpen(false)}} title={'Descartar '+noun} description={'Contanos por qué este '+noun+' no es una respuesta.'} busy={dismiss.isPending}><label>Motivo<Input autoFocus value={dismissReason} onChange={e=>setDismissReason(e.target.value)} maxLength={1000}/></label>{dismiss.error&&<p role="alert">{dismiss.error.message}</p>}<DialogFooter><Button variant="outline" disabled={dismiss.isPending} onClick={()=>setDismissOpen(false)}>Cancelar</Button><Button disabled={dismissReason.trim().length<3||dismiss.isPending} onClick={()=>dismiss.mutate({action:'inbound_dismiss',id:crypto.randomUUID(),inboundId:item.id,reason:dismissReason.trim()})}>{dismiss.isPending?'Guardando…':'Descartar '+noun}</Button></DialogFooter></CrmDialog>
 </>;
}
