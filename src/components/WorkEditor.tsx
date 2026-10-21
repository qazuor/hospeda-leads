import {useGuardedMutation} from '../helpers/useGuardedMutation';
import { Disclosure, DisclosureSummary } from './Disclosure';
import { Input } from './Input';
import { NativeSelect } from './NativeSelect';
import { Textarea } from './Textarea';
import { Checkbox } from './Checkbox';
import {WorkFlowSteps} from './WorkFlowSteps';
import {HelpHint} from './HelpHint';
import {DueDateShortcuts,needsOverdueConfirmation} from './DueDateShortcuts';
import {purposeNames,pendingWork,type WorkPurpose} from '../helpers/nextStep';
import {useDebounce} from '../helpers/useDebounce';
import {useUnsavedChanges,type LeaveCopy} from './UnsavedChanges';
import {outcomeOptions,type WorkOutcome} from '../helpers/workOutcomes';
import {outcomeLabel} from '../helpers/crmLabels';
import {VOCAB,NO_FOLLOW_UP_REASONS,OTHER_REASON,managementDisplayName} from '../content/vocabulary';
import {workGuidance,canLogNewActivity} from '../helpers/workGuidance';
import {formatDate} from '../helpers/crmDates';
import {suggestedStageForOutcome,managementLabel,type ManagementType} from '../helpers/businessManagement';
import {stageChangeToSend,STAGE_CONFLICT_MESSAGE,type AcceptedStage} from '../helpers/stageSuggestion';
import {CrmApiError} from '../helpers/apiClient';
import React,{useId,useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {toast} from 'sonner';
import {crmSuccess} from '../helpers/crmFeedback';
import {Dialog,DialogContent,DialogHeader,DialogFooter,DialogTitle,DialogDescription} from './Dialog';
import {Button} from './Button';
import {postCommunication,getCommunication} from '../endpoints/communication.schema';
import {getWork,getWorkDuplicates,postWork,day,type WorkData,type WorkTask,type WorkActivity,type WorkMutation} from '../endpoints/work.schema';
import {localDateTime,argentinaInstant} from '../helpers/workDates';
import {useAuth} from '../helpers/useAuth';
import styles from './Commercial.module.css';
export type WorkTarget={kind:'task'|'activity';item?:WorkTask|WorkActivity;accountId?:string;leadId?:string;contactIds?:string[];channel?:string;purpose?:WorkPurpose;title?:string;messageId?:string;messageSent?:boolean;/** Result already known when the editor opens (e.g. after "No me atendieron"); the seller can still change it. */outcome?:WorkOutcome}|{kind:'complete'|'cancel'|'delete_task';item:WorkTask;contactIds?:string[];channel?:string;purpose?:WorkPurpose}|{kind:'delete_activity';item:WorkActivity};
const channelNames:Record<string,string>={phone:'Teléfono',whatsapp:'WhatsApp',email:'Email',presencial:'Presencial',videollamada:'Videollamada',other:'Otro'};
const responseChannel=(channel:string):'call'|'whatsapp'|'email'|'other'=>channel==='phone'?'call':channel==='whatsapp'||channel==='email'?channel:'other';
/** `leaveCopy` makes closing always ask (used after a contact, decision 2B); `onSaved` runs before `onClose` only when the save succeeded. */
export function WorkEditor({target,data,onClose,onSaved,leaveCopy}:{target:WorkTarget;data:WorkData;onClose:()=>void;onSaved?:()=>void;leaveCopy?:LeaveCopy}){
 const qc=useQueryClient();const {authState}=useAuth();const admin=authState.type==='authenticated'&&authState.user.role==='admin';
 const item='item' in target?target.item:undefined;
 const [accountId,setAccount]=useState(item?.accountId||('accountId' in target?target.accountId:'')||'');
 const [leadId,setLead]=useState(item?.leadId||('leadId' in target?target.leadId:'')||'');
 const [title,setTitle]=useState(item?.title||('title' in target?target.title:'')||'');
 const preferredType=target.kind==='task'?'call':'message';
 const [typeId,setType]=useState(item?.typeId||data.types.find(t=>t.id===preferredType&&t.active)?.id||data.types.find(t=>t.active)?.id||'followup');
 const [description,setDescription]=useState(item&&'description' in item?item.description??'':item&&'notes' in item?item.notes??'':'');
 const [date,setDate]=useState(item&&'dueDate' in item?item.dueDate:'');
 const [dueConfirmed,setDueConfirmed]=useState(false),[nextConfirmed,setNextConfirmed]=useState(false);
 const [time,setTime]=useState(item&&'dueAt' in item&&item.dueAt?localDateTime(item.dueAt).slice(11):'');
 const [occurred,setOccurred]=useState(item&&'occurredAt' in item?localDateTime(item.occurredAt):localDateTime());
 const [assigned,setAssigned]=useState<string|undefined>(item&&'assignedUserEmail' in item?item.assignedUserEmail??'':undefined);
 const [priority,setPriority]=useState<'alta'|'media'|'baja'>(item&&'priority' in item?item.priority:'media');
 const [participants,setParticipants]=useState(item?.participants||'');
 const [contactIds,setContacts]=useState<string[]>(('contactIds' in target?target.contactIds:undefined)||item?.contactIds||[]);
 const [channel,setChannel]=useState(item&&'channel' in item?item.channel??'':('channel' in target?target.channel:undefined)||'');
 const [result,setResult]=useState(item?.result??'');
 const startOutcome:WorkOutcome|''=!item&&'outcome' in target&&target.outcome||'';
 const [outcome,setOutcome]=useState<WorkOutcome|''>((item?.outcome as WorkOutcome)||startOutcome);
 // One tap on "No respondió" by phone suggests waiting for a date (the seller still has to pick it): about 3 taps instead of 8.
 const phoneNoAnswer=!item&&target.kind==='activity'&&startOutcome==='no_answer'&&channel==='phone';
 const [purpose,setPurpose]=useState<WorkPurpose|''>(('purpose' in target?target.purpose:undefined)||item?.purpose||(item||target.kind==='task'?'':'commercial'));
 // Completing a task without a purpose makes the seller choose one (never inferred). Planning or rescheduling never asks for a purpose: it is hidden when the task already has one, otherwise optional.
 const [hadPurpose]=useState(!!purpose);
 // Hidden only when the task, activity or caller already says what kind of work this is (a new activity without context still defaults to commercial and lets her change it).
 const [purposeKnown]=useState(!!(('purpose' in target&&target.purpose)||item?.purpose));
 const [continuation,setContinuation]=useState<'task'|'wait'|'done'|''>(phoneNoAnswer?'wait':'');
 const [next,setNext]=useState(phoneNoAnswer),[nextTitle,setNextTitle]=useState(phoneNoAnswer?'Retomar conversación':''),[nextDate,setNextDate]=useState('');
 const [detailsOpen,setDetailsOpen]=useState(false),[outcomeError,setOutcomeError]=useState('');
 const [closeLeadIds,setCloseLeadIds]=useState<string[]>([]),[dncConfirmed,setDncConfirmed]=useState(false);
 const dncAttempt=React.useRef<string|null>(null),autoWait=React.useRef(phoneNoAnswer),outcomeErrorId=useId();
 const [reasonChoice,setReasonChoice]=useState(''),[reasonText,setReasonText]=useState('');
 const continuationReason=continuation==='done'?(reasonChoice===OTHER_REASON?reasonText.trim():reasonChoice)||undefined:undefined;
 // Decision 2B: every new result says how it continues (also an edit that adds the first result); other edits may keep what they had.
 const continuationRequired=target.kind==='complete'||(target.kind==='activity'&&(!item||(!item.outcome&&!!outcome)));
 const guidance=workGuidance(purpose,outcome);
 // "Pidió no ser contactado" is a communication response (it blocks the whole business), so it is only offered when recording a new activity.
 const pickOutcome=(value:WorkOutcome)=>{
  setOutcomeError('');setAcceptedStage(null);
  // A "wait" suggested by "No respondió" goes away when she moves to another result, unless she already touched it.
  if(autoWait.current&&value!=='no_answer'){setContinuation('');setNext(false);setNextTitle('');autoWait.current=false}
  if(outcome==='do_not_contact'&&value!=='do_not_contact'){setContinuation('');setNext(false);setDncConfirmed(false);setCloseLeadIds([])}
  setOutcome(value);
  if(value==='do_not_contact'){setNext(false);setContinuation('done');return}
  if(value==='no_answer'&&channel==='phone'&&!continuation){chooseContinuation('wait');autoWait.current=true}
 };
 const chooseContinuation=(value:'task'|'wait'|'done')=>{autoWait.current=false;setContinuation(value);setNext(value!=='done');if(value==='wait'&&!nextTitle)setNextTitle('Retomar conversación')};
 const values=JSON.stringify({accountId,leadId,title,typeId,description,date,time,occurred,assigned,priority,participants,contactIds,channel,result,outcome,purpose,continuation,next,nextTitle,nextDate,reasonChoice,reasonText});
 const [baseline]=useState(values);
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
 const contextualTasks=useQuery({queryKey:['work','pending-context',accountId],queryFn:()=>getWork({mode:'detail',accountId}),enabled:target.kind==='task'&&!item&&!!accountId});
 const pendingForBusiness=pendingWork(contextualTasks.data?.tasks??[]);
 const owner=leadId?opportunities.find(o=>o.id===leadId)?.assignedUserEmail:choices.find(a=>a.id===accountId)?.assignedUserEmail;
 const businessOwner=choices.find(a=>a.id===accountId)?.assignedUserEmail;
 const managementOwner=opportunities.find(o=>o.id===leadId)?.assignedUserEmail;
 // Same rule the server applies to a new activity (admin or the responsible of the management/business); "No contactar" is a communication response and is only offered to whoever can log the activity here.
 const canLogActivity=canLogNewActivity({admin,ownerEmail:owner,userEmail:authState.type==='authenticated'?authState.user.email:null});
 const dncAllowed=target.kind==='activity'&&!item&&canLogActivity;
 const dncFlow=dncAllowed&&outcome==='do_not_contact';
 // Decision 9A: a suggestion the seller accepts with one tick (never preticked). `acceptedStage` holds the stage she accepted, so changing the result drops it.
 const [acceptedStage,setAcceptedStage]=useState<AcceptedStage|null>(null),[stageConflict,setStageConflict]=useState(false);
 const stageOpportunity=leadId?opportunities.find(o=>o.id===leadId):undefined;
 const userEmail=authState.type==='authenticated'?authState.user.email:null;
 const suggestedStage=!dncFlow&&!(target.kind==='activity'&&item)&&['activity','complete'].includes(target.kind)&&outcome&&stageOpportunity?.managementType&&(admin||stageOpportunity.assignedUserEmail===userEmail)&&!choices.find(a=>a.id===accountId)?.doNotContact?suggestedStageForOutcome(stageOpportunity.managementType as ManagementType,stageOpportunity.estado,outcome):null;
 const stageChange=stageChangeToSend({accepted:acceptedStage,suggestedKey:suggestedStage?.key,leadId});
 const displayUser=(email:string|undefined|null)=>data.users.find(u=>u.email===email)?.displayName||email||'Sin asignar';
 const statusAction=['complete','cancel','delete_task','delete_activity'].includes(target.kind);
 const names={task:item?'Cambiar fecha o datos':VOCAB.scheduleTask,activity:item?'Editar actividad':VOCAB.logWhatHappened,complete:VOCAB.logWhatHappened,cancel:VOCAB.noLongerNeeded,delete_task:VOCAB.deleteMistake,delete_activity:'Dar de baja actividad'};
 const save=useGuardedMutation({mutationFn:postWork,onSuccess:async(result,input)=>{await Promise.all(['work','leads','lead-stats','commercial-detail','lead-journal','global-journal','global-journal-filtered','communication','pipeline','analytics'].map(key=>qc.invalidateQueries({queryKey:[key]})));// The next pending comes from the server right after the write, never from cached lists (they may hold tasks already completed, cancelled or moved).
const fresh=input.action==='task_save'?undefined:await qc.fetchQuery({queryKey:['work','next-pending',accountId,leadId||null],queryFn:()=>getWork({mode:'detail',accountId,...(leadId?{leadId}:{}),...(admin?{responsible:'all'}:{})}),staleTime:0,gcTime:0}).catch(()=>undefined);const remaining=pendingWork((fresh?.tasks??[]).filter(t=>t.accountId===accountId&&t.leadId===(leadId||null)));if(input.action==='task_save')crmSuccess((item?'Tarea actualizada: ':'Tarea agendada: ')+input.title+' · '+formatDate(input.dueDate),{label:'Ver en Mi día',href:'/my-day?accountId='+accountId+'&taskId='+result.id});else crmSuccess((target.kind==='complete'?(next?'Resultado guardado y próximo paso programado':'Resultado guardado; las otras tareas se conservan'):target.kind==='cancel'?'Tarea cerrada: ya no hacía falta':'Guardado')+('stageChange' in input&&input.stageChange?' · La gestión pasó a «'+managementLabel(null,input.stageChange.stage)+'»':''),remaining[0]?{label:'Ver pendiente',href:'/my-day?accountId='+accountId+'&taskId='+remaining[0].id}:leadId?{label:'Abrir gestión',href:'/sales/'+leadId}:{label:'Ver historial',href:'/accounts/'+accountId+'?section=history'},remaining[0]?'Próximo pendiente: '+remaining[0].title+' · '+formatDate(remaining[0].dueDate):'No hay otro pendiente visible en este contexto.');onSaved?.();onClose();},onError:async(e,input)=>{if(e instanceof CrmApiError&&e.status===409&&'stageChange' in input&&input.stageChange){setStageConflict(true);setAcceptedStage(null);await Promise.all(['work','commercial-detail','leads','pipeline'].map(key=>qc.invalidateQueries({queryKey:[key]})));toast.error(STAGE_CONFLICT_MESSAGE);return;}toast.error(e.message)}});
 const dncManagements=useQuery({queryKey:['communication','dnc-confirm',accountId],queryFn:()=>getCommunication('',accountId),enabled:dncFlow&&!!accountId});
 const dnc=useGuardedMutation({mutationFn:postCommunication,onSuccess:async()=>{await Promise.all(['work','leads','lead-stats','commercial-detail','lead-journal','global-journal','communication','pipeline','analytics'].map(key=>qc.invalidateQueries({queryKey:[key]})));crmSuccess('Se bloqueó el contacto de este negocio',{label:'Ver el negocio',href:'/accounts/'+accountId});onSaved?.();onClose();},onError:e=>toast.error(e.message)});
 const busy=save.isPending||dnc.isPending;
 const guard=useUnsavedChanges(values!==baseline||!!leaveCopy,onClose,busy,leaveCopy);
 const submit=(e:React.FormEvent)=>{
  e.preventDefault();
  if(dncFlow){
   if(!dncConfirmed){toast.error('Marcá la confirmación para bloquear el contacto de este negocio.');return;}
   const linkedId='messageId' in target&&target.messageId&&JSON.stringify(contactIds)===JSON.stringify(('contactIds' in target?target.contactIds:undefined)||[])?target.messageId:null;
   // Same shape Comunicación sends: the destination of the linked contact when known, the person's or business name otherwise.
   const sentMessage=linkedId?dncManagements.data?.messages.find(m=>m.id===linkedId):undefined;
   const name=(contactIds.length===1&&availableContacts.find(c=>c.id===contactIds[0])?.name)||sentMessage?.recipientName||choices.find(a=>a.id===accountId)?.nombre||'Negocio';
   dncAttempt.current??=crypto.randomUUID();
   dnc.mutate({action:'response_create',id:dncAttempt.current,accountId,leadId:leadId||null,contactId:contactIds.length===1?contactIds[0]:null,channel:responseChannel(channel),recipient:sentMessage?.recipient||name,recipientName:name,destination:sentMessage?.recipient||null,linkedMessageId:linkedId,category:'do_not_contact',summary:result.trim()||outcomeLabel('do_not_contact'),exactText:null,otherDetail:null,confirmDoNotContact:true,closeLeadIds});
   return;
  }
  if(target.kind==='task'&&!date){toast.error('Elegí para cuándo es la tarea.');return;}if(next&&!nextDate){toast.error('Elegí cuándo vas a retomar esto.');return;}if(target.kind==='task'&&needsOverdueConfirmation(date,item&&'dueDate' in item?item.dueDate:undefined)&&!dueConfirmed){toast.error('Esa fecha ya pasó. Marcá "Sí, quiero dejarla vencida" o elegí otra fecha.');return;}if(next&&needsOverdueConfirmation(nextDate,undefined)&&!nextConfirmed){toast.error('Esa fecha ya pasó. Marcá "Sí, quiero dejarla vencida" o elegí otra fecha.');return;}if(target.kind==='cancel'&&!result.trim()){toast.error('Escribí un motivo para cancelar esta tarea.');return;}let body:WorkMutation;
  if(target.kind==='complete'||target.kind==='cancel')body={action:'task_status',id:target.item.id,status:target.kind==='complete'?'completed':'cancelled',purpose:purpose||undefined,continuation:continuation||undefined,continuationReason,result:result.trim()||(outcome?outcomeLabel(outcome):'')||'Cancelada',outcome:outcome||null,nextTask,contactIds,channel:channel||null,...(stageChange?{stageChange}:{}), ...(target.kind==='complete'?{completedAt:argentinaInstant(occurred).toISOString()}:{})};
  else if(target.kind==='delete_task')body={action:'task_delete',id:target.item.id};
  else if(target.kind==='delete_activity')body={action:'activity_delete',id:target.item.id};
  else{
   const common={purpose:purpose||undefined,id:item?.id,accountId,leadId:leadId||null,title,typeId,participants,contactIds};
   body=target.kind==='task'?{action:'task_save',...common,description,dueDate:date,dueAt:time?argentinaInstant(date+'T'+time).toISOString():null,priority,...(admin?{assignedUserEmail:assigned===undefined?owner||null:assigned||null}:{})}:{action:'activity_save',...common,occurredAt:argentinaInstant(occurred).toISOString(),continuation:continuation||undefined,continuationReason,outcome:outcome||null,nextTask,channel:channel||null,...(stageChange?{stageChange}:{}),result:result||(outcome?outcomeLabel(outcome):'')||(item&&'result' in item?item.result:null),notes:description,...('messageId' in target&&target.messageId?{messageId:target.messageId,messageSent:target.messageSent}:{})};
  }
  save.mutate(body);
 };
 return <Dialog open onOpenChange={open=>{if(!open&&!busy)guard.requestClose();}}><DialogContent className={styles.editor}>
  <DialogHeader><DialogTitle>{names[target.kind]}</DialogTitle><DialogDescription>{statusAction?item?.title:target.kind==='task'?(item?'Cambiá la fecha, la hora o los datos de la tarea. Horarios de Argentina.':'Contá qué hay que hacer y para cuándo. Horarios de Argentina.'):'Registrá una acción realizada, también de días anteriores. Horarios de Argentina.'}</DialogDescription></DialogHeader>
  {['complete','activity'].includes(target.kind)&&<><WorkFlowSteps current={continuation||dncFlow?2:1} blocked={outcome==='do_not_contact'}/>{target.kind==='complete'&&<p className={styles.contextNote}><strong>{'accountName' in target.item?target.item.accountName:'Negocio seleccionado'}</strong> · {target.item.leadId?(target.item.opportunityName||'Esta gestión'):'Sin gestión (general del negocio)'}</p>}</>}
  {['activity','complete'].includes(target.kind)&&<p className={styles.contextNote}>Canal: <strong>{channel?channelNames[channel]||'Otro':'Sin especificar'}</strong> · <Button type="button" variant="link" size="sm" disabled={busy} disabledReason="Se está guardando. Esperá a que termine." onClick={()=>setDetailsOpen(true)}>Cambiar</Button></p>}
  <form onSubmit={submit}><fieldset className={styles.form} disabled={busy} style={{border:0,padding:0,margin:0,minWidth:0}}>
   {['activity','complete'].includes(target.kind)&&(!purposeKnown||(target.kind==='activity'&&!!item))&&<label className={styles.fullField}>Propósito<NativeSelect required autoFocus={!purpose} value={purpose} onChange={e=>{setPurpose(e.target.value as WorkPurpose);setOutcome('')}}><option value="">Elegí qué tipo de trabajo hiciste</option>{Object.entries(purposeNames).map(([id,label])=><option key={id} value={id}>{label}</option>)}</NativeSelect></label>}
   {target.kind==='task'&&!hadPurpose&&<label className={styles.fullField}>¿De qué se trata? (opcional)<NativeSelect value={purpose} onChange={e=>setPurpose(e.target.value as WorkPurpose|'')}><option value="">Sin especificar</option>{Object.entries(purposeNames).map(([id,label])=><option key={id} value={id}>{label}</option>)}</NativeSelect></label>}
   {!statusAction&&<>
    {accountId&&('accountId' in target&&target.accountId||item)?<p className={styles.contextNote}><strong>{choices.find(a=>a.id===accountId)?.nombre||item&&'accountName' in item&&item.accountName||'Negocio seleccionado'}</strong> · {leadId?opportunities.find(o=>o.id===leadId)?.opportunityName||'Esta gestión':'Sin gestión (general del negocio)'}</p>:<fieldset className={styles.formSection}><legend>Negocio y gestión</legend>{!accountId&&<label>Buscar negocio<Input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Escribí un nombre o ciudad"/></label>}<label>Negocio<NativeSelect required value={accountId} disabled={!!item||!!('accountId' in target&&target.accountId)} onChange={e=>{setAccount(e.target.value);setLead('');setAcceptedStage(null);setContacts([]);setAssigned(undefined);}}><option value="">Elegí un negocio</option>{choices.map(a=><option key={a.id} value={a.id}>{a.nombre}</option>)}</NativeSelect></label>
    <label>Contexto<NativeSelect value={leadId} disabled={!!item||!!('leadId' in target&&target.leadId)} onChange={e=>{setLead(e.target.value);setAcceptedStage(null);setAssigned(undefined);}}><option value="">Sin gestión (general del negocio)</option>{opportunities.map(o=><option key={o.id} value={o.id}>{managementDisplayName(o)}</option>)}</NativeSelect></label>
    </fieldset>}{target.kind==='task'&&!!pendingForBusiness.length&&<section className={styles.contextNote} aria-label="Tareas pendientes del negocio"><strong>Ya hay tareas pendientes para este negocio</strong><p>Revisá si alguna cubre este mismo compromiso antes de crear otra. Son las tareas pendientes visibles para vos.</p><ul>{pendingForBusiness.slice(0,5).map(t=><li key={t.id}>{t.title} · {formatDate(t.dueDate)} · {t.leadId?(contextualTasks.data?.opportunities.find(o=>o.id===t.leadId)?.opportunityName||'Gestión'):'Sin gestión (general del negocio)'}</li>)}</ul>{pendingForBusiness.length>5&&<small>Y {pendingForBusiness.length-5} más.</small>}</section>}<fieldset className={styles.formSection}><legend>Qué hay que hacer</legend><label>Título<Input required maxLength={200} value={title} onChange={e=>setTitle(e.target.value)} placeholder="Ej.: llamar para confirmar la visita"/></label>
    <label>Tipo<NativeSelect value={typeId} onChange={e=>setType(e.target.value)}>{data.types.filter(t=>t.active||t.id===typeId).map(t=><option key={t.id} value={t.id}>{t.name}{!t.active?' (desactivado)':''}</option>)}</NativeSelect></label>
    </fieldset>{target.kind==='task'&&<fieldset className={styles.formSection}><legend>Cuándo y quién lo hará</legend>
     <DueDateShortcuts className={styles.fullField} label="Fecha de vencimiento" postpone={!!item} value={date} onChange={setDate} originalValue={item&&'dueDate' in item?item.dueDate:undefined} overdueConfirmed={dueConfirmed} onOverdueConfirmedChange={setDueConfirmed}/>
     <label>Hora (opcional)<Input type="time" value={time} onChange={e=>setTime(e.target.value)}/></label>
     <label>Prioridad<NativeSelect value={priority} onChange={e=>setPriority(e.target.value as typeof priority)}><option value="alta">Alta</option><option value="media">Media</option><option value="baja">Baja</option></NativeSelect></label>
     <label>{VOCAB.assignedTo}{admin?<NativeSelect value={assigned??owner??''} onChange={e=>setAssigned(e.target.value)} disabled={item&&'legacy' in item&&item.legacy}><option value="">Sin asignar</option>{data.users.map(u=><option key={u.email} value={u.email}>{u.displayName}</option>)}</NativeSelect>:<Input readOnly value={data.users.find(u=>u.email===(item&&'assignedUserEmail' in item?item.assignedUserEmail:owner))?.displayName||'Responsable asignado a la tarea'}/>}</label>
     <p className={styles.muted}>Responsable del negocio: <strong>{displayUser(businessOwner)}</strong>{leadId&&<> · Responsable de la gestión: <strong>{displayUser(managementOwner)}</strong></>}. La asignación de la tarea no cambia esos responsables ni sus permisos.</p>
    </fieldset>}
    {!item&&accountId&&'accountId' in target&&target.accountId&&!target.leadId&&!target.messageId&&<Disclosure className={styles.optionalFields}><DisclosureSummary>Vincular a una gestión (opcional)</DisclosureSummary><label>Contexto<NativeSelect value={leadId} onChange={e=>{setLead(e.target.value);setAcceptedStage(null);setAssigned(undefined)}}><option value="">Sin gestión (general del negocio)</option>{opportunities.map(o=><option key={o.id} value={o.id}>{managementDisplayName(o)}</option>)}</NativeSelect></label></Disclosure>}
    <Disclosure className={styles.optionalFields} open={!!item}><DisclosureSummary>Participantes y notas (opcional)</DisclosureSummary><fieldset className={styles.formSection}><legend>Detalles adicionales</legend><label>Participantes / objetivo adicional<Input value={participants} onChange={e=>setParticipants(e.target.value)} placeholder="Ej.: propietario y administradora"/></label>
    <label className={styles.fullField}>Descripción / notas<Textarea rows={3} value={description} onChange={e=>setDescription(e.target.value)} placeholder="Objetivo y detalles para la acción"/></label>
    {availableContacts.some(c=>c.accountId===accountId)&&<fieldset><legend>Contactos participantes</legend>{availableContacts.filter(c=>c.accountId===accountId).map(c=><label className={styles.checkbox} key={c.id}><Checkbox  checked={contactIds.includes(c.id)} onChange={e=>setContacts(e.target.checked?[...contactIds,c.id]:contactIds.filter(id=>id!==c.id))}/>{c.name}</label>)}</fieldset>}
    </fieldset></Disclosure>
   </>}
   {['activity','complete'].includes(target.kind)&&<fieldset className={styles.outcomeChoices} disabled={!purpose}><legend>¿Qué pasó?</legend>{[...new Set([...outcomeOptions(purpose).filter(id=>id!=='do_not_contact'||dncAllowed),...(outcome?[outcome]:[])])].map((id,i)=><label key={id} className={styles.outcomeChoice} data-checked={outcome===id||undefined}><input type="radio" name="outcome" value={id} required aria-invalid={outcomeError&&!outcome?true:undefined} aria-describedby={outcomeError&&!outcome?outcomeErrorId:undefined} checked={outcome===id} autoFocus={!!purpose&&(outcome?outcome===id:i===0)} data-autofocus={(!!purpose&&(outcome?outcome===id:i===0))||undefined} onChange={()=>pickOutcome(id)} onInvalid={e=>{e.preventDefault();setOutcomeError('Elegí qué pasó.');const field=e.currentTarget;if(Array.from(field.form?.elements??[]).find(item=>(item as HTMLInputElement).willValidate&&!(item as HTMLInputElement).validity.valid)===field){field.focus({preventScroll:true});field.scrollIntoView?.({block:'center'})}}}/>{outcomeLabel(id)}</label>)}{!purpose&&<p className={styles.muted}>Primero elegí el propósito.</p>}{outcomeError&&!outcome&&<p id={outcomeErrorId} role="alert" className={styles.error}>{outcomeError}</p>}</fieldset>}
   {['activity','complete'].includes(target.kind)&&<Disclosure className={styles.optionalFields} open={detailsOpen} onOpenChange={setDetailsOpen}><DisclosureSummary>Fecha, canal y participantes</DisclosureSummary>   {(target.kind==='activity'||target.kind==='complete')&&<label>Fecha y hora real<Input type="datetime-local" required max={localDateTime()} value={occurred} onChange={e=>setOccurred(e.target.value)}/></label>}
   {['activity','complete'].includes(target.kind)&&<label>Canal<NativeSelect value={channel} onChange={e=>setChannel(e.target.value)}><option value="">Sin especificar</option><option value="phone">Teléfono</option><option value="whatsapp">WhatsApp</option><option value="email">Email</option><option value="presencial">Presencial</option><option value="videollamada">Videollamada</option><option value="other">Otro</option></NativeSelect></label>}
   {target.kind==='complete'&&availableContacts.some(c=>c.accountId===accountId)&&<Disclosure className={styles.optionalFields}><DisclosureSummary>Revisar con quién hablamos</DisclosureSummary><fieldset><legend>Personas que participaron</legend>{availableContacts.filter(c=>c.accountId===accountId).map(c=><label className={styles.checkbox} key={c.id}><Checkbox  checked={contactIds.includes(c.id)} onChange={e=>setContacts(e.target.checked?[...contactIds,c.id]:contactIds.filter(id=>id!==c.id))}/>{c.name}</label>)}</fieldset></Disclosure>}
</Disclosure>}
   {guidance&&!dncFlow&&['activity','complete'].includes(target.kind)&&<section className={styles.contextNote} aria-label="Orientación para continuar"><p>{guidance.text}</p>{guidance.continuation&&outcome!=='do_not_contact'&&<Button type="button" variant="outline" size="sm" disabled={save.isPending} disabledReason="Se está guardando este registro. Esperá a que termine para cambiar el próximo paso." onClick={()=>chooseContinuation(guidance.continuation!)}>{guidance.continuation==='wait'?'Elegir una fecha para retomar':VOCAB.scheduleTask}</Button>}</section>}
   {outcome==='do_not_contact'&&!dncFlow&&<p role="alert">El negocio quedará marcado como No contactar. Solo un administrador podrá habilitarlo de nuevo.</p>}
   {dncFlow&&<section className={`${styles.contextNote} ${styles.fullField}`} aria-label="Confirmar No contactar"><p role="alert">Se bloquea todo el negocio: no se le va a poder escribir ni llamar desde el CRM. Si cerrás todas sus gestiones abiertas, el negocio también se archiva. Solo un administrador podrá habilitarlo de nuevo.</p>
    {dncManagements.isPending?<p role="status">Buscando las gestiones abiertas…</p>:dncManagements.error?<div role="alert"><p>No pudimos buscar las gestiones abiertas.</p><Button type="button" variant="outline" size="sm" disabled={dncManagements.isFetching} disabledReason="Estamos buscando. Esperá a que termine." onClick={()=>void dncManagements.refetch()}>Reintentar</Button></div>:!!dncManagements.data?.openManagements.length&&<fieldset><legend>¿Cerrar también estas gestiones? Ninguna viene marcada.</legend>{dncManagements.data.openManagements.map(m=><label className={styles.checkbox} key={m.id}><Checkbox disabled={!m.canClose} checked={closeLeadIds.includes(String(m.id))} onChange={e=>setCloseLeadIds(ids=>e.target.checked?[...ids,String(m.id)]:ids.filter(id=>id!==String(m.id)))}/>{managementDisplayName({opportunityName:m.opportunityName})}{m.canClose?'':' · Solo su responsable o un administrador puede cerrarla'}</label>)}</fieldset>}
    <label className={styles.checkbox}><Checkbox checked={dncConfirmed} onChange={e=>setDncConfirmed(e.target.checked)}/>Confirmo que no se le va a poder contactar desde el CRM.</label>
    {dnc.error&&<p role="alert" className={styles.error}>{dnc.error.message}</p>}</section>}
   {['activity','complete','cancel'].includes(target.kind)&&<label className={styles.fullField}>{target.kind==='cancel'?'Motivo de cancelación':'Detalles del resultado'}<Textarea required={target.kind==='cancel'} value={result} onChange={e=>setResult(e.target.value)} placeholder={target.kind==='cancel'?'Por qué ya no corresponde hacer esta tarea':item?.result||'Qué ocurrió'}/></label>}
   {['activity','complete'].includes(target.kind)&&outcome!=='do_not_contact'&&<fieldset className={styles.formSection}><legend>Próximo paso <HelpHint term="nextStep" iconOnly/></legend><label>{VOCAB.whatsNext}<NativeSelect required={continuationRequired} value={continuation} onChange={e=>{autoWait.current=false;setContinuation(e.target.value as typeof continuation);setNext(['task','wait'].includes(e.target.value));if(e.target.value==='wait'&&!nextTitle)setNextTitle('Retomar conversación');}}><option value="">{continuationRequired?'Elegí cómo sigue':'Dejar como está'}</option><option value="task">Agendar una tarea</option><option value="wait">Esperar hasta una fecha y retomar</option><option value="done">No agendar nada</option></NativeSelect></label>{next?<><label>Qué hay que hacer<Input required maxLength={200} value={nextTitle} onChange={e=>{autoWait.current=false;setNextTitle(e.target.value)}} placeholder="Por ejemplo: revisar la propuesta con Ana"/></label><DueDateShortcuts className={styles.fullField} label="Cuándo" value={nextDate} onChange={v=>{autoWait.current=false;setNextDate(v)}} overdueConfirmed={nextConfirmed} onOverdueConfirmedChange={setNextConfirmed}/></>:continuation==='done'?<><label>¿Por qué no agendás nada?<NativeSelect required={continuationRequired} value={reasonChoice} onChange={e=>setReasonChoice(e.target.value)}><option value="">Elegí un motivo</option>{NO_FOLLOW_UP_REASONS.map(r=><option key={r} value={r}>{r}</option>)}</NativeSelect></label>{reasonChoice===OTHER_REASON&&<label>Contá por qué<Input required minLength={3} maxLength={500} value={reasonText} onChange={e=>setReasonText(e.target.value)} placeholder="Ej.: ya trabaja con otra empresa"/></label>}<p>No se crea otra tarea. Las demás tareas se conservan.</p></>:<p>{continuation==='task'?'Definí una acción con fecha para que quede pendiente.':continuationRequired?'Antes de guardar, elegí si agendás una tarea o no agendás nada.':'Si no elegís nada, se conserva cómo seguía.'}</p>}</fieldset>}
   {suggestedStage&&<label className={`${styles.checkbox} ${styles.fullField}`}><Checkbox checked={!!stageChange} onChange={e=>{setStageConflict(false);setAcceptedStage(e.target.checked&&stageOpportunity?{leadId,stage:suggestedStage.key,revision:stageOpportunity.pipelineRevision}:null)}}/><span>¿Pasar la {VOCAB.management.toLowerCase()} a «{suggestedStage.label}»? <small className={styles.muted}>Ahora está en «{managementLabel(null,stageOpportunity?.estado)}». Si no lo marcás, la {VOCAB.stage.toLowerCase()} no cambia.</small></span></label>}
   {next&&<p role="status">Al guardar se registrará el resultado y quedará pendiente “{nextTitle||'el próximo paso'}” para el {formatDate(nextDate)}. Las otras tareas se conservan.</p>}
   {['activity','complete'].includes(target.kind)&&outcome&&!dncFlow&&<section className={styles.formSection} aria-label="Revisión del resultado"><h3>Revisá lo que se guardará</h3><dl>
    <dt>Resultado</dt><dd>{outcomeLabel(outcome)}{result.trim()?' · '+result.trim():''}</dd>
    <dt>Fecha real</dt><dd>{occurred?formatDate(occurred.slice(0,10))+' · '+occurred.slice(11)+' (Argentina)':'Elegí una fecha'}</dd>
    <dt>Personas</dt><dd>{contactIds.length?contactIds.map(id=>availableContacts.find(c=>c.id===id)?.name||'Contacto #'+id).join(', '):'Sin persona registrada'}</dd>
    <dt>Próximo paso</dt><dd>{outcome==='do_not_contact'?'Respetar la restricción de contacto':next?(nextTitle||'Falta definir la acción')+' · '+formatDate(nextDate):continuation==='done'?'No agendar nada'+(continuationReason?' · '+continuationReason:''):'Falta elegir cómo continuar'}</dd>
   </dl><p>{target.kind==='complete'?'Se completará esta tarea y se registrará una actividad.':'Se guardará esta actividad.'} {stageChange&&suggestedStage?<>La gestión pasará a «{suggestedStage.label}» porque lo marcaste<HelpHint term="stage" iconOnly/>.</>:<>La etapa de la gestión se conserva<HelpHint term="stage" iconOnly/>.</>} Las otras tareas no se completan ni cancelan.</p></section>}
   {target.kind==='complete'&&<p className={styles.muted}>Se registrará una actividad con la fecha real, participantes y resultado. La fecha de vencimiento original se conserva.</p>}
   {target.kind==='task'&&date&&<p role="status">{item&&'dueDate' in item?'Vencimiento original: '+formatDate(item.dueDate)+(item.dueAt?' · '+localDateTime(item.dueAt).slice(11):'')+'. ':''}Se guardará para {formatDate(date)}{time?' a las '+time:' sin hora definida'} (Argentina).</p>}
   {duplicates.isFetching&&<p role="status">Revisando posibles pendientes duplicados…</p>}
   {duplicates.error&&<div role="alert"><p>No pudimos revisar duplicados. Tus datos se conservan.</p><Button type="button" variant="outline" disabled={duplicates.isFetching} disabledReason="La operación está en curso. Esperá a que termine para continuar." onClick={()=>void duplicates.refetch()}>Reintentar revisión de pendientes</Button></div>}
   {!!duplicates.data?.total&&<div role="alert"><p>Ya hay {duplicates.data.total} pendiente{duplicates.data.total===1?'':'s'} con el mismo título, tipo, fecha y contexto, entre las tareas {admin?'del equipo':'visibles para vos'}. Revisá si hace falta otro; ninguna se reemplazará automáticamente.</p><ul>{duplicates.data.tasks.map(t=><li key={t.id}>{t.title} · {formatDate(t.dueDate)} · {data.users.find(u=>u.email===t.assignedUserEmail)?.displayName||t.assignedUserEmail||'Sin responsable'}</li>)}</ul></div>}
   {target.kind.startsWith('delete')&&<p>Se ocultará el registro. Su historial de auditoría se conserva.</p>}
   {save.error&&<p role="alert" className={styles.error}>{stageConflict?STAGE_CONFLICT_MESSAGE:save.error.message}</p>}
   <DialogFooter><Button type="button" variant="outline" onClick={guard.requestClose} disabled={busy} disabledReason="La operación está en curso. Esperá a que termine para continuar.">Volver</Button><Button type="submit" disabled={busy} disabledReason="La operación está en curso. Esperá a que termine para continuar.">{busy?'Guardando…':dncFlow?'Bloquear contacto':next?'Guardar y programar':target.kind==='complete'?'Guardar resultado':target.kind==='task'?(item?'Guardar cambios':VOCAB.scheduleTask):'Guardar'}</Button></DialogFooter>
  </fieldset></form>
 </DialogContent>{guard.confirmation}</Dialog>;
}

function statusActionPlaceholder(kind:WorkTarget['kind']){return ['complete','cancel','delete_task','delete_activity'].includes(kind)}
