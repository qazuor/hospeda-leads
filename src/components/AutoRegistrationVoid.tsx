import {useState} from 'react';
import {useQueryClient} from '@tanstack/react-query';
import {toast} from 'sonner';
import {postCommunication} from '../endpoints/communication.schema';
import {useGuardedMutation} from '../helpers/useGuardedMutation';
import {crmSuccess} from '../helpers/crmFeedback';
import {Button} from './Button';
import {Dialog,DialogContent,DialogDescription,DialogFooter,DialogHeader,DialogTitle} from './Dialog';
import styles from './Communication.module.css';

const VOID_REASONS=['Era de otro negocio','No era de esta gestión','Mensaje personal','Otro'] as const;
const BUSY='La operación está en curso. Esperá a que termine.';

/**
 * Client mirror of who may void an automatic registration (the server checks again): an active automatic registration of a
 * row that is not voided yet, on a writable view, for its own registering user or an admin.
 */
export function canVoidAutoRegistration({readOnly,canWrite,admin,userEmail,registrationId,registrationUserEmail,status}:{readOnly:boolean;canWrite:boolean;admin:boolean;userEmail:string;registrationId?:string|null;registrationUserEmail?:string|null;status:string}):boolean{
 return !readOnly&&canWrite&&!!registrationId&&status!=='voided'&&(admin||registrationUserEmail===userEmail);
}

/** Warnings for the later effects the server could not undo (`skipped`), as plain text. */
function skippedMessages(data:unknown):string[]{
 const skipped=(data as {skipped?:unknown}|null)?.skipped;
 if(!Array.isArray(skipped))return [];
 return skipped.map(item=>{
  if(typeof item==='string')return item;
  const message=(item as {message?:unknown}|null)?.message;
  return typeof message==='string'?message:'No se pudo deshacer un efecto posterior.';
 });
}

/**
 * «Anular registro» for an automatic WhatsApp registration, shared by the business «Comunicación» tab and the Bandeja.
 * Requires a reason, blocks a second submit while pending and keeps the choice after an error. Render it only when
 * `canVoidAutoRegistration` allows it.
 */
export function AutoRegistrationVoidButton({registrationId}:{registrationId:string}){
 const qc=useQueryClient();
 const [open,setOpen]=useState(false),[choice,setChoice]=useState(''),[other,setOther]=useState('');
 const mutation=useGuardedMutation({mutationFn:postCommunication,onSuccess:(data:unknown)=>{
  for(const queryKey of [['communication'],['inbox'],['work'],['global-journal'],['lead-journal']])void qc.invalidateQueries({queryKey});
  setOpen(false);setChoice('');setOther('');crmSuccess('Registro anulado');
  for(const message of skippedMessages(data))toast.warning(message);
 }});
 const otherInvalid=choice==='Otro'&&(other.trim().length<3||other.trim().length>500);
 return <>
  <Button size="sm" variant="outline" disabled={mutation.isPending} disabledReason={BUSY} onClick={()=>{setChoice('');setOther('');mutation.reset();setOpen(true)}}>Anular registro</Button>
  <Dialog open={open} onOpenChange={value=>{if(!value&&!mutation.isPending)setOpen(false)}}><DialogContent><DialogHeader><DialogTitle>Anular registro automático</DialogTitle><DialogDescription>Elegí el motivo. La anulación queda registrada en el historial del negocio.</DialogDescription></DialogHeader><div className={styles.panel}>
   {VOID_REASONS.map(option=><label key={option} style={{display:'flex',gap:8,alignItems:'center'}}><input type="radio" name={`auto-void-reason-${registrationId}`} value={option} checked={choice===option} disabled={mutation.isPending} onChange={()=>setChoice(option)}/>{option}</label>)}
   {choice==='Otro'&&<label>Motivo (3–500 caracteres)<textarea value={other} maxLength={500} minLength={3} disabled={mutation.isPending} onChange={event=>setOther(event.target.value)} rows={4}/></label>}
   {mutation.error&&<p role="alert">{mutation.error.message}</p>}
  </div><DialogFooter><Button variant="outline" disabled={mutation.isPending} disabledReason={BUSY} onClick={()=>setOpen(false)}>Cancelar</Button><Button disabled={!choice||otherInvalid||mutation.isPending} disabledReason={mutation.isPending?BUSY:'Elegí un motivo y completá el texto si seleccionaste «Otro».'} onClick={()=>mutation.mutate({action:'auto_registration_void',id:registrationId,reason:choice==='Otro'?other.trim():choice})}>{mutation.isPending?'Anulando…':'Anular registro'}</Button></DialogFooter></DialogContent></Dialog>
 </>;
}
