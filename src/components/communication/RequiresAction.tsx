import {useEffect,useRef,useState,type ReactNode} from 'react';
import {useQueryClient} from '@tanstack/react-query';
import {AutoOutcomeCorrection,AutoOutcomeNote,canFixAutoOutcome} from './AutoOutcome';
import type {InboundMessage,Message,PendingOutcome} from '../../endpoints/communication.schema';
import {formatDateTime} from '../../helpers/crmDates';
import {actorLabel} from '../../helpers/crmLabels';
import {useConfirmWaitNow} from './useInstagramWait';
import {instagramTarget,isInstagramAttempt,isWaitingForInstagramEcho} from '../../helpers/instagramChat';
import {OutcomeAfterContact,type ContactOutcomeTarget} from '../OutcomeAfterContact';
import {INSTAGRAM_WAITING_HINT,INSTAGRAM_WAITING_STATUS,WHATSAPP_WAITING_HINT,WHATSAPP_WAITING_STATUS,actionSummary,isWaitingForScript,isConfirmableOpen,requiresAction,timelineChannel,timelineChannelLabel} from '../../helpers/communicationTimeline';
import {crmSuccess} from '../../helpers/crmFeedback';
import {toast} from 'sonner';
import {copyInGesture,instagramOpenedToast,isCoarsePointer,openInstagramForPaste} from '../InstagramOpenChat';
import {ClampedText} from './ClampedText';
import {MessageMaterialRecord} from './MessageMaterialRecord';
import {isInstagramInbound} from '../../helpers/instagramChannel';
import {Button} from '../Button';
import {OutcomeGroupRow,groupOutcomeNote,outcomeContact} from '../PendingOutcomes';
import {Disclosure,DisclosureSummary} from '../Disclosure';
import {groupOutcomeFollowUps,pendingCount,type OutcomeGroup} from '../../helpers/contactFollowUpGroups';
import {RequiresActionStrip} from './RequiresActionStrip';
import {ChannelIcon} from './ChannelIcon';
import {ConfirmSendButtons,canConfirmSend} from './ConfirmSendButtons';
import {BulkCheckbox,BulkConfirmBar,BulkConfirmDialog,useBulkSelection,type BulkSelection} from './BulkConfirmSends';
import type {CommunicationView} from './types';

/** Spec 100 §7: what «Vencidos» means. */
const EXPIRED_HELP='Preguntas de más de 3 días (envíos sin confirmar) o 7 días (gestiones sin resultado). No cuentan como pendientes, pero podés responderlas igual.';
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

/** An open the server does not list yet because it still waits for Meta's echo (Instagram) or the user script (WhatsApp, spec 100 §9). */
const isWaiting=({message,now,counted}:{message:Message;now:number;counted:boolean})=>!counted&&(isInstagramAttempt(message)?isWaitingForInstagramEcho({message,now}):isWaitingForScript({message,now}));

/**
 * An opened WhatsApp or Instagram nobody confirmed (spec 92 owner decision): it is not in «Conversación», so this entry is
 * self-contained. Spec 100 §5.2 compact form: who opened what for whom and when on one line, then «Sí, se envió» / «No se envió» (and
 * «Copiar y abrir de nuevo» for Instagram); the prepared text and the sales material record (with «Revocar enlace», so the public link
 * can be revoked before the send is confirmed) sit behind «Ver mensaje y material». An Instagram attempt still waiting for Meta's echo,
 * or a WhatsApp open still waiting for the user script (spec 100 §9), says so. Nothing here scrolls.
 */
