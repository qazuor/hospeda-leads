import React,{useState} from 'react';
import {useQueryClient} from '@tanstack/react-query';
import {Button} from './Button';
import {Input} from './Input';
import {NativeSelect} from './NativeSelect';
import {useGuardedMutation} from '../helpers/useGuardedMutation';
import {postCommunication,type Message} from '../endpoints/communication.schema';
export function ManualAttemptResolution({message}:{message:Message}){
 const qc=useQueryClient();const [result,setResult]=useState<'manual_sent'|'manual_no_contact'|'manual_not_done'>('manual_sent'),[summary,setSummary]=useState('');
 const mutation=useGuardedMutation({mutationFn:postCommunication,onSuccess:()=>{void qc.invalidateQueries({queryKey:['communication']});void qc.invalidateQueries({queryKey:['global-journal']});void qc.invalidateQueries({queryKey:['lead-journal']});}});
 return <div><label>¿Cómo salió?<NativeSelect value={result} onChange={e=>setResult(e.target.value as typeof result)}><option value="manual_sent">Lo hice (confirmo que se envió)</option><option value="manual_no_contact">Lo intenté y no respondió</option><option value="manual_not_done">No lo hice</option></NativeSelect></label><label>Contá qué pasó (obligatorio)<Input value={summary} onChange={e=>setSummary(e.target.value)} /></label>{mutation.error&&<p role="alert">{mutation.error.message}</p>}<Button disabled={!summary.trim()||mutation.isPending} disabledReason={(mutation.isPending) ? "La operación está en curso. Esperá a que termine para continuar." : "Contá qué pasó en el resumen para poder guardar."} onClick={()=>mutation.mutate({action:'manual_complete',id:message.id,result,summary:summary.trim()})}>{mutation.isPending?'Guardando…':'Guardar cómo salió'}</Button></div>;
}
