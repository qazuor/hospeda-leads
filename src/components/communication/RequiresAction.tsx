import {useEffect,useRef,useState} from 'react';
import {useQueryClient} from '@tanstack/react-query';
import {AutoOutcomeCorrection,AutoOutcomeNote,canFixAutoOutcome} from './AutoOutcome';
import type {InboundMessage,Message,PendingOutcome} from '../../endpoints/communication.schema';
import {formatDateTime} from '../../helpers/crmDates';
import {actorLabel} from '../../helpers/crmLabels';
import {useConfirmWaitNow} from './useInstagramWait';
import {instagramTarget,isInstagramAttempt,isWaitingForInstagramEcho} from '../../helpers/instagramChat';
import {OutcomeAfterContact} from '../OutcomeAfterContact';
import {INSTAGRAM_WAITING_HINT,INSTAGRAM_WAITING_STATUS,WHATSAPP_WAITING_HINT,WHATSAPP_WAITING_STATUS,actionSummary,isWaitingForScript,isConfirmableOpen,requiresAction,timelineChannel,timelineChannelLabel} from '../../helpers/communicationTimeline';
import {crmSuccess} from '../../helpers/crmFeedback';
import {toast} from 'sonner';
import {copyInGesture,instagramOpenedToast,isCoarsePointer,openInstagramForPaste} from '../InstagramOpenChat';
import {ClampedText} from './ClampedText';
import {MessageMaterialRecord} from './MessageMaterialRecord';
import {isInstagramInbound} from '../../helpers/instagramChannel';
import {Button} from '../Button';
import {PendingOutcomes,outcomeContact} from '../PendingOutcomes';
import {ChannelIcon} from './ChannelIcon';
import {ConfirmSendButtons,canConfirmSend} from './ConfirmSendButtons';
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
 * for Meta's echo, or a WhatsApp open still waiting for the user script (spec 100 §9), says so, and an Instagram attempt also offers «Copiar y abrir de nuevo». Its sales material record (with
 * «Revocar enlace») is here too, so the public link can be revoked before the send is confirmed. Nothing here scrolls.
 */
function ConfirmEntry({view,message,now,counted}:{view:CommunicationView;message:Message;now:number;/** The server lists it: its wait is over by the database clock, whatever the client clock says. */counted:boolean}){
 const own=message.ownerEmail===view.userEmail,instagram=isInstagramAttempt(message),channel=instagram?'instagram':'whatsapp',name=instagram?'Instagram':'WhatsApp';
 const waiting=!counted&&(instagram?isWaitingForInstagramEcho({message,now}):isWaitingForScript({message,now})),text=(message.textBody||message.body||'').trim(),[fixingOutcome,setFixingOutcome]=useState(false);
 return <li><div role="group" aria-label={name+' sin confirmar para '+(message.recipientName||message.recipient)} className={styles.actionCard} data-waiting={waiting||undefined}>
  <div className={styles.actionBody}><span className={styles.channel} data-channel={channel}><ChannelIcon channel={channel} size={18}/></span><div>
   <span className={styles.actionTitle} role={waiting?'status':undefined}>{waiting?(instagram?INSTAGRAM_WAITING_STATUS:WHATSAPP_WAITING_STATUS):'¿Lo enviaste?'}</span>
   <p className={styles.actionText}>{own?'Abriste':'Se abrió'} {name} para {message.recipientName||message.recipient} ({message.recipient}) el {formatDateTime(message.lastInteractionAt??message.updatedAt)}{own?'':' · '+actorLabel(message.ownerEmail,view.detail?.users)}. {waiting?(instagram?INSTAGRAM_WAITING_HINT:WHATSAPP_WAITING_HINT):`Abrir ${name} no confirma el envío${instagram?' y Instagram no avisó del envío':''}.`}</p>
   {text&&<ClampedText className={styles.actionQuote} text={text} lines={3}/>}
   <MessageMaterialRecord view={view} message={message}/>
  </div></div>
  <AutoOutcomeNote message={message}/><div className={styles.actionButtons}><ConfirmSendButtons view={view} message={message}/>{instagram&&message.status==='instagram_opened'&&<ReopenInstagram message={message}/>}{canFixAutoOutcome(view,message)&&<Button size="sm" variant="ghost" onClick={()=>setFixingOutcome(true)}>Corregir cómo salió</Button>}</div>
  {fixingOutcome&&<AutoOutcomeCorrection view={view} message={message} onClose={()=>setFixingOutcome(false)}/>}
 </div></li>;
}

/**
 * A server «Envío sin confirmar» (spec 99 §3.6) whose full message is not loaded here, or a manual attempt started and not resolved:
 * recipient and time only, with the same button as Hoy, which opens «¿Lo enviaste?» (or the manual attempt's result).
 */
