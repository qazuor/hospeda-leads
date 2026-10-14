import React,{useEffect,useRef,useState} from 'react';
import {ActionIcon,ScrollArea,UnstyledButton} from '@mantine/core';
import {Check,ChevronLeft,ChevronRight} from 'lucide-react';
import type {BusinessSystemView} from '../helpers/businessSystemViews';
import type {BusinessViewSelection} from '../helpers/businessViewSelection';
import styles from './BusinessViewBadges.module.css';
export function BusinessViewBadges({system,personal,active,onSelect}:{system:BusinessSystemView[];personal:{id?:string;name:string}[];active:BusinessViewSelection|null;onSelect:(kind:'system'|'personal',id:string)=>void}){
 const viewport=useRef<HTMLDivElement>(null),content=useRef<HTMLDivElement>(null);
 const [edges,setEdges]=useState({left:false,right:false});
 function updateEdges(){const el=viewport.current;if(el)setEdges({left:el.scrollLeft>1,right:el.scrollLeft+el.clientWidth<el.scrollWidth-1});}
 function reveal(button:HTMLElement){button=button.closest<HTMLElement>('[data-view-badge]')??button;const el=viewport.current;if(!el)return;const box=button.getBoundingClientRect(),visible=el.getBoundingClientRect();if(box.left<visible.left)el.scrollLeft-=visible.left-box.left+4;else if(box.right>visible.right)el.scrollLeft+=box.right-visible.right+4;}
 useEffect(()=>{const observer=new ResizeObserver(updateEdges);if(viewport.current)observer.observe(viewport.current);if(content.current)observer.observe(content.current);updateEdges();return()=>observer.disconnect();},[]);
 useEffect(()=>{const button=content.current?.querySelector<HTMLElement>('[aria-pressed="true"]');if(button)reveal(button);},[active?.kind,active?.id,personal.length,system.length]);
 function badge(kind:'system'|'personal',id:string,name:string){const selected=active?.kind===kind&&active.id===id;return <div key={id} className={styles.badge} data-view-badge data-active={selected}>
  <UnstyledButton className={styles.select} data-view-id={kind+':'+id} aria-label={'Aplicar vista '+(kind==='system'?'del sistema ':'personal ')+name} aria-pressed={selected} title={name} onFocus={event=>{if(event.currentTarget.matches(':focus-visible'))reveal(event.currentTarget);}} onClick={()=>onSelect(kind,id)}>{selected&&<Check size={13} aria-hidden="true"/>}<span>{name}</span></UnstyledButton>
 </div>;}
 return <div className={styles.container}>
 <div className={styles.row} role="region" aria-label="Vistas guardadas">
  <ActionIcon variant="subtle" color="gray" size={30} disabled={!edges.left} aria-label="Vistas anteriores" onClick={()=>viewport.current?.scrollBy({left:-Math.max(160,viewport.current.clientWidth*.7),behavior:'smooth'})}><ChevronLeft size={16}/></ActionIcon>
  <ScrollArea className={styles.scroll} viewportRef={viewport} scrollbars="x" type="auto" scrollbarSize={5} offsetScrollbars="x" onScrollPositionChange={updateEdges}>
   <div className={styles.content} ref={content}><div className={styles.group} role="group" aria-label="Vistas del sistema"><span className={styles.label}>Sistema</span>{system.map(view=>badge('system',view.id,view.name))}</div><div className={styles.group} role="group" aria-label="Tus vistas"><span className={styles.label}>Tus vistas</span>{personal.map(view=>view.id?badge('personal',view.id,view.name):null)}{personal.length===0&&<span className={styles.empty}>Sin vistas personales</span>}</div></div>
  </ScrollArea>
  <ActionIcon variant="subtle" color="gray" size={30} disabled={!edges.right} aria-label="Más vistas" onClick={()=>viewport.current?.scrollBy({left:Math.max(160,viewport.current.clientWidth*.7),behavior:'smooth'})}><ChevronRight size={16}/></ActionIcon>
 </div>
 {edges.right&&<p className={styles.scrollHint}><ChevronRight size={13} aria-hidden="true"/>Deslizá para ver más vistas</p>}
 </div>;
}
