import {useEffect,useRef,useState,type ReactNode} from 'react';
import {CircleAlert} from 'lucide-react';
import {Button} from '../Button';
import styles from './CommunicationView.module.css';

/** Spec 100 §5.4: `?pending=open` in the business URL opens «Requiere acción» on mount; Hoy «Ver en el negocio» and the work editor toast link to it (`businessPendingHref`). */
export const pendingOpenRequested=(search:string):boolean=>new URLSearchParams(search).get('pending')==='open';

/**
 * «Requiere acción» as one line (spec 100 §5, owner decision A1): collapsed on mount, «N pendientes» (breakdown at 600 px or wider,
 * container query) and «Revisar»; with nothing counted but `idle` (expired, uncounted opens, material), a grey «Sin pendientes · …»
 * with «Ver»; with neither, nothing. Expanded: «Requiere acción · N», «Ocultar» and the blocks (`children`). Resolving the last counted
 * pending folds it back. The region keeps its `aria-label`, which the browser tests use.
 */
export function RequiresActionStrip({count,summary,idle,children}:{count:number;summary:string;/** «2 vencidos · 1 envío esperando confirmación», or '' when nothing uncounted is listed. */idle:string;children:ReactNode}){
 const [open,setOpen]=useState(()=>typeof window!=='undefined'&&pendingOpenRequested(window.location.search)),previous=useRef(count);
 useEffect(()=>{if(previous.current>0&&count===0)setOpen(false);previous.current=count;},[count]);
 if(!count&&!idle)return null;
 const label=`${count} ${count===1?'pendiente':'pendientes'}`;
 return <section className={styles.strip} aria-label="Requiere acción" data-open={open||undefined} data-idle={!count||undefined}>
  {open?<div className={styles.stripLine}><h4 className={styles.sectionTitle} data-tone="action">Requiere acción · {count}</h4>{count>0&&<span className={styles.stripSummary}>{summary}</span>}<Button size="sm" variant="ghost" aria-expanded onClick={()=>setOpen(false)}>Ocultar</Button></div>
  :<div className={styles.stripLine}><CircleAlert size={18} aria-hidden className={styles.stripIcon}/>{count?<><strong className={styles.stripCount}>{label}</strong><span className={styles.stripSummary}>{summary}</span></>:<span className={styles.stripIdle}>Sin pendientes · {idle}</span>}<Button size="sm" variant={count?'outline':'ghost'} aria-expanded={false} onClick={()=>setOpen(true)}>{count?'Revisar':'Ver'}</Button></div>}
  {open&&children}
 </section>;
}
