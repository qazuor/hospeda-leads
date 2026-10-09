import { Disclosure, DisclosureSummary } from './Disclosure';
import { Input } from './Input';
import { NativeSelect } from './NativeSelect';
import { Textarea } from './Textarea';
import { Checkbox } from './Checkbox';
import {WorkFlowSteps} from './WorkFlowSteps';
import {purposeNames,pendingWork,type WorkPurpose} from '../helpers/nextStep';
import {useDebounce} from '../helpers/useDebounce';
import {useUnsavedChanges} from './UnsavedChanges';
import {workOutcomes,purposeOutcomes,type WorkOutcome} from '../helpers/workOutcomes';
import {workGuidance} from '../helpers/workGuidance';
import {formatDate} from '../helpers/crmDates';
import React,{useState} from 'react';
import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query';
import {toast} from 'sonner';
import {crmSuccess} from '../helpers/crmFeedback';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from './Dialog';
import {Button} from './Button';
import {getWork,getWorkDuplicates,postWork,day,type WorkData,type WorkTask,type WorkActivity,type WorkMutation} from '../endpoints/work.schema';
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
 const guidance=workGuidance(purpose,outcome);
 const chooseContinuation=(value:'task'|'wait'|'done')=>{setContinuation(value);setNext(value!=='done');if(value==='wait'&&!nextTitle)setNextTitle('Retomar conversación')};
 const values=JSON.stringify({accountId,leadId,title,typeId,description,date,time,occurred,assigned,priority,participants,contactIds,channel,result,outcome,purpose,continuation,next,nextTitle,nextDate});
 const [baseline]=useState(values);const guard=useUnsavedChanges(values!==baseline,onClose);
 const nextTask=next&&outcome!=='do_not_contact'?{title:nextTitle,dueDate:nextDate,typeId:'followup',purpose:purpose||undefined}:undefined;
 const [search,setSearch]=useState('');const debouncedSearch=useDebounce(search,250);
 const lookup=useQuery({queryKey:['work','lookup',debouncedSearch,accountId],queryFn:()=>getWork({mode:'lookup',...(debouncedSearch?{q:debouncedSearch}:accountId?{accountId}:{})}),enabled:!['delete_task','delete_activity','cancel'].includes(target.kind)});
 const choices=[...new Map([...data.accounts,...(lookup.data?.accounts??[])].map(a=>[a.id,a])).values()];
 const availableContacts=[...new Map([...data.contacts,...(lookup.data?.contacts??[])].map(c=>[c.id,c])).values()];
 const availableOpportunities=lookup.data?.opportunities??data.opportunities;
 const opportunities=availableOpportunities.filter(o=>o.accountId===accountId);
 const duplicateTitle=useDebounce(target.kind==='task'?title:next?nextTitle:'',250);
 const duplicateDate=target.kind==='task'?date:nextDate;
 const duplicates=useQuery({queryKey:['work','duplicates',accountId,leadId,duplicateTitle,duplicateDate,target.kind==='task'?typeId:'followup',item?.id,admin],queryFn:()=>getWorkDuplicates({accountId,leadId:leadId||undefined,title:duplicateTitle,typeId:target.kind==='task'?typeId:'followup',date:duplicateDate,excludeTaskId:target.kind==='task'||target.kind==='complete'?item?.id:undefined,responsible:admin?'all':undefined}),enabled:!!accountId&&!!duplicateTitle.trim()&&day.safeParse(duplicateDate).success&&(target.kind==='task'||(['activity','complete'].includes(target.kind)&&next&&outcome!=='do_not_contact'))});
 const owner=leadId?opportunities.find(o=>o.id===leadId)?.assignedUserEmail:choices.find(a=>a.id===accountId)?.assignedUserEmail;
 const statusAction=['complete','cancel','delete_task','delete_activity'].includes(target.kind);
 const names={task:item?'Editar / reprogramar tarea':'Planificar próximo paso',activity:item?'Editar actividad':'Registrar actividad',complete:'Registrar qué pasó',cancel:'Cancelar tarea',delete_task:'Dar de baja tarea',delete_activity:'Dar de baja actividad'};
 const save=useMutation({mutationFn:postWork,onSuccess:async(result,input)=>{await Promise.all(['work','leads','lead-stats','commercial-detail','lead-journal','global-journal','communication','pipeline','analytics'].map(key=>qc.invalidateQueries({queryKey:[key]})));const cached=qc.getQueriesData<Partial<WorkData>>({queryKey:['work']}).flatMap(([,value])=>value?.tasks??[]);const remaining=pendingWork([...new Map(cached.filter(t=>t.accountId===accountId&&t.leadId===(leadId||null)&&(!['complete','cancel','delete_task'].includes(target.kind)||t.id!==item?.id)).map(t=>[t.id,t])).values()]);crmSuccess(target.kind==='complete'?(next?'Resultado guardado y próximo paso programado':'Resultado guardado; las otras tareas se conservan'):target.kind==='task'?'Próximo paso guardado':target.kind==='cancel'?'Tarea cancelada con motivo':'Guardado',input.action==='task_save'?{label:'Ver pendiente',href:'/my-day?accountId='+accountId+'&taskId='+result.id}:remaining[0]?{label:'Ver pendiente',href:'/my-day?accountId='+accountId+'&taskId='+remaining[0].id}:leadId?{label:'Abrir gestión',href:'/sales/'+leadId}:{label:'Ver historial',href:'/accounts/'+accountId+'?section=history'},remaining[0]?'Próximo pendiente: '+remaining[0].title+' · '+formatDate(remaining[0].dueDate):'No hay otro pendiente visible en este contexto.');onClose();},onError:e=>toast.error(e.message)});
 const submit=(e:React.FormEvent)=>{
  e.preventDefault();if(target.kind==='cancel'&&!result.trim()){toast.error('Escribí un motivo para cancelar esta tarea.');return;}if(['activity','complete'].includes(target.kind)&&outcome!=='do_not_contact'&&!continuation){toast.error('Elegí cómo sigue esta conversación.');return;}let body:WorkMutation;
  if(target.kind==='complete'||target.kind==='cancel')body={action:'task_status',id:target.item.id,status:target.kind==='complete'?'completed':'cancelled',purpose:purpose||undefined,continuation:continuation||undefined,result:result.trim()||workOutcomes[outcome as WorkOutcome]||'Cancelada',outcome:outcome||null,nextTask,contactIds,channel:channel||null, ...(target.kind==='complete'?{completedAt:argentinaInstant(occurred).toISOString()}:{})};
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
    {accountId&&('accountId' in target&&target.accountId||item)?<p className={styles.contextNote}><strong>{choices.find(a=>a.id===accountId)?.nombre||item&&'accountName' in item&&item.accountName||'Negocio seleccionado'}</strong> · {leadId?opportunities.find(o=>o.id===leadId)?.opportunityName||'Esta gestión':'Seguimiento general del negocio'}</p>:<fieldset className={styles.formSection}><legend>Negocio y gestión</legend>{!accountId&&<label>Buscar negocio<Input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Escribí un nombre o ciudad"/></label>}<label>Negocio<NativeSelect required value={accountId} disabled={!!item||!!('accountId' in target&&target.accountId)} onChange={e=>{setAccount(e.target.value);setLead('');setContacts([]);setAssigned(undefined);}}><option value="">Elegí un negocio</option>{choices.map(a=><option key={a.id} value={a.id}>{a.nombre}</option>)}</NativeSelect></label>
    <label>Contexto<NativeSelect value={leadId} disabled={!!item||!!('leadId' in target&&target.leadId)} onChange={e=>{setLead(e.target.value);setAssigned(undefined);}}><option value="">Seguimiento general del negocio</option>{opportunities.map(o=><option key={o.id} value={o.id}>{o.opportunityName||'Gestión comercial inicial'} · #{o.id}</option>)}</NativeSelect></label>
    </fieldset>}<fieldset className={styles.formSection}><legend>Qué hay que hacer</legend><label>Título<Input required maxLength={200} value={title} onChange={e=>setTitle(e.target.value)} placeholder="Ej.: llamar para confirmar la visita"/></label>
    <label>Tipo<NativeSelect value={typeId} onChange={e=>setType(e.target.value)}>{data.types.filter(t=>t.active||t.id===typeId).map(t=><option key={t.id} value={t.id}>{t.name}{!t.active?' (desactivado)':''}</option>)}</NativeSelect></label>
    </fieldset>{target.kind==='task'&&<fieldset className={styles.formSection}><legend>Cuándo y quién lo hará</legend>
     <label>Fecha de vencimiento<Input type="date" required value={date} onChange={e=>setDate(e.target.value)}/></label>
     <label>Hora (opcional)<Input type="time" value={time} onChange={e=>setTime(e.target.value)}/></label>
     <label>Prioridad<NativeSelect value={priority} onChange={e=>setPriority(e.target.value as typeof priority)}><option value="alta">Alta</option><option value="media">Media</option><option value="baja">Baja</option></NativeSelect></label>
     <label>Responsable{admin?<NativeSelect value={assigned??owner??''} onChange={e=>setAssigned(e.target.value)} disabled={item&&'legacy' in item&&item.legacy}><option value="">Sin asignar</option>{data.users.map(u=><option key={u.email} value={u.email}>{u.displayName}</option>)}</NativeSelect>:<Input readOnly value={data.users.find(u=>u.email===(item&&'assignedUserEmail' in item?item.assignedUserEmail:owner))?.displayName||'Responsable asignado a la tarea'}/>}</label>
     <p className={styles.muted}>{admin?"Asignar esta tarea no cambia el responsable comercial.":"El responsable comercial se conserva. Solo admin puede asignar tareas."}</p>
    </fieldset>}
    {!item&&accountId&&'accountId' in target&&target.accountId&&!target.leadId&&<Disclosure className={styles.optionalFields}><DisclosureSummary>Vincular a una gestión (opcional)</DisclosureSummary><label>Contexto<NativeSelect value={leadId} onChange={e=>{setLead(e.target.value);setAssigned(undefined)}}><option value="">Seguimiento general del negocio</option>{opportunities.map(o=><option key={o.id} value={o.id}>{o.opportunityName||'Gestión sin nombre'}</option>)}</NativeSelect></label></Disclosure>}
    <Disclosure className={styles.optionalFields} open={!!item}><DisclosureSummary>Participantes y notas (opcional)</DisclosureSummary><fieldset className={styles.formSection}><legend>Detalles adicionales</legend><label>Participantes / objetivo adicional<Input value={participants} onChange={e=>setParticipants(e.target.value)} placeholder="Ej.: propietario y administradora"/></label>
    <label className={styles.fullField}>Descripción / notas<Textarea rows={3} value={description} onChange={e=>setDescription(e.target.value)} placeholder="Objetivo y detalles para la acción"/></label>
    {availableContacts.some(c=>c.accountId===accountId)&&<fieldset><legend>Contactos participantes</legend>{availableContacts.filter(c=>c.accountId===accountId).map(c=><label className={styles.checkbox} key={c.id}><Checkbox  checked={contactIds.includes(c.id)} onChange={e=>setContacts(e.target.checked?[...contactIds,c.id]:contactIds.filter(id=>id!==c.id))}/>{c.name}</label>)}</fieldset>}
    </fieldset></Disclosure>
   </>}
   {['task','activity','complete'].includes(target.kind)&&<label className={styles.fullField}>Propósito<NativeSelect required autoFocus={!purpose} value={purpose} onChange={e=>{setPurpose(e.target.value as WorkPurpose);setOutcome('')}}><option value="">Elegí qué tipo de trabajo hiciste</option>{Object.entries(purposeNames).map(([id,label])=><option key={id} value={id}>{label}</option>)}</NativeSelect></label>}
   {['activity','complete'].includes(target.kind)&&<label className={styles.fullField}>¿Qué pasó?<NativeSelect autoFocus={!!purpose} required disabled={!purpose} value={outcome} onChange={e=>{setOutcome(e.target.value as WorkOutcome);if(e.target.value==='do_not_contact'){setNext(false);setContinuation('done');}}}><option value="">Elegí el resultado</option>{[...new Set([...purposeOutcomes[purpose||'commercial'],...(outcome?[outcome]:[])])].map(id=><option key={id} value={id}>{workOutcomes[id]}</option>)}</NativeSelect></label>}
   {['activity','complete'].includes(target.kind)&&<Disclosure className={styles.optionalFields}><DisclosureSummary>Fecha, canal y participantes</DisclosureSummary>   {(target.kind==='activity'||target.kind==='complete')&&<label>Fecha y hora real<Input type="datetime-local" required max={localDateTime()} value={occurred} onChange={e=>setOccurred(e.target.value)}/></label>}
   {['activity','complete'].includes(target.kind)&&<label>Canal<NativeSelect value={channel} onChange={e=>setChannel(e.target.value)}><option value="">Sin especificar</option><option value="phone">Teléfono</option><option value="whatsapp">WhatsApp</option><option value="email">Email</option><option value="presencial">Presencial</option><option value="videollamada">Videollamada</option><option value="other">Otro</option></NativeSelect></label>}
   {target.kind==='complete'&&availableContacts.some(c=>c.accountId===accountId)&&<Disclosure className={styles.optionalFields}><DisclosureSummary>Revisar con quién hablamos</DisclosureSummary><fieldset><legend>Personas que participaron</legend>{availableContacts.filter(c=>c.accountId===accountId).map(c=><label className={styles.checkbox} key={c.id}><Checkbox  checked={contactIds.includes(c.id)} onChange={e=>setContacts(e.target.checked?[...contactIds,c.id]:contactIds.filter(id=>id!==c.id))}/>{c.name}</label>)}</fieldset></Disclosure>}
</Disclosure>}
   {guidance&&['activity','complete'].includes(target.kind)&&<section className={styles.contextNote} aria-label="Orientación para continuar"><p>{guidance.text}</p>{guidance.continuation&&outcome!=='do_not_contact'&&<Button type="button" variant="outline" size="sm" onClick={()=>chooseContinuation(guidance.continuation!)}>{guidance.continuation==='wait'?'Elegir una fecha para retomar':'Planificar una acción con fecha'}</Button>}</section>}
   {outcome==='do_not_contact'&&<p role="alert">El negocio quedará marcado como No contactar y se detendrán sus secuencias. Solo un administrador podrá habilitarlo de nuevo.</p>}
   {['activity','complete','cancel'].includes(target.kind)&&<label className={styles.fullField}>{target.kind==='cancel'?'Motivo de cancelación':'Detalles del resultado'}<Textarea required={target.kind==='cancel'} value={result} onChange={e=>setResult(e.target.value)} placeholder={target.kind==='cancel'?'Por qué ya no corresponde hacer esta tarea':item?.result||'Qué ocurrió'}/></label>}
   {['activity','complete'].includes(target.kind)&&outcome!=='do_not_contact'&&<fieldset className={styles.formSection}><legend>¿Qué hacemos después?</legend><label>Cómo sigue<NativeSelect required value={continuation} onChange={e=>{setContinuation(e.target.value as typeof continuation);setNext(['task','wait'].includes(e.target.value));if(e.target.value==='wait'&&!nextTitle)setNextTitle('Retomar conversación');}}><option value="">Elegí qué hacemos después</option><option value="task">Planificar el próximo paso</option><option value="wait">Esperar hasta una fecha y recordar retomar</option><option value="done">Terminar por ahora</option></NativeSelect></label>{next?<><label>Qué hay que hacer<Input required maxLength={200} value={nextTitle} onChange={e=>setNextTitle(e.target.value)} placeholder="Por ejemplo: revisar la propuesta con Ana"/></label><label>Cuándo<Input required type="date" value={nextDate} onChange={e=>setNextDate(e.target.value)}/></label></>:<p>{continuation==='done'?'Terminar por ahora guarda el resultado sin crear otra tarea. Las demás tareas se conservan.':'Elegí una opción. Si hay algo pendiente, dejá una acción con fecha.'}</p>}</fieldset>}
   {next&&<p role="status">Al guardar se registrará el resultado y quedará pendiente “{nextTitle||'el próximo paso'}” para el {formatDate(nextDate)}. Las otras tareas se conservan.</p>}
   {['activity','complete'].includes(target.kind)&&outcome&&<section className={styles.formSection} aria-label="Revisión del resultado"><h3>Revisá lo que se guardará</h3><dl>
    <dt>Resultado</dt><dd>{workOutcomes[outcome]}{result.trim()?' · '+result.trim():''}</dd>
    <dt>Fecha real</dt><dd>{occurred?formatDate(occurred.slice(0,10))+' · '+occurred.slice(11)+' (Argentina)':'Elegí una fecha'}</dd>
    <dt>Personas</dt><dd>{contactIds.length?contactIds.map(id=>availableContacts.find(c=>c.id===id)?.name||'Contacto #'+id).join(', '):'Sin persona registrada'}</dd>
    <dt>Próximo paso</dt><dd>{outcome==='do_not_contact'?'Respetar la restricción de contacto':next?(nextTitle||'Falta definir la acción')+' · '+formatDate(nextDate):continuation==='done'?'Terminar por ahora, sin crear otra tarea':'Falta elegir cómo continuar'}</dd>
   </dl><p>{target.kind==='complete'?'Se completará esta tarea y se registrará una actividad.':'Se guardará esta actividad.'} La etapa comercial se conserva. Las otras tareas no se completan ni cancelan.</p></section>}
   {target.kind==='complete'&&<p className={styles.muted}>Se registrará una actividad con la fecha real, participantes y resultado. La fecha de vencimiento original se conserva.</p>}
   {target.kind==='task'&&date&&<p role="status">{item&&'dueDate' in item?'Vencimiento original: '+formatDate(item.dueDate)+(item.dueAt?' · '+localDateTime(item.dueAt).slice(11):'')+'. ':''}Se guardará para {formatDate(date)}{time?' a las '+time:' sin hora definida'} (Argentina).{date<localDay()?' La fecha ya pasó; quedará vencida.':''}</p>}
   {duplicates.isFetching&&<p role="status">Revisando posibles pendientes duplicados…</p>}
   {duplicates.error&&<div role="alert"><p>No pudimos revisar duplicados. Tus datos se conservan.</p><Button type="button" variant="outline" disabled={duplicates.isFetching} onClick={()=>void duplicates.refetch()}>Reintentar revisión de pendientes</Button></div>}
   {!!duplicates.data?.total&&<div role="alert"><p>Ya hay {duplicates.data.total} pendiente{duplicates.data.total===1?'':'s'} con el mismo título, tipo, fecha y contexto, entre las tareas {admin?'del equipo':'visibles para vos'}. Revisá si hace falta otro; ninguna se reemplazará automáticamente.</p><ul>{duplicates.data.tasks.map(t=><li key={t.id}>{t.title} · {formatDate(t.dueDate)} · {data.users.find(u=>u.email===t.assignedUserEmail)?.displayName||t.assignedUserEmail||'Sin responsable'}</li>)}</ul></div>}
   {target.kind.startsWith('delete')&&<p>Se ocultará el registro. Su historial de auditoría se conserva.</p>}
   {save.error&&<p role="alert" className={styles.error}>{save.error.message}</p>}
   <div className={styles.actions}><Button type="submit" disabled={save.isPending}>{save.isPending?'Guardando…':next?'Guardar y programar próximo paso':target.kind==='complete'?'Guardar resultado':target.kind==='task'?'Guardar próximo paso':'Guardar'}</Button><Button type="button" variant="outline" onClick={guard.requestClose} disabled={save.isPending}>Volver</Button></div>
  </form>
 </DialogContent>{guard.confirmation}</Dialog>;
}

function statusActionPlaceholder(kind:WorkTarget['kind']){return ['complete','cancel','delete_task','delete_activity'].includes(kind)}
