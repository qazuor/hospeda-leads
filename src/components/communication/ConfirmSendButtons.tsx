import {useQueryClient} from '@tanstack/react-query';
import {postCommunication,type Message} from '../../endpoints/communication.schema';
import {useGuardedMutation} from '../../helpers/useGuardedMutation';
import {crmSuccess} from '../../helpers/crmFeedback';
import {confirmSendBlockReason} from '../../helpers/communicationRecipient';
import {Button} from '../Button';
import {BUSY_REASON,type CommunicationView} from './types';
import {isConfirmableOpen} from '../../helpers/communicationTimeline';

/** Who may answer «¿Lo enviaste?» for an opened WhatsApp or Instagram (spec 92): its author or an admin, on a writable view (same rule as «Requiere acción»). */
export const canConfirmSend=({view,message}:{view:Pick<CommunicationView,'readOnly'|'admin'|'userEmail'>;message:Pick<Message,'channel'|'status'|'ownerEmail'|'destinationDetail'>}):boolean=>!view.readOnly&&isConfirmableOpen(message)&&(view.admin||message.ownerEmail===view.userEmail);

/**
 * «Sí, se envió» / «No se envió» for an opened but unconfirmed WhatsApp or Instagram. Since the spec 92 owner decision the
 * opened send is not in «Conversación», so these buttons exist once, in its «Requiere acción» entry; both stay off while the
 * request runs (no double submit) and it is never retried automatically. «Sí, se envió» stays off while the contact is restricted.
 */
export function ConfirmSendButtons({view,message,size}:{view:CommunicationView;message:Message;size?:'sm'}){
 const qc=useQueryClient();
 const m=useGuardedMutation({mutationFn:postCommunication,onSuccess:(_data,input)=>{
  for(const queryKey of [['communication'],['work'],['global-journal'],['lead-journal'],['commercial-detail']])void qc.invalidateQueries({queryKey});
  if(input.action==='outcome')crmSuccess(input.event==='manual_sent'?'Envío confirmado':'Marcado como no enviado');
 }});
 const busy=m.isPending,saving=m.variables?.action==='outcome'&&busy?m.variables.event:null;
 const block=confirmSendBlockReason({account:view.detail?.account,message,restrictions:view.data.activeRestrictions??view.data.restrictions,openManagementIds:view.data.openManagements.map(o=>o.id)});
 return <>
  <Button size={size} disabled={busy||!!block} disabledReason={busy?BUSY_REASON:block} onClick={()=>m.mutate({action:'outcome',id:message.id,event:'manual_sent',notes:''})}>{saving==='manual_sent'?'Guardando…':'Sí, se envió'}</Button>
  <Button size={size} variant="outline" disabled={busy} disabledReason={BUSY_REASON} onClick={()=>m.mutate({action:'outcome',id:message.id,event:'manual_not_sent',notes:''})}>{saving==='manual_not_sent'?'Guardando…':'No se envió'}</Button>
  {m.error&&<p role="alert">{m.error.message}</p>}
 </>;
}
