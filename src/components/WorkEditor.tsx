import React,{useState} from 'react';
import {useMutation,useQueryClient} from '@tanstack/react-query';
import {toast} from 'sonner';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from './Dialog';
import {Button} from './Button';
import {postWork,type WorkData,type WorkTask,type WorkActivity,type WorkMutation} from '../endpoints/work.schema';
import {localDay,localDateTime,argentinaInstant} from '../helpers/workDates';
import {useAuth} from '../helpers/useAuth';
import styles from './Commercial.module.css';
export type WorkTarget={kind:'task'|'activity';item?:WorkTask|WorkActivity;accountId?:string;leadId?:string}|{kind:'complete'|'cancel'|'delete_task';item:WorkTask}|{kind:'delete_activity';item:WorkActivity};
export function WorkEditor({target,data,onClose}:{target:WorkTarget;data:WorkData;onClose:()=>void}){
 const qc=useQueryClient();const {authState}=useAuth();const admin=authState.type==='authenticated'&&authState.user.role==='admin';
 const item='item' in target?target.item:undefined;
 const [accountId,setAccount]=useState(item?.accountId||('accountId' in target?target.accountId:'')||'');
 const [leadId,setLead]=useState(item?.leadId||('leadId' in target?target.leadId:'')||'');
 const [title,setTitle]=useState(item?.title||'');
 const preferredType=target.kind==='task'?'call':'message';
 const [typeId,setType]=useState(item?.typeId||data.types.find(t=>t.id===preferredType&&t.active)?.id||data.types.find(t=>t.active)?.id||'followup');
 const [description,setDescription]=useState(item&&'description' in item?item.description??'':item&&'notes' in item?item.notes??'':'');
 const [date,setDate]=useState(item&&'dueDate' in item?item.dueDate:localDay());
 const [time,setTime]=useState(item&&'dueAt' in item&&item.dueAt?localDateTime(item.dueAt).slice(11):'');
 const [occurred,setOccurred]=useState(item&&'occurredAt' in item?localDateTime(item.occurredAt):localDateTime());
 const [assigned,setAssigned]=useState<string|undefined>(item&&'assignedUserEmail' in item?item.assignedUserEmail??'':undefined);
 const [priority,setPriority]=useState<'alta'|'media'|'baja'>(item&&'priority' in item?item.priority:'media');
 const [participants,setParticipants]=useState(item?.participants||'');
 const [contactIds,setContacts]=useState<string[]>(item?.contactIds||[]);
 const [channel,setChannel]=useState(item&&'channel' in item?item.channel??'':'');
 const [result,setResult]=useState(item?.result??'');
 const opportunities=data.opportunities.filter(o=>o.accountId===accountId);
 const owner=leadId?opportunities.find(o=>o.id===leadId)?.assignedUserEmail:data.accounts.find(a=>a.id===accountId)?.assignedUserEmail;
 const statusAction=['complete','cancel','delete_task','delete_activity'].includes(target.kind);
 const names={task:item?'Editar / reprogramar tarea':'Nueva tarea',activity:item?'Editar actividad':'Registrar actividad',complete:'Completar tarea',cancel:'Cancelar tarea',delete_task:'Dar de baja tarea',delete_activity:'Dar de baja actividad'};
 const save=useMutation({mutationFn:postWork,onSuccess:async()=>{await Promise.all(['work','leads','lead-stats','commercial-detail','lead-journal','global-journal'].map(key=>qc.invalidateQueries({queryKey:[key]})));toast.success('Guardado');onClose();},onError:e=>toast.error(e.message)});
 const submit=(e:React.FormEvent)=>{
  e.preventDefault();let body:WorkMutation;
  if(target.kind==='complete'||target.kind==='cancel')body={action:'task_status',id:target.item.id,status:target.kind==='complete'?'completed':'cancelled',result, ...(target.kind==='complete'?{completedAt:argentinaInstant(occurred).toISOString()}:{})};
  else if(target.kind==='delete_task')body={action:'task_delete',id:target.item.id};
  else if(target.kind==='delete_activity')body={action:'activity_delete',id:target.item.id};
  else{
   const common={id:item?.id,accountId,leadId:leadId||null,title,typeId,participants,contactIds};
   body=target.kind==='task'?{action:'task_save',...common,description,dueDate:date,dueAt:time?argentinaInstant(date+'T'+time).toISOString():null,priority,...(admin?{assignedUserEmail:assigned===undefined?owner||null:assigned||null}:{})}:{action:'activity_save',...common,occurredAt:argentinaInstant(occurred).toISOString(),channel:channel||null,result:result||(item&&'result' in item?item.result:null),notes:description};
  }
  save.mutate(body);
 };
 return <Dialog open onOpenChange={open=>{if(!open&&!save.isPending)onClose();}}><DialogContent className={styles.editor}>
  <DialogHeader><DialogTitle>{names[target.kind]}</DialogTitle><DialogDescription>{statusAction?item?.title:'Una tarea planifica trabajo. Una actividad registra lo que ya ocurrió. Horarios de Argentina.'}</DialogDescription></DialogHeader>
  <form className={styles.form} onSubmit={submit}>
   {!statusAction&&<>
    <label>Negocio<select required value={accountId} disabled={!!item} onChange={e=>{setAccount(e.target.value);setLead('');setContacts([]);setAssigned(undefined);}}><option value="">Elegí un negocio</option>{data.accounts.map(a=><option key={a.id} value={a.id}>{a.nombre}</option>)}</select></label>
    <label>Contexto<select value={leadId} disabled={!!item} onChange={e=>{setLead(e.target.value);setAssigned(undefined);}}><option value="">Seguimiento general del negocio</option>{opportunities.map(o=><option key={o.id} value={o.id}>{o.opportunityName||'Gestión comercial inicial'} · #{o.id}</option>)}</select></label>
    <label>Título<input required maxLength={200} value={title} onChange={e=>setTitle(e.target.value)} placeholder="Ej.: llamar para confirmar la visita"/></label>
    <label>Tipo<select value={typeId} onChange={e=>setType(e.target.value)}>{data.types.filter(t=>t.active||t.id===typeId).map(t=><option key={t.id} value={t.id}>{t.name}{!t.active?' (desactivado)':''}</option>)}</select></label>
    {target.kind==='task'&&<>
     <label>Fecha de vencimiento<input type="date" required value={date} onChange={e=>setDate(e.target.value)}/></label>
     <label>Hora (opcional)<input type="time" value={time} onChange={e=>setTime(e.target.value)}/></label>
     <label>Prioridad<select value={priority} onChange={e=>setPriority(e.target.value as typeof priority)}><option value="alta">Alta</option><option value="media">Media</option><option value="baja">Baja</option></select></label>
     <label>Responsable{admin?<select value={assigned??owner??''} onChange={e=>setAssigned(e.target.value)} disabled={item&&'legacy' in item&&item.legacy}><option value="">Sin asignar</option>{data.users.map(u=><option key={u.email} value={u.email}>{u.displayName}</option>)}</select>:<input readOnly value={data.users.find(u=>u.email===(item&&'assignedUserEmail' in item?item.assignedUserEmail:owner))?.displayName||'Responsable asignado a la tarea'}/>}</label>
     <p className={styles.muted}>Solo admin puede asignar tareas. Esto no cambia el responsable comercial del negocio ni de la oportunidad. Próxima acción muestra la primera tarea pendiente; completar una conserva las demás.</p>
    </>}
    <label>Participantes / objetivo adicional<input value={participants} onChange={e=>setParticipants(e.target.value)} placeholder="Ej.: propietario y administradora"/></label>
    <label>Descripción / notas<textarea rows={3} value={description} onChange={e=>setDescription(e.target.value)} placeholder="Objetivo y detalles para la acción"/></label>
    {data.contacts.some(c=>c.accountId===accountId)&&<fieldset><legend>Contactos participantes</legend>{data.contacts.filter(c=>c.accountId===accountId).map(c=><label className={styles.checkbox} key={c.id}><input type="checkbox" checked={contactIds.includes(c.id)} onChange={e=>setContacts(e.target.checked?[...contactIds,c.id]:contactIds.filter(id=>id!==c.id))}/>{c.name}</label>)}</fieldset>}
   </>}
   {(target.kind==='activity'||target.kind==='complete')&&<label>Fecha y hora real<input type="datetime-local" required max={localDateTime()} value={occurred} onChange={e=>setOccurred(e.target.value)}/></label>}
   {target.kind==='activity'&&<label>Canal<select value={channel} onChange={e=>setChannel(e.target.value)}><option value="">Sin especificar</option><option value="phone">Teléfono</option><option value="whatsapp">WhatsApp</option><option value="email">Email</option><option value="presencial">Presencial</option><option value="videollamada">Videollamada</option><option value="other">Otro</option></select></label>}
   {['activity','complete','cancel'].includes(target.kind)&&<label>Resultado<textarea required={target.kind!=='activity'} value={result} onChange={e=>setResult(e.target.value)} placeholder={item?.result||'Qué ocurrió / motivo de cancelación'}/></label>}
   {target.kind==='complete'&&<p className={styles.muted}>Se registrará una actividad con la fecha real, participantes y resultado. La fecha de vencimiento original se conserva.</p>}
   {target.kind.startsWith('delete')&&<p>Se ocultará el registro. Su historial de auditoría se conserva.</p>}
   {save.error&&<p role="alert" className={styles.error}>{save.error.message}</p>}
   <div className={styles.actions}><Button type="submit" disabled={save.isPending}>{save.isPending?'Guardando…':'Guardar'}</Button><Button type="button" variant="outline" onClick={onClose} disabled={save.isPending}>Volver</Button></div>
  </form>
 </DialogContent></Dialog>;
}
