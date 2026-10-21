import {useEffect,useState} from 'react';
import {UnstyledButton} from '@mantine/core';
import {useMutation,useQueryClient} from '@tanstack/react-query';
import {Check,ChevronDown} from 'lucide-react';
import {Popover,PopoverContent,PopoverTrigger} from './Popover';
import {Button} from './Button';
import {CrmDateInput} from './ui/CrmDateInput';
import {ValueBadge} from './ValueBadge';
import {saveCommercial} from '../endpoints/commercial.schema';
import {recontactNotice,RECONTACT_TASK_TITLE} from '../helpers/recontactTask';
import {crmSuccess} from '../helpers/crmFeedback';
import {businessStatuses,businessStatusLabels,type BusinessStatus} from '../helpers/businessStatus';
import {calendarDay} from '../helpers/workDates';
import styles from './InlineBusinessStatus.module.css';
import {DisabledTooltip} from './Tooltip';

type SavedStatus=Awaited<ReturnType<typeof saveCommercial>>;
/** Success toast of a status save; when it scheduled "Volver a contactar" it says so and links to Hoy (decision 7A). */
export function notifyStatusSaved(result:SavedStatus|undefined){
 const task=result?.recontactTask;
 if(task)crmSuccess('Estado del negocio actualizado',{label:'Ver en Hoy',href:'/my-day'},task.action==='kept'?`Ya tenías «${RECONTACT_TASK_TITLE}» agendada para esa fecha.`:recontactNotice(task.dueDate));
 else crmSuccess('Estado del negocio actualizado');
}
const directlyEditable:BusinessStatus[]=['reviewed','no_follow_up_scheduled','recontact'];
/**
 * Business status badge-button with a popover to change it. The popover always starts on the saved status;
 * "Guardar" only appears after choosing a different one (or a new recontact date).
 * `labelled` renders the business record variant: "Estado: {badge} ▾ Cambiar".
 */
export function InlineBusinessStatus({accountId,status,recontactAt,disabled=false,labelled=false,onSaved}:{accountId:string;status:BusinessStatus|null|undefined;recontactAt:Date|string|null|undefined;disabled?:boolean;labelled?:boolean;onSaved?:(result:SavedStatus)=>Promise<void>|void}){
 const qc=useQueryClient();const current=status??'new';const savedRecontactDay=calendarDay(recontactAt);const [value,setValue]=useState<BusinessStatus>(current);const [date,setDate]=useState(savedRecontactDay);const [open,setOpen]=useState(false);
 useEffect(()=>{setValue(current);setDate(savedRecontactDay);},[current,savedRecontactDay]);
 const mutation=useMutation({mutationFn:saveCommercial,onSuccess:async result=>{if(!onSaved)notifyStatusSaved(result);await qc.invalidateQueries({queryKey:['leads']});await qc.invalidateQueries({queryKey:['commercial-detail',accountId]});await qc.invalidateQueries({queryKey:['work']});await onSaved?.(result);setOpen(false);}});
 const canEditStatus=current==='new'?['reviewed' as const]:directlyEditable;
 const canEdit=!disabled&&!mutation.isPending&&canEditStatus.length>0;
 const changed=value!==current||(value==='recontact'&&date!==savedRecontactDay);
 return <Popover open={open} onOpenChange={next=>{setOpen(next);if(!next){setValue(current);setDate(savedRecontactDay);}}}>
  <PopoverTrigger asChild><UnstyledButton type="button" className={styles.trigger} aria-label={(labelled?'Cambiar estado del negocio. Ahora: ':'Estado del negocio: ')+businessStatusLabels[current]}>
   {labelled&&<span className={styles.label}>Estado:</span>}<ValueBadge category="status" value={businessStatusLabels[current]} nativeTooltip={false} className={styles.badge}/><ChevronDown size={12} aria-hidden="true"/>{labelled&&<span className={styles.change}>Cambiar</span>}
  </UnstyledButton></PopoverTrigger>
  <PopoverContent aria-label="Estado del negocio" className={styles.popover} align="start">
   <div className={styles.options} role="group" aria-label="Estados del negocio">
    {businessStatuses.map(option=>{const selected=value===option;const allowed=canEditStatus.includes(option)&&!disabled;const isDisabled=!allowed||mutation.isPending;const reason=mutation.isPending?'Guardando el estado. Esperá a que termine.':disabled?'Solo el responsable autorizado del negocio o un administrador puede cambiar este estado.':current==='new'?'Primero cambiá el negocio a Revisado para habilitar esta etapa.':current==='in_management'?'El negocio tiene una gestión abierta; su estado se actualiza automáticamente al iniciar o cerrar gestiones.':current==='archived'?'Un administrador debe desarchivar el negocio antes de cambiar su estado.':'Esta opción no está disponible desde el estado actual del negocio.';return <DisabledTooltip key={option} disabled={isDisabled} reason={reason} style={{width:'100%'}}><UnstyledButton type="button" className={styles.option} aria-pressed={selected} disabled={isDisabled} onClick={()=>setValue(option)}>
      <ValueBadge category="status" value={businessStatusLabels[option]} nativeTooltip={false}/>{selected&&<Check size={14} aria-label="Estado seleccionado"/>}
     </UnstyledButton></DisabledTooltip>;})}
   </div>
   {value==='recontact'&&canEditStatus.includes('recontact')&&<label className={styles.date}>Fecha de recontacto (opcional)<CrmDateInput disabled={disabled||mutation.isPending} value={date} onValueChange={setDate}/></label>}
   {value==='recontact'&&canEditStatus.includes('recontact')&&<span role="status" className={styles.notice}>{date?recontactNotice(date):'Con una fecha, te agendamos una tarea para volver a contactar.'}</span>}
   {changed&&<Button size="sm" disabled={disabled||mutation.isPending} disabledReason={mutation.isPending?"Guardando el estado. Esperá a que termine.":"Solo el responsable autorizado del negocio o un administrador puede cambiar este estado."} onClick={()=>mutation.mutate({action:'business_status',accountId,status:value,recontactAt:value==='recontact'?(date||null):null})}>{mutation.isPending?'Guardando…':'Guardar'}</Button>}
   {mutation.error&&<span role="alert" className={styles.error}>{mutation.error.message}</span>}
  </PopoverContent>
 </Popover>;
}
