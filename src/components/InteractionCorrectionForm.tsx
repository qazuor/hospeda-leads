import React,{useState} from 'react';
import {useQueryClient} from '@tanstack/react-query';
import {Button} from './Button';
import {Input} from './Input';
import {NativeSelect} from './NativeSelect';
import {useGuardedMutation} from '../helpers/useGuardedMutation';
import {postCommunication,type Message} from '../endpoints/communication.schema';

export function InteractionCorrectionForm({message}:{message:Message}){
 const options=message.channel==='whatsapp'?['manual_sent','manual_not_done']:['manual_sent','manual_no_contact','manual_not_done'];
 const [result,setResult]=useState(message.status as 'manual_sent'|'manual_no_contact'|'manual_not_done'),[summary,setSummary]=useState(message.summary??''),[reason,setReason]=useState('');
 const qc=useQueryClient();
 const mutation=useGuardedMutation({mutationFn:postCommunication,onSuccess:()=>{void qc.invalidateQueries({queryKey:['communication']});void qc.invalidateQueries({queryKey:['global-journal']});void qc.invalidateQueries({queryKey:['lead-journal']});}});
 return <details><summary>Corregir resultado o resumen</summary><label>Resultado<NativeSelect value={result} onChange={e=>setResult(e.target.value as typeof result)}>{options.map(value=><option key={value} value={value}>{value==='manual_sent'?'Realizado / enviado':value==='manual_no_contact'?'Intento sin respuesta / contacto':'No realizado / enviado'}</option>)}</NativeSelect></label><label>Resumen<Input value={summary} onChange={e=>setSummary(e.target.value)} /></label><label>Motivo de corrección (mínimo 3 caracteres)<Input required minLength={3} value={reason} onChange={e=>setReason(e.target.value)} /></label>{mutation.error&&<p role="alert">{mutation.error.message}</p>}<Button disabled={mutation.isPending||reason.trim().length<3} disabledReason={(mutation.isPending) ? "La operación está en curso. Esperá a que termine para continuar." : "Completá el motivo obligatorio (mínimo 3 caracteres)."} onClick={()=>mutation.mutate({action:'interaction_correct',id:message.id,result,summary:summary.trim(),reason:reason.trim()})}>{mutation.isPending?'Guardando…':'Guardar corrección'}</Button></details>;
}
