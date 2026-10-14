import {useEffect,useState} from 'react';
import {UnstyledButton} from '@mantine/core';
import {useMutation,useQueryClient} from '@tanstack/react-query';
import {Check,ChevronDown} from 'lucide-react';
import {Popover,PopoverContent,PopoverTrigger} from './Popover';
import {Button} from './Button';
import {CrmDateInput} from './ui/CrmDateInput';
import {ValueBadge} from './ValueBadge';
import {saveCommercial} from '../endpoints/commercial.schema';
import {businessStatuses,businessStatusLabels,type BusinessStatus} from '../helpers/businessStatus';
import {calendarDay} from '../helpers/workDates';
import styles from './InlineBusinessStatus.module.css';

const directlyEditable:BusinessStatus[]=['reviewed','no_follow_up_scheduled','recontact'];
export function InlineBusinessStatus({accountId,status,recontactAt,disabled=false}:{accountId:string;status:BusinessStatus|null|undefined;recontactAt:Date|string|null|undefined;disabled?:boolean}){
 const qc=useQueryClient();const current=status??'new';const savedRecontactDay=calendarDay(recontactAt);const [value,setValue]=useState<BusinessStatus>(current);const [date,setDate]=useState(savedRecontactDay);const [open,setOpen]=useState(false);
 useEffect(()=>{setValue(current);setDate(savedRecontactDay);},[current,savedRecontactDay]);
 const mutation=useMutation({mutationFn:saveCommercial,onSuccess:async()=>{await qc.invalidateQueries({queryKey:['leads']});await qc.invalidateQueries({queryKey:['commercial-detail',accountId]});setOpen(false);}});
 const canEditStatus=current==='new'?['reviewed' as const]:directlyEditable;
 const canEdit=!disabled&&!mutation.isPending&&canEditStatus.length>0;
 const changed=value!==current||(value==='recontact'&&date!==savedRecontactDay);
 return <Popover open={open} onOpenChange={setOpen}>
  <PopoverTrigger asChild><UnstyledButton type="button" className={styles.trigger} aria-label={'Estado del negocio: '+businessStatusLabels[current]}>
   <ValueBadge category="status" value={businessStatusLabels[current]} nativeTooltip={false} className={styles.badge}/><ChevronDown size={12} aria-hidden="true"/>
  </UnstyledButton></PopoverTrigger>
  <PopoverContent aria-label="Estado del negocio" className={styles.popover} align="start">
   <div className={styles.options} role="group" aria-label="Estados del negocio">
    {businessStatuses.map(option=>{const selected=value===option;const allowed=canEditStatus.includes(option)&&!disabled;return <UnstyledButton key={option} type="button" className={styles.option} aria-pressed={selected} disabled={!allowed||mutation.isPending} onClick={()=>setValue(option)}>
      <ValueBadge category="status" value={businessStatusLabels[option]} nativeTooltip={false}/>{selected&&<Check size={14} aria-label="Estado seleccionado"/>}
     </UnstyledButton>;})}
   </div>
   {value==='recontact'&&canEditStatus.includes('recontact')&&<label className={styles.date}>Fecha de recontacto (opcional)<CrmDateInput disabled={disabled||mutation.isPending} value={date} onValueChange={setDate}/></label>}
   {changed&&<Button size="sm" disabled={disabled||mutation.isPending} onClick={()=>mutation.mutate({action:'business_status',accountId,status:value,recontactAt:value==='recontact'?(date||null):null})}>{mutation.isPending?'Guardando…':'Guardar'}</Button>}
   {mutation.error&&<span role="alert" className={styles.error}>{mutation.error.message}</span>}
  </PopoverContent>
 </Popover>;
}
