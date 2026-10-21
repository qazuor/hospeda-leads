import {useRef,useState} from 'react';
import {useQueryClient} from '@tanstack/react-query';
import {toast} from 'sonner';
import {CalendarClock,ChevronDown} from 'lucide-react';
import {useGuardedMutation} from '../helpers/useGuardedMutation';
import {postWork,type WorkTask,type WorkMutation} from '../endpoints/work.schema';
import {argentinaInstant,localDateTime,localDay,shortcutDates} from '../helpers/workDates';
import {formatDate} from '../helpers/crmDates';
import {Button} from './Button';
import {CrmDateInput} from './ui/CrmDateInput';
import {DropdownMenu,DropdownMenuTrigger,DropdownMenuContent,DropdownMenuItem} from './DropdownMenu';
import {Dialog,DialogContent,DialogHeader,DialogFooter,DialogTitle,DialogDescription} from './Dialog';

/** Quick postpone choices for a task: Argentina calendar days, without repeats (on a Friday "Lunes" is the same day as "En 3 días") and without the day the task already has. */
export function postponeOptions({dueDate,now}:{dueDate:string;now?:Date}):{label:string;day:string}[]{
 const dates=shortcutDates(now);
 const all=[{label:'Mañana',day:dates.tomorrow},{label:'En 3 días',day:dates.in3},{label:'Lunes',day:dates.nextMonday}];
 return all.filter((option,i)=>option.day!==dueDate&&all.findIndex(o=>o.day===option.day)===i);
}

/** The `task_reschedule` body: only the date/time changes, and `expected*` is what the row showed, so a concurrent edit answers 409 instead of being overwritten. */
export function rescheduleBody({task,dueDate,dueAt}:{task:WorkTask;dueDate:string;dueAt:string|null}):WorkMutation{
 return {action:'task_reschedule',id:task.id,expectedDueDate:task.dueDate,expectedDueAt:task.dueAt?new Date(task.dueAt).toISOString():null,dueDate,dueAt};
}
/** Same time of day on another day (Argentina), or null when the task has no time. */
export function movedDueAt({task,dueDate}:{task:WorkTask;dueDate:string}):string|null{
 return task.dueAt?argentinaInstant(dueDate+'T'+localDateTime(task.dueAt).slice(11)).toISOString():null;
}

const refreshed=['work','leads','lead-stats','commercial-detail','lead-journal','global-journal','communication','pipeline','analytics'];

/**
 * "Posponer ▾" of a pending task row: Mañana / En 3 días / Lunes / Elegir fecha. Saves through `task_reschedule` and offers "Deshacer" in the toast.
 */
export function TaskPostponeMenu({task}:{task:WorkTask}){
 const qc=useQueryClient();
 const [pickerOpen,setPickerOpen]=useState(false),[picked,setPicked]=useState('');
 const refresh=()=>Promise.all(refreshed.map(key=>qc.invalidateQueries({queryKey:[key]})));
 const undoing=useRef(false);
 const save=useGuardedMutation({mutationFn:(dueDate:string)=>postWork(rescheduleBody({task,dueDate,dueAt:movedDueAt({task,dueDate})})),onSuccess:async(_,dueDate)=>{
  await refresh();setPickerOpen(false);setPicked('');
  const movedAt=movedDueAt({task,dueDate});
  // Runs outside any hook: the row (and this component) usually unmounts once the task moves to another list. The postponed value is what Deshacer expects to find.
  const undo=async()=>{if(undoing.current)return;undoing.current=true;try{await postWork(rescheduleBody({task:{...task,dueDate,dueAt:movedAt?new Date(movedAt):null},dueDate:task.dueDate,dueAt:task.dueAt?new Date(task.dueAt).toISOString():null}));await refresh();toast.success('Volvió a su fecha: '+formatDate(task.dueDate));}catch(e){toast.error('No se pudo deshacer: '+(e instanceof Error?e.message:'probá de nuevo'));}finally{undoing.current=false;}};
  toast.success('Tarea pospuesta para el '+formatDate(dueDate),{duration:8000,description:task.title,action:{label:'Deshacer',onClick:()=>{void undo();}}});
 },onError:e=>toast.error(e.message)});
 const today=localDay();
 const pickDisabled=!picked||picked<today||picked===task.dueDate;
 return <>
  <DropdownMenu><DropdownMenuTrigger asChild><Button size="sm" variant="outline" disabled={save.isPending} disabledReason="Se está guardando la nueva fecha. Esperá a que termine." aria-label={'Posponer '+task.title}><CalendarClock size={14} aria-hidden="true"/>Posponer<ChevronDown size={14} aria-hidden="true"/></Button></DropdownMenuTrigger><DropdownMenuContent align="end">
   {postponeOptions({dueDate:task.dueDate}).map(o=><DropdownMenuItem key={o.day} onSelect={()=>save.mutate(o.day)}>{o.label} · {formatDate(o.day)}</DropdownMenuItem>)}
   <DropdownMenuItem onSelect={()=>setPickerOpen(true)}>Elegir fecha…</DropdownMenuItem>
  </DropdownMenuContent></DropdownMenu>
  {pickerOpen&&<Dialog open onOpenChange={open=>{if(!open&&!save.isPending){setPickerOpen(false);setPicked('');}}}><DialogContent>
   <DialogHeader><DialogTitle>Posponer tarea</DialogTitle><DialogDescription>{task.title} · hoy vence el {formatDate(task.dueDate)}. Horarios de Argentina.</DialogDescription></DialogHeader>
   <label>Nueva fecha<CrmDateInput required autoFocus value={picked} min={today} onValueChange={setPicked}/></label>
   <DialogFooter><Button type="button" variant="outline" disabled={save.isPending} disabledReason="Se está guardando la nueva fecha. Esperá a que termine." onClick={()=>{setPickerOpen(false);setPicked('');}}>Volver</Button><Button type="button" disabled={save.isPending||pickDisabled} disabledReason={save.isPending?'Se está guardando la nueva fecha. Esperá a que termine.':!picked?'Elegí la nueva fecha.':picked<today?'Elegí hoy o un día futuro.':'Esa ya es la fecha de la tarea.'} onClick={()=>save.mutate(picked)}>{save.isPending?'Guardando…':'Posponer'}</Button></DialogFooter>
  </DialogContent></Dialog>}
 </>;
}
