import {useState} from 'react';
import {useQueryClient} from '@tanstack/react-query';
import {postCommunication,type InboundMessage,type Message} from '../../endpoints/communication.schema';
import {useGuardedMutation} from '../../helpers/useGuardedMutation';
import {crmSuccess} from '../../helpers/crmFeedback';
import {formatDateTime} from '../../helpers/crmDates';
import {actorLabel} from '../../helpers/crmLabels';
import {confirmSendBlockReason} from '../../helpers/communicationRecipient';
import {managementChip,requiresAction,timelineChannel,timelineChannelLabel} from '../../helpers/communicationTimeline';
import {Button} from '../Button';
import {InboundMessageActions} from '../InboundMessageActions';
import {PendingOutcomes} from '../PendingOutcomes';
import {ChannelIcon} from './ChannelIcon';
import {BUSY_REASON,type CommunicationView} from './types';
import styles from './CommunicationView.module.css';

const EXCERPT=240;
/** Text of a received message, cut at {@link EXCERPT} characters with «Ver completo». */
export function ExpandableText({text,className}:{text:string;className?:string}){
 const [open,setOpen]=useState(false),long=text.length>EXCERPT;
 return <><p className={className}>{open||!long?text:text.slice(0,EXCERPT)+'…'}</p>{long&&<Button size="sm" variant="ghost" aria-expanded={open} onClick={()=>setOpen(value=>!value)}>{open?'Ocultar completo':'Ver completo'}</Button>}</>;
}

function ReviewCard({view,item}:{view:CommunicationView;item:InboundMessage}){
 const instagram=item.channel==='social',channel=timelineChannel({channel:item.channel,instagram}),label=timelineChannelLabel({channel:item.channel,instagram});
 const sender=item.fromName||item.fromAddress||'remitente sin identificar';
 const meta=[label,formatDateTime(item.receivedAt),item.channel==='email'?`«${item.subject||'(sin asunto)'}»`:'',managementChip({leadId:item.leadId,name:item.contextName,managements:view.detail?.opportunities??view.data.openManagements})].filter(Boolean).join(' · ');
 return <article className={styles.actionCard} aria-label={`${label} de ${sender} por revisar`}>
  <div className={styles.actionBody}><span className={styles.channel} data-channel={channel}><ChannelIcon channel={channel} size={18}/></span><div>
   <span className={styles.actionTitle}>{label} de {sender} por revisar</span><span className={styles.actionMeta}>{meta}</span><ExpandableText className={styles.actionText} text={item.textBody??''}/>
  </div></div>
  <div className={styles.actionButtons}><InboundMessageActions item={item} readOnly={view.readOnly} canWrite={view.canWrite} onRegister={view.openResponse} replyStatus={view.replyStatus}/></div>
 </article>;
}

function ConfirmSendCard({view,message}:{view:CommunicationView;message:Message}){
 const qc=useQueryClient();
 const m=useGuardedMutation({mutationFn:postCommunication,onSuccess:(_data,input)=>{
  for(const queryKey of [['communication'],['work'],['global-journal'],['lead-journal'],['commercial-detail']])void qc.invalidateQueries({queryKey});
  if(input.action==='outcome')crmSuccess(input.event==='manual_sent'?'Envío confirmado':'Marcado como no enviado');
 }});
 const own=message.ownerEmail===view.userEmail;
 const block=confirmSendBlockReason({account:view.detail?.account,message,restrictions:view.data.activeRestrictions??view.data.restrictions,openManagementIds:view.data.openManagements.map(o=>o.id)});
 const saving=(event:'manual_sent'|'manual_not_sent')=>m.isPending&&m.variables?.action==='outcome'&&m.variables.event===event;
 return <div role="group" aria-label={'WhatsApp sin confirmar para '+(message.recipientName||message.recipient)} className={styles.actionCard}>
  <div className={styles.actionBody}><span className={styles.channel} data-channel="whatsapp"><ChannelIcon channel="whatsapp" size={18}/></span><div>
   <span className={styles.actionTitle}>¿Lo enviaste?</span>
   <p className={styles.actionText}>{own?'Abriste':'Se abrió'} WhatsApp para {message.recipientName||message.recipient} ({message.recipient}) el {formatDateTime(message.lastInteractionAt??message.updatedAt)}{own?'':' · '+actorLabel(message.ownerEmail,view.detail?.users)}. Abrir WhatsApp no confirma el envío.</p>
   {m.error&&<p role="alert">{m.error.message}</p>}
  </div></div>
  <div className={styles.actionButtons}>
   <Button disabled={m.isPending||!!block} disabledReason={m.isPending?BUSY_REASON:block} onClick={()=>m.mutate({action:'outcome',id:message.id,event:'manual_sent',notes:''})}>{saving('manual_sent')?'Guardando…':'Sí, se envió'}</Button>
   <Button variant="outline" disabled={m.isPending} disabledReason={BUSY_REASON} onClick={()=>m.mutate({action:'outcome',id:message.id,event:'manual_not_sent',notes:''})}>{saving('manual_not_sent')?'Guardando…':'No se envió'}</Button>
  </div>
 </div>;
}

/**
 * «Requiere acción · N»: received messages «Por revisar» (register, dismiss, reply) and «¿Lo enviaste?» prompts for opened
 * but unconfirmed WhatsApp sends, with the same endpoints as before. The viewer's own contacts without «¿Cómo salió?»
 * (decision 2B) stay here too, without repeating a send that already has its «¿Lo enviaste?» prompt.
 */
export function RequiresAction({view}:{view:CommunicationView}){
 const items=requiresAction({inbound:view.data.inbound,messages:view.data.messages,userEmail:view.userEmail,admin:view.admin,readOnly:view.readOnly});
 const prompted=new Set(items.filter(i=>i.kind==='confirm_send').map(i=>String(i.key.slice(4))));
 const outcomes=view.readOnly?[]:(view.data.pendingOutcomes??[]).filter(o=>!prompted.has(String(o.id)));
 const count=items.length+outcomes.length;
 return <section className={styles.section} aria-label="Requiere acción">
  <h4 className={styles.sectionTitle} data-tone="action">Requiere acción · {count}</h4>
  {!count&&<p className={styles.empty}>Nada pendiente: no hay mensajes por revisar ni envíos sin confirmar.</p>}
  {items.map(item=>item.kind==='review'?<ReviewCard key={item.key} view={view} item={item.inbound}/>:<ConfirmSendCard key={item.key} view={view} message={item.message}/>)}
  <PendingOutcomes items={outcomes} showBusiness={false}/>
 </section>;
}
