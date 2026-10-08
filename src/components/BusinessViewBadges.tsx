import React,{useEffect,useRef,useState} from 'react';
import {ActionIcon,ScrollArea,UnstyledButton} from '@mantine/core';
import {Check,ChevronLeft,ChevronRight,Pencil,Trash2} from 'lucide-react';
import type {SavedLeadView} from '../endpoints/saved_views_GET.schema';
import type {BusinessSystemView} from '../helpers/businessSystemViews';
import type {BusinessViewSelection} from '../helpers/businessViewSelection';
import styles from './BusinessViewBadges.module.css';
export function BusinessViewBadges({system,personal,active,onSelect,onManage}:{system:BusinessSystemView[];personal:SavedLeadView[];active:BusinessViewSelection|null;onSelect:(kind:'system'|'personal',id:string)=>void;onManage:(kind:'edit'|'delete',view:SavedLeadView,opener:HTMLButtonElement)=>void}){
 const viewport=useRef<HTMLDivElement>(null),content=useRef<HTMLDivElement>(null);
 const [edges,setEdges]=useState({left:false,right:false});
 function updateEdges(){const el=viewport.current;if(el)setEdges({left:el.scrollLeft>1,right:el.scrollLeft+el.clientWidth<el.scrollWidth-1});}
 function reveal(button:HTMLElement){const el=viewport.current;if(!el)return;const box=button.getBoundingClientRect(),visible=el.getBoundingClientRect();if(box.left<visible.left)el.scrollLeft-=visible.left-box.left+4;else if(box.right>visible.right)el.scrollLeft+=box.right-visible.right+4;}
 useEffect(()=>{const observer=new ResizeObserver(updateEdges);if(viewport.current)observer.observe(viewport.current);if(content.current)observer.observe(content.current);updateEdges();return()=>observer.disconnect();},[]);
 useEffect(()=>{const button=content.current?.querySelector<HTMLElement>('[aria-pressed="true"]');if(button)reveal(button);},[active?.kind,active?.id,personal.length,system.length]);
 function badge(kind:'system'|'personal',id:string,name:string,view?:SavedLeadView){const selected=active?.kind===kind&&active.id===id;return <div key={id} className={styles.badge} data-active={selected}>
  <UnstyledButton className={styles.select} data-view-id={kind+':'+id} aria-label={'Aplicar vista '+(kind==='system'?'del sistema ':'personal ')+name} aria-pressed={selected} title={name} onFocus={event=>reveal(event.currentTarget)} onClick={()=>onSelect(kind,id)}><Check size={13} aria-hidden="true" style={{visibility:selected?'visible':'hidden'}}/><span>{name}</span></UnstyledButton>
  {view&&<div className={styles.actions}>{(['edit','delete'] as const).map(action=><ActionIcon key={action} variant="subtle" color={action==='delete'?'red':'gray'} size={28} aria-label={(action==='edit'?'Editar':'Eliminar')+' vista '+name} title={(action==='edit'?'Editar':'Eliminar')+' vista '+name} onFocus={event=>reveal(event.currentTarget)} onClick={event=>onManage(action,view,event.currentTarget)}>{action==='edit'?<Pencil size={13}/>:<Trash2 size={13}/>}</ActionIcon>)}</div>}
 </div>;}
 return <div className={styles.row} role="region" aria-label="Vistas guardadas">
  <ActionIcon variant="subtle" color="gray" size={30} disabled={!edges.left} aria-label="Vistas anteriores" onClick={()=>viewport.current?.scrollBy({left:-Math.max(160,viewport.current.clientWidth*.7),behavior:'smooth'})}><ChevronLeft size={16}/></ActionIcon>
  <ScrollArea className={styles.scroll} viewportRef={viewport} scrollbars="x" type="auto" scrollbarSize={5} offsetScrollbars="x" onScrollPositionChange={updateEdges}>
   <div className={styles.content} ref={content}><div className={styles.group} role="group" aria-label="Vistas del sistema"><span className={styles.label}>Sistema</span>{system.map(view=>badge('system',view.id,view.name))}</div><div className={styles.group} role="group" aria-label="Tus vistas"><span className={styles.label}>Tus vistas</span>{personal.map(view=>view.id?badge('personal',view.id,view.name,view):null)}{personal.length===0&&<span className={styles.empty}>Sin vistas personales</span>}</div></div>
  </ScrollArea>
  <ActionIcon variant="subtle" color="gray" size={30} disabled={!edges.right} aria-label="Más vistas" onClick={()=>viewport.current?.scrollBy({left:Math.max(160,viewport.current.clientWidth*.7),behavior:'smooth'})}><ChevronRight size={16}/></ActionIcon>
 </div>;
}
