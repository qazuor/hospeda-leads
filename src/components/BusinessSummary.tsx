import {NextWork} from './NextWork';
import React from 'react';
import {Link} from 'react-router-dom';
import {useQuery} from '@tanstack/react-query';
import type {CommercialDetail} from '../endpoints/commercial.schema';
import {getPipeline} from '../endpoints/pipeline.schema';
import {getBusinessHistory} from '../endpoints/businessHistory.schema';
import {prettyInstant} from '../helpers/workDates';
import {Button} from './Button';
import {managementDisplayName} from '../content/vocabulary';
import styles from './Commercial.module.css';
export function BusinessSummary({detail,onContact,onSale,readOnly=false,continuityOnly=false,onDirectContact,onEditChannels,onOpenWork}:{detail:CommercialDetail;onContact:()=>void;onSale:()=>void;readOnly?:boolean;continuityOnly?:boolean;onDirectContact?:()=>void;onEditChannels?:()=>void;onOpenWork?:()=>void}){
 const id=detail.account.id;
 const history=useQuery({queryKey:['commercial-detail','history',id,1,'contact'],queryFn:()=>getBusinessHistory(id,1,'contact')});
 const stages=useQuery({queryKey:['pipeline','config-summary'],queryFn:()=>getPipeline({mode:'config'})});
 const person=detail.contacts.find(c=>!c.deletedAt&&c.isPrimary&&(c.phone||c.email))||detail.contacts.find(c=>!c.deletedAt&&(c.phone||c.email))||detail.contacts.find(c=>!c.deletedAt);

 const last=history.data?.events[0];
 const sales=detail.opportunities.filter(o=>!o.deletedAt);
 const open=sales.filter(o=>(stages.data?.stages.find(s=>s.name===o.estado)?.classification??'open')==='open');
 return <div className={styles.section}>
  <NextWork accountId={id} classification={detail.account.commercialStatus==='client'?'won':'open'} detail={detail} onAddContact={onContact} onContact={onDirectContact} onAddChannel={onEditChannels} readOnly={readOnly} onOpenWork={onOpenWork}/>
  {continuityOnly&&<section className={styles.continuitySummary} aria-label="Resumen para retomar"><div className={styles.continuityItem}><span>Último contacto o actividad</span>{last?<><strong>{last.title}</strong><small>{prettyInstant(last.occurredAt)}</small></>:<strong>{history.isPending?'Buscando historial…':'Todavía no hay interacciones registradas'}</strong>}</div><div className={styles.continuityItem}><span>Gestiones abiertas</span>{stages.isPending?<strong>Buscando gestiones…</strong>:open.length?<><strong>{open.length} {open.length===1?'activa':'activas'}</strong>{open.slice(0,2).map(o=><Link key={o.id} className={styles.continuityLink} to={'/sales/'+o.id}>{managementDisplayName(o)}</Link>)}</>:<strong>No hay gestiones abiertas</strong>}</div></section>}
  {!continuityOnly&&<div className={styles.overviewGrid}><section className={styles.panel}><h2>Con quién hablamos</h2>{person?<><strong>{person.name}</strong><p>{person.position||'Cargo sin informar'}</p><p>{person.phone||person.email||'Falta un teléfono o email'}</p>{person.preferredChannel&&<p>Prefiere {person.preferredChannel}</p>}</>:<><p>No hay una persona registrada todavía.</p><p>{detail.account.email||detail.account.telefono||'Agregá una persona o un canal para poder contactar.'}</p></>}{!readOnly&&<Button variant="outline" onClick={onContact}>{person?'Ver o editar personas':'Agregar persona'}</Button>}</section>
  <section className={styles.panel}><h2>Última conversación o acción</h2>{history.isPending?<p role="status">Cargando historial…</p>:history.error?<p role="alert">{history.error.message}</p>:last?<><strong>{last.title}</strong><p>{prettyInstant(last.occurredAt)}</p>{last.recipientName&&<p>{last.recipientName}</p>}<p>{last.result||'Sin resultado detallado'}</p></>:<p>Todavía no se registraron interacciones en este alcance.</p>}</section></div>}
  {!continuityOnly&&<section className={styles.panel}><div className={styles.heading}><div><h2>Gestiones de este negocio</h2><p className={styles.muted}>{open.length} en curso · {sales.length} en total. Cada propuesta conserva su propio resultado.</p>{detail.account.archivedAt&&<p className={styles.muted}>Un administrador debe desarchivar este negocio antes de iniciar otra gestión.</p>}</div>{!readOnly&&<Button variant="outline" disabled={!!detail.account.archivedAt||detail.account.status==='archived'} disabledReason={"El negocio está archivado. Un administrador debe desarchivarlo antes de continuar."} onClick={onSale}>Iniciar gestión</Button>}</div>{!sales.length?<p>Sin gestiones iniciadas. Usá Iniciar gestión para preparar una propuesta.</p>:sales.slice(0,4).map(o=><div key={o.id} className={styles.summarySale}><Link to={'/sales/'+o.id}>{o.opportunityName||'Propuesta inicial'}</Link><span>{o.estado||'Sin etapa'}</span></div>)}</section>}
  {!continuityOnly&&(detail.account.origin||detail.account.sourceReference||detail.account.subscriptionLabel)&&<section className={styles.panel}><h2>Datos del negocio</h2>{detail.account.subscriptionLabel&&<p><strong>Suscripción histórica:</strong> {detail.account.subscriptionLabel}</p>}{detail.account.origin&&<p className={styles.researchValue}><strong>Origen:</strong> {detail.account.origin}</p>}{detail.account.sourceReference&&<p className={styles.researchValue}><strong>Fuente de referencia:</strong> {detail.account.sourceReference}</p>}</section>}

 </div>;
}
