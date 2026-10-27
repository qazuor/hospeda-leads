import {useEffect,useRef,useSyncExternalStore} from 'react';
import {dialogZIndex} from './layers';
type Layer={id:symbol;order:number};
const empty:Layer[]=[];let layers:Layer[]=empty,order=0;
const listeners=new Set<()=>void>();
const subscribe=(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener)}};
const snapshot=()=>layers;
const emit=()=>{for(const listener of listeners)listener()};
let viewportUsers=0;
/** Mirrors the visual viewport into CSS variables so open dialogs can stay above the on-screen keyboard (it shrinks the visual viewport, not 100dvh). */
function syncViewport(){
 const viewport=window.visualViewport;if(!viewport)return;
 const style=document.documentElement.style;style.setProperty('--crm-vv-height',viewport.height+'px');style.setProperty('--crm-vv-top',viewport.offsetTop+'px');
}
function trackViewport(){
 if(typeof window==='undefined'||!window.visualViewport)return()=>{};
 const viewport=window.visualViewport;
 if(viewportUsers++===0){viewport.addEventListener('resize',syncViewport);viewport.addEventListener('scroll',syncViewport);}
 syncViewport();
 return()=>{
  if(--viewportUsers>0)return;
  viewport.removeEventListener('resize',syncViewport);viewport.removeEventListener('scroll',syncViewport);
  document.documentElement.style.removeProperty('--crm-vv-height');document.documentElement.style.removeProperty('--crm-vv-top');
 };
}
/** Coordinate independent Mantine modal roots (including navigation confirmations). */
export function useDialogLayer(open:boolean){
 const identity=useRef(Symbol('dialog-layer')),wasOpen=useRef(false),position=useRef(0);
 // Opening order follows render order, so a nested dialog is above its parent.
 if(open&&!wasOpen.current)position.current=++order;
 wasOpen.current=open;
 useEffect(()=>{
  if(!open)return;
  const layer={id:identity.current,order:position.current},untrack=trackViewport();
  layers=[...layers,layer].sort((a,b)=>a.order-b.order);emit();
  return()=>{layers=layers.filter(item=>item.id!==layer.id);emit();untrack()};
 },[open]);
 const current=useSyncExternalStore(subscribe,snapshot,()=>empty);
 return {active:current.at(-1)?.id===identity.current,...dialogZIndex({index:current.findIndex(item=>item.id===identity.current)})};
}
