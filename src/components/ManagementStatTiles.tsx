import {CalendarClock,CheckCircle2,Clock3,Target,UserRound,Users} from 'lucide-react';
import type {LucideIcon} from 'lucide-react';
import styles from './ManagementStatTiles.module.css';
const items:[string,keyof ManagementStatTilesProps['stats'],LucideIcon][]=[['all','total',Users],['pending','pendientes',Target],['today','paraHoy',CalendarClock],['overdue','vencidos',Clock3],['myToday','misPendientesHoy',UserRound],['subscribed','suscriptos',CheckCircle2]];
export interface ManagementStatTilesProps{stats:{total:number;pendientes:number;paraHoy:number;vencidos:number;misPendientesHoy:number;suscriptos:number};active:string;onSelect:(view:string)=>void}
/** Six actionable management summary tiles. */
export function ManagementStatTiles({stats,active,onSelect}:ManagementStatTilesProps){const labels=['Total de gestiones','Gestiones abiertas','Gestiones con acción hoy','Gestiones con acción atrasada','Mis registros con acción hasta hoy','Suscriptos históricos'];return <section className={styles.tiles} aria-label="Resumen de gestiones">{items.map(([view,key,Icon],index)=><button type="button" key={view} aria-pressed={active===view} onClick={()=>onSelect(view)}><span className={styles.icon}><Icon size={17}/></span><strong>{stats[key].toLocaleString('es-AR')}</strong><span>{labels[index]}</span></button>)}</section>}
