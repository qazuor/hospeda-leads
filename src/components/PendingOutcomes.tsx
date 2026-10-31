import React,{useState} from 'react';
import {Button} from './Button';
import {OutcomeAfterContact} from './OutcomeAfterContact';
import type {PendingOutcome} from '../endpoints/communication.schema';
import {needsSentAnswer} from '../helpers/contactOutcome';
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
export function OutcomeGroupRow({group,showBusiness,onOutcome}:{group:OutcomeGroup;showBusiness:boolean;onOutcome:(group:OutcomeGroup)=>void}){
 const [all,setAll]=useState(false),name=group.opportunityName||'Sin gestión',n=group.total;
 const shown=all?group.items:group.items.slice(0,GROUP_VISIBLE_SENDS),rest=n-shown.length;
 return <article className={ws.row} aria-label={'Resultado pendiente de '+name}>
  <div className={ws.rowBody}><span><strong>{showBusiness?group.accountName+' · ':''}{name}</strong> · <span>{n} {n===1?'envío sin resultado':'envíos sin resultado'}</span></span>
   <ul className={styles.muted+' '+ws.groupSends}>{shown.map(item=><li key={item.id}>{sendLine(item)}</li>)}</ul>
   {rest>0&&(group.items.length>shown.length?<Button size="sm" variant="ghost" onClick={()=>setAll(true)}>+{rest} más</Button>:<p className={styles.muted}>+{rest} más</p>)}</div>
  <div className={ws.rowActions}><Button size="sm" onClick={()=>onOutcome(group)}>Anotá cómo salió</Button></div>
 </article>;
}

/**
 * Decision 2B: contacts the seller left without "¿Cómo salió?" stay listed until an outcome is recorded or the send is denied.
 * Spec 99 §3.6: `items` are only «Anotá cómo salió» (`count` is the server total, which may pass the server limit); Hoy also passes
 * `unconfirmed`, shown below in the same card as «Envíos sin confirmar · N» with the same button; with no contacts to log, the card shows
 * only that block (no «Anotá cómo salió» header at 0). The final layout belongs to spec 100.
 */
export function PendingOutcomes({items,count,unconfirmed,showBusiness=true,className,id}:{items:readonly PendingOutcome[]|undefined;count?:number;unconfirmed?:{items:readonly PendingOutcome[];count:number};showBusiness?:boolean;className?:string;id?:string}){
 const [open,setOpen]=useState<PendingOutcome|null>(null);
 const total=count??items?.length??0,waiting=unconfirmed?.count??0;
 if(!items?.length&&!total&&!waiting)return null;
 const row=(item:PendingOutcome)=><article key={item.id} className={ws.row} aria-label={'Contacto pendiente con '+(item.recipientName||item.accountName)}>
  <div className={ws.rowBody}><strong>{showBusiness?item.accountName+' · ':''}{item.opportunityName||'Sin gestión'}</strong><p className={styles.muted}>{sendLine(item)}</p></div>
  <div className={ws.rowActions}><Button size="sm" onClick={()=>setOpen(item)}>Anotá cómo salió</Button></div>
 </article>;
 const more=(shown:number,all:number)=>all>shown?<p className={styles.muted}>Se muestran los {shown} más recientes de {all}.</p>:null;
 return <section id={id} tabIndex={id?-1:undefined} className={styles.panel+' '+(className||'')} data-tone="violet" aria-label="Anotá cómo salió">{(!!total||!!items?.length)&&<header className={ws.unifiedHeader}><h2>Anotá cómo salió</h2><span aria-label="Contactos sin resultado">{total}</span></header>}
  {!!items?.length&&<><p className={styles.muted}>Contactos que hiciste y todavía no tienen resultado ni próximo paso.</p><div className={styles.rows}>{items.map(row)}</div>{more(items.length,total)}</>}
  {!!waiting&&unconfirmed&&<section aria-label="Envíos sin confirmar"><h3>Envíos sin confirmar · {waiting}</h3><p className={styles.muted}>Abriste el chat o empezaste el contacto y falta confirmar si se envió.</p><div className={styles.rows}>{unconfirmed.items.map(row)}</div>{more(unconfirmed.items.length,waiting)}</section>}
  {open&&<OutcomeAfterContact key={open.id} contact={outcomeContact(open)} onDone={()=>setOpen(null)}/>}
 </section>;
}
