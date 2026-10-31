import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Alert } from '@mantine/core';
import { Ban, CalendarPlus, ExternalLink, Facebook, Globe, Instagram, MapPin, NotebookPen, type LucideIcon } from 'lucide-react';
import type { CommercialDetail, Contact } from '../endpoints/commercial.schema';
import type { WorkTarget } from './WorkEditor';
import type { DoNotContactMark } from '../helpers/doNotContactSince';
import { formatDay } from '../helpers/crmDates';
import { prettyInstant } from '../helpers/workDates';
import { toneHue, toneOfStatus } from '../helpers/tones';
import { VOCAB } from '../content/vocabulary';
import { Button } from './Button';
import { ContactPolicy } from './ContactPolicy';
import { Disclosure, DisclosureSummary } from './Disclosure';
import { QueryErrorNotice } from './QueryErrorNotice';
import { TechnicalRestrictions } from './TechnicalRestrictions';
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

/**
 * «Último contacto» line of the business header. It follows the contact evidence (spec 99), not the people: with people and
 * no contact it says there is none yet, never «Sin contactos registrados» (spec 104).
 */
export function BusinessLastContactLine({lastContact,pending,failed}:{lastContact:{title:string;occurredAt:Date|string}|null|undefined;pending:boolean;failed:boolean}){
  if(lastContact)return <><strong>Último contacto:</strong> {lastContact.title} · {prettyInstant(lastContact.occurredAt)}</>;
  if(pending)return <>Buscando último contacto…</>;
  if(failed)return <>No se pudo cargar el último contacto</>;
  return <><strong>Último contacto:</strong> todavía no hay ninguno registrado</>;
}

/** State of the work query the task and activity editors depend on. */
export interface BusinessWorkState {
  readonly ready:boolean;
  readonly blockedReason:string;
  readonly error:Error|null;
  readonly retry:()=>void;
  readonly retrying:boolean;
}

/** One populated link of the business record. */
export interface BusinessLinkFact {readonly field:string;readonly label:string;readonly value:string;readonly href:string|null}
const linkIcons:Record<string,LucideIcon>={sitioWeb:Globe,urlGmap:MapPin,perfilInstagram:Instagram,perfilFacebook:Facebook};

/** A business link: an external link (new tab, no opener) with the full value in its title, or plain text when it is not a web address. Opening it records nothing. */
export function BusinessLinkValue({link}:{link:BusinessLinkFact}){
  if(!link.href)return <>{link.value} <span className={styles.muted}>(no es un enlace válido)</span></>;
  const Icon=linkIcons[link.field]??ExternalLink;
  return <a className={styles.factLink} href={link.href} target="_blank" rel="noopener noreferrer" title={link.value}><Icon size={15} aria-hidden="true"/><span>{link.value}</span></a>;
}

/** Props of {@link BusinessSidebar}. */
export interface BusinessSidebarProps {
  readonly detail:CommercialDetail;
  readonly mainContact:Contact|undefined;
  readonly contactCount:number;
  /** People section (rows and their actions), shared with the compact record. */
  readonly contactSection:React.ReactNode;
  readonly facts:readonly {field:string;label:string;value:React.ReactNode}[];
  /** Populated link fields («Enlaces»): `href` is the safe URL from businessLinkHref, null when the value is not a valid web address. */
  readonly links:readonly BusinessLinkFact[];
  readonly emptyFactLabels:readonly string[];
  readonly readOnly:boolean;
  readonly contactEditable:boolean;
  readonly canDoWork:boolean;
  readonly work:BusinessWorkState;
  readonly onWork:(target:WorkTarget)=>void;
  readonly onEditAccount:()=>void;
  /** Bumped by the page to open «Personas» before it scrolls to and focuses that section (next step, ?contactId). */
  readonly revealPeople?:number;
}

