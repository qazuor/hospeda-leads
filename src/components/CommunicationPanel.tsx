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
import {PhoneCallPanel,useCallSession} from './PhoneCallPanel';
import {getPipeline} from '../endpoints/pipeline.schema';
import {canModifyManagement} from '../helpers/crmPermissions';
import {canRecordDoNotContact,DO_NOT_CONTACT_READ_ONLY,DO_NOT_CONTACT_RECORD_DENIED} from '../helpers/doNotContactPermission';
import {DisabledTooltip} from './Tooltip';
import {Dialog,DialogContent,DialogDescription,DialogFooter,DialogHeader,DialogTitle} from './Dialog';
import {MessageComposer,messageLabels} from './MessageComposer';
import {ManualCommunicationForm} from './ManualCommunicationForm';
import {PendingOutcomes} from './PendingOutcomes';
import {ManualAttemptResolution} from './ManualAttemptResolution';
import {ResponseCorrectionForm,responseCategoryOptions} from './ResponseCorrectionForm';
import {InteractionCorrectionForm} from './InteractionCorrectionForm';
import {actorLabel,channelLabel,responseCategoryLabel,stageLabel,userLabel} from '../helpers/crmLabels';
import {crmSuccess} from '../helpers/crmFeedback';
import {confirmSendBlockReason} from '../helpers/communicationRecipient';
import styles from './Communication.module.css';
import {ValueBadge} from './ValueBadge';
import {CrmDialog} from './ui/CrmDialog';

const restrictionChannelLabel=(channel:string)=>channel==='all'?'Todos los canales':channelLabel(channel);

