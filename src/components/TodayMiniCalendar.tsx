import React,{useMemo,useState} from 'react';
import {ChevronLeft,ChevronRight} from 'lucide-react';
import {Link} from 'react-router-dom';
import type {WorkTask} from '../endpoints/work.schema';
import {localDay,taskBucket} from '../helpers/workDates';
import styles from './TodayMiniCalendar.module.css';

/** Calendar day cell data; dates are Argentina calendar day strings. */
export interface MiniCalendarDay{date:string;day:number;outside:boolean}
/** Build a Monday-first month grid with a whole number of weeks. */
export function miniCalendarDays(month:string):MiniCalendarDay[]{
 const year=Number(month.slice(0,4)),number=Number(month.slice(5,7)),count=new Date(Date.UTC(year,number,0)).getUTCDate();
 const offset=(new Date(Date.UTC(year,number-1,1,12)).getUTCDay()+6)%7,total=Math.ceil((offset+count)/7)*7;
 return Array.from({length:total},(_,index)=>{const date=new Date(Date.UTC(year,number-1,1-offset+index,12));const value=date.toISOString().slice(0,10);return {date:value,day:date.getUTCDate(),outside:value.slice(0,7)!==month};});
}
const monthTitle=(month:string)=>new Date(`${month}-01T12:00:00Z`).toLocaleDateString('es-AR',{month:'long',year:'numeric',timeZone:'UTC'});
const dayLabel=(date:string,day:number,count:number)=>`${day} de ${new Date(`${date}T12:00:00Z`).toLocaleDateString('es-AR',{month:'long',timeZone:'UTC'})}${count?`, ${count} ${count===1?'tarea':'tareas'}`:''}`;
const shiftMonth=(month:string,delta:number)=>{const date=new Date(`${month}-01T12:00:00Z`);date.setUTCMonth(date.getUTCMonth()+delta);return date.toISOString().slice(0,7)};
/** Compact calendar of only the tasks already loaded by the Lista query. */
export function TodayMiniCalendar({tasks,now}:{tasks:readonly WorkTask[];now:Date}){
 const today=localDay(now);const [month,setMonth]=useState(today.slice(0,7));const [selected,setSelected]=useState<string|null>(null);const days=useMemo(()=>miniCalendarDays(month),[month]);
 const byDay=useMemo(()=>tasks.reduce<Record<string,WorkTask[]>>((groups,task)=>{(groups[task.dueDate]??=[]).push(task);return groups;},{}),[tasks]);
 const selectedTasks=selected?byDay[selected]??[]:[];
 return <section className={styles.card} aria-label="Calendario de tareas">
  <header className={styles.header}><button type="button" aria-label="Mes anterior" onClick={()=>setMonth(value=>shiftMonth(value,-1))}><ChevronLeft size={16}/></button><h2>{monthTitle(month)}</h2><button type="button" aria-label="Mes siguiente" onClick={()=>setMonth(value=>shiftMonth(value,1))}><ChevronRight size={16}/></button></header>
  <div className={styles.grid} role="group" aria-label={monthTitle(month)}>{['L','M','X','J','V','S','D'].map((label,index)=><span className={styles.weekday} aria-hidden="true" key={index}>{label}</span>)}{days.map(({date,day,outside})=>{const dayTasks=byDay[date]??[];const buckets=dayTasks.slice(0,3).map(task=>taskBucket(task.dueDate,task.dueAt,now));return <button className={styles.day} type="button" key={date} data-outside={outside||undefined} data-today={date===today||undefined} data-selected={date===selected||undefined} aria-label={dayLabel(date,day,dayTasks.length)} aria-pressed={date===selected} onClick={()=>setSelected(value=>value===date?null:date)}><span>{day}</span>{buckets.length>0&&<span className={styles.dots} aria-hidden="true">{buckets.map((bucket,index)=><i key={index} data-bucket={bucket}/>)}</span>}</button>;})}</div>
  <div className={styles.legend}><span data-bucket="overdue">Vencida</span><span data-bucket="today">Hoy</span><span data-bucket="upcoming">Próxima</span></div>
  {selected&&<div className={styles.selected} aria-live="polite">{selectedTasks.length?<ul>{selectedTasks.slice(0,5).map(task=><li key={task.id}>{task.title} · {task.accountName}</li>)}</ul>:<p>Sin tareas en esta lista.</p>}{selectedTasks.length>5&&<p>y {selectedTasks.length-5} más</p>}</div>}
  <p className={styles.note}>Muestra las tareas cargadas en esta lista.</p><Link className={styles.link} to="/my-day?view=calendar">Ver visitas y reuniones en Calendario →</Link>
 </section>;
}
