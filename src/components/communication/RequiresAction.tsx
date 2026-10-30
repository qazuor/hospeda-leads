import {useState} from 'react';
import {AutoOutcomeCorrection,AutoOutcomeNote,canFixAutoOutcome} from './AutoOutcome';
import type {InboundMessage,Message} from '../../endpoints/communication.schema';
import {formatDateTime} from '../../helpers/crmDates';
import {actorLabel} from '../../helpers/crmLabels';
import {useInstagramWaitNow} from './useInstagramWait';
import {instagramTarget,isInstagramAttempt,isWaitingForInstagramEcho} from '../../helpers/instagramChat';
import {INSTAGRAM_WAITING_HINT,INSTAGRAM_WAITING_STATUS,actionSummary,isConfirmableOpen,requiresAction,timelineChannel,timelineChannelLabel} from '../../helpers/communicationTimeline';
import {crmSuccess} from '../../helpers/crmFeedback';
import {toast} from 'sonner';
import {copyInGesture,instagramOpenedToast,isCoarsePointer,openInstagramForPaste} from '../InstagramOpenChat';
import {ClampedText} from './ClampedText';
import {MessageMaterialRecord} from './MessageMaterialRecord';
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

/** «Copiar y abrir de nuevo» (spec 92): copies the prepared text and opens the same Instagram chat, client-side only (no new attempt, no request). */
function ReopenInstagram({message}:{message:Message}){
 const reopen=async()=>{
  const mobile=isCoarsePointer(),text=message.textBody||message.body;if(!instagramTarget({username:message.recipient,mobile}))return;
  // Copy first, inside the click; then the (possibly pre-opened) tab and the one-time handoff for the user script (spec 94).
  const copy=copyInGesture(text),[{opened,scriptPastes},copied]=await Promise.all([openInstagramForPaste({username:message.recipient,text,mobile}),copy.settled]);
  if(!opened)toast.warning('No se pudo abrir Instagram automáticamente.');else if(copied)crmSuccess(instagramOpenedToast({copied,mobile,scriptPastes}));else toast.warning(instagramOpenedToast({copied,mobile:false}));
 };
 return <Button variant="ghost" size="sm" onClick={()=>void reopen()}>Copiar y abrir de nuevo</Button>;
}

/**
 * An opened WhatsApp or Instagram nobody confirmed (spec 92 owner decision): it is not in «Conversación», so this entry is
 * self-contained. It shows what was prepared and carries «Sí, se envió» / «No se envió»; an Instagram attempt still waiting
 * for Meta's echo says so, and an Instagram attempt also offers «Copiar y abrir de nuevo». Its sales material record (with
 * «Revocar enlace») is here too, so the public link can be revoked before the send is confirmed. Nothing here scrolls.
 */
function ConfirmEntry({view,message,now}:{view:CommunicationView;message:Message;now:number}){
 const own=message.ownerEmail===view.userEmail,instagram=isInstagramAttempt(message),channel=instagram?'instagram':'whatsapp',name=instagram?'Instagram':'WhatsApp';
 const waiting=instagram&&isWaitingForInstagramEcho({message,now}),text=(message.textBody||message.body||'').trim(),[fixingOutcome,setFixingOutcome]=useState(false);
 return <li><div role="group" aria-label={name+' sin confirmar para '+(message.recipientName||message.recipient)} className={styles.actionCard} data-waiting={waiting||undefined}>
  <div className={styles.actionBody}><span className={styles.channel} data-channel={channel}><ChannelIcon channel={channel} size={18}/></span><div>
   <span className={styles.actionTitle} role={waiting?'status':undefined}>{waiting?INSTAGRAM_WAITING_STATUS:'¿Lo enviaste?'}</span>
   <p className={styles.actionText}>{own?'Abriste':'Se abrió'} {name} para {message.recipientName||message.recipient} ({message.recipient}) el {formatDateTime(message.lastInteractionAt??message.updatedAt)}{own?'':' · '+actorLabel(message.ownerEmail,view.detail?.users)}. {waiting?INSTAGRAM_WAITING_HINT:`Abrir ${name} no confirma el envío${instagram?' y Instagram no avisó del envío':''}.`}</p>
   {text&&<ClampedText className={styles.actionQuote} text={text} lines={3}/>}
   <MessageMaterialRecord view={view} message={message}/>
  </div></div>
  <AutoOutcomeNote message={message}/><div className={styles.actionButtons}><ConfirmSendButtons view={view} message={message}/>{instagram&&message.status==='instagram_opened'&&<ReopenInstagram message={message}/>}{canFixAutoOutcome(view,message)&&<Button size="sm" variant="ghost" onClick={()=>setFixingOutcome(true)}>Corregir cómo salió</Button>}</div>
  {fixingOutcome&&<AutoOutcomeCorrection view={view} message={message} onClose={()=>setFixingOutcome(false)}/>}
 </div></li>;
}