function PendingConfirmEntry({item}:{item:PendingOutcome}){
 const instagram=item.channel==='social'&&item.destinationDetail==='instagram',channel=timelineChannel({channel:item.channel,instagram}),name=timelineChannelLabel({channel:item.channel,instagram}),to=item.recipientName||'Sin nombre',[open,setOpen]=useState(false);
 return <li><div role="group" aria-label={name+' sin confirmar para '+to} className={styles.actionCard}>
  <div className={styles.actionBody}><span className={styles.channel} data-channel={channel}><ChannelIcon channel={channel} size={18}/></span><div>
   <span className={styles.actionTitle}>¿Lo enviaste?</span>
   <p className={styles.actionText}>{item.status==='manual_pending'?'Empezaste un contacto':'Abriste '+name} para {to} el {formatDateTime(item.lastInteractionAt)}. Todavía no se confirmó el envío.</p>
  </div></div>
  <div className={styles.actionButtons}><Button size="sm" onClick={()=>setOpen(true)}>Anotá cómo salió</Button></div>
  {open&&<OutcomeAfterContact contact={outcomeContact(item)} onDone={()=>setOpen(false)}/>}
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

/** One «Requiere acción» line: a received message to review, a loaded unconfirmed open, or a server pending send without its loaded message. */
type Entry={key:string;at:Date}&({kind:'review';inbound:InboundMessage}|{kind:'confirm';message:Message;counted:boolean}|{kind:'pending';item:PendingOutcome});

/**
 * «Requiere acción · N», spec 91 §9: a compact summary («N mensajes por revisar · M envíos sin confirmar»). Each received
 * message «Por revisar» is one line that scrolls to its bubble, where its actions are. Spec 99 §3.6: the counted «¿Lo enviaste?»
 * entries are the server's `followUps.unconfirmed` (the same list and count as Hoy), drawn from the loaded message when there is one,
 * and «Anotá cómo salió» is `followUps.outcomes`. A loaded open the viewer may answer (`canConfirmSend`) that the server leaves out
 * (No contactar, closed management, archived business, before the outcome window, someone else's open for an admin, an Instagram
 * attempt still waiting for Meta's echo, a WhatsApp open still waiting for the user script, or not listed yet) is listed too, so it can still be resolved: «Sí, se envió» carries its
 * block reason and «No se envió» stays available. Those entries are not counted, so the shared count stays the server's.
 */
export function RequiresAction({view,onFocus}:{view:CommunicationView;onFocus:(key:string)=>void}){
 // An open waiting for Instagram's echo (spec 92, 15 min) or the WhatsApp script (spec 100, 5 min) switches to «¿Lo enviaste?» when its wait ends; the reload brings the server list.
 const now=useConfirmWaitNow(view.data.messages),qc=useQueryClient(),started=useRef(false);
 useEffect(()=>{if(!started.current){started.current=true;return;}void qc.invalidateQueries({queryKey:['communication']});},[now,qc]);
 const followUps=view.readOnly?undefined:view.data.followUps,byId=new Map(view.data.messages.map(m=>[String(m.id),m]));
 const unconfirmed=followUps?.unconfirmed.items??[],serverIds=new Set(unconfirmed.map(u=>String(u.id)));
 const uncounted=view.data.messages.filter(m=>!serverIds.has(String(m.id))&&canConfirmSend({view,message:m}));
 const review=requiresAction({inbound:view.data.inbound,messages:[],userEmail:view.userEmail,admin:view.admin,readOnly:view.readOnly});
 const confirm:Entry[]=[...unconfirmed.map((item):Entry=>{const message=byId.get(String(item.id)),at=new Date(item.lastInteractionAt);return message&&isConfirmableOpen(message)?{kind:'confirm',key:'out:'+item.id,at,message,counted:true}:{kind:'pending',key:'out:'+item.id,at,item};}),...uncounted.map((message):Entry=>({kind:'confirm',key:'out:'+message.id,at:new Date(message.lastInteractionAt??message.updatedAt),message,counted:false}))];
 const items=[...review.flatMap((r):Entry[]=>r.kind==='review'?[{kind:'review',key:r.key,at:r.at,inbound:r.inbound}]:[]),...confirm].sort((x,y)=>y.at.getTime()-x.at.getTime()||x.key.localeCompare(y.key));
 const prompted=new Set(confirm.flatMap(c=>c.kind==='confirm'?[String(c.message.id)]:[]));
 const outcomes=followUps?.outcomes.items??[],outcomeCount=followUps?.outcomes.count??0,unconfirmedCount=followUps?.unconfirmed.count??0;
 const count=review.length+unconfirmedCount+outcomeCount;
 const materials=view.data.messages.filter(m=>isConfirmableOpen(m)&&!!m.materials?.length&&!prompted.has(String(m.id)));
 return <section className={styles.section} aria-label="Requiere acción">
  <h4 className={styles.sectionTitle} data-tone="action">Requiere acción · {count}</h4>
  {!count&&!items.length&&!materials.length&&<p className={styles.empty}>Nada pendiente: no hay mensajes por revisar ni envíos sin confirmar.</p>}
  {count>0&&<p className={styles.summary}>{actionSummary({review:review.length,unconfirmed:unconfirmedCount,outcomes:outcomeCount})}</p>}
  {items.length>0&&<ul className={styles.actionList}>{items.map(entry=>entry.kind==='review'?<ReviewEntry key={entry.key} item={entry.inbound} onFocus={onFocus}/>:entry.kind==='confirm'?<ConfirmEntry key={entry.key} view={view} message={entry.message} now={now} counted={entry.counted}/>:<PendingConfirmEntry key={entry.key} item={entry.item}/>)}</ul>}
  {unconfirmedCount>unconfirmed.length&&<p className={styles.summary}>Se muestran los {unconfirmed.length} más recientes de {unconfirmedCount}.</p>}
  {materials.length>0&&<ul className={styles.actionList} aria-label="Material en envíos sin confirmar">{materials.map(m=><UnconfirmedMaterialEntry key={m.id} view={view} message={m}/>)}</ul>}
  <PendingOutcomes items={outcomes} count={outcomeCount} showBusiness={false}/>
 </section>;
}