function ConfirmEntry({view,message,now,counted,bulk,selectable}:{view:CommunicationView;message:Message;now:number;/** The server lists it: its wait is over by the database clock, whatever the client clock says. */counted:boolean;bulk:BulkSelection;/** Spec 100 §8: shows its bulk box. */selectable:boolean}){
 const own=message.ownerEmail===view.userEmail,instagram=isInstagramAttempt(message),channel=instagram?'instagram':'whatsapp',name=instagram?'Instagram':'WhatsApp';
 const waiting=isWaiting({message,now,counted}),text=(message.textBody||message.body||'').trim(),[fixingOutcome,setFixingOutcome]=useState(false);
 return <li><div role="group" aria-label={name+' sin confirmar para '+(message.recipientName||message.recipient)} className={styles.actionCard} data-waiting={waiting||undefined}>
  <div className={styles.actionBody}>{selectable&&<BulkCheckbox message={message} bulk={bulk}/>}<span className={styles.channel} data-channel={channel}><ChannelIcon channel={channel} size={18}/></span><div>
   <span className={styles.actionTitle}>{own?'Abriste':'Se abrió'} {name} para {message.recipientName?`${message.recipientName} (${message.recipient})`:message.recipient} · {formatDateTime(message.lastInteractionAt??message.updatedAt)}{own?'':' · '+actorLabel(message.ownerEmail,view.detail?.users)}</span>
   {waiting&&<p className={styles.actionText}><strong role="status">{instagram?INSTAGRAM_WAITING_STATUS:WHATSAPP_WAITING_STATUS}</strong> {instagram?INSTAGRAM_WAITING_HINT:WHATSAPP_WAITING_HINT}</p>}
   {(!!text||!!message.materials?.length)&&<Disclosure><DisclosureSummary>Ver mensaje y material</DisclosureSummary>{text&&<ClampedText className={styles.actionQuote} text={text} lines={3}/>}<MessageMaterialRecord view={view} message={message}/></Disclosure>}
  </div></div>
  <AutoOutcomeNote message={message}/><div className={styles.actionButtons}><ConfirmSendButtons view={view} message={message} locked={bulk.busy}/>{instagram&&message.status==='instagram_opened'&&<ReopenInstagram message={message}/>}{canFixAutoOutcome(view,message)&&<Button size="sm" variant="ghost" onClick={()=>setFixingOutcome(true)}>Corregir cómo salió</Button>}</div>
  {fixingOutcome&&<AutoOutcomeCorrection view={view} message={message} onClose={()=>setFixingOutcome(false)}/>}
 </div></li>;
}

/**
 * A server «Envío sin confirmar» (spec 99 §3.6) whose full message is not loaded here, or a manual attempt started and not resolved:
 * recipient and time only, with the same button as Hoy, which opens «¿Lo enviaste?» (or the manual attempt's result) through `onOutcome`.
 */