export function CommunicationPanel({leadId,accountId,readOnly=false}:{leadId?:string;accountId?:string;readOnly?:boolean}){
 const recordId=leadId??accountId??'';
 const {authState}=useAuth(),qc=useQueryClient();
 const q=useQuery({queryKey:['communication',leadId?'lead':'account',recordId],queryFn:()=>getCommunication(leadId??'',accountId)});
 const stages=useQuery({queryKey:['pipeline','config-summary'],queryFn:()=>getPipeline({mode:'config'}),enabled:!!leadId});
 const detail=useQuery({queryKey:['commercial-detail',accountId??'',leadId??''],queryFn:()=>getCommercialDetail(accountId,leadId)});
 const [liftTarget,setLiftTarget]=useState<RestrictionTarget|null>(null);
 const [liftedNotice,setLiftedNotice]=useState<{id:string;text:string}|null>(null);
 const [person,setPerson]=useState(''),[channel,setChannel]=useState<'email'|'whatsapp'|'call'|'social'|'other'>('email'),[reason,setReason]=useState('');
 const [responseContext,setResponseContext]=useState(leadId??''),[responseChannel,setResponseChannel]=useState<'email'|'whatsapp'|'call'|'social'|'other'>('call'),[responseContact,setResponseContact]=useState(''),[responseRecipient,setResponseRecipient]=useState(''),[responseDestination,setResponseDestination]=useState(''),[responseLinkedMessageId,setResponseLinkedMessageId]=useState(''),[responseCategory,setResponseCategory]=useState('interested'),[responseSummary,setResponseSummary]=useState(''),[responseText,setResponseText]=useState(''),[responseOther,setResponseOther]=useState('');
 const [confirmGlobalBlock,setConfirmGlobalBlock]=useState(false),callSession=useCallSession();
 const [closeLeadIds,setCloseLeadIds]=useState<string[]>([]);
 const [createReminder,setCreateReminder]=useState(false),[reminderDate,setReminderDate]=useState(''),[reminderAssignee,setReminderAssignee]=useState('');
 const [responseOpen,setResponseOpen]=useState(false);
 const [expandedInbound,setExpandedInbound]=useState<string|null>(null),[registeringInbound,setRegisteringInbound]=useState<string|null>(null);
 const [dismissTarget,setDismissTarget]=useState<string|null>(null),[dismissReason,setDismissReason]=useState('');
 const [correctingResponse,setCorrectingResponse]=useState<string|null>(null);
 const m=useGuardedMutation({mutationFn:postCommunication,onSuccess:(_data,input)=>{
  void qc.invalidateQueries({queryKey:['communication']});
  void qc.invalidateQueries({queryKey:['work']});
  void qc.invalidateQueries({queryKey:['global-journal']});
  void qc.invalidateQueries({queryKey:['lead-journal']});
  setReason('');
  if(input.action==='response_create'||input.action==='inbound_register'){setResponseOpen(false);setRegisteringInbound(null);crmSuccess('Respuesta guardada')}
  if(input.action==='inbound_dismiss'){setDismissTarget(null);setDismissReason('');crmSuccess('Email descartado')}
  if(input.action==='outcome'){void qc.invalidateQueries({queryKey:['commercial-detail']});crmSuccess(input.event==='manual_sent'?'Envío confirmado':'Marcado como no enviado')}
 }});
 const admin=authState.type==='authenticated'&&authState.user.role==='admin';
 const userEmail=authState.type==='authenticated'?authState.user.email:'';
 const opp=leadId?detail.data?.opportunities.find(o=>String(o.id)===leadId):undefined;
 const canWrite=admin||(leadId?opp?.assignedUserEmail===userEmail:detail.data?.account.assignedUserEmail===userEmail);
 // Decision 1C: an archived business is read-only for every seller, so recording or correcting a response stays with the admin (the server rejects it too).
 const archivedReadOnly=!admin&&!!detail.data?.account.archivedAt;
 // Decision D1: the same rule the server applies to response_create / response_correct with «Pidió no ser contactado».
 const canRecordDnc=canRecordDoNotContact({admin,userEmail,businessOwnerEmail:detail.data?.account.assignedUserEmail,managementOwnerEmails:detail.data?.opportunities.filter(o=>!o.deletedAt).map(o=>o.assignedUserEmail)});
 const reminderLead=detail.data?.opportunities.find(o=>String(o.id)===responseContext);
 // Decision 1C: tasks of a No contactar business are admin-only, so a reminder is too (the server rejects the whole response otherwise).
 const dncLocked=!admin&&!!detail.data?.account.doNotContact;
 const canCreateReminder=!dncLocked&&(admin||(responseContext?reminderLead?.assignedUserEmail===userEmail:detail.data?.account.assignedUserEmail===userEmail));
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
    <label>Motivo de restricción<Input value={reason} onChange={e=>setReason(e.target.value)} placeholder="Ej.: Pidió que no le escribamos por WhatsApp"/></label>
    <Button disabled={reason.trim().length<3||m.isPending||!detail.data?.account.id} disabledReason={(m.isPending) ? "La operación está en curso. Esperá a que termine para continuar." : "Completá el motivo obligatorio (mínimo 3 caracteres)."} onClick={()=>m.mutate({action:'restrict',accountId:String(detail.data!.account.id),leadId:null,contactId:person||null,channel,reason})}>Registrar restricción técnica</Button>
   </>}
   {q.data.restrictions.map(r=><article key={r.id}>
    <strong>{restrictionChannelLabel(r.channel)} · {r.liftedAt?'Levantada':'Restricción activa'}</strong>
    <p>{r.contactId?detail.data?.contacts.find(c=>String(c.id)===String(r.contactId))?.name:'Negocio o contexto original'} · {r.reason} · {actorLabel(r.actorEmail,detail.data?.users)} · {formatDateTime(r.createdAt)}</p>
    {r.liftedAt?<p>{r.liftReason} · {actorLabel(r.liftedBy,detail.data?.users)} · {formatDateTime(r.liftedAt)}</p>:admin&&<Button variant="outline" disabled={m.isPending} disabledReason="La operación está en curso. Esperá a que termine para continuar." onClick={()=>{setLiftedNotice(null);setLiftTarget({id:String(r.id),channel:r.channel,reason:r.reason,contact:r.contactId?detail.data?.contacts.find(c=>String(c.id)===String(r.contactId))?.name||'Persona #'+r.contactId:'Negocio o contexto original'})}}>Levantar restricción</Button>}
   </article>)}
  </div></Disclosure>
  {liftedNotice&&<p role="status" tabIndex={-1} data-lifted-restriction={liftedNotice.id}>{liftedNotice.text}</p>}
  {admin&&liftTarget&&<LiftRestrictionDialog key={liftTarget.id} target={liftTarget} onClose={()=>setLiftTarget(null)} onLifted={()=>{setLiftedNotice({id:liftTarget.id,text:'Restricción levantada. No se enviaron mensajes.'});setLiftTarget(null)}}/>}
  {!readOnly&&<PendingOutcomes items={q.data.pendingOutcomes} showBusiness={false}/>}
  {!!q.data.inbound?.length&&<><h4>Emails recibidos</h4>{q.data.inbound.map(item=><article key={item.id} className={styles.panel}><strong>Email recibido · {item.fromName||item.fromAddress}</strong><p>{item.fromAddress} · {item.subject||'(sin asunto)'} · {formatDateTime(item.receivedAt)}</p><p>{item.textBody.slice(0,240)}{item.textBody.length>240?'…':''}</p><div className={styles.actions}><Button size="sm" variant="ghost" onClick={()=>setExpandedInbound(expandedInbound===item.id?null:item.id)}> {expandedInbound===item.id?'Ocultar completo':'Ver completo'}</Button>{item.status==='pending_review'&&<ValueBadge value="Por revisar" category="review"/>}{item.status==='registered'&&<ValueBadge value="Registrada" category="review"/>}{item.status==='dismissed'&&<ValueBadge value="Descartada" category="review"/>}{item.isAutomatic&&<ValueBadge value="Respuesta automática" category="review"/>}</div>{expandedInbound===item.id&&<pre style={{whiteSpace:'pre-wrap',fontFamily:'inherit'}}>{item.textBody}</pre>}{!readOnly&&canWrite&&item.status==='pending_review'&&<div className={styles.actions}><Button size="sm" disabled={m.isPending} onClick={()=>{setRegisteringInbound(item.id);setResponseChannel('email');setResponseRecipient(item.fromName||item.fromAddress);setResponseDestination(item.fromAddress);setResponseLinkedMessageId(item.linkedMessageId||'');setResponseText(item.textBody.slice(0,20000));setResponseContext(item.leadId||'');setResponseSummary('');setResponseOpen(true)}}>Registrar respuesta</Button><Button size="sm" variant="outline" disabled={m.isPending} onClick={()=>{setDismissReason('');setDismissTarget(item.id)}}>No es una respuesta</Button></div>}</article>)}</>}
  <h4>Mensajes y borradores ({q.data.messages.length})</h4>
  {!q.data.messages.length&&!q.data.responses.length&&<p className={styles.muted}>{!readOnly&&detail.data&&!detail.data.account.doNotContact&&!detail.data.account.archivedAt?'Todavía no hay mensajes ni respuestas. Cuando prepares un mensaje, por ejemplo «presentación por WhatsApp», queda guardado acá. Lo que te conteste el negocio lo anotás con «Registrar respuesta recibida».':'Todavía no hay mensajes ni respuestas.'}</p>}
  {q.data.messages.map(msg=>{const unconfirmed=!readOnly&&(admin||msg.ownerEmail===userEmail)&&msg.channel==='whatsapp'&&msg.status==='whatsapp_opened';const sentBlock=unconfirmed?confirmSendBlockReason({account:detail.data?.account,message:msg,restrictions:q.data.activeRestrictions??q.data.restrictions,openManagementIds:q.data.openManagements.map(o=>o.id)}):'';return <React.Fragment key={msg.id}>
  {unconfirmed&&<div role="group" aria-label={'WhatsApp sin confirmar para '+(msg.recipientName||msg.recipient)} className={styles.panel}><p><strong>¿Lo enviaste?</strong> {msg.ownerEmail===userEmail?'Abriste':'Se abrió'} WhatsApp para {msg.recipientName||msg.recipient} ({msg.recipient}) el {formatDateTime(msg.lastInteractionAt??msg.updatedAt)}{msg.ownerEmail===userEmail?'':' · '+actorLabel(msg.ownerEmail,detail.data?.users)}. Abrir WhatsApp no confirma el envío.</p><div className={styles.actions}><Button disabled={m.isPending||!!sentBlock} disabledReason={m.isPending?'La operación está en curso. Esperá a que termine para continuar.':sentBlock} onClick={()=>m.mutate({action:'outcome',id:msg.id,event:'manual_sent',notes:''})}>{m.isPending&&m.variables?.action==='outcome'&&m.variables.id===msg.id&&m.variables.event==='manual_sent'?'Guardando…':'Sí, se envió'}</Button><Button variant="outline" disabled={m.isPending} disabledReason="La operación está en curso. Esperá a que termine para continuar." onClick={()=>m.mutate({action:'outcome',id:msg.id,event:'manual_not_sent',notes:''})}>{m.isPending&&m.variables?.action==='outcome'&&m.variables.id===msg.id&&m.variables.event==='manual_not_sent'?'Guardando…':'No se envió'}</Button></div></div>}
  <Disclosure><DisclosureSummary>{messageLabels[msg.status]||msg.status} · {channelLabel(msg.channel)} · {msg.recipient} · {formatDateTime(msg.createdAt)}</DisclosureSummary>{!readOnly&&canWrite&&(admin||msg.ownerEmail===userEmail)&&(msg.channel==='email'||msg.channel==='whatsapp')?<MessageComposer key={msg.id} initial={msg as PreparedMessage} hideWhatsAppResolution={unconfirmed}/>:<p>{msg.subject} · {msg.textBody||msg.body||msg.summary}</p>}{!readOnly&&msg.status==='manual_pending'&&(admin||msg.ownerEmail===userEmail)&&<ManualAttemptResolution key={msg.id+'-resolution'} message={msg} />}{['manual_sent','manual_no_contact','manual_not_done'].includes(msg.status)&&(admin||msg.ownerEmail===userEmail)&&<InteractionCorrectionForm key={msg.id+'-correction'} message={msg}/>}</Disclosure></React.Fragment>})}
  {!readOnly&&detail.data&&leadId&&opp&&<Disclosure><DisclosureSummary>Registrar una llamada</DisclosureSummary><PhoneCallPanel session={callSession} account={detail.data.account} contacts={detail.data.contacts} leadId={leadId} blockedReason={!canModifyManagement(authState.type==='authenticated'?authState.user:undefined,opp,detail.data.account)?'Solo la persona responsable de esta gestión o un administrador puede iniciar el contacto.':stages.isPending?'Esperá a que se carguen las etapas de la gestión.':stages.error?'No pudimos revisar la etapa de la gestión. Reintentá la carga.':(stages.data?.stages.find(s=>s.name===opp.estado)?.classification??'open')!=='open'?'La gestión está cerrada: solo admite registrar respuestas recibidas, no llamadas nuevas.':detail.data.account.doNotContact?'El negocio está marcado No contactar; un administrador debe levantar ese bloqueo.':detail.data.account.archivedAt?'El negocio está archivado; un administrador debe desarchivarlo.':''} onFinished={callSession.reset}/></Disclosure>}
  {!readOnly&&detail.data&&<ManualCommunicationForm detail={detail.data} currentLeadId={leadId??null} userEmail={userEmail} isAdmin={admin}/>}
  {!archivedReadOnly&&<Button variant="outline" onClick={()=>setResponseOpen(true)}>Registrar respuesta recibida</Button>}
  <Dialog open={responseOpen} onOpenChange={open=>{if(!m.isPending){setResponseOpen(open);if(!open)setRegisteringInbound(null)}}}><DialogContent><DialogHeader><DialogTitle>Registrar respuesta recibida</DialogTitle><DialogDescription>Guardá lo que respondió la persona; esto no envía mensajes ni cambia la etapa de la gestión.</DialogDescription></DialogHeader><div className={styles.panel}>
   {registeringInbound&&(()=>{const inbound=q.data.inbound?.find(item=>item.id===registeringInbound);return inbound?<p role="note">Registrás el email recibido de {inbound.fromName||inbound.fromAddress} del {formatDateTime(inbound.receivedAt)}.</p>:null})()}
   <label>¿Sobre qué gestión?<NativeSelect value={responseContext} onChange={e=>setResponseContext(e.target.value)}><option value="">Ninguna (todo el negocio)</option>{detail.data?.opportunities.filter(o=>!o.deletedAt).map(o=><option key={o.id} value={o.id}>{o.opportunityName||'Gestión #'+o.id}{o.id===leadId?' · actual':''}</option>)}</NativeSelect></label>
   <label>¿Por dónde?<NativeSelect value={responseChannel} onChange={e=>{setResponseChannel(e.target.value as typeof responseChannel);setResponseDestination('')}}>{[['email','Email'],['whatsapp','WhatsApp'],['call','Llamada'],['social','Red social'],['other','Otro']].map(([v,l])=><option key={v} value={v}>{l}</option>)}</NativeSelect></label>
   <label>¿De quién vino? (opcional)<NativeSelect value={responseContact} onChange={e=>{const value=e.target.value;setResponseContact(value);const contact=detail.data?.contacts.find(c=>String(c.id)===value);if(contact){setResponseRecipient(contact.name);setResponseDestination(responseChannel==='email'?contact.email??'':contact.phone??'')}else{setResponseRecipient(detail.data?.account.nombre??'');setResponseDestination(responseChannel==='email'?detail.data?.account.email??'':detail.data?.account.telefono??'')}}}><option value="">El negocio (no sé quién)</option>{detail.data?.contacts.filter(c=>!c.deletedAt).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</NativeSelect></label>
   <label>Nombre de quien respondió<Input value={responseRecipient} onChange={e=>setResponseRecipient(e.target.value)} placeholder="Ej.: Marta, o el nombre del negocio" /></label>
   <label>Desde dónde respondió (opcional)<Input value={responseDestination} onChange={e=>setResponseDestination(e.target.value)} placeholder="Ej.: su email, teléfono o usuario" /></label>
   <label>¿Responde a un mensaje que mandaste? (opcional)<NativeSelect value={responseLinkedMessageId} onChange={e=>{const value=e.target.value;setResponseLinkedMessageId(value);const message=q.data.messages.find(msg=>msg.id===value);if(message){setResponseContact(message.contactId??'');setResponseRecipient(message.recipientName||message.recipient);setResponseDestination(message.recipient)}}}><option value="">No, es una respuesta nueva</option>{q.data.messages.filter(msg=>!['draft','cancelled'].includes(msg.status)&&(!responseContext||String(msg.leadId??'')===responseContext)&&String(msg.contactId??'')===responseContact).map(msg=><option key={msg.id} value={msg.id}>{channelLabel(msg.channel)} · {msg.recipientName||msg.recipient} · {formatDay(msg.createdAt)}</option>)}</NativeSelect></label>
   <label>¿Qué respondió?<NativeSelect value={responseCategory} onChange={e=>{setResponseCategory(e.target.value);setConfirmGlobalBlock(false);setCloseLeadIds([]);setCreateReminder(false);setReminderDate('')}}>{responseCategoryOptions().map(([v,l])=><option key={v} value={v} disabled={v==='do_not_contact'&&!canRecordDnc}>{l}</option>)}</NativeSelect></label>{!canRecordDnc&&<p role="note" data-testid="dnc-record-denied">{DO_NOT_CONTACT_RECORD_DENIED}</p>}
   {responseCategory==='later'&&<><label><DisabledTooltip disabled={!canCreateReminder} reason={dncLocked?DO_NOT_CONTACT_READ_ONLY:"Solo el responsable del contexto o un administrador puede crear este recordatorio."}><input type="checkbox" disabled={!canCreateReminder} checked={createReminder} onChange={e=>setCreateReminder(e.target.checked)}/></DisabledTooltip> Crear recordatorio para retomar</label>{!canCreateReminder&&<p>{dncLocked?DO_NOT_CONTACT_READ_ONLY:'Solo el responsable del contexto o un administrador puede crear el recordatorio.'} Podés guardar la respuesta igualmente.</p>}{createReminder&&canCreateReminder&&<><label>Fecha del recordatorio<Input type="date" value={reminderDate} onChange={e=>setReminderDate(e.target.value)} /></label>{admin&&<label>Asignada a<NativeSelect value={reminderAssignee||reminderLead?.assignedUserEmail||detail.data?.account.assignedUserEmail||''} onChange={e=>setReminderAssignee(e.target.value)}>{detail.data?.users?.map(u=><option key={u.email} value={u.email}>{userLabel(detail.data?.users,u.email)}</option>)}</NativeSelect></label>}<p>Se asignará por defecto al responsable del {responseContext?'contexto':'negocio'}.</p></>}</>}
   {responseCategory==='other'&&<label>Aclaración (contame)<Input value={responseOther} onChange={e=>setResponseOther(e.target.value)} placeholder="Ej.: Está de viaje hasta fin de mes" /></label>}
   <label>¿Qué te dijo? Resumen (obligatorio)<Input value={responseSummary} onChange={e=>setResponseSummary(e.target.value)} placeholder="Ej.: Le interesa y pidió que lo llame el lunes" /></label>
   <label>Texto exacto (opcional)<Input value={responseText} onChange={e=>setResponseText(e.target.value)} placeholder="Ej.: «Mandame el precio por mail»" /></label>
   {responseCategory==='do_not_contact'&&<>
    <p>No vas a poder mandarle mensajes ni llamarlo desde el CRM. Si cerrás todas sus gestiones abiertas, el negocio queda archivado. Podés elegir qué gestiones cerrar; ninguna viene marcada.</p>
    {q.data.openManagements.length>0&&<fieldset><legend>Gestiones abiertas · ninguna seleccionada inicialmente</legend>{q.data.openManagements.map((item:any)=><label key={item.id}><DisabledTooltip disabled={!item.canClose||m.isPending} reason={m.isPending?"Se está guardando la respuesta. Esperá a que termine.":"Solo la persona responsable de esta gestión o un administrador puede cerrarla."}><input type="checkbox" disabled={!item.canClose||m.isPending} checked={closeLeadIds.includes(String(item.id))} onChange={e=>setCloseLeadIds(ids=>e.target.checked?[...ids,String(item.id)]:ids.filter(id=>id!==String(item.id)))}/></DisabledTooltip>{item.opportunityName||`Gestión #${item.id}`} · {stageLabel(item.estado)}{item.canClose?'':' · Solo su responsable o un administrador puede cerrarla'}</label>)}</fieldset>}
    <label><input type="checkbox" checked={confirmGlobalBlock} onChange={e=>setConfirmGlobalBlock(e.target.checked)}/> Confirmo que no se le va a poder contactar desde el CRM.</label>
   </>}
   {m.error&&<p role="alert">{m.error.message}</p>}
   <DialogFooter><Button variant="outline" disabled={m.isPending} disabledReason="La operación está en curso. Esperá a que termine para continuar." onClick={()=>{setResponseOpen(false);setRegisteringInbound(null)}}>Cancelar</Button><Button disabled={!responseSummary.trim()||!responseRecipient.trim()||m.isPending||(responseCategory==='other'&&!responseOther.trim())||(responseCategory==='do_not_contact'&&!confirmGlobalBlock)||(responseCategory==='later'&&createReminder&&!reminderDate)} disabledReason={(m.isPending) ? "La operación está en curso. Esperá a que termine para continuar." : "Completá el nombre, el resumen y las confirmaciones que pide la pantalla."} onClick={()=>registeringInbound?m.mutate({action:'inbound_register',id:crypto.randomUUID(),inboundId:registeringInbound,category:responseCategory as any,summary:responseSummary.trim(),otherDetail:responseCategory==='other'?responseOther.trim():null,confirmDoNotContact:responseCategory==='do_not_contact'?confirmGlobalBlock:undefined}):m.mutate({action:'response_create',id:crypto.randomUUID(),accountId:String(detail.data!.account.id),leadId:responseContext||null,contactId:responseContact||null,channel:responseChannel,recipient:responseDestination.trim(),recipientName:responseRecipient.trim(),destination:responseDestination.trim()||null,linkedMessageId:responseLinkedMessageId||null,category:responseCategory as any,summary:responseSummary.trim(),exactText:responseText.trim()||null,otherDetail:responseCategory==='other'?responseOther.trim():null,confirmDoNotContact:responseCategory==='do_not_contact'?confirmGlobalBlock:undefined,closeLeadIds:responseCategory==='do_not_contact'?closeLeadIds:undefined,reminder:responseCategory==='later'&&createReminder?{dueDate:reminderDate,assignedUserEmail:admin?(reminderAssignee||reminderLead?.assignedUserEmail||detail.data!.account.assignedUserEmail):null}:null})}>{m.isPending?'Guardando respuesta…':'Guardar respuesta'}</Button></DialogFooter>
  </div></DialogContent></Dialog>
  <CrmDialog opened={!!dismissTarget} onClose={()=>setDismissTarget(null)} title="Descartar email" description="Contanos por qué este email no es una respuesta." busy={m.isPending}><label>Motivo<Input autoFocus value={dismissReason} onChange={e=>setDismissReason(e.target.value)} maxLength={1000} /></label>{m.error&&<p role="alert">{m.error.message}</p>}<DialogFooter><Button variant="outline" disabled={m.isPending} onClick={()=>setDismissTarget(null)}>Cancelar</Button><Button disabled={dismissReason.trim().length<3||m.isPending} onClick={()=>dismissTarget&&m.mutate({action:'inbound_dismiss',id:crypto.randomUUID(),inboundId:dismissTarget,reason:dismissReason.trim()})}>{m.isPending?'Guardando…':'Descartar email'}</Button></DialogFooter></CrmDialog>
  {!!q.data.responses.length&&<><h4>Respuestas registradas</h4>{q.data.responses.map((r:any)=><Disclosure key={r.id}><DisclosureSummary>{responseCategoryLabel(r.category)} · {r.contextName} · {formatDateTime(r.occurredAt)}</DisclosureSummary><p>{r.summary}{r.exactText?` · “${r.exactText}”`:''} · {actorLabel(r.actorEmail,detail.data?.users)}</p>{!archivedReadOnly&&(admin||r.actorEmail===userEmail)&&<>{correctingResponse===String(r.id)?<ResponseCorrectionForm response={r} openManagements={q.data.openManagements} canRecordDnc={canRecordDnc} canLiftDnc={admin} onClose={()=>setCorrectingResponse(null)}/>:<Button variant="outline" onClick={()=>setCorrectingResponse(String(r.id))}>Corregir respuesta</Button>}</>}</Disclosure>)}</>}
  {m.error&&<p role="alert">{m.error.message}</p>}
 </section>;
}