/**
 * Sales material of an unconfirmed open the viewer cannot answer (someone else's send, or a read-only view). The send is not in
 * «Conversación» yet, so its material record lives here with the usual «Revocar enlace» permissions: revoking a public link
 * must stay possible at any time. It is not counted as a pending action.
 */
function UnconfirmedMaterialEntry({view,message}:{view:CommunicationView;message:Message}){
 const instagram=isInstagramAttempt(message),channel=instagram?'instagram':'whatsapp',name=instagram?'Instagram':'WhatsApp',to=message.recipientName||message.recipient;
 return <li><div role="group" aria-label={'Material de un '+name+' sin confirmar para '+to} className={styles.actionCard}>
  <div className={styles.actionBody}><span className={styles.channel} data-channel={channel}><ChannelIcon channel={channel} size={18}/></span><div>
   <span className={styles.actionTitle}>Material en un envío sin confirmar</span>
   <p className={styles.actionText}>{actorLabel(message.ownerEmail,view.detail?.users)} abrió {name} para {to} ({message.recipient}) el {formatDateTime(message.lastInteractionAt??message.updatedAt)}. Todavía no se confirmó el envío.</p>
   <MessageMaterialRecord view={view} message={message}/>
  </div></div>
 </div></li>;
}

/**
 * «Requiere acción · N», spec 91 §9: a compact summary («N mensajes por revisar · M envíos sin confirmar»). Each received
 * message «Por revisar» is one line that scrolls to its bubble, where its actions are. An unconfirmed send is only here
 * (spec 92 owner decision), with its own actions. The viewer's own contacts without «¿Cómo salió?» (decision 2B) stay here
 * too, without repeating a prompted send.
 */
export function RequiresAction({view,onFocus}:{view:CommunicationView;onFocus:(key:string)=>void}){
 // An Instagram attempt waiting for its echo (spec 92) switches to «¿Lo enviaste?» when its 15 minutes end.
 const now=useInstagramWaitNow(view.data.messages);
 const items=requiresAction({inbound:view.data.inbound,messages:view.data.messages,userEmail:view.userEmail,admin:view.admin,readOnly:view.readOnly});
 const prompted=new Set(items.filter(i=>i.kind==='confirm_send').map(i=>String(i.key.slice(4))));
 const outcomes=view.readOnly?[]:(view.data.pendingOutcomes??[]).filter(o=>!prompted.has(String(o.id)));
 const review=items.filter(i=>i.kind==='review').length,count=items.length+outcomes.length;
 const materials=view.data.messages.filter(m=>isConfirmableOpen(m)&&!!m.materials?.length&&!prompted.has(String(m.id)));
 return <section className={styles.section} aria-label="Requiere acción">
  <h4 className={styles.sectionTitle} data-tone="action">Requiere acción · {count}</h4>
  {!count&&!materials.length&&<p className={styles.empty}>Nada pendiente: no hay mensajes por revisar ni envíos sin confirmar.</p>}
  {count>0&&<p className={styles.summary}>{actionSummary({review,unconfirmed:items.length-review,outcomes:outcomes.length})}</p>}
  {items.length>0&&<ul className={styles.actionList}>{items.map(item=>item.kind==='review'?<ReviewEntry key={item.key} item={item.inbound} onFocus={onFocus}/>:<ConfirmEntry key={item.key} view={view} message={item.message} now={now}/>)}</ul>}
  {materials.length>0&&<ul className={styles.actionList} aria-label="Material en envíos sin confirmar">{materials.map(m=><UnconfirmedMaterialEntry key={m.id} view={view} message={m}/>)}</ul>}
  <PendingOutcomes items={outcomes} showBusiness={false}/>
 </section>;
}
