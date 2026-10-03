import React from 'react';
import {Link} from 'react-router-dom';
import type {PipelineStage} from '../endpoints/pipeline.schema';
import {NextWork} from './NextWork';
import styles from './Commercial.module.css';
const steps=[['contact','Contacto','Identificá a la persona que decide y preguntá si quiere conversar.'],['need','Necesidad','Escuchá qué necesita y registrá lo que te contó.'],['proposal','Propuesta','Prepará lo que ofrecés y acordá cuándo conversarlo.'],['decision','Decisión','Registrá la respuesta real. Si acepta, revisá acuerdo y entrega.']] as const;
export function SalesJourney({accountId,leadId,stage}:{accountId:string;leadId:string;stage?:PipelineStage}){
 const classification=stage?.classification??'open';
 const current=steps.find(s=>s[0]===stage?.journeyPhase);
 return <div className={styles.section}>
  <NextWork accountId={accountId} leadId={leadId} classification={classification}/>
  {classification==='won'&&<p className={styles.milestone}>La venta está concretada. El acuerdo y el historial quedan disponibles para acompañar al cliente. <Link to={'/accounts/'+accountId}>Ver cliente y ofrecer otra venta</Link></p>}
  {classification==='lost'&&<p>La venta está cerrada sin venta. Podés planificar cuándo retomar desde Etapa y prioridad, conservando el cierre anterior.</p>}
  {classification==='open'&&<>{current&&<p className={styles.phaseHint}><strong>Momento actual: {current[1]}.</strong> {current[2]}</p>}<details className={styles.processHelp}><summary>Cómo avanzar con esta venta</summary><p>Las etapas del equipo se conservan. Esta ayuda no modifica datos.</p><ol className={styles.progressPath}>{steps.map(([id,name,help])=><li key={id} aria-current={stage?.journeyPhase===id?'step':undefined}><strong>{name}{stage?.journeyPhase===id?' · Ahora':''}</strong><p>{help}</p></li>)}</ol></details></>}
 </div>;
}
