import {AlertTriangle,Check,Clock,MessageSquareText,Reply,Workflow} from 'lucide-react';
import type {LucideIcon} from 'lucide-react';
import {dayProgress} from '../helpers/dayProgress';
import styles from './TodayStatTiles.module.css';

/**
 * Props of {@link TodayStatTiles}; `inbound` is undefined while the replies query is loading or failed, so the tile never shows a false zero.
 * `pendingContacts` is «Pendientes de contacto» (spec 100 D8): unconfirmed sends plus management outcome groups, without expired ones
 * (`pendingCount` without review); while above 0 the day is not finished.
 */
export interface TodayStatTilesProps{counts:{overdue:number;today:number};inbound:number|undefined;attention:number;done:number;pendingContacts:number}
type Tile={label:string;value:number|undefined;Icon:LucideIcon;tone:string;target:string};
/** Shows daily counts and progress; each count jumps to its section, and is disabled when that section is not rendered (count 0 or unknown). */
export function TodayStatTiles({counts,inbound,attention,done,pendingContacts}:TodayStatTilesProps){
 const progress=dayProgress({overdue:counts.overdue,today:counts.today,done,waiting:pendingContacts});
 const tiles:Tile[]=[{label:'Vencidas',value:counts.overdue,Icon:AlertTriangle,tone:'red',target:'today-overdue'},{label:'Para hoy',value:counts.today,Icon:Clock,tone:'orange',target:'today-due-today'},{label:'Respuestas nuevas',value:inbound,Icon:Reply,tone:'violet',target:'today-inbound'},{label:'Gestiones sin tarea agendada',value:attention,Icon:Workflow,tone:'sky',target:'today-attention'},{label:'Pendientes de contacto',value:pendingContacts,Icon:MessageSquareText,tone:'violet',target:'today-outcomes'}];
 const focus=(id:string)=>{const node=document.getElementById(id);node?.scrollIntoView({block:'start',behavior:'smooth'});node?.focus({preventScroll:true})};
 return <section className={styles.tiles} aria-label="Resumen de hoy">{tiles.map(({label,value,Icon,tone,target})=><button type="button" key={target} disabled={!value} aria-label={`${value??'Sin dato de'} ${label}`} onClick={()=>focus(target)}><span className={`${styles.icon} ${styles[tone]}`}><Icon size={17}/></span><strong>{value??'–'}</strong><span>{label}</span></button>)}<div className={`${styles.progress} ${styles.iconGreen}`} role="status"><span className={`${styles.icon} ${styles.green}`}><Check size={17}/></span>{progress.kind==='progress'?<><strong>Hoy: {progress.done} de {progress.total} hechas</strong><progress value={progress.done} max={progress.total} aria-label="Avance de hoy"/></>:progress.kind==='finished'?<><strong>¡Terminaste por hoy!</strong><span>Hoy: {progress.done} de {progress.total} hechas. Lo que sigue está en «Próximas tareas».</span></>:<strong>Sin tareas para hoy</strong>}</div></section>;
}
