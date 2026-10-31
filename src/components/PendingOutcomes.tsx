import React,{useState,type ReactNode} from 'react';
import {Link} from 'react-router-dom';
import {useQueryClient} from '@tanstack/react-query';
import {toast} from 'sonner';
import {Button} from './Button';
import {Disclosure,DisclosureSummary} from './Disclosure';
import type {ContactOutcomeTarget} from './OutcomeAfterContact';
import {postCommunication,type ContactFollowUps,type PendingOutcome} from '../endpoints/communication.schema';
import {ALREADY_CONFIRMED_MESSAGE,EXPIRED_FOLLOW_UPS_HELP,isAlreadyConfirmed,needsSentAnswer} from '../helpers/contactOutcome';
import {invalidateAfterOutcome} from './communication/ConfirmSendButtons';
import {isConfirmableOpen} from '../helpers/communicationTimeline';
import {useGuardedMutation} from '../helpers/useGuardedMutation';
import {crmSuccess} from '../helpers/crmFeedback';
import {businessPendingHref,groupOutcomeFollowUps,pendingCount} from '../helpers/contactFollowUpGroups';
import {channelLabel} from '../helpers/crmLabels';
import {sentStatusLabel} from '../helpers/communicationTimeline';
import {formatDateTime} from '../helpers/crmDates';
import styles from './Commercial.module.css';
import ws from './Work.module.css';
import type {OutcomeGroup} from '../helpers/contactFollowUpGroups';


/** What {@link OutcomeAfterContact} needs to log a pending contact or answer «¿Lo enviaste?» for it. */
export const outcomeContact=(item:PendingOutcome)=>({accountId:item.accountId,leadId:item.leadId,contactIds:item.contactId?[item.contactId]:[],channel:item.channel,purpose:item.purpose,messageId:item.id,messageStatus:item.status});

/** «{Canal} · {destinatario} · {fecha hora} · {confirmación}» of one pending send (spec 100 §6: the label tells manual, script and Instagram apart). */
export const sendLine=(item:PendingOutcome):string=>[channelLabel(item.channel),item.recipientName||'Sin nombre',formatDateTime(item.lastInteractionAt),needsSentAnswer(item.status)?'Envío sin confirmar':sentStatusLabel({channel:item.channel,ownerEmail:item.ownerEmail??'',status:item.status,destinationDetail:item.destinationDetail,externalId:item.externalId,confirmationSource:item.confirmationSource})].join(' · ');
/** Sends of a group listed before «+N más». */
const GROUP_VISIBLE_SENDS=3;

/** The outcome dialog's help when one result covers several sends of the management (spec 100 §6), counted on the server. */
export const groupOutcomeNote=(group:OutcomeGroup):string|undefined=>group.total>1?`Este resultado vale para los ${group.total} envíos de esta gestión.`:undefined;

/**
 * Spec 100 §6 (D2): one «Anotá cómo salió» row per management: its name, «{N} envíos sin resultado» (N from the server, before its cap
 * of 10 sends per group), one grey line per send (3, then «+N más») and one button. `onOutcome` opens the outcome of the newest send in
 * the list that owns the dialog, so it survives this row leaving after the save; the server then resolves every send of the group.
 */
export function OutcomeGroupRow({group,showBusiness,onOutcome,href}:{group:OutcomeGroup;showBusiness:boolean;onOutcome:(group:OutcomeGroup)=>void;/** «Ver en el negocio» (Hoy). */href?:string}){
 const [all,setAll]=useState(false),name=group.opportunityName||'Sin gestión',n=group.total;
 const shown=all?group.items:group.items.slice(0,GROUP_VISIBLE_SENDS),rest=n-shown.length;
 return <article className={ws.row} aria-label={'Resultado pendiente de '+name}>
  <div className={ws.rowBody}><span><strong>{showBusiness?group.accountName+' · ':''}{name}</strong> · <span>{n} {n===1?'envío sin resultado':'envíos sin resultado'}</span></span>
   <ul className={styles.muted+' '+ws.groupSends}>{shown.map(item=><li key={item.id}>{sendLine(item)}</li>)}</ul>
   {rest>0&&(group.items.length>shown.length?<Button size="sm" variant="ghost" onClick={()=>setAll(true)}>+{rest} más</Button>:<p className={styles.muted}>+{rest} más</p>)}</div>
  <div className={ws.rowActions}><Button size="sm" onClick={()=>onOutcome(group)}>Anotá cómo salió</Button>{href&&<BusinessLink href={href}/>}</div>
 </article>;
}

