import {useLayoutEffect,useRef,useState} from 'react';
import {estimatedLines} from '../../helpers/communicationTimeline';
import {Button} from '../Button';
import styles from './CommunicationView.module.css';

/**
 * Spec 91 §7: a bubble text clamped at `lines` with «Ver más» / «Ver menos». The overflow is measured when the browser lays
 * the text out and estimated from its length otherwise, so a short text never gets the toggle.
 */
export function ClampedText({text,lines,className}:{text:string;lines:number;className?:string}){
 const ref=useRef<HTMLParagraphElement>(null);
 const [open,setOpen]=useState(false),[overflow,setOverflow]=useState(()=>estimatedLines(text)>lines);
 useLayoutEffect(()=>{
  const el=ref.current;if(!el||open)return;
  const measure=()=>setOverflow(el.clientHeight>0?el.scrollHeight>el.clientHeight+1:estimatedLines(text)>lines);
  measure();
  if(typeof ResizeObserver==='undefined')return;
  const observer=new ResizeObserver(measure);observer.observe(el);return()=>observer.disconnect();
 },[text,lines,open]);
 return <>
  <p ref={ref} className={[className,open?'':styles.clamped].filter(Boolean).join(' ')} style={open?undefined:{WebkitLineClamp:lines,lineClamp:lines}} data-clamped={!open&&overflow||undefined}>{text}</p>
  {overflow&&<Button size="sm" variant="ghost" className={styles.more} aria-expanded={open} onClick={()=>setOpen(value=>!value)}>{open?'Ver menos':'Ver más'}</Button>}
 </>;
}
