import React from 'react';
import {Check} from 'lucide-react';
import {Button} from './Button';
import type {FirstStepItem} from '../helpers/firstSteps';
import ws from './Work.module.css';

/** First-use checklist for Hoy: four steps that tick themselves from real actions; dismissible, never blocks work. */
export function FirstStepsChecklist({items,onDismiss}:{items:readonly FirstStepItem[];onDismiss:()=>void}){
 const done=items.filter(i=>i.done).length;
 return <section className={ws.firstSteps} aria-label="Primeros pasos">
  <header><h2>Primeros pasos</h2><span className={ws.firstStepsCount}>{done} de {items.length} hechos</span><Button size="sm" variant="ghost" onClick={onDismiss}>Ocultar</Button></header>
  <div className={ws.firstStepsProgress} role="progressbar" aria-label="Primeros pasos" aria-valuemin={0} aria-valuemax={items.length} aria-valuenow={done}><span style={{width:`${items.length?done/items.length*100:0}%`}}/></div>
  <ol>{items.map(i=><li key={i.key} data-done={i.done}><span className={ws.firstStepMark} aria-hidden="true">{i.done?<Check size={14}/>:null}</span><span>{i.label}{i.done&&<span className={ws.srOnly}> (hecho)</span>}</span></li>)}</ol>
 </section>;
}
