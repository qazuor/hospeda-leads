import {useState} from 'react';
import {UnstyledButton} from '@mantine/core';
import {useMutation,useQueryClient} from '@tanstack/react-query';
import {Check,ChevronDown} from 'lucide-react';
import {Popover,PopoverContent,PopoverTrigger} from './Popover';
import {ValueBadge} from './ValueBadge';
import {saveCommercial} from '../endpoints/commercial.schema';
import {crmSuccess} from '../helpers/crmFeedback';
import {DisabledTooltip} from './Tooltip';
import styles from './InlineBusinessStatus.module.css';
import type {BusinessStatus} from '../helpers/businessStatus';

export function InlineBusinessReview({accountId,name,status,disabled=false,doNotContact=false}:{accountId:string;name:string;status:BusinessStatus|null|undefined;disabled?:boolean;doNotContact?:boolean}){
 const qc=useQueryClient(),current=status??'new',reviewed=current!=='new',label=reviewed?'Revisado':'No revisado';const [open,setOpen]=useState(false);const [pendingValue,setPendingValue]=useState<boolean|null>(null);
 const mutation=useMutation({mutationFn:saveCommercial,onSuccess:async()=>{crmSuccess('Revisión del negocio actualizada');await Promise.all([qc.invalidateQueries({queryKey:['leads']}),qc.invalidateQueries({queryKey:['commercial-detail',accountId]}),qc.invalidateQueries({queryKey:['work']})]);setOpen(false);setPendingValue(null);}});
 const allowed=!disabled&&!doNotContact&&!mutation.isPending&&!['in_management','archived'].includes(current);
 const reason=mutation.isPending?'Guardando la revisión. Esperá a que termine.':disabled?'Solo el responsable del negocio o un administrador puede cambiar la revisión.':doNotContact?'Este negocio está marcado como No contactar y no admite cambios de estado.':current==='in_management'?'El negocio tiene una gestión abierta; la revisión no se cambia desde esta columna.':current==='archived'?'Un administrador debe desarchivar el negocio antes de cambiar la revisión.':'Esta opción no está disponible desde el estado actual del negocio.';
 async function choose(next:boolean){if(next===reviewed||!allowed)return;setPendingValue(next);mutation.reset();mutation.mutate({action:'business_status',accountId,status:next?'reviewed':'new',recontactAt:null});}
 if(disabled)return <ValueBadge category="review" value={label} className={styles.badge} nativeTooltip={false}/>;
 return <Popover open={open} onOpenChange={next=>{setOpen(next);if(!next&&!mutation.isPending){setPendingValue(null);mutation.reset();}}}>
  <PopoverTrigger asChild><UnstyledButton type="button" className={styles.trigger} aria-label={'Editar revisión de '+name+'. Ahora: '+label}><ValueBadge category="review" value={label} className={styles.badge} nativeTooltip={false}/><ChevronDown size={12} aria-hidden="true"/></UnstyledButton></PopoverTrigger>
  <PopoverContent aria-label="Revisión del negocio" className={styles.popover} align="start"><div className={styles.options} role="group" aria-label="Revisión">
   {[true,false].map(next=>{const selected=pendingValue===null?next===reviewed:pendingValue===next;const noOp=next===reviewed;const isDisabled=!allowed||noOp;return <DisabledTooltip key={String(next)} disabled={!allowed} reason={reason} style={{width:'100%'}}><UnstyledButton type="button" className={styles.option} aria-pressed={selected} disabled={isDisabled} onClick={()=>void choose(next)}><ValueBadge category="review" value={next?'Revisado':'No revisado'} nativeTooltip={false}/>{selected&&<Check size={14} aria-label="Revisión seleccionada"/>}</UnstyledButton></DisabledTooltip>;})}
  </div>{mutation.isPending&&<span role="status" className={styles.notice}>Guardando…</span>}{mutation.error&&<div role="alert" className={styles.error}>{mutation.error.message}<button type="button" onClick={()=>{if(pendingValue!==null)void choose(pendingValue);}}>Reintentar</button></div>}</PopoverContent>
 </Popover>;
}
