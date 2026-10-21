import { Disclosure, DisclosureSummary } from './Disclosure';
import React from 'react';
import {Link} from 'react-router-dom';
import type {PipelineStage} from '../endpoints/pipeline.schema';
import {managementStageCatalog,managementTypeLabels,type ManagementType} from '../helpers/businessManagement';
import {NextWork} from './NextWork';
import {useAuth} from '../helpers/useAuth';
import styles from './Commercial.module.css';
const steps=[['contact','Contacto','Identificá a la persona que decide y preguntá si quiere conversar.'],['need','Necesidad','Escuchá qué necesita y registrá lo que te contó.'],['proposal','Propuesta','Prepará lo que ofrecés y acordá cuándo conversarlo.'],['decision','Decisión','Registrá la respuesta real. Si acepta, revisá acuerdo y entrega.']] as const;
export function SalesJourney({accountId,leadId,stage,managementType,readOnly=false}:{accountId:string;leadId:string;stage?:PipelineStage;managementType:ManagementType|null;readOnly?:boolean}){
 const classification=stage?.classification??'open';
 const {authState}=useAuth();const admin=authState.type==='authenticated'&&authState.user.role==='admin';
 const current=steps.find(s=>s[0]===stage?.journeyPhase);
 const typedStages=managementType?managementStageCatalog(managementType):null;
 return <div className={styles.section}>
  <NextWork accountId={accountId} leadId={leadId} classification={classification} readOnly={readOnly}/>
  {classification==='won'&&<p className={styles.milestone}>La gestión está concretada. El acuerdo y el historial quedan disponibles para acompañar al cliente. <Link to={'/accounts/'+accountId}>Ver cliente y ofrecer otra gestión</Link></p>}
  {classification==='lost'&&<p>Esta gestión está cerrada. Podés agendar una tarea de seguimiento sin reabrirla. {admin?'Para reabrirla, elegí una etapa abierta en «Etapa».':'Para reabrirla pedíselo a un administrador.'} El cierre queda en Cambios de etapa.</p>}
  {managementType&&<Disclosure className={styles.processHelp}><DisclosureSummary>Cómo avanzar con esta gestión</DisclosureSummary><p>Recorrido de {managementTypeLabels[managementType]}. Tocá «Etapa» arriba y elegí la que describe lo que pasó. Podés saltar etapas o volver a una anterior mientras siga abierta.</p><ol className={styles.progressPath}>{typedStages!.map(item=><li key={item.key} aria-current={stage?.name===item.key?'step':undefined}><strong>{item.label}{stage?.name===item.key?' · Actual':''}</strong><p>{item.classification==='open'?'La gestión sigue abierta.':item.classification==='won'?'Cierra la gestión con resultado favorable. Te pide el motivo.':'Cierra la gestión sin resultado favorable. Te pide el motivo.'}</p></li>)}</ol><p>Mientras la gestión siga abierta podés derivarla a Leandro. Una gestión cerrada solo la reabre un administrador.</p></Disclosure>}
  {!managementType&&classification==='open'&&<>{current&&<p className={styles.phaseHint}><strong>Momento actual: {current[1]}.</strong> {current[2]}</p>}<Disclosure className={styles.processHelp}><DisclosureSummary>Orientación para esta gestión histórica</DisclosureSummary><p>Este recorrido es una sugerencia para gestiones anteriores sin tipo. No hace falta completar todos los pasos ni seguir un orden fijo.</p><ol className={styles.progressPath}>{steps.map(([id,name,help])=><li key={id} aria-current={stage?.journeyPhase===id?'step':undefined}><strong>{name}{stage?.journeyPhase===id?' · Ahora':''}</strong><p>{help}</p></li>)}</ol></Disclosure></>}
 </div>;
}