/**
 * Persistent column of the business record: identity, quick actions, contact preferences, contact, people and business data.
 * The No contactar / archived banner stays above the columns so it is seen first on every width.
 * Stacks above the tabs on narrow containers (see `.recordColumns` in Commercial.module.css).
 */
export function BusinessSidebar({detail:d,mainContact,contactCount,contactSection,facts,links,emptyFactLabels,readOnly,contactEditable,canDoWork,work,onWork,onEditAccount,revealPeople=0}:BusinessSidebarProps){
  // Spec 90: when the record is stacked (same 900px container breakpoint as the CSS) the column comes first as a compact card,
  // with «Personas» and «Datos del negocio» collapsed. Decided once on mount: a resize never overrides what the user toggled.
  const asideRef=useRef<HTMLElement>(null),[peopleOpen,setPeopleOpen]=useState(true),[dataOpen,setDataOpen]=useState(true);
  useLayoutEffect(()=>{const width=asideRef.current?.closest<HTMLElement>('.'+styles.businessDetail)?.clientWidth;if(width&&width<=900){setPeopleOpen(false);setDataOpen(false);}},[]);
  useEffect(()=>{if(revealPeople)setPeopleOpen(true)},[revealPeople]);
  const initials=d.account.nombre.split(/\s+/).slice(0,2).map(word=>word[0]?.toUpperCase()).join('');
  return <aside ref={asideRef} className={styles.businessAside} aria-label={BUSINESS_SIDEBAR_LABEL}>
    <section className={styles.identityCard} aria-label="Identidad del negocio">
      <span className={styles.identityAvatar} style={{'--identity-hue':toneHue(toneOfStatus(d.account.status))[0]} as React.CSSProperties} aria-hidden="true">{initials}</span>
      <strong>{d.account.nombre}</strong>
      <span>H{d.account.id} · {d.account.ciudad||'Sin ciudad'}</span>
    </section>
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
    <Disclosure open={peopleOpen} onOpenChange={setPeopleOpen}><DisclosureSummary><h3 tabIndex={-1} data-people-heading>Personas ({contactCount})</h3></DisclosureSummary>{contactSection}</Disclosure>
    <Disclosure open={dataOpen} onOpenChange={setDataOpen}><DisclosureSummary><h3>Datos del negocio</h3></DisclosureSummary><section className={styles.section}>
      {facts.length>0&&<dl className={styles.businessFacts}>{facts.map(fact=><div key={fact.field}><dt>{fact.label}</dt><dd className={styles.researchValue}>{fact.value}</dd></div>)}</dl>}
      {links.length>0&&<><h4 className={styles.factGroup}>Enlaces</h4><dl className={styles.businessFacts}>{links.map(link=><div key={link.field}><dt>{link.label}</dt><dd><BusinessLinkValue link={link}/></dd></div>)}</dl></>}
      {emptyFactLabels.length>0&&<p className={styles.muted}>Sin cargar: {emptyFactLabels.join(", ")}</p>}
      {!readOnly&&<Button variant="outline" onClick={onEditAccount}>Editar datos del negocio</Button>}
      {contactEditable&&<Button variant="outline" onClick={onEditAccount}>Corregir datos de contacto</Button>}
    </section></Disclosure>
  </aside>;
}

/** Contact preferences and restrictions, collapsed by default: the only place to edit them (spec 90), including the technical per-channel restrictions. */
function BusinessRestrictionsPolicy({detail:d,readOnly}:{detail:CommercialDetail;readOnly:boolean}){
  // The accordion keeps a closed panel mounted: the technical restrictions mount (and query) only once it is opened.
  const [open,setOpen]=useState(false);
  return <Disclosure className={styles.relatedSection} open={open} onOpenChange={setOpen}><DisclosureSummary>Preferencias y restricciones de contacto</DisclosureSummary><ContactPolicy accountId={d.account.id} blocked={d.account.doNotContact} readOnly={readOnly}/>{open&&<TechnicalRestrictions accountId={String(d.account.id)}/>}</Disclosure>;
}
