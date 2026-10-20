import {QueryErrorNotice} from './QueryErrorNotice';
import {QueryLoadingNotice} from './QueryLoadingNotice';
import {useGuardedMutation} from '../helpers/useGuardedMutation';
import {LiftRestrictionDialog,type RestrictionTarget} from './LiftRestrictionDialog';
import {Disclosure,DisclosureSummary} from './Disclosure';
import {NativeSelect} from './NativeSelect';
import {Input} from './Input';
import React,{useEffect,useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {getCommunication,postCommunication,type PreparedMessage} from '../endpoints/communication.schema';
import {getCommercialDetail} from '../endpoints/commercial.schema';
import {useAuth} from '../helpers/useAuth';
import {formatDateTime,formatDay} from '../helpers/crmDates';
import {Button} from './Button';
import {DisabledTooltip} from './Tooltip';
import {Dialog,DialogContent,DialogDescription,DialogFooter,DialogHeader,DialogTitle} from './Dialog';
import {MessageComposer,messageLabels} from './MessageComposer';
import {ManualCommunicationForm} from './ManualCommunicationForm';
import {ManualAttemptResolution} from './ManualAttemptResolution';
import {ResponseCorrectionForm} from './ResponseCorrectionForm';
import {InteractionCorrectionForm} from './InteractionCorrectionForm';
import {actorLabel,channelLabel,responseCategoryLabel,responseCategoryLabels} from '../helpers/crmLabels';
import {crmSuccess} from '../helpers/crmFeedback';
import styles from './Communication.module.css';

const restrictionChannelLabel=(channel:string)=>channel==='all'?'Todos los canales':channelLabel(channel);

export function CommunicationPanel({leadId,accountId,readOnly=false}:{leadId?:string;accountId?:string;readOnly?:boolean}){
 const recordId=leadId??accountId??'';
 const {authState}=useAuth(),qc=useQueryClient();
 const q=useQuery({queryKey:['communication',leadId?'lead':'account',recordId],queryFn:()=>getCommunication(leadId??'',accountId)});
 const detail=useQuery({queryKey:['commercial-detail',accountId??'',leadId??''],queryFn:()=>getCommercialDetail(accountId,leadId)});
 const [liftTarget,setLiftTarget]=useState<RestrictionTarget|null>(null);
 const [liftedNotice,setLiftedNotice]=useState<{id:string;text:string}|null>(null);
 const [person,setPerson]=useState(''),[channel,setChannel]=useState<'email'|'whatsapp'|'call'|'social'|'other'>('email'),[reason,setReason]=useState('');
 const [responseContext,setResponseContext]=useState(leadId??''),[responseChannel,setResponseChannel]=useState<'email'|'whatsapp'|'call'|'social'|'other'>('call'),[responseContact,setResponseContact]=useState(''),[responseRecipient,setResponseRecipient]=useState(''),[responseDestination,setResponseDestination]=useState(''),[responseLinkedMessageId,setResponseLinkedMessageId]=useState(''),[responseCategory,setResponseCategory]=useState('interested'),[responseSummary,setResponseSummary]=useState(''),[responseText,setResponseText]=useState(''),[responseOther,setResponseOther]=useState('');
 const [confirmGlobalBlock,setConfirmGlobalBlock]=useState(false);
 const [closeLeadIds,setCloseLeadIds]=useState<string[]>([]);
 const [createReminder,setCreateReminder]=useState(false),[reminderDate,setReminderDate]=useState(''),[reminderAssignee,setReminderAssignee]=useState('');
 const [responseOpen,setResponseOpen]=useState(false);
 const [correctingResponse,setCorrectingResponse]=useState<string|null>(null);
 const m=useGuardedMutation({mutationFn:postCommunication,onSuccess:(_data,input)=>{
  void qc.invalidateQueries({queryKey:['communication']});
  void qc.invalidateQueries({queryKey:['work']});
  void qc.invalidateQueries({queryKey:['global-journal']});
  void qc.invalidateQueries({queryKey:['lead-journal']});
  setReason('');
  if(input.action==='response_create'){setResponseOpen(false);crmSuccess('Respuesta guardada')}
  if(input.action==='outcome'){void qc.invalidateQueries({queryKey:['commercial-detail']});crmSuccess(input.event==='manual_sent'?'Envío confirmado':'Marcado como no enviado')}
 }});
 const admin=authState.type==='authenticated'&&authState.user.role==='admin';
 const userEmail=authState.type==='authenticated'?authState.user.email:'';
 const opp=leadId?detail.data?.opportunities.find(o=>String(o.id)===leadId):undefined;
 const canWrite=admin||(leadId?opp?.assignedUserEmail===userEmail:detail.data?.account.assignedUserEmail===userEmail);
 const reminderLead=detail.data?.opportunities.find(o=>String(o.id)===responseContext);
 const canCreateReminder=admin||(responseContext?reminderLead?.assignedUserEmail===userEmail:detail.data?.account.assignedUserEmail===userEmail);
 useEffect(()=>{if(detail.data&&!responseRecipient.trim())setResponseRecipient(detail.data.account.nombre)},[detail.data?.account.id]);
 if(!q.data&&q.isPending)return <QueryLoadingNotice>Cargando comunicación…</QueryLoadingNotice>;
 if(!q.data)return <QueryErrorNotice error={q.error!} onRetry={q.refetch} busy={q.isFetching}/>;
 return <section className={styles.panel}>
  {q.error&&<QueryErrorNotice error={q.error} onRetry={q.refetch} busy={q.isFetching}/>}
  <h3>Comunicación</h3>
  <p className={styles.muted}>{leadId?'Contactos y respuestas de esta gestión y del negocio.':'Contactos y respuestas del negocio, con o sin gestiones.'}</p>
  <Disclosure><DisclosureSummary>Restricciones de contacto</DisclosureSummary><div className={styles.panel}>
   {admin&&<>
    <label>Persona<NativeSelect value={person} onChange={e=>setPerson(e.target.value)}><option value="">Negocio o persona</option>{detail.data?.contacts.filter(c=>!c.deletedAt).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</NativeSelect></label>
    <label>Canal<NativeSelect aria-label="Canal de restricción" value={channel} onChange={e=>setChannel(e.target.value as typeof channel)}><option value="email">Email</option><option value="whatsapp">WhatsApp</option><option value="call">Llamada</option><option value="social">Red social</option><option value="other">Otro</option></NativeSelect></label>
    <label>Motivo de restricción<Input value={reason} onChange={e=>setReason(e.target.value)}/></label>
    <Button disabled={reason.trim().length<3||m.isPending||!detail.data?.account.id} disabledReason={(m.isPending) ? "La operación está en curso. Esperá a que termine para continuar." : "Completá el motivo obligatorio (mínimo 3 caracteres)."} onClick={()=>m.mutate({action:'restrict',accountId:String(detail.data!.account.id),leadId:null,contactId:person||null,channel,reason})}>Registrar restricción técnica</Button>
   </>}
   {q.data.restrictions.map(r=><article key={r.id}>
    <strong>{restrictionChannelLabel(r.channel)} · {r.liftedAt?'Levantada':'Restricción activa'}</strong>
    <p>{r.contactId?detail.data?.contacts.find(c=>String(c.id)===String(r.contactId))?.name:'Negocio o contexto original'} · {r.reason} · {actorLabel(r.actorEmail,detail.data?.users)} · {formatDateTime(r.createdAt)}</p>
    {r.liftedAt?<p>{r.liftReason} · {actorLabel(r.liftedBy,detail.data?.users)} · {formatDateTime(r.liftedAt)}</p>:admin&&<Button variant="outline" disabled={m.isPending} disabledReason="La operación está en curso. Esperá a que termine para continuar." onClick={()=>{setLiftedNotice(null);setLiftTarget({id:String(r.id),channel:r.channel,reason:r.reason,contact:r.contactId?detail.data?.contacts.find(c=>String(c.id)===String(r.contactId))?.name||'Contacto #'+r.contactId:'Negocio o contexto original'})}}>Levantar restricción</Button>}
   </article>)}
  </div></Disclosure>
  {liftedNotice&&<p role="status" tabIndex={-1} data-lifted-restriction={liftedNotice.id}>{liftedNotice.text}</p>}
  {admin&&liftTarget&&<LiftRestrictionDialog key={liftTarget.id} target={liftTarget} onClose={()=>setLiftTarget(null)} onLifted={()=>{setLiftedNotice({id:liftTarget.id,text:'Restricción levantada. No se enviaron mensajes.'});setLiftTarget(null)}}/>}
  <h4>Mensajes y borradores ({q.data.messages.length})</h4>
  {q.data.messages.map(msg=>{const unconfirmed=!readOnly&&(admin||msg.ownerEmail===userEmail)&&msg.channel==='whatsapp'&&msg.status==='whatsapp_opened';return <React.Fragment key={msg.id}>
  {unconfirmed&&<div role="group" aria-label={'WhatsApp sin confirmar para '+(msg.recipientName||msg.recipient)} className={styles.panel}><p><strong>¿Lo enviaste?</strong> Abriste WhatsApp para {msg.recipientName||msg.recipient} ({msg.recipient}) el {formatDateTime(msg.lastInteractionAt??msg.updatedAt)}. Abrir WhatsApp no confirma el envío.</p><div className={styles.actions}><Button disabled={m.isPending||!!detail.data?.account.doNotContact} disabledReason={m.isPending?'La operación está en curso. Esperá a que termine para continuar.':'El negocio está marcado No contactar; un administrador debe levantar ese bloqueo antes de confirmar un envío.'} onClick={()=>m.mutate({action:'outcome',id:msg.id,event:'manual_sent',notes:''})}>{m.isPending&&m.variables?.action==='outcome'&&m.variables.id===msg.id&&m.variables.event==='manual_sent'?'Guardando…':'Sí, se envió'}</Button><Button variant="outline" disabled={m.isPending} disabledReason="La operación está en curso. Esperá a que termine para continuar." onClick={()=>m.mutate({action:'outcome',id:msg.id,event:'manual_not_sent',notes:''})}>{m.isPending&&m.variables?.action==='outcome'&&m.variables.id===msg.id&&m.variables.event==='manual_not_sent'?'Guardando…':'No se envió'}</Button></div></div>}
  <Disclosure><DisclosureSummary>{messageLabels[msg.status]||msg.status} · {channelLabel(msg.channel)} · {msg.recipient} · {formatDateTime(msg.createdAt)}</DisclosureSummary>{!readOnly&&canWrite&&(admin||msg.ownerEmail===userEmail)&&(msg.channel==='email'||msg.channel==='whatsapp')?<MessageComposer key={msg.id} initial={msg as PreparedMessage} hideWhatsAppResolution={unconfirmed}/>:<p>{msg.subject} · {msg.textBody||msg.body||msg.summary}</p>}{!readOnly&&msg.status==='manual_pending'&&(admin||msg.ownerEmail===userEmail)&&<ManualAttemptResolution key={msg.id+'-resolution'} message={msg} />}{['manual_sent','manual_no_contact','manual_not_done'].includes(msg.status)&&(admin||msg.ownerEmail===userEmail)&&<InteractionCorrectionForm key={msg.id+'-correction'} message={msg}/>}</Disclosure></React.Fragment>})}
  {!readOnly&&detail.data&&<ManualCommunicationForm detail={detail.data} currentLeadId={leadId??null} userEmail={userEmail} isAdmin={admin}/>}
  <Button variant="outline" onClick={()=>setResponseOpen(true)}>Registrar respuesta recibida</Button>
  <Dialog open={responseOpen} onOpenChange={open=>{if(!m.isPending)setResponseOpen(open)}}><DialogContent><DialogHeader><DialogTitle>Registrar respuesta recibida</DialogTitle><DialogDescription>Guardá lo que respondió la persona; esto no envía mensajes ni cambia la etapa de la gestión.</DialogDescription></DialogHeader><div className={styles.panel}>
   <label>Contexto<NativeSelect value={responseContext} onChange={e=>setResponseContext(e.target.value)}><option value="">General · negocio</option>{detail.data?.opportunities.filter(o=>!o.deletedAt).map(o=><option key={o.id} value={o.id}>{o.opportunityName||'Gestión #'+o.id}{o.id===leadId?' · actual':''}</option>)}</NativeSelect></label>
   <label>Canal<NativeSelect value={responseChannel} onChange={e=>{setResponseChannel(e.target.value as typeof responseChannel);setResponseDestination('')}}>{[['email','Email'],['whatsapp','WhatsApp'],['call','Llamada'],['social','Red social'],['other','Otro']].map(([v,l])=><option key={v} value={v}>{l}</option>)}</NativeSelect></label>
   <label>Persona (opcional)<NativeSelect value={responseContact} onChange={e=>{const value=e.target.value;setResponseContact(value);const contact=detail.data?.contacts.find(c=>String(c.id)===value);if(contact){setResponseRecipient(contact.name);setResponseDestination(responseChannel==='email'?contact.email??'':contact.phone??'')}else{setResponseRecipient(detail.data?.account.nombre??'');setResponseDestination(responseChannel==='email'?detail.data?.account.email??'':detail.data?.account.telefono??'')}}}><option value="">Negocio / sin persona</option>{detail.data?.contacts.filter(c=>!c.deletedAt).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</NativeSelect></label>
   <label>Destinatario<Input value={responseRecipient} onChange={e=>setResponseRecipient(e.target.value)} placeholder="Persona o negocio que respondió" /></label>
   <label>Dato o perfil usado (opcional)<Input value={responseDestination} onChange={e=>setResponseDestination(e.target.value)} placeholder="Email, teléfono, perfil o canal" /></label>
   <label>Contacto saliente relacionado (opcional)<NativeSelect value={responseLinkedMessageId} onChange={e=>{const value=e.target.value;setResponseLinkedMessageId(value);const message=q.data.messages.find(msg=>msg.id===value);if(message){setResponseContact(message.contactId??'');setResponseRecipient(message.recipientName||message.recipient);setResponseDestination(message.recipient)}}}><option value="">Sin vincular</option>{q.data.messages.filter(msg=>!['draft','cancelled'].includes(msg.status)&&(!responseContext||String(msg.leadId??'')===responseContext)&&String(msg.contactId??'')===responseContact).map(msg=><option key={msg.id} value={msg.id}>{channelLabel(msg.channel)} · {msg.recipientName||msg.recipient} · {formatDay(msg.createdAt)}</option>)}</NativeSelect></label>
   <label>Qué respondió<NativeSelect value={responseCategory} onChange={e=>{setResponseCategory(e.target.value);setConfirmGlobalBlock(false);setCloseLeadIds([]);setCreateReminder(false);setReminderDate('')}}>{Object.entries(responseCategoryLabels).map(([v,l])=><option key={v} value={v}>{l}</option>)}</NativeSelect></label>
   {responseCategory==='later'&&<><label><DisabledTooltip disabled={!canCreateReminder} reason="Solo el responsable del contexto o un administrador puede crear este recordatorio."><input type="checkbox" disabled={!canCreateReminder} checked={createReminder} onChange={e=>setCreateReminder(e.target.checked)}/></DisabledTooltip> Crear recordatorio para retomar</label>{!canCreateReminder&&<p>Solo el responsable del contexto o un administrador puede crear el recordatorio. Podés guardar la respuesta igualmente.</p>}{createReminder&&canCreateReminder&&<><label>Fecha del recordatorio<Input type="date" value={reminderDate} onChange={e=>setReminderDate(e.target.value)} /></label>{admin&&<label>Asignar a<NativeSelect value={reminderAssignee||reminderLead?.assignedUserEmail||detail.data?.account.assignedUserEmail||''} onChange={e=>setReminderAssignee(e.target.value)}>{detail.data?.users?.map(u=><option key={u.email} value={u.email}>{u.displayName} · {u.email}</option>)}</NativeSelect></label>}<p>Se asignará por defecto al responsable del {responseContext?'contexto':'negocio'}.</p></>}</>}
   {responseCategory==='other'&&<label>Aclaración<Input value={responseOther} onChange={e=>setResponseOther(e.target.value)} /></label>}
   <label>Resumen (obligatorio)<Input value={responseSummary} onChange={e=>setResponseSummary(e.target.value)} /></label>
   <label>Texto exacto (opcional)<Input value={responseText} onChange={e=>setResponseText(e.target.value)} /></label>
   {responseCategory==='do_not_contact'&&<>
    <p>Se bloquearán todos los contactos salientes del negocio. Si querés, también podés cerrar gestiones abiertas que tengas permiso para gestionar.</p>
    {q.data.openManagements.length>0&&<fieldset><legend>Gestiones abiertas · ninguna seleccionada inicialmente</legend>{q.data.openManagements.map((item:any)=><label key={item.id}><DisabledTooltip disabled={!item.canClose||m.isPending} reason={m.isPending?"Se está guardando la respuesta. Esperá a que termine.":"Solo la persona responsable de esta gestión o un administrador puede cerrarla."}><input type="checkbox" disabled={!item.canClose||m.isPending} checked={closeLeadIds.includes(String(item.id))} onChange={e=>setCloseLeadIds(ids=>e.target.checked?[...ids,String(item.id)]:ids.filter(id=>id!==String(item.id)))}/></DisabledTooltip>{item.opportunityName||`Gestión #${item.id}`} · {item.estado}{item.canClose?'':' · Solo su responsable o un administrador puede cerrarla'}</label>)}</fieldset>}
    <label><input type="checkbox" checked={confirmGlobalBlock} onChange={e=>setConfirmGlobalBlock(e.target.checked)}/> Confirmo que esta solicitud bloqueará todos los contactos salientes del negocio.</label>
   </>}
   {m.error&&<p role="alert">{m.error.message}</p>}
   <DialogFooter><Button variant="outline" disabled={m.isPending} disabledReason="La operación está en curso. Esperá a que termine para continuar." onClick={()=>setResponseOpen(false)}>Cancelar</Button><Button disabled={!responseSummary.trim()||!responseRecipient.trim()||m.isPending||(responseCategory==='other'&&!responseOther.trim())||(responseCategory==='do_not_contact'&&!confirmGlobalBlock)||(responseCategory==='later'&&createReminder&&!reminderDate)} disabledReason={(m.isPending) ? "La operación está en curso. Esperá a que termine para continuar." : "Marcá la confirmación después de revisar la información."} onClick={()=>m.mutate({action:'response_create',id:crypto.randomUUID(),accountId:String(detail.data!.account.id),leadId:responseContext||null,contactId:responseContact||null,channel:responseChannel,recipient:responseDestination.trim(),recipientName:responseRecipient.trim(),destination:responseDestination.trim()||null,linkedMessageId:responseLinkedMessageId||null,category:responseCategory as any,summary:responseSummary.trim(),exactText:responseText.trim()||null,otherDetail:responseCategory==='other'?responseOther.trim():null,confirmDoNotContact:responseCategory==='do_not_contact'?confirmGlobalBlock:undefined,closeLeadIds:responseCategory==='do_not_contact'?closeLeadIds:undefined,reminder:responseCategory==='later'&&createReminder?{dueDate:reminderDate,assignedUserEmail:admin?(reminderAssignee||reminderLead?.assignedUserEmail||detail.data!.account.assignedUserEmail):null}:null})}>{m.isPending?'Guardando respuesta…':'Guardar respuesta'}</Button></DialogFooter>
  </div></DialogContent></Dialog>
  {!!q.data.responses.length&&<><h4>Respuestas registradas</h4>{q.data.responses.map((r:any)=><Disclosure key={r.id}><DisclosureSummary>{responseCategoryLabel(r.category)} · {r.contextName} · {formatDateTime(r.occurredAt)}</DisclosureSummary><p>{r.summary}{r.exactText?` · “${r.exactText}”`:''} · {actorLabel(r.actorEmail,detail.data?.users)}</p>{(admin||r.actorEmail===userEmail)&&<>{correctingResponse===String(r.id)?<ResponseCorrectionForm response={r} openManagements={q.data.openManagements} onClose={()=>setCorrectingResponse(null)}/>:<Button variant="outline" onClick={()=>setCorrectingResponse(String(r.id))}>Corregir respuesta</Button>}</>}</Disclosure>)}</>}
  {m.error&&<p role="alert">{m.error.message}</p>}
 </section>;
}