function PendingConfirmEntry({item,onOutcome}:{item:PendingOutcome;onOutcome:(item:PendingOutcome)=>void}){
 const instagram=item.channel==='social'&&item.destinationDetail==='instagram',channel=timelineChannel({channel:item.channel,instagram}),name=timelineChannelLabel({channel:item.channel,instagram}),to=item.recipientName||'Sin nombre';
 return <li><div role="group" aria-label={name+' sin confirmar para '+to} className={styles.actionCard}>
  <div className={styles.actionBody}><span className={styles.channel} data-channel={channel}><ChannelIcon channel={channel} size={18}/></span><div>
   <span className={styles.actionTitle}>{item.status==='manual_pending'?'Empezaste un contacto':'Abriste '+name} para {to} · {formatDateTime(item.lastInteractionAt)}</span>
  </div></div>
  <div className={styles.actionButtons}><Button size="sm" onClick={()=>onOutcome(item)}>Anotá cómo salió</Button></div>
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

/** One «¿Lo enviaste?» line: a loaded unconfirmed open (counted when the server lists it) or a server pending send without its loaded message. */
type Entry={key:string;at:Date}&({kind:'confirm';message:Message;counted:boolean}|{kind:'pending';item:PendingOutcome});
const newestFirst=(x:Entry,y:Entry)=>y.at.getTime()-x.at.getTime()||x.key.localeCompare(y.key);
const plural=(n:number,one:string,many:string)=>`${n} ${n===1?one:many}`;

/** A titled block of the expanded strip («Por revisar · N», «¿Lo enviaste? · N», «Anotá cómo salió · N»); without `count`, the title alone. */
function Block({label,count,children}:{label:string;count?:number;children:ReactNode}){
 return <section className={styles.block} aria-label={label}><h5 className={styles.blockTitle}>{label}{count?` · ${count}`:''}</h5>{children}</section>;
}
/** The outcome dialog of a row, owned by the list so it survives the row leaving when the save refetches the lists. */
type OpenOutcome={key:string;contact:ContactOutcomeTarget;note?:string};

/**
 * «Requiere acción», spec 91 §9 as the spec 100 §5 strip: collapsed «N pendientes · Revisar» on mount (expanded with `?pending=open`).
 * N is {@link pendingCount}: messages «Por revisar», the server's `followUps.unconfirmed` and its management groups of
 * `followUps.outcomes` (D2). Until spec 100 block 4, Hoy and the work editor toast still count sends (and no «Por revisar»), so their
 * numbers may differ from this one. Expanded, in order: «Por revisar» (one line that scrolls to the bubble, where its actions are),
 * «¿Lo enviaste?» (the server list, drawn from the loaded message when there is one), «Anotá cómo salió» (one row per management,
 * one outcome for all its sends), «Vencidos» (collapsed, answerable, uncounted) and the material of opens the viewer cannot answer.
 * A loaded open the viewer may answer (`canConfirmSend`) that the server leaves out (No contactar, closed management, archived
 * business, before the outcome window, someone else's open for an admin, an Instagram attempt still waiting for Meta's echo, a
 * WhatsApp open still waiting for the user script, or not listed yet) closes «¿Lo enviaste?», uncounted, so it can still be resolved:
 * «Sí, se envió» carries its block reason and «No se envió» stays available; with only those, «¿Lo enviaste?» shows no count. The
 * outcome dialog lives here, outside the strip, so it stays open while the save refetches and the row (or the whole strip) goes away.
 */
export function RequiresAction({view,onFocus,bulk:bulkEnabled=false}:{view:CommunicationView;onFocus:(key:string)=>void;/** Spec 100 §8 (D3): bulk «Sí, se enviaron» / «No se enviaron», only in the business view. */bulk?:boolean}){
 // An open waiting for Instagram's echo (spec 92, 15 min) or the WhatsApp script (spec 100, 5 min) switches to «¿Lo enviaste?» when its wait ends; the reload brings the server list.
 const now=useConfirmWaitNow(view.data.messages),qc=useQueryClient(),started=useRef(false),[outcome,setOutcome]=useState<OpenOutcome|null>(null);
 useEffect(()=>{if(!started.current){started.current=true;return;}void qc.invalidateQueries({queryKey:['communication']});},[now,qc]);
 const followUps=view.readOnly?undefined:view.data.followUps,byId=new Map(view.data.messages.map(m=>[String(m.id),m]));
 const unconfirmed=followUps?.unconfirmed.items??[],expiredUnconfirmed=followUps?.expired?.unconfirmed.items??[];
 const serverIds=new Set([...unconfirmed,...expiredUnconfirmed].map(u=>String(u.id)));
 const entry=(item:PendingOutcome):Entry=>{const message=byId.get(String(item.id)),at=new Date(item.lastInteractionAt);return message&&isConfirmableOpen(message)?{kind:'confirm',key:'out:'+item.id,at,message,counted:true}:{kind:'pending',key:'out:'+item.id,at,item};};
 const uncounted=view.data.messages.filter(m=>!serverIds.has(String(m.id))&&canConfirmSend({view,message:m})).map((message):Entry=>({kind:'confirm',key:'out:'+message.id,at:new Date(message.lastInteractionAt??message.updatedAt),message,counted:false})).sort(newestFirst);
 const confirm=[...unconfirmed.map(entry).sort(newestFirst),...uncounted],expiredConfirm=expiredUnconfirmed.map(entry).sort(newestFirst);
 const review=requiresAction({inbound:view.data.inbound,messages:[],userEmail:view.userEmail,admin:view.admin,readOnly:view.readOnly}).flatMap(r=>r.kind==='review'?[r]:[]);
 const groups=groupOutcomeFollowUps({items:followUps?.outcomes.items??[]}),expiredGroups=groupOutcomeFollowUps({items:followUps?.expired?.outcomes.items??[]});
 const unconfirmedCount=followUps?.unconfirmed.count??0,groupCount=followUps?.outcomes.groupCount??0,count=pendingCount({review:review.length,followUps});
 const expiredCount=(followUps?.expired?.unconfirmed.count??0)+(followUps?.expired?.outcomes.groupCount??0);
 const prompted=new Set([...confirm,...expiredConfirm].flatMap(c=>c.kind==='confirm'?[String(c.message.id)]:[]));
 const materials=view.data.messages.filter(m=>isConfirmableOpen(m)&&!!m.materials?.length&&!prompted.has(String(m.id)));
 const idle=[expiredCount?plural(expiredCount,'vencido','vencidos'):'',uncounted.length?plural(uncounted.length,'envío esperando confirmación','envíos esperando confirmación'):'',materials.length?(materials.length===1?'material en un envío sin confirmar':`material en ${materials.length} envíos sin confirmar`):''].filter(Boolean).join(' · ');
 const pendingOutcome=(item:PendingOutcome)=>setOutcome({key:'out:'+item.id,contact:outcomeContact(item)});
 const groupOutcome=(g:OutcomeGroup)=>setOutcome({key:'group:'+g.key,contact:outcomeContact(g.newest),note:groupOutcomeNote(g)});
 // Spec 100 §8: an open the viewer may answer and not waiting gets a box; a block with 2 or more of them gets the bulk bar.
 const eligible=(entries:Entry[])=>bulkEnabled?entries.flatMap(e=>e.kind==='confirm'&&canConfirmSend({view,message:e.message})&&!isWaiting({message:e.message,now,counted:e.counted})?[e.message]:[]):[];
 const confirmEligible=eligible(confirm),expiredEligible=eligible(expiredConfirm),boxed=[confirmEligible,expiredEligible].map(list=>list.length>1?list.map(m=>String(m.id)):[]);
 const bulk=useBulkSelection({blocks:boxed}),selectable=new Set(boxed.flat());
 const line=(e:Entry)=>e.kind==='confirm'?<ConfirmEntry key={e.key} view={view} message={e.message} now={now} counted={e.counted} bulk={bulk} selectable={selectable.has(String(e.message.id))}/>:<PendingConfirmEntry key={e.key} item={e.item} onOutcome={pendingOutcome}/>;
 const shownOf=(shown:number,all:number,groups=false)=>all>shown?<p className={styles.blockHelp}>{groups?`Se muestran las ${shown} gestiones más recientes de ${all}.`:`Se muestran los ${shown} más recientes de ${all}.`}</p>:null;
 const expiredUnconfirmedCount=followUps?.expired?.unconfirmed.count??0,expiredGroupCount=followUps?.expired?.outcomes.groupCount??0;
 return <><RequiresActionStrip count={count} summary={actionSummary({review:review.length,unconfirmed:unconfirmedCount,outcomes:groupCount})} idle={idle}>
  {review.length>0&&<Block label="Por revisar" count={review.length}><ul className={styles.actionList}>{review.map(r=><ReviewEntry key={r.key} item={r.inbound} onFocus={onFocus}/>)}</ul></Block>}
  {confirm.length>0&&<Block label="¿Lo enviaste?" count={unconfirmedCount}><BulkConfirmBar messages={confirmEligible} bulk={bulk}/><ul className={styles.actionList}>{confirm.map(line)}</ul>{shownOf(unconfirmed.length,unconfirmedCount)}</Block>}
  {groups.length>0&&<Block label="Anotá cómo salió" count={groupCount}><div className={styles.actionList}>{groups.map(g=><OutcomeGroupRow key={g.key} group={g} showBusiness={false} onOutcome={groupOutcome}/>)}</div>{shownOf(groups.length,groupCount,true)}</Block>}
  {expiredCount>0&&<section className={styles.block} aria-label="Vencidos"><Disclosure><DisclosureSummary>Vencidos · {expiredCount}</DisclosureSummary><p className={styles.blockHelp}>{EXPIRED_HELP}</p>
   {expiredConfirm.length>0&&<><BulkConfirmBar messages={expiredEligible} bulk={bulk}/><ul className={styles.actionList}>{expiredConfirm.map(line)}</ul>{shownOf(expiredUnconfirmed.length,expiredUnconfirmedCount)}</>}
   {expiredGroups.length>0&&<><div className={styles.actionList}>{expiredGroups.map(g=><OutcomeGroupRow key={g.key} group={g} showBusiness={false} onOutcome={groupOutcome}/>)}</div>{shownOf(expiredGroups.length,expiredGroupCount,true)}</>}
  </Disclosure></section>}
  {materials.length>0&&<ul className={styles.actionList} aria-label="Material en envíos sin confirmar">{materials.map(m=><UnconfirmedMaterialEntry key={m.id} view={view} message={m}/>)}</ul>}
 </RequiresActionStrip>
 <BulkConfirmDialog view={view} bulk={bulk} eligible={[...confirmEligible,...expiredEligible]}/>
 {outcome&&<OutcomeAfterContact key={outcome.key} contact={outcome.contact} note={outcome.note} onDone={()=>setOutcome(null)}/>}</>;
}
