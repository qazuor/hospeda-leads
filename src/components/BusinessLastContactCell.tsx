import {CalendarDays} from 'lucide-react';
import {formatDate} from '../helpers/crmDates';
import {lastContactHealth} from '../helpers/businessListQuickFilters';
import {toneToken} from '../helpers/tones';
import {calendarDay} from '../helpers/workDates';
import styles from './BusinessLastContactCell.module.css';
/** Display a last-contact date with its age tone while keeping the meaning available to assistive technology. */
export function BusinessLastContactCell({value}:{value:Date|string|null|undefined}){const date=value?(value instanceof Date?value:/^\d{4}-\d{2}-\d{2}$/.test(value)?new Date(`${value}T12:00:00-03:00`):new Date(value)):null,day=date&&!Number.isNaN(date.getTime())?(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)?value:calendarDay(date)):null,tone=lastContactHealth(day);const label=day?formatDate(date!):'Sin contacto',meaning=tone==='green'?'reciente':tone==='orange'?'hace más de 7 días':'hace más de 30 días';return <span className={styles.cell}><span>{label}</span><span aria-hidden="true" className={styles.track}><span className={styles.bar} data-tone={toneToken(tone)}/></span><span className={styles.sr}>{label==='Sin contacto'?'Sin contacto':`Último contacto: ${label}, ${meaning}`}</span><CalendarDays size={13} aria-hidden="true"/></span>}
