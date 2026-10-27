import {useMutationState,useQueryClient} from '@tanstack/react-query';
import {postCommunication,type CommunicationMutation,type Message} from '../../endpoints/communication.schema';
import {useGuardedMutation} from '../../helpers/useGuardedMutation';
import {crmSuccess} from '../../helpers/crmFeedback';
import {confirmSendBlockReason} from '../../helpers/communicationRecipient';
import {Button} from '../Button';
import {BUSY_REASON,type CommunicationView} from './types';
import {isConfirmableOpen} from '../../helpers/communicationTimeline';

/** Who may answer «¿Lo enviaste?» for an opened WhatsApp or Instagram (spec 92): its author or an admin, on a writable view (same rule as «Requiere acción»). */
export const canConfirmSend=({view,message}:{view:Pick<CommunicationView,'readOnly'|'admin'|'userEmail'>;message:Pick<Message,'channel'|'status'|'ownerEmail'|'destinationDetail'>}):boolean=>!view.readOnly&&isConfirmableOpen(message)&&(view.admin||message.ownerEmail===view.userEmail);

/**
 * «Sí, se envió» / «No se envió» for an opened but unconfirmed WhatsApp. Spec 91 §9 shows them twice (summary and bubble):
 * both copies share one mutation key, so a click on either blocks both until the request ends. Never retried automatically.
 */
/**
 * The shared «¿Lo enviaste?» mutation of one message (buttons and the «⋯» menu of a waiting Instagram attempt use the same key,
 * so any copy blocks the others while a request runs). `block` keeps «Sí, se envió» off while the contact is restricted.
 */
export function useConfirmSend({view,message}:{view:CommunicationView;message:Message}){
 const qc=useQueryClient();
 const mutationKey=['communication-confirm-send',message.id];
 const m=useGuardedMutation({mutationKey,mutationFn:postCommunication,onSuccess:(_data,input)=>{
  for(const queryKey of [['communication'],['work'],['global-journal'],['lead-journal'],['commercial-detail']])void qc.invalidateQueries({queryKey});
  if(input.action==='outcome')crmSuccess(input.event==='manual_sent'?'Envío confirmado':'Marcado como no enviado');
 }});
 const pending=useMutationState({filters:{mutationKey,status:'pending'},select:mutation=>mutation.state.variables as CommunicationMutation|undefined});
 const busy=pending.length>0||m.isPending,saving=pending[0]?.action==='outcome'?pending[0].event:null;
 const block=confirmSendBlockReason({account:view.detail?.account,message,restrictions:view.data.activeRestrictions??view.data.restrictions,openManagementIds:view.data.openManagements.map(o=>o.id)});
 const answer=(event:'manual_sent'|'manual_not_sent')=>{if(busy||(event==='manual_sent'&&block))return;m.mutate({action:'outcome',id:message.id,event,notes:''});};
 return {m,busy,saving,block,answer};
}

export function ConfirmSendButtons({view,message,size}:{view:CommunicationView;message:Message;size?:'sm'}){
 const {m,busy,saving,block}=useConfirmSend({view,message});
 return <>
  <Button size={size} disabled={busy||!!block} disabledReason={busy?BUSY_REASON:block} onClick={()=>m.mutate({action:'outcome',id:message.id,event:'manual_sent',notes:''})}>{saving==='manual_sent'?'Guardando…':'Sí, se envió'}</Button>
  <Button size={size} variant="outline" disabled={busy} disabledReason={BUSY_REASON} onClick={()=>m.mutate({action:'outcome',id:message.id,event:'manual_not_sent',notes:''})}>{saving==='manual_not_sent'?'Guardando…':'No se envió'}</Button>
  {m.error&&<p role="alert">{m.error.message}</p>}
 </>;
}
