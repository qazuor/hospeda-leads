import {useRef} from 'react';
import {CrmDateInput} from './ui/CrmDateInput';
import {Checkbox} from './Checkbox';
import {Button} from './Button';
import {localDay,shortcutDates} from '../helpers/workDates';
import {formatDate} from '../helpers/crmDates';

/** True when `value` is a calendar day before today (Argentina) and differs from the day the task already had. */
export const needsOverdueConfirmation=(value:string,originalValue:string|undefined,now:Date=new Date()):boolean=>!!value&&value<localDay(now)&&value!==originalValue;

/**
 * Due date field with quick choices (Mañana, En 3 días, Lunes, En 1 semana, Elegir fecha).
 * Never preselects a day. A past day (other than the one the task already had) shows a required "Sí, quiero dejarla vencida" checkbox.
 */
export function DueDateShortcuts({label,value,onChange,originalValue,overdueConfirmed,onOverdueConfirmedChange,now,className,postpone}:{label:string;value:string;onChange:(value:string)=>void;originalValue?:string;overdueConfirmed:boolean;onOverdueConfirmedChange:(confirmed:boolean)=>void;now?:Date;className?:string;postpone?:boolean}){
 const change=(day:string)=>{onChange(day);onOverdueConfirmedChange(false);};
 const input=useRef<HTMLInputElement>(null);
 const dates=shortcutDates(now);
 const chips=[['Mañana',dates.tomorrow],['En 3 días',dates.in3],['Lunes',dates.nextMonday],['En 1 semana',dates.in7]] as const;
 const matches=chips.some(([,day])=>day===value);
 const overdue=needsOverdueConfirmation(value,originalValue,now);
 return <div className={className} style={{display:'grid',gap:8}}>
  <div role="group" aria-label="Atajos de fecha" style={{display:'flex',flexWrap:'wrap',gap:8}}>
   {postpone&&<span>Posponer a:</span>}
   {chips.map(([name,day])=><Button key={name} type="button" size="sm" variant={value===day?'primary':'outline'} aria-pressed={value===day} title={formatDate(day)} onClick={()=>change(day)}>{name}</Button>)}
   <Button type="button" size="sm" variant={value&&!matches?'primary':'outline'} aria-pressed={!!value&&!matches} onClick={()=>input.current?.focus()}>Elegir fecha</Button>
  </div>
  <label>{label}<CrmDateInput ref={input} required value={value} onValueChange={change}/></label>
  {overdue&&<label style={{display:'flex',alignItems:'center',gap:12,fontWeight:400}}><Checkbox required checked={overdueConfirmed} onChange={e=>onOverdueConfirmedChange(e.target.checked)}/>Sí, quiero dejarla vencida</label>}
 </div>;
}
