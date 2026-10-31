import {useQueryClient,type QueryClient} from '@tanstack/react-query';
import {toast} from 'sonner';
import {postCommunication,type Message} from '../../endpoints/communication.schema';
import {useGuardedMutation} from '../../helpers/useGuardedMutation';
import {crmSuccess} from '../../helpers/crmFeedback';
import {confirmSendBlockReason} from '../../helpers/communicationRecipient';
import {ALREADY_CONFIRMED_MESSAGE,isAlreadyConfirmed} from '../../helpers/contactOutcome';
import {Button} from '../Button';
import {BUSY_REASON,type CommunicationView} from './types';
import {isConfirmableOpen} from '../../helpers/communicationTimeline';

/** Who may answer «¿Lo enviaste?» for an opened WhatsApp or Instagram (spec 92): its author or an admin, on a writable view (same rule as «Requiere acción»). */
export const canConfirmSend=({view,message}:{view:Pick<CommunicationView,'readOnly'|'admin'|'userEmail'>;message:Pick<Message,'channel'|'status'|'ownerEmail'|'destinationDetail'>}):boolean=>!view.readOnly&&isConfirmableOpen(message)&&(view.admin||message.ownerEmail===view.userEmail);

/** Why «Sí, se envió» cannot be recorded for `message` in this view ('' when allowed): {@link confirmSendBlockReason} with the loaded business. */
export const sendBlockReason=({view,message}:{view:CommunicationView;message:Message}):string=>confirmSendBlockReason({account:view.detail?.account,message,restrictions:view.data.activeRestrictions??view.data.restrictions,openManagementIds:view.data.openManagements.map(o=>o.id)});

/** Reloads everything an answer to «¿Lo enviaste?» changes: the conversation, Hoy, both histories and the business detail. */
export const invalidateAfterOutcome=(qc:QueryClient):void=>{for(const queryKey of [['communication'],['work'],['global-journal'],['lead-journal'],['commercial-detail']])void qc.invalidateQueries({queryKey});};

/**
 * «Sí, se envió» / «No se envió» for an opened but unconfirmed WhatsApp or Instagram. Since the spec 92 owner decision the
 * opened send is not in «Conversación», so these buttons exist once, in its «Requiere acción» entry; both stay off while the
 * request runs or `locked` (a bulk answer is running, spec 100 §8), so there is no double submit, and it is never retried automatically.
 * «Sí, se envió» stays off while the contact is restricted. When the script or Meta's echo confirmed the send first, the server's
 * «Este envío ya estaba confirmado.» is information, not an error: it shows as such and the lists reload.
 */
export function ConfirmSendButtons({view,message,size,locked=false}:{view:CommunicationView;message:Message;size?:'sm';locked?:boolean}){
 const qc=useQueryClient();
 const m=useGuardedMutation({mutationFn:postCommunication,onSuccess:(_data,input)=>{
  invalidateAfterOutcome(qc);
  if(input.action==='outcome')crmSuccess(input.event==='manual_sent'?'Envío confirmado':'Marcado como no enviado');
 },onError:error=>{if(isAlreadyConfirmed(error)){toast.info(ALREADY_CONFIRMED_MESSAGE);invalidateAfterOutcome(qc);}}});
 const busy=m.isPending||locked,saving=m.variables?.action==='outcome'&&m.isPending?m.variables.event:null;
 const block=sendBlockReason({view,message});
 return <>
  <Button size={size} disabled={busy||!!block} disabledReason={busy?BUSY_REASON:block} onClick={()=>m.mutate({action:'outcome',id:message.id,event:'manual_sent',notes:''})}>{saving==='manual_sent'?'Guardando…':'Sí, se envió'}</Button>
  <Button size={size} variant="outline" disabled={busy} disabledReason={BUSY_REASON} onClick={()=>m.mutate({action:'outcome',id:message.id,event:'manual_not_sent',notes:''})}>{saving==='manual_not_sent'?'Guardando…':'No se envió'}</Button>
  {m.error&&!isAlreadyConfirmed(m.error)&&<p role="alert">{m.error.message}</p>}
 </>;
}
