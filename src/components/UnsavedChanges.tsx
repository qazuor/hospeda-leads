import {toast} from 'sonner';
import React,{useEffect,useState} from 'react';
import {Dialog,DialogContent,DialogTitle,DialogDescription,DialogFooter} from './Dialog';
import {Button} from './Button';
import {useNavigate} from 'react-router-dom';
/** One guard for Escape, overlay, close button and beforeunload. */
export function useUnsavedChanges(dirty:boolean,onClose:()=>void,busy=false){
 const [asked,setAsked]=useState(false);
 useEffect(()=>{if(!dirty)return;const discard=()=>{if(!busy)onClose()};window.addEventListener('crm:discard-navigation',discard);return()=>window.removeEventListener('crm:discard-navigation',discard)},[dirty,onClose,busy]);
 useEffect(()=>{if(!dirty)return;const warn=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn)},[dirty]);
 return {requestClose:()=>{if(!busy){if(dirty)setAsked(true);else onClose()}},confirmation:<>{dirty&&<span hidden data-unsaved="true" data-crm-writing={busy?"true":undefined}/>}{asked?<Dialog open onOpenChange={setAsked}><DialogContent><DialogTitle>Tenés cambios sin guardar</DialogTitle><DialogDescription>Volvé al formulario para guardarlos o descartá los cambios para salir.</DialogDescription><DialogFooter><Button onClick={()=>setAsked(false)}>Seguir editando</Button><Button variant="outline" disabled={busy} onClick={()=>{setAsked(false);onClose()}}>Descartar cambios y salir</Button></DialogFooter></DialogContent></Dialog>:null}</>};
}

/** Protect internal links as well as the local dialog close controls. */
export function UnsavedNavigation(){
 const navigate=useNavigate(),[destination,setDestination]=useState<string|null>(null);
 useEffect(()=>{const request=(event:Event)=>{const path=(event as CustomEvent<unknown>).detail;if(typeof path!=='string'||!path.startsWith('/'))return;const url=new URL(path,location.origin);if(url.origin!==location.origin)return;if(document.querySelector('[data-crm-writing="true"]')){toast.info('Esperá a que termine de guardar antes de salir.');return;}if(document.querySelector('[data-unsaved="true"]'))setDestination(url.pathname+url.search+url.hash);else navigate(url.pathname+url.search+url.hash)};window.addEventListener('crm:navigate',request);return()=>window.removeEventListener('crm:navigate',request)},[navigate]);
 useEffect(()=>{const intercept=(event:MouseEvent)=>{if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;const anchor=(event.target as Element)?.closest('a');if(!anchor||anchor.target==='_blank'||anchor.hasAttribute('download'))return;const url=new URL(anchor.href,location.href);if(url.origin!==location.origin)return;if(!document.querySelector('[data-unsaved="true"]'))return;event.preventDefault();event.stopPropagation();if(document.querySelector('[data-crm-writing="true"]')){toast.info('Esperá a que termine de guardar antes de salir.');return;}setDestination(url.pathname+url.search+url.hash)};document.addEventListener('click',intercept,true);return()=>document.removeEventListener('click',intercept,true)},[]);
 return destination?<Dialog open onOpenChange={open=>{if(!open)setDestination(null)}}><DialogContent><DialogTitle>Tenés cambios sin guardar</DialogTitle><DialogDescription>Volvé para guardar antes de salir, o descartá los cambios.</DialogDescription><DialogFooter><Button onClick={()=>setDestination(null)}>Seguir editando</Button><Button variant="outline" onClick={()=>{window.dispatchEvent(new Event('crm:discard-navigation'));navigate(destination);setDestination(null)}}>Descartar cambios y salir</Button></DialogFooter></DialogContent></Dialog>:null;
}
