import React from 'react';
import {Check} from 'lucide-react';
import {Button} from './Button';
import type {FirstStepItem} from '../helpers/firstSteps';
import ws from './Work.module.css';

/** First-use checklist for Hoy: four steps that tick themselves from real actions; dismissible, never blocks work. */
export function FirstStepsChecklist({items,onDismiss}:{items:readonly FirstStepItem[];onDismiss:()=>void}){
 const done=items.filter(i=>i.done).length;
 return <section className={ws.firstSteps} aria-label="Primeros pasos">
  <header><div><h2>Primeros pasos</h2><p>{done} de {items.length} hechos. Se tildan solos a medida que trabajás.</p></div><Button size="sm" variant="ghost" onClick={onDismiss}>Ocultar</Button></header>
  <ol>{items.map(i=><li key={i.key} data-done={i.done}><span className={ws.firstStepMark} aria-hidden="true">{i.done?<Check size={14}/>:null}</span><span>{i.label}{i.done&&<span className={ws.srOnly}> (hecho)</span>}</span></li>)}</ol>
 </section>;
}
