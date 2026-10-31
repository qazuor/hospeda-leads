import {AlertTriangle,Check,Clock,MessageSquareText,Reply,Workflow} from 'lucide-react';
import type {LucideIcon} from 'lucide-react';
import {dayProgress} from '../helpers/dayProgress';
import styles from './TodayStatTiles.module.css';

/**
 * Props of {@link TodayStatTiles}; `inbound` is undefined while the replies query is loading or failed, so the tile never shows a false zero.
 * `followUps` are the server counts of «Anotá cómo salió» and «Envíos sin confirmar» (spec 99 §3.6); both keep the day unfinished.
 */
export interface TodayStatTilesProps{counts:{overdue:number;today:number};inbound:number|undefined;attention:number;done:number;followUps:{outcomes:number;unconfirmed:number}}
type Tile={label:string;value:number|undefined;Icon:LucideIcon;tone:string;target:string;enabled?:boolean};
/** Shows daily counts and progress; each count jumps to its section, and is disabled when that section is not rendered (count 0 or unknown). */
export function TodayStatTiles({counts,inbound,attention,done,followUps}:TodayStatTilesProps){
 const progress=dayProgress({overdue:counts.overdue,today:counts.today,done,waiting:followUps.outcomes+followUps.unconfirmed});
 const tiles:Tile[]=[{label:'Vencidas',value:counts.overdue,Icon:AlertTriangle,tone:'red',target:'today-overdue'},{label:'Para hoy',value:counts.today,Icon:Clock,tone:'orange',target:'today-due-today'},{label:'Respuestas nuevas',value:inbound,Icon:Reply,tone:'violet',target:'today-inbound'},{label:'Gestiones sin tarea agendada',value:attention,Icon:Workflow,tone:'sky',target:'today-attention'},{label:'Anotá cómo salió'+(followUps.unconfirmed?` · ${followUps.unconfirmed} sin confirmar`:''),value:followUps.outcomes,Icon:MessageSquareText,tone:'violet',target:'today-outcomes',enabled:followUps.outcomes+followUps.unconfirmed>0}];
 const focus=(id:string)=>{const node=document.getElementById(id);node?.scrollIntoView({block:'start',behavior:'smooth'});node?.focus({preventScroll:true})};
 return <section className={styles.tiles} aria-label="Resumen de hoy">{tiles.map(({label,value,Icon,tone,target,enabled})=><button type="button" key={target} disabled={!(enabled??value)} aria-label={`${value??'Sin dato de'} ${label}`} onClick={()=>focus(target)}><span className={`${styles.icon} ${styles[tone]}`}><Icon size={17}/></span><strong>{value??'–'}</strong><span>{label}</span></button>)}<div className={`${styles.progress} ${styles.iconGreen}`} role="status"><span className={`${styles.icon} ${styles.green}`}><Check size={17}/></span>{progress.kind==='progress'?<><strong>Hoy: {progress.done} de {progress.total} hechas</strong><progress value={progress.done} max={progress.total} aria-label="Avance de hoy"/></>:progress.kind==='finished'?<><strong>¡Terminaste por hoy!</strong><span>Hoy: {progress.done} de {progress.total} hechas. Lo que sigue está en «Próximas tareas».</span></>:<strong>Sin tareas para hoy</strong>}</div></section>;
}