/** «Ver en el negocio»: the business «Comunicación» with the strip expanded. */
function BusinessLink({href}:{href:string}){return <Button size="sm" variant="ghost" className={ws.rowLink} asChild><Link to={href}>Ver en el negocio</Link></Button>;}

/** The outcome dialog a Hoy row asks for; its owner renders it outside the card, so it survives the row (or the card) leaving after the save. */
export type PendingOutcomeDialog={key:string;contact:ContactOutcomeTarget;note?:string};

/**
 * «Sí, se envió» / «No se envió» of a Hoy «¿Lo enviaste?» row (spec 100 §4.2): the same `outcome` action as the strip buttons, so the
 * server applies the same permission and No contactar checks; Hoy does not load each business, so a refusal shows on the row. Both stay
 * off while it saves (no double submit) and nothing is retried automatically. «Este envío ya estaba confirmado.» (the script, Meta's echo
 * or another answer came first) is information, like in the strip: it shows as such and the lists reload, so the row leaves.
 */
function ConfirmPendingButtons({item}:{item:PendingOutcome}){
 const qc=useQueryClient();
 const m=useGuardedMutation({mutationFn:postCommunication,onSuccess:(_data,input)=>{
  invalidateAfterOutcome(qc);
  if(input.action==='outcome')crmSuccess(input.event==='manual_sent'?'Envío confirmado':'Marcado como no enviado');
 },onError:error=>{if(isAlreadyConfirmed(error)){toast.info(ALREADY_CONFIRMED_MESSAGE);invalidateAfterOutcome(qc);}}});
 const busy=m.isPending,saving=m.variables?.action==='outcome'&&busy?m.variables.event:null,reason='Estamos guardando. Esperá a que termine.';
 return <>
  <Button size="sm" disabled={busy} disabledReason={reason} onClick={()=>m.mutate({action:'outcome',id:item.id,event:'manual_sent',notes:''})}>{saving==='manual_sent'?'Guardando…':'Sí, se envió'}</Button>
  <Button size="sm" variant="outline" disabled={busy} disabledReason={reason} onClick={()=>m.mutate({action:'outcome',id:item.id,event:'manual_not_sent',notes:''})}>{saving==='manual_not_sent'?'Guardando…':'No se envió'}</Button>
  {m.error&&!isAlreadyConfirmed(m.error)&&<p role="alert" className={ws.rowError}>{m.error.message}</p>}
 </>;
}

/** One Hoy «¿Lo enviaste?» row per send: an open answers «Sí, se envió» / «No se envió»; a manual attempt needs its result («Anotá cómo salió»). */
function UnconfirmedRow({item,onOutcome}:{item:PendingOutcome;onOutcome:(dialog:PendingOutcomeDialog)=>void}){
 return <article className={ws.row} aria-label={'Contacto pendiente con '+(item.recipientName||item.accountName)}>
  <div className={ws.rowBody}><strong>{item.accountName} · {item.opportunityName||'Sin gestión'}</strong><p className={styles.muted}>{sendLine(item)}</p></div>
  <div className={ws.rowActions}>{isConfirmableOpen(item)?<ConfirmPendingButtons item={item}/>:<Button size="sm" onClick={()=>onOutcome({key:'out:'+item.id,contact:outcomeContact(item)})}>Anotá cómo salió</Button>}<BusinessLink href={businessPendingHref(item.accountId)}/></div>
 </article>;
}

