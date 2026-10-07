import React,{useEffect,useLayoutEffect,useRef,useState} from 'react';
import styles from '../pages/business-list.module.css';
/** A separate header viewport lets the page scroll vertically while the table scrolls horizontally. */
export function BusinessStickyHeader({enabled,tableViewport,toolbar,onVisibleChange,children}:{enabled:boolean;tableViewport:React.RefObject<HTMLDivElement|null>;toolbar:React.RefObject<HTMLDivElement|null>;onVisibleChange:(visible:boolean)=>void;children:React.ReactNode}){
 const [position,setPosition]=useState<{top:number;left:number;width:number}|null>(null);const viewport=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  if(!enabled){setPosition(null);onVisibleChange(false);return;}
  const table=tableViewport.current,bar=toolbar.current;if(!table||!bar)return;
  let frame=0;
  const update=()=>{frame=0;const bounds=table.getBoundingClientRect(),head=table.querySelector('thead')?.getBoundingClientRect(),barBounds=bar.getBoundingClientRect();const visible=!!head&&head.top<barBounds.bottom&&bounds.bottom>barBounds.bottom+head.height;setPosition(visible?{top:barBounds.bottom,left:bounds.left,width:bounds.width}:null);onVisibleChange(visible);if(viewport.current)viewport.current.scrollLeft=table.scrollLeft;};
  const schedule=()=>{if(!frame)frame=requestAnimationFrame(update);};
  const observer=new ResizeObserver(schedule);observer.observe(table);observer.observe(bar);
  window.addEventListener('scroll',schedule,{passive:true});window.addEventListener('resize',schedule);table.addEventListener('scroll',schedule,{passive:true});update();
  return()=>{cancelAnimationFrame(frame);observer.disconnect();window.removeEventListener('scroll',schedule);window.removeEventListener('resize',schedule);table.removeEventListener('scroll',schedule);};
 },[enabled,tableViewport,toolbar,onVisibleChange]);
 useLayoutEffect(()=>{if(viewport.current&&tableViewport.current)viewport.current.scrollLeft=tableViewport.current.scrollLeft;},[position,tableViewport]);
 return position?<div ref={viewport} className={styles.floatingHeader} style={position} aria-label="Encabezados fijos de negocios">{children}</div>:null;
}
