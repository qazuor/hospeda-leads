import type {InboundMessage,Message} from '../../endpoints/communication.schema';
import {formatDateTime} from '../../helpers/crmDates';
import {actorLabel} from '../../helpers/crmLabels';
import {useInstagramWaitNow} from './useInstagramWait';
import {isInstagramAttempt} from '../../helpers/instagramChat';
import {actionSummary,requiresAction,timelineChannel,timelineChannelLabel} from '../../helpers/communicationTimeline';
import {isInstagramInbound} from '../../helpers/instagramChannel';
import {Button} from '../Button';
import {PendingOutcomes} from '../PendingOutcomes';
import {ChannelIcon} from './ChannelIcon';
import {ConfirmSendButtons} from './ConfirmSendButtons';
import type {CommunicationView} from './types';
import styles from './CommunicationView.module.css';

/** A received message «Por revisar» as one summary line; its actions live on its bubble (spec 91 §9). Clicking scrolls to it. */
function ReviewEntry({item,onFocus}:{item:InboundMessage;onFocus:(key:string)=>void}){
 const instagram=isInstagramInbound(item),channel=timelineChannel({channel:item.channel,instagram}),label=timelineChannelLabel({channel:item.channel,instagram});
 const sender=item.fromName||item.fromAddress||'remitente sin identificar';
 return <li><button type="button" className={styles.jump} onClick={()=>onFocus('in:'+item.id)}>
  <span className={styles.channel} data-channel={channel}><ChannelIcon channel={channel}/></span>
  <span><strong>{label} de {sender} por revisar</strong><span className={styles.jumpMeta}> · {formatDateTime(item.receivedAt)}</span></span>
 </button></li>;
}

/** «¿Lo enviaste?» keeps its buttons here: there is no received bubble to attach them to. «Ver en la conversación» scrolls to the send. */
function ConfirmEntry({view,message,onFocus}:{view:CommunicationView;message:Message;onFocus:(key:string)=>void}){
 const own=message.ownerEmail===view.userEmail,channel=isInstagramAttempt(message)?'instagram':'whatsapp',name=channel==='instagram'?'Instagram':'WhatsApp';
 return <li><div role="group" aria-label={name+' sin confirmar para '+(message.recipientName||message.recipient)} className={styles.actionCard}>
  <div className={styles.actionBody}><span className={styles.channel} data-channel={channel}><ChannelIcon channel={channel} size={18}/></span><div>
   <span className={styles.actionTitle}>¿Lo enviaste?</span>
   <p className={styles.actionText}>{own?'Abriste':'Se abrió'} {name} para {message.recipientName||message.recipient} ({message.recipient}) el {formatDateTime(message.lastInteractionAt??message.updatedAt)}{own?'':' · '+actorLabel(message.ownerEmail,view.detail?.users)}. Abrir {name} no confirma el envío{channel==='instagram'?' y Instagram no avisó del envío':''}.</p>
  </div></div>
  <div className={styles.actionButtons}><ConfirmSendButtons view={view} message={message}/><Button variant="ghost" size="sm" onClick={()=>onFocus('out:'+message.id)}>Ver en la conversación</Button></div>
 </div></li>;
}

/**
 * «Requiere acción · N», spec 91 §9: a compact summary («N mensajes por revisar · M envíos sin confirmar»). Each received
 * message «Por revisar» is one line that scrolls to its bubble, where its actions are; «¿Lo enviaste?» prompts keep their
 * buttons. The viewer's own contacts without «¿Cómo salió?» (decision 2B) stay here too, without repeating a prompted send.
 */
export function RequiresAction({view,onFocus}:{view:CommunicationView;onFocus:(key:string)=>void}){
 // An Instagram attempt waiting for its echo (spec 92) joins the list when its 15 minutes end.
 const now=useInstagramWaitNow(view.data.messages);
 const items=requiresAction({inbound:view.data.inbound,messages:view.data.messages,userEmail:view.userEmail,admin:view.admin,readOnly:view.readOnly,now});
 const prompted=new Set(items.filter(i=>i.kind==='confirm_send').map(i=>String(i.key.slice(4))));
 const outcomes=view.readOnly?[]:(view.data.pendingOutcomes??[]).filter(o=>!prompted.has(String(o.id)));
 const review=items.filter(i=>i.kind==='review').length,count=items.length+outcomes.length;
 return <section className={styles.section} aria-label="Requiere acción">
  <h4 className={styles.sectionTitle} data-tone="action">Requiere acción · {count}</h4>
  {!count&&<p className={styles.empty}>Nada pendiente: no hay mensajes por revisar ni envíos sin confirmar.</p>}
  {count>0&&<p className={styles.summary}>{actionSummary({review,unconfirmed:items.length-review,outcomes:outcomes.length})}</p>}
  {items.length>0&&<ul className={styles.actionList}>{items.map(item=>item.kind==='review'?<ReviewEntry key={item.key} item={item.inbound} onFocus={onFocus}/>:<ConfirmEntry key={item.key} view={view} message={item.message} onFocus={onFocus}/>)}</ul>}
  <PendingOutcomes items={outcomes} showBusiness={false}/>
 </section>;
}
