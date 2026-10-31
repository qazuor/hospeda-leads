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

/** Decision 2B: contacts the seller left without "¿Cómo salió?" stay listed until an outcome is recorded or the send is denied. */
export function PendingOutcomes({items,showBusiness=true,className}:{items:readonly PendingOutcome[]|undefined;showBusiness?:boolean;className?:string}){
 const [open,setOpen]=useState<PendingOutcome|null>(null);
 if(!items?.length)return null;
 return <section className={styles.panel+' '+(className||'')} data-tone="violet" aria-label="Anotá cómo salió"><header className={ws.unifiedHeader}><h2>Anotá cómo salió</h2><span aria-label="Contactos sin resultado">{items.length}</span></header><p className={styles.muted}>Contactos que hiciste y todavía no tienen resultado ni próximo paso.</p>
  <div className={styles.rows}>{items.map(item=><article key={item.id} className={ws.row} aria-label={'Contacto pendiente con '+(item.recipientName||item.accountName)}>
   <div className={ws.rowBody}><strong>{showBusiness?item.accountName+' · ':''}{item.opportunityName||'Sin gestión'}</strong><p className={styles.muted}>{channelLabel(item.channel)} · {item.recipientName||'Sin nombre'} · {formatDateTime(item.lastInteractionAt)} · {needsSentAnswer(item.status)?'Envío sin confirmar':sentStatusLabel({channel:item.channel,ownerEmail:item.ownerEmail??'',status:item.status,destinationDetail:item.destinationDetail,externalId:item.externalId,confirmationSource:item.confirmationSource})}</p></div>
   <div className={ws.rowActions}><Button size="sm" onClick={()=>setOpen(item)}>Anotá cómo salió</Button></div>
  </article>)}</div>
  {open&&<OutcomeAfterContact key={open.id} contact={{accountId:open.accountId,leadId:open.leadId,contactIds:open.contactId?[open.contactId]:[],channel:open.channel,purpose:open.purpose,messageId:open.id,messageStatus:open.status}} onDone={()=>setOpen(null)}/>}
 </section>;
}
