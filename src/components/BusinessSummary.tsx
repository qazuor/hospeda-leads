import {NextWork} from './NextWork';
import {useAuth} from '../helpers/useAuth';
import React from 'react';
import {Link} from 'react-router-dom';
import {useQuery} from '@tanstack/react-query';
import {getWork} from '../endpoints/work.schema';
import type {CommercialDetail} from '../endpoints/commercial.schema';
import {getPipeline} from '../endpoints/pipeline.schema';
import {prettyInstant} from '../helpers/workDates';
import {Button} from './Button';
import {ContactPolicy} from './ContactPolicy';
import styles from './Commercial.module.css';
export function BusinessSummary({detail,onContact,onSale,readOnly=false}:{detail:CommercialDetail;onContact:()=>void;onSale:()=>void;readOnly?:boolean}){
 const {authState}=useAuth();
 const id=detail.account.id;
 const q=useQuery({queryKey:['work','next',id,authState.type==='authenticated'&&authState.user.role==='admin'?'all':undefined],queryFn:()=>getWork({accountId:id,mode:'detail',responsible:authState.type==='authenticated'&&authState.user.role==='admin'?'all':undefined})});
 const stages=useQuery({queryKey:['pipeline','config-summary'],queryFn:()=>getPipeline({mode:'config'})});
 const person=detail.contacts.find(c=>!c.deletedAt&&c.isPrimary&&(c.phone||c.email))||detail.contacts.find(c=>!c.deletedAt&&(c.phone||c.email))||detail.contacts.find(c=>!c.deletedAt);

 const last=q.data?.activities[0];
 const sales=detail.opportunities.filter(o=>!o.deletedAt);
 const open=sales.filter(o=>(stages.data?.stages.find(s=>s.name===o.estado)?.classification??'open')==='open');
 return <div className={styles.section}>
  <NextWork accountId={id} classification={detail.account.commercialStatus==='client'?'won':'open'} detail={detail} onAddContact={onContact} readOnly={readOnly}/>
  <div className={styles.overviewGrid}><section className={styles.panel}><h2>Con quién hablamos</h2>{person?<><strong>{person.name}</strong><p>{person.position||'Cargo sin informar'}</p><p>{person.phone||person.email||'Falta un teléfono o email'}</p>{person.preferredChannel&&<p>Prefiere {person.preferredChannel}</p>}</>:<><p>No hay una persona registrada todavía.</p><p>{detail.account.email||detail.account.telefono||'Agregá una persona o un canal para poder contactar.'}</p></>}{!readOnly&&<Button variant="outline" onClick={onContact}>{person?'Ver o editar personas':'Agregar persona'}</Button>}</section>
  <section className={styles.panel}><h2>Última conversación o acción</h2>{q.isPending?<p role="status">Cargando historial…</p>:q.error?<p role="alert">{q.error.message}</p>:last?<><strong>{last.title}</strong><p>{prettyInstant(last.occurredAt)}</p><p>{last.result||'Sin resultado detallado'}</p></>:<p>Todavía no se registraron actividades en este alcance.</p>}</section></div>
  <section className={styles.panel}><div className={styles.heading}><div><h2>Gestiones comerciales de este negocio</h2><p className={styles.muted}>{open.length} en curso · {sales.length} en total. Cada propuesta conserva su propio resultado.</p></div>{!readOnly&&<Button variant="outline" onClick={onSale}>{detail.account.commercialStatus==='client'?'Iniciar gestión':'Iniciar gestión'}</Button>}</div>{!sales.length?<p>Sin gestiones iniciadas. Usá Iniciar gestión para preparar una propuesta.</p>:sales.slice(0,4).map(o=><div key={o.id} className={styles.summarySale}><Link to={'/sales/'+o.id}>{o.opportunityName||'Propuesta inicial'}</Link><span>{o.estado||'Sin etapa'}</span></div>)}</section>
  <details><summary>Preferencias y restricciones de contacto</summary><ContactPolicy accountId={id} blocked={detail.account.doNotContact} readOnly={readOnly}/></details>

 </div>;
}