/** A titled block of the card, like the strip's («¿Lo enviaste? · N», «Anotá cómo salió · N»). */
function Block({label,count,children}:{label:string;count:number;children:ReactNode}){return <section aria-label={label}><h3>{label} · {count}</h3>{children}</section>;}

/**
 * Hoy «Pendientes de contacto» (spec 100 §4.2, D8): the strip's blocks and words without «Por revisar» (in Hoy that is «Respuestas
 * nuevas»). «¿Lo enviaste? · N» has one row per send, «Anotá cómo salió · N» one row per management (one outcome resolves all its sends,
 * D2) and «Vencidos · N» is collapsed, uncounted and answerable. The number is {@link pendingCount} without review, so for one business
 * it is the strip's number minus its «Por revisar». Rows name the business and link to it with the strip open. `onOutcome` asks the
 * owner (outside this card, which unmounts when its last row leaves) to open the outcome dialog.
 */
export function PendingOutcomes({followUps,onOutcome,className,id}:{followUps:ContactFollowUps|undefined;onOutcome:(dialog:PendingOutcomeDialog)=>void;className?:string;id?:string}){
 if(!followUps)return null;
 const total=pendingCount({review:0,followUps}),expired=followUps.expired,expiredCount=expired.unconfirmed.count+expired.outcomes.groupCount;
 if(!total&&!expiredCount&&!followUps.unconfirmed.items.length&&!followUps.outcomes.items.length)return null;
 const groups=groupOutcomeFollowUps({items:followUps.outcomes.items}),expiredGroups=groupOutcomeFollowUps({items:expired.outcomes.items});
 const groupOutcome=(g:OutcomeGroup)=>onOutcome({key:'group:'+g.key,contact:outcomeContact(g.newest),note:groupOutcomeNote(g)});
 const rows=(items:readonly PendingOutcome[])=><div className={styles.rows}>{items.map(item=><UnconfirmedRow key={item.id} item={item} onOutcome={onOutcome}/>)}</div>;
 const groupRows=(list:OutcomeGroup[])=><div className={styles.rows}>{list.map(g=><OutcomeGroupRow key={g.key} group={g} showBusiness onOutcome={groupOutcome} href={businessPendingHref(g.accountId)}/>)}</div>;
 const more=(shown:number,all:number,ofGroups=false)=>all>shown?<p className={styles.muted}>{ofGroups?`Se muestran las ${shown} gestiones más recientes de ${all}.`:`Se muestran los ${shown} más recientes de ${all}.`}</p>:null;
 return <section id={id} tabIndex={id?-1:undefined} className={styles.panel+' '+(className||'')} data-tone="violet" aria-label="Pendientes de contacto">
  <header className={ws.unifiedHeader}><h2>Pendientes de contacto</h2><span aria-label="Total de pendientes de contacto">{total}</span></header>
  <p className={styles.muted}>Contactos que todavía no confirmaste o que no tienen resultado ni próximo paso.</p>
  {!!followUps.unconfirmed.items.length&&<Block label="¿Lo enviaste?" count={followUps.unconfirmed.count}>{rows(followUps.unconfirmed.items)}{more(followUps.unconfirmed.items.length,followUps.unconfirmed.count)}</Block>}
  {!!groups.length&&<Block label="Anotá cómo salió" count={followUps.outcomes.groupCount}>{groupRows(groups)}{more(groups.length,followUps.outcomes.groupCount,true)}</Block>}
  {expiredCount>0&&<section aria-label="Vencidos"><Disclosure><DisclosureSummary>Vencidos · {expiredCount}</DisclosureSummary><p className={styles.muted}>{EXPIRED_FOLLOW_UPS_HELP}</p>
   {!!expired.unconfirmed.items.length&&<>{rows(expired.unconfirmed.items)}{more(expired.unconfirmed.items.length,expired.unconfirmed.count)}</>}
   {!!expiredGroups.length&&<>{groupRows(expiredGroups)}{more(expiredGroups.length,expired.outcomes.groupCount,true)}</>}
  </Disclosure></section>}
 </section>;
}
