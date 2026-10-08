import React,{useRef,useState} from 'react';
import {useMutation,useQueryClient} from '@tanstack/react-query';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription,DialogFooter} from './Dialog';
import {Input} from './Input';
import {Button} from './Button';
import {postCommunication} from '../endpoints/communication.schema';
import {crmError} from '../helpers/crmErrors';

export type RestrictionTarget={id:string;channel:string;contact:string;reason:string};
export function LiftRestrictionDialog({target,onClose,onLifted}:{target:RestrictionTarget;onClose:()=>void;onLifted:()=>void}){
 const [reason,setReason]=useState('');
 const lock=useRef(false),opener=useRef(typeof document==='undefined'?null:document.activeElement as HTMLElement|null);
 const qc=useQueryClient();
 const mutation=useMutation({mutationFn:postCommunication,onSuccess:()=>Promise.all([
  qc.invalidateQueries({queryKey:['communication']}),qc.invalidateQueries({queryKey:['work']})
 ])});
 const close=()=>{if(!lock.current)onClose()};
 async function submit(){
  if(lock.current||reason.trim().length<3)return;
  lock.current=true;
  try{await mutation.mutateAsync({action:'lift',id:target.id,reason:reason.trim()});onLifted();}
  catch{/* Keep the reason and mutation error available for retry. */}
  finally{lock.current=false;}
 }
 const channel=target.channel==='all'?'Todos los canales':target.channel==='email'?'Email':'WhatsApp';
 return <Dialog open onOpenChange={open=>{if(!open)close()}}><DialogContent showCloseButton={!mutation.isPending} onCloseAutoFocus={event=>{
  event.preventDefault();const notice=document.querySelector<HTMLElement>(`[data-lifted-restriction="${target.id}"]`);
  if(notice)notice.focus();else if(opener.current?.isConnected)opener.current.focus();
 }}><DialogHeader><DialogTitle>Levantar restricción</DialogTitle><DialogDescription>Se habilitará el contacto para este canal. Los seguimientos detenidos no se reanudan y no se envía ningún mensaje.</DialogDescription></DialogHeader>
  <p><strong>{channel}</strong> · {target.contact}</p><p>Motivo original: {target.reason}</p>
  <form onSubmit={event=>{event.preventDefault();event.stopPropagation();void submit()}}>
   <label>Motivo para levantar la restricción<Input autoFocus required minLength={3} maxLength={1000} disabled={mutation.isPending} value={reason} onChange={event=>setReason(event.target.value)}/></label>
   {mutation.error&&<p role="alert">{crmError(mutation.error)}<br/>El motivo se conserva para reintentar.</p>}
   {mutation.isPending&&<p role="status">Levantando restricción…</p>}
   <DialogFooter><Button variant="outline" disabled={mutation.isPending} onClick={close}>Cancelar</Button><Button type="submit" disabled={mutation.isPending||reason.trim().length<3}>{mutation.isPending?'Levantando restricción…':'Confirmar levantamiento'}</Button></DialogFooter>
  </form>
 </DialogContent></Dialog>;
}
