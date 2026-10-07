import {WorkFlowSteps} from './WorkFlowSteps';
import {purposeNames,type WorkPurpose} from '../helpers/nextStep';
import {useDebounce} from '../helpers/useDebounce';
import {useUnsavedChanges} from './UnsavedChanges';
import {workOutcomes,purposeOutcomes,type WorkOutcome} from '../helpers/workOutcomes';
import React,{useState} from 'react';
import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query';
import {toast} from 'sonner';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from './Dialog';
import {Button} from './Button';
import {getWork,postWork,type WorkData,type WorkTask,type WorkActivity,type WorkMutation} from '../endpoints/work.schema';
import {localDay,localDateTime,argentinaInstant} from '../helpers/workDates';
import {useAuth} from '../helpers/useAuth';
import styles from './Commercial.module.css';
export type WorkTarget={kind:'task'|'activity';item?:WorkTask|WorkActivity;accountId?:string;leadId?:string;contactIds?:string[];channel?:string;purpose?:WorkPurpose;title?:string}|{kind:'complete'|'cancel'|'delete_task';item:WorkTask;contactIds?:string[];channel?:string;purpose?:WorkPurpose}|{kind:'delete_activity';item:WorkActivity};
export function WorkEditor({target,data,onClose}:{target:WorkTarget;data:WorkData;onClose:()=>void}){
 const qc=useQueryClient();const {authState}=useAuth();const admin=authState.type==='authenticated'&&authState.user.role==='admin';
 const item='item' in target?target.item:undefined;
 const [accountId,setAccount]=useState(item?.accountId||('accountId' in target?target.accountId:'')||'');
 const [leadId,setLead]=useState(item?.leadId||('leadId' in target?target.leadId:'')||'');
 const [title,setTitle]=useState(item?.title||('title' in target?target.title:'')||'');
 const preferredType=target.kind==='task'?'call':'message';
 const [typeId,setType]=useState(item?.typeId||data.types.find(t=>t.id===preferredType&&t.active)?.id||data.types.find(t=>t.active)?.id||'followup');
 const [description,setDescription]=useState(item&&'description' in item?item.description??'':item&&'notes' in item?item.notes??'':'');
 const [date,setDate]=useState(item&&'dueDate' in item?item.dueDate:localDay());
 const [time,setTime]=useState(item&&'dueAt' in item&&item.dueAt?localDateTime(item.dueAt).slice(11):'');
 const [occurred,setOccurred]=useState(item&&'occurredAt' in item?localDateTime(item.occurredAt):localDateTime());
 const [assigned,setAssigned]=useState<string|undefined>(item&&'assignedUserEmail' in item?item.assignedUserEmail??'':undefined);
 const [priority,setPriority]=useState<'alta'|'media'|'baja'>(item&&'priority' in item?item.priority:'media');
 const [participants,setParticipants]=useState(item?.participants||'');
 const [contactIds,setContacts]=useState<string[]>(('contactIds' in target?target.contactIds:undefined)||item?.contactIds||[]);
 const [channel,setChannel]=useState(item&&'channel' in item?item.channel??'':('channel' in target?target.channel:undefined)||'');
 const [result,setResult]=useState(item?.result??'');
 const [outcome,setOutcome]=useState<WorkOutcome|''>((item?.outcome as WorkOutcome)||'');
 const [purpose,setPurpose]=useState<WorkPurpose|''>(('purpose' in target?target.purpose:undefined)||item?.purpose||(item?'':'commercial'));
 const [continuation,setContinuation]=useState<'task'|'wait'|'done'|''>('');
 const [next,setNext]=useState(false),[nextTitle,setNextTitle]=useState(''),[nextDate,setNextDate]=useState(localDay());
 const values=JSON.stringify({accountId,leadId,title,typeId,description,date,time,occurred,assigned,priority,participants,contactIds,channel,result,outcome,purpose,continuation,next,nextTitle,nextDate});
 const [baseline]=useState(values);const guard=useUnsavedChanges(values!==baseline,onClose);
 const nextTask=next&&outcome!=='do_not_contact'?{title:nextTitle,dueDate:nextDate,typeId:'followup',purpose:purpose||undefined}:undefined;
 const [search,setSearch]=useState('');const debouncedSearch=useDebounce(search,250);
 const lookup=useQuery({queryKey:['work','lookup',debouncedSearch,accountId],queryFn:()=>getWork({mode:'lookup',...(debouncedSearch?{q:debouncedSearch}:accountId?{accountId}:{})}),enabled:!['delete_task','delete_activity','cancel'].includes(target.kind)});
 const choices=[...new Map([...data.accounts,...(lookup.data?.accounts??[])].map(a=>[a.id,a])).values()];
 const availableContacts=[...new Map([...data.contacts,...(lookup.data?.contacts??[])].map(c=>[c.id,c])).values()];
 const availableOpportunities=lookup.data?.opportunities??data.opportunities;
 const opportunities=availableOpportunities.filter(o=>o.accountId===accountId);
 const owner=leadId?opportunities.find(o=>o.id===leadId)?.assignedUserEmail:choices.find(a=>a.id===accountId)?.assignedUserEmail;
 const statusAction=['complete','cancel','delete_task','delete_activity'].includes(target.kind);
 const names={task:item?'Editar / reprogramar tarea':'Planificar próximo paso',activity:item?'Editar actividad':'Registrar actividad',complete:'Registrar qué pasó',cancel:'Cancelar tarea',delete_task:'Dar de baja tarea',delete_activity:'Dar de baja actividad'};
 const save=useMutation({mutationFn:postWork,onSuccess:async()=>{await Promise.all(['work','leads','lead-stats','commercial-detail','lead-journal','global-journal','communication','pipeline','analytics'].map(key=>qc.invalidateQueries({queryKey:[key]})));toast.success(target.kind==='complete'?(next?'Resultado guardado y próximo paso programado':'Resultado guardado; las otras tareas se conservan'):target.kind==='task'?'Próximo paso guardado':'Guardado');onClose();},onError:e=>toast.error(e.message)});
 const submit=(e:React.FormEvent)=>{
  e.preventDefault();if(['activity','complete'].includes(target.kind)&&outcome!=='do_not_contact'&&!continuation){toast.error('Elegí cómo sigue esta conversación.');return;}let body:WorkMutation;
  if(target.kind==='complete'||target.kind==='cancel')body={action:'task_status',id:target.item.id,status:target.kind==='complete'?'completed':'cancelled',purpose:purpose||undefined,continuation:continuation||undefined,result:result||workOutcomes[outcome as WorkOutcome]||'Cancelada',outcome:outcome||null,nextTask,contactIds,channel:channel||null, ...(target.kind==='complete'?{completedAt:argentinaInstant(occurred).toISOString()}:{})};
  else if(target.kind==='delete_task')body={action:'task_delete',id:target.item.id};
  else if(target.kind==='delete_activity')body={action:'activity_delete',id:target.item.id};
  else{
   const common={purpose:purpose||undefined,id:item?.id,accountId,leadId:leadId||null,title,typeId,participants,contactIds};
   body=target.kind==='task'?{action:'task_save',...common,description,dueDate:date,dueAt:time?argentinaInstant(date+'T'+time).toISOString():null,priority,...(admin?{assignedUserEmail:assigned===undefined?owner||null:assigned||null}:{})}:{action:'activity_save',...common,occurredAt:argentinaInstant(occurred).toISOString(),continuation:continuation||undefined,outcome:outcome||null,nextTask,channel:channel||null,result:result||workOutcomes[outcome as WorkOutcome]||(item&&'result' in item?item.result:null),notes:description};
  }
  save.mutate(body);
 };
 return <Dialog open onOpenChange={open=>{if(!open&&!save.isPending)guard.requestClose();}}><DialogContent className={styles.editor}>
  <DialogHeader><DialogTitle>{names[target.kind]}</DialogTitle><DialogDescription>{statusAction?item?.title:target.kind==='task'?'Definí el próximo paso y cuándo hacerlo. Horarios de Argentina.':'Registrá una acción realizada, también de días anteriores. Horarios de Argentina.'}</DialogDescription></DialogHeader>
  {['complete','activity'].includes(target.kind)&&<><WorkFlowSteps current={continuation?2:1} blocked={outcome==='do_not_contact'}/>{target.kind==='complete'&&<p className={styles.contextNote}><strong>{'accountName' in target.item?target.item.accountName:'Negocio seleccionado'}</strong> · {target.item.leadId?(target.item.opportunityName||'Esta gestión'):'Seguimiento general del negocio'}</p>}</>}
  <form className={styles.form} onSubmit={submit}>
   {!statusAction&&<>
    {accountId&&('accountId' in target&&target.accountId||item)?<p className={styles.contextNote}><strong>{choices.find(a=>a.id===accountId)?.nombre||item&&'accountName' in item&&item.accountName||'Negocio seleccionado'}</strong> · {leadId?opportunities.find(o=>o.id===leadId)?.opportunityName||'Esta gestión':'Seguimiento general del negocio'}</p>:<fieldset className={styles.formSection}><legend>Negocio y gestión</legend>{!accountId&&<label>Buscar negocio<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Escribí un nombre o ciudad"/></label>}<label>Negocio<select required value={accountId} disabled={!!item||!!('accountId' in target&&target.accountId)} onChange={e=>{setAccount(e.target.value);setLead('');setContacts([]);setAssigned(undefined);}}><option value="">Elegí un negocio</option>{choices.map(a=><option key={a.id} value={a.id}>{a.nombre}</option>)}</select></label>
    <label>Contexto<select value={leadId} disabled={!!item||!!('leadId' in target&&target.leadId)} onChange={e=>{setLead(e.target.value);setAssigned(undefined);}}><option value="">Seguimiento general del negocio</option>{opportunities.map(o=><option key={o.id} value={o.id}>{o.opportunityName||'Gestión comercial inicial'} · #{o.id}</option>)}</select></label>
    </fieldset>}<fieldset className={styles.formSection}><legend>Qué hay que hacer</legend><label>Título<input required maxLength={200} value={title} onChange={e=>setTitle(e.target.value)} placeholder="Ej.: llamar para confirmar la visita"/></label>
    <label>Tipo<select value={typeId} onChange={e=>setType(e.target.value)}>{data.types.filter(t=>t.active||t.id===typeId).map(t=><option key={t.id} value={t.id}>{t.name}{!t.active?' (desactivado)':''}</option>)}</select></label>
    </fieldset>{target.kind==='task'&&<fieldset className={styles.formSection}><legend>Cuándo y quién lo hará</legend>
     <label>Fecha de vencimiento<input type="date" required value={date} onChange={e=>setDate(e.target.value)}/></label>
     <label>Hora (opcional)<input type="time" value={time} onChange={e=>setTime(e.target.value)}/></label>
     <label>Prioridad<select value={priority} onChange={e=>setPriority(e.target.value as typeof priority)}><option value="alta">Alta</option><option value="media">Media</option><option value="baja">Baja</option></select></label>
     <label>Responsable{admin?<select value={assigned??owner??''} onChange={e=>setAssigned(e.target.value)} disabled={item&&'legacy' in item&&item.legacy}><option value="">Sin asignar</option>{data.users.map(u=><option key={u.email} value={u.email}>{u.displayName}</option>)}</select>:<input readOnly value={data.users.find(u=>u.email===(item&&'assignedUserEmail' in item?item.assignedUserEmail:owner))?.displayName||'Responsable asignado a la tarea'}/>}</label>
     <p className={styles.muted}>{admin?"Asignar esta tarea no cambia el responsable comercial.":"El responsable comercial se conserva. Solo admin puede asignar tareas."}</p>
    </fieldset>}
    {!item&&accountId&&'accountId' in target&&target.accountId&&!target.leadId&&<details className={styles.optionalFields}><summary>Vincular a una gestión (opcional)</summary><label>Contexto<select value={leadId} onChange={e=>{setLead(e.target.value);setAssigned(undefined)}}><option value="">Seguimiento general del negocio</option>{opportunities.map(o=><option key={o.id} value={o.id}>{o.opportunityName||'Gestión sin nombre'}</option>)}</select></label></details>}
    <details className={styles.optionalFields} open={!!item}><summary>Participantes y notas (opcional)</summary><fieldset className={styles.formSection}><legend>Detalles adicionales</legend><label>Participantes / objetivo adicional<input value={participants} onChange={e=>setParticipants(e.target.value)} placeholder="Ej.: propietario y administradora"/></label>
    <label className={styles.fullField}>Descripción / notas<textarea rows={3} value={description} onChange={e=>setDescription(e.target.value)} placeholder="Objetivo y detalles para la acción"/></label>
    {availableContacts.some(c=>c.accountId===accountId)&&<fieldset><legend>Contactos participantes</legend>{availableContacts.filter(c=>c.accountId===accountId).map(c=><label className={styles.checkbox} key={c.id}><input type="checkbox" checked={contactIds.includes(c.id)} onChange={e=>setContacts(e.target.checked?[...contactIds,c.id]:contactIds.filter(id=>id!==c.id))}/>{c.name}</label>)}</fieldset>}
    </fieldset></details>
   </>}
   {['task','activity','complete'].includes(target.kind)&&<label className={styles.fullField}>Propósito<select required autoFocus={!purpose} value={purpose} onChange={e=>{setPurpose(e.target.value as WorkPurpose);setOutcome('')}}><option value="">Elegí qué tipo de trabajo hiciste</option>{Object.entries(purposeNames).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>}
   {['activity','complete'].includes(target.kind)&&<label className={styles.fullField}>¿Qué pasó?<select autoFocus={!!purpose} required disabled={!purpose} value={outcome} onChange={e=>{setOutcome(e.target.value as WorkOutcome);if(e.target.value==='do_not_contact'){setNext(false);setContinuation('done');}}}><option value="">Elegí el resultado</option>{[...new Set([...purposeOutcomes[purpose||'commercial'],...(outcome?[outcome]:[])])].map(id=><option key={id} value={id}>{workOutcomes[id]}</option>)}</select></label>}
   {['activity','complete'].includes(target.kind)&&<details className={styles.optionalFields}><summary>Fecha, canal y participantes</summary>   {(target.kind==='activity'||target.kind==='complete')&&<label>Fecha y hora real<input type="datetime-local" required max={localDateTime()} value={occurred} onChange={e=>setOccurred(e.target.value)}/></label>}
   {['activity','complete'].includes(target.kind)&&<label>Canal<select value={channel} onChange={e=>setChannel(e.target.value)}><option value="">Sin especificar</option><option value="phone">Teléfono</option><option value="whatsapp">WhatsApp</option><option value="email">Email</option><option value="presencial">Presencial</option><option value="videollamada">Videollamada</option><option value="other">Otro</option></select></label>}
   {target.kind==='complete'&&availableContacts.some(c=>c.accountId===accountId)&&<details className={styles.optionalFields}><summary>Revisar con quién hablamos</summary><fieldset><legend>Personas que participaron</legend>{availableContacts.filter(c=>c.accountId===accountId).map(c=><label className={styles.checkbox} key={c.id}><input type="checkbox" checked={contactIds.includes(c.id)} onChange={e=>setContacts(e.target.checked?[...contactIds,c.id]:contactIds.filter(id=>id!==c.id))}/>{c.name}</label>)}</fieldset></details>}
</details>}
   {outcome==='do_not_contact'&&<p role="alert">El negocio quedará marcado como No contactar y se detendrán sus secuencias. Solo un administrador podrá habilitarlo de nuevo.</p>}
   {['activity','complete','cancel'].includes(target.kind)&&<label className={styles.fullField}>Detalles del resultado<textarea required={target.kind==='cancel'} value={result} onChange={e=>setResult(e.target.value)} placeholder={item?.result||'Qué ocurrió / motivo de cancelación'}/></label>}
   {['activity','complete'].includes(target.kind)&&outcome!=='do_not_contact'&&<fieldset className={styles.formSection}><legend>¿Qué hacemos después?</legend><label>Cómo sigue<select required value={continuation} onChange={e=>{setContinuation(e.target.value as typeof continuation);setNext(['task','wait'].includes(e.target.value));if(e.target.value==='wait'&&!nextTitle)setNextTitle('Retomar conversación');}}><option value="">Elegí qué hacemos después</option><option value="task">Planificar el próximo paso</option><option value="wait">Esperar hasta una fecha y recordar retomar</option><option value="done">Terminar por ahora</option></select></label>{next?<><label>Qué hay que hacer<input required maxLength={200} value={nextTitle} onChange={e=>setNextTitle(e.target.value)} placeholder="Por ejemplo: revisar la propuesta con Ana"/></label><label>Cuándo<input required type="date" value={nextDate} onChange={e=>setNextDate(e.target.value)}/></label></>:<p>{continuation==='done'?'Terminar por ahora guarda el resultado sin crear otra tarea. Las demás tareas se conservan.':'Elegí una opción. Si hay algo pendiente, dejá una acción con fecha.'}</p>}</fieldset>}
   {next&&<p role="status">Al guardar se registrará el resultado y quedará pendiente “{nextTitle||'el próximo paso'}” para el {nextDate}. Las otras tareas se conservan.</p>}
   {target.kind==='complete'&&<p className={styles.muted}>Se registrará una actividad con la fecha real, participantes y resultado. La fecha de vencimiento original se conserva.</p>}
   {target.kind.startsWith('delete')&&<p>Se ocultará el registro. Su historial de auditoría se conserva.</p>}
   {save.error&&<p role="alert" className={styles.error}>{save.error.message}</p>}
   <div className={styles.actions}><Button type="submit" disabled={save.isPending}>{save.isPending?'Guardando…':next?'Guardar y programar próximo paso':target.kind==='complete'?'Guardar resultado':target.kind==='task'?'Guardar próximo paso':'Guardar'}</Button><Button type="button" variant="outline" onClick={guard.requestClose} disabled={save.isPending}>Volver</Button></div>
  </form>
 </DialogContent>{guard.confirmation}</Dialog>;
}

function statusActionPlaceholder(kind:WorkTarget['kind']){return ['complete','cancel','delete_task','delete_activity'].includes(kind)}
