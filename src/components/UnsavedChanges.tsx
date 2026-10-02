import React,{useEffect,useState} from 'react';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from './Dialog';
import {Button} from './Button';
import {useNavigate} from 'react-router-dom';
/** One guard for Escape, overlay, close button and beforeunload. */
export function useUnsavedChanges(dirty:boolean,onClose:()=>void){
 const [asked,setAsked]=useState(false);
 useEffect(()=>{if(!dirty)return;const warn=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn)},[dirty]);
 return {requestClose:()=>dirty?setAsked(true):onClose(),confirmation:<>{dirty&&<span hidden data-unsaved="true"/>}{asked?<Dialog open onOpenChange={setAsked}><DialogContent><DialogTitle>Tenés cambios sin guardar</DialogTitle><DialogDescription>Volvé al formulario para guardarlos o descartá los cambios para salir.</DialogDescription><Button onClick={()=>setAsked(false)}>Seguir editando</Button><Button variant="outline" onClick={()=>{setAsked(false);onClose()}}>Descartar cambios y salir</Button></DialogContent></Dialog>:null}</>};
}

/** Protect internal links as well as the local dialog close controls. */
export function UnsavedNavigation(){
 const navigate=useNavigate(),[destination,setDestination]=useState<string|null>(null);
 useEffect(()=>{const intercept=(event:MouseEvent)=>{if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;const anchor=(event.target as Element)?.closest('a');if(!anchor||anchor.target==='_blank'||anchor.hasAttribute('download'))return;const url=new URL(anchor.href,location.href);if(url.origin!==location.origin||url.pathname+url.search===location.pathname+location.search)return;if(!document.querySelector('[data-unsaved="true"]'))return;event.preventDefault();event.stopPropagation();setDestination(url.pathname+url.search+url.hash)};document.addEventListener('click',intercept,true);return()=>document.removeEventListener('click',intercept,true)},[]);
 return destination?<Dialog open onOpenChange={open=>{if(!open)setDestination(null)}}><DialogContent><DialogTitle>Tenés cambios sin guardar</DialogTitle><DialogDescription>Volvé para guardar antes de salir, o descartá los cambios.</DialogDescription><Button onClick={()=>setDestination(null)}>Seguir editando</Button><Button variant="outline" onClick={()=>{navigate(destination);setDestination(null)}}>Descartar cambios y salir</Button></DialogContent></Dialog>:null;
}
