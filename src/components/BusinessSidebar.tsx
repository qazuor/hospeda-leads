import React from 'react';
import { Alert } from '@mantine/core';
import { Ban, CalendarPlus, Mail, MessageCircle, NotebookPen } from 'lucide-react';
import type { CommercialDetail, Contact } from '../endpoints/commercial.schema';
import type { WorkTarget } from './WorkEditor';
import type { DoNotContactMark } from '../helpers/doNotContactSince';
import { formatDay } from '../helpers/crmDates';
import { toneHue, toneOfStatus } from '../helpers/tones';
import { VOCAB } from '../content/vocabulary';
import { Button } from './Button';
import { ContactPolicy } from './ContactPolicy';
import { Disclosure, DisclosureSummary } from './Disclosure';
import { QueryErrorNotice } from './QueryErrorNotice';
import styles from './Commercial.module.css';

/** Accessible name of the business record aside; the next step uses it to reach the people section. */
export const BUSINESS_SIDEBAR_LABEL = 'Datos del negocio';

/**
 * No contactar / archived banner of a business. Renders nothing for an active business.
 * @example <BusinessRestrictionBanner account={detail.account} dncMark={mark}/>
 */
export function BusinessRestrictionBanner({account,dncMark}:{account:CommercialDetail['account'];dncMark:DoNotContactMark|null}){
  if(!account.doNotContact&&!account.archivedAt)return null;
  return <Alert color="red" variant="light" role="alert" icon={<Ban size={18} aria-hidden="true"/>} data-testid={account.doNotContact?'do-not-contact-banner':'archived-banner'}>
    {account.doNotContact
      ?<><strong>No contactar</strong> · {dncMark?(dncMark.requested?"Pidió no ser contactado el ":"Marcado el ")+formatDay(dncMark.at)+". ":""}Solo un administrador puede levantar el bloqueo.</>
      :<><strong>Negocio archivado</strong> · Podés consultarlo; solo un administrador puede desarchivarlo.</>}
  </Alert>;
}

/** State of the work query the task and activity editors depend on. */
export interface BusinessWorkState {
  readonly ready:boolean;
  readonly blockedReason:string;
  readonly error:Error|null;
  readonly retry:()=>void;
  readonly retrying:boolean;
}

/** Props of {@link BusinessSidebar}. */
export interface BusinessSidebarProps {
  readonly detail:CommercialDetail;
  readonly mainContact:Contact|undefined;
  readonly contactCount:number;
  /** People section (rows and their actions), shared with the compact record. */
  readonly contactSection:React.ReactNode;
  readonly facts:readonly {field:string;label:string;value:React.ReactNode}[];
  readonly emptyFactLabels:readonly string[];
  readonly readOnly:boolean;
  readonly contactEditable:boolean;
  readonly canDoWork:boolean;
  readonly work:BusinessWorkState;
  readonly onContact:()=>void;
  readonly onWork:(target:WorkTarget)=>void;
  readonly onEditAccount:()=>void;
}

/**
 * Persistent column of the business record: identity, quick actions, contact preferences, contact, people and business data.
 * The No contactar / archived banner stays above the columns so it is seen first on every width.
 * Stacks above the tabs on narrow containers (see `.recordColumns` in Commercial.module.css).
 */
export function BusinessSidebar({detail:d,mainContact,contactCount,contactSection,facts,emptyFactLabels,readOnly,contactEditable,canDoWork,work,onContact,onWork,onEditAccount}:BusinessSidebarProps){
  const initials=d.account.nombre.split(/\s+/).slice(0,2).map(word=>word[0]?.toUpperCase()).join('');
  return <aside className={styles.businessAside} aria-label={BUSINESS_SIDEBAR_LABEL}>
    <section className={styles.identityCard} aria-label="Identidad del negocio">
      <span className={styles.identityAvatar} style={{'--identity-hue':toneHue(toneOfStatus(d.account.status))[0]} as React.CSSProperties} aria-hidden="true">{initials}</span>
      <strong>{d.account.nombre}</strong>
      <span>H{d.account.id} · {d.account.ciudad||'Sin ciudad'}</span>
    </section>
    {!readOnly&&!d.account.doNotContact&&<div className={styles.quickActions}>
      <Button variant="outline" onClick={onContact}><MessageCircle size={16} aria-hidden="true"/>WhatsApp</Button>
      <Button variant="outline" onClick={onContact}><Mail size={16} aria-hidden="true"/>Email</Button>
    </div>}
    {canDoWork&&<div className={styles.quickActions}>
      {work.error&&<QueryErrorNotice error={work.error} onRetry={work.retry} busy={work.retrying}/>}
      {/* Same business-level targets as the Tareas tab buttons. */}
      <Button variant="outline" disabled={!work.ready} disabledReason={work.blockedReason} onClick={()=>onWork({kind:'task',accountId:d.account.id})}><CalendarPlus size={16} aria-hidden="true"/>{VOCAB.scheduleTask}</Button>
      <Button variant="outline" disabled={!work.ready} disabledReason={work.blockedReason} onClick={()=>onWork({kind:'activity',accountId:d.account.id})}><NotebookPen size={16} aria-hidden="true"/>{VOCAB.logWhatHappened}</Button>
    </div>}
    <BusinessRestrictionsPolicy detail={d} readOnly={readOnly}/>
    <section className={styles.section}>
      <h3>Contacto</h3>
      <strong>{mainContact?.name||'Sin persona de contacto'}</strong>
      {[mainContact?.phone,mainContact?.email,d.account.telefono,d.account.email].filter(Boolean).map((value,index)=><div key={index} className={styles.contactValue}>{String(value)}</div>)}
    </section>
    <Disclosure open><DisclosureSummary><h3 tabIndex={-1}>Personas ({contactCount})</h3></DisclosureSummary>{contactSection}</Disclosure>
    <Disclosure open><DisclosureSummary><h3>Datos del negocio</h3></DisclosureSummary><section className={styles.section}>
      {facts.length>0&&<dl className={styles.businessFacts}>{facts.map(fact=><div key={fact.field}><dt>{fact.label}</dt><dd className={styles.researchValue}>{fact.value}</dd></div>)}</dl>}
      {emptyFactLabels.length>0&&<p className={styles.muted}>Sin cargar: {emptyFactLabels.join(", ")}</p>}
      {!readOnly&&<Button variant="outline" onClick={onEditAccount}>Editar datos del negocio</Button>}
      {contactEditable&&<Button variant="outline" onClick={onEditAccount}>Corregir datos de contacto</Button>}
    </section></Disclosure>
  </aside>;
}

/** Contact preferences and restrictions, collapsed by default as in the previous record layout. */
function BusinessRestrictionsPolicy({detail:d,readOnly}:{detail:CommercialDetail;readOnly:boolean}){
  return <Disclosure className={styles.relatedSection}><DisclosureSummary>Preferencias y restricciones de contacto</DisclosureSummary><ContactPolicy accountId={d.account.id} blocked={d.account.doNotContact} readOnly={readOnly}/></Disclosure>;
}
