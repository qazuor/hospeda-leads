import {ChevronDown,ChevronRight} from 'lucide-react';
import {useEffect,useState} from 'react';
import type {ReactNode} from 'react';
import type {ToneName} from '../helpers/stageTones';
import styles from './PipelineBoard.module.css';

/** Column data shown on the commercial pipeline. */
export interface PipelineColumnProps{readonly columnKey:string;readonly name:string;readonly count:number;readonly tone:ToneName;readonly classification:string;readonly simple:boolean;readonly children:ReactNode;readonly phoneLayout:boolean;readonly phoneExpanded:boolean;readonly onPhoneToggle:()=>void}
function readCollapsed(key:string){try{return window.localStorage.getItem(`crm-pipeline-column-${key}`)==='true'}catch{return false}}
/** A desktop kanban column with persisted collapse state and a phone accordion section. */
export function PipelineColumn({columnKey,name,count,tone,classification,simple,children,phoneLayout,phoneExpanded,onPhoneToggle}:PipelineColumnProps){
 const [collapsed,setCollapsed]=useState(()=>readCollapsed(columnKey));useEffect(()=>{try{window.localStorage.setItem(`crm-pipeline-column-${columnKey}`,String(collapsed))}catch{/* Storage is optional. */}},[columnKey,collapsed]);
 return <section className={`${styles.column} ${collapsed&&!phoneLayout?styles.collapsed:''}`} data-tone={tone}>
  {!phoneLayout&&<><h3 className={styles.columnHeading}><button className={styles.desktopHeader} type="button" aria-label={`${collapsed?'Expandir':'Colapsar'} columna ${name}`} aria-expanded={!collapsed} onClick={()=>setCollapsed(value=>!value)}><span className={styles.toneDot}/><span className={styles.columnName}>{name}</span><span className={styles.count}>{count.toLocaleString('es-AR')}</span>{collapsed?<ChevronRight size={16}/>:<ChevronDown size={16}/>}</button></h3>{!collapsed&&<div className={styles.columnContent}><span className={styles.classification}>{simple?'Por clasificación de la etapa':classification}</span>{children}</div>}</>}
  {phoneLayout&&<><h3 className={styles.columnHeading}><button className={styles.phoneHeader} type="button" aria-expanded={phoneExpanded} aria-controls={`pipeline-phone-${columnKey}`} onClick={onPhoneToggle}><span className={styles.toneDot}/><span className={styles.phoneText}><strong>{name}</strong><small>{count.toLocaleString('es-AR')} {count===1?'gestión':'gestiones'}</small></span><span className={styles.count}>{count.toLocaleString('es-AR')}</span>{phoneExpanded?<ChevronDown size={16}/>:<ChevronRight size={16}/>}</button></h3><div id={`pipeline-phone-${columnKey}`} className={`${styles.phoneContent} ${phoneExpanded?styles.phoneExpanded:''}`} hidden={!phoneExpanded}><span className={styles.classification}>{simple?'Por clasificación de la etapa':classification}</span>{children}</div></>}
 </section>;
}
