import {useEffect,useRef,useSyncExternalStore} from 'react';
type Layer={id:symbol;order:number};
const empty:Layer[]=[];let layers:Layer[]=empty,order=0;
const listeners=new Set<()=>void>();
const subscribe=(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener)}};
const snapshot=()=>layers;
const emit=()=>{for(const listener of listeners)listener()};
/** Coordinate independent Mantine modal roots (including navigation confirmations). */
export function useDialogLayer(open:boolean){
 const identity=useRef(Symbol('dialog-layer')),wasOpen=useRef(false),position=useRef(0);
 // Opening order follows render order, so a nested dialog is above its parent.
 if(open&&!wasOpen.current)position.current=++order;
 wasOpen.current=open;
 useEffect(()=>{
  if(!open)return;
  const layer={id:identity.current,order:position.current};
  layers=[...layers,layer].sort((a,b)=>a.order-b.order);emit();
  return()=>{layers=layers.filter(item=>item.id!==layer.id);emit()};
 },[open]);
 const current=useSyncExternalStore(subscribe,snapshot,()=>empty);
 return {active:current.at(-1)?.id===identity.current,zIndex:410+Math.max(0,current.findIndex(item=>item.id===identity.current))*2};
}
