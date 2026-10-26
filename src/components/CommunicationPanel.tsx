import {QueryErrorNotice} from './QueryErrorNotice';
import {QueryLoadingNotice} from './QueryLoadingNotice';
import {useGuardedMutation} from '../helpers/useGuardedMutation';
import {LiftRestrictionDialog,type RestrictionTarget} from './LiftRestrictionDialog';
import {Disclosure,DisclosureSummary} from './Disclosure';
import {NativeSelect} from './NativeSelect';
import {Input} from './Input';
import React,{useRef,useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {getCommunication,postCommunication,type InboundMessage,type PreparedMessage} from '../endpoints/communication.schema';
import {InboundMessageActions} from './InboundMessageActions';
import {ResponseRecordDialog,type ResponseDialogRequest} from './ResponseRecordDialog';
import {getCommercialDetail} from '../endpoints/commercial.schema';
import {useAuth} from '../helpers/useAuth';
import {formatDateTime} from '../helpers/crmDates';
import {Button} from './Button';
import {PhoneCallPanel,useCallSession} from './PhoneCallPanel';
import {getPipeline} from '../endpoints/pipeline.schema';
import {canModifyManagement} from '../helpers/crmPermissions';
import {canRecordDoNotContact} from '../helpers/doNotContactPermission';
import {DialogFooter} from './Dialog';
import {MessageComposer,messageLabels} from './MessageComposer';
import {ManualCommunicationForm} from './ManualCommunicationForm';
import {PendingOutcomes} from './PendingOutcomes';
import {ManualAttemptResolution} from './ManualAttemptResolution';
import {ResponseCorrectionForm} from './ResponseCorrectionForm';
import {InteractionCorrectionForm} from './InteractionCorrectionForm';
import {actorLabel,channelLabel,inboundMeta,responseCategoryLabel} from '../helpers/crmLabels';
import {crmSuccess} from '../helpers/crmFeedback';
import {confirmSendBlockReason} from '../helpers/communicationRecipient';
import styles from './Communication.module.css';
import {ValueBadge} from './ValueBadge';
import {CrmDialog} from './ui/CrmDialog';
import {AutoRegistrationVoidButton,canVoidAutoRegistration} from './AutoRegistrationVoid';

const restrictionChannelLabel=(channel:string)=>channel==='all'?'Todos los canales':channelLabel(channel);

export function CommunicationPanel({leadId,accountId,readOnly=false}:{leadId?:string;accountId?:string;readOnly?:boolean}){
 const recordId=leadId??accountId??'';
 const {authState}=useAuth(),qc=useQueryClient();
 const admin=authState.type==='authenticated'&&authState.user.role==='admin';
 const userEmail=authState.type==='authenticated'?authState.user.email:'';
 const [includeVoided,setIncludeVoided]=useState(false);
 const q=useQuery({queryKey:['communication',leadId?'lead':'account',recordId,admin&&includeVoided],queryFn:()=>getCommunication(leadId??'',accountId,admin&&includeVoided)});
 const stages=useQuery({queryKey:['pipeline','config-summary'],queryFn:()=>getPipeline({mode:'config'}),enabled:!!leadId});
 const detail=useQuery({queryKey:['commercial-detail',accountId??'',leadId??''],queryFn:()=>getCommercialDetail(accountId,leadId)});
 const [liftTarget,setLiftTarget]=useState<RestrictionTarget|null>(null);
 const [liftedNotice,setLiftedNotice]=useState<{id:string;text:string}|null>(null);
 const [person,setPerson]=useState(''),[channel,setChannel]=useState<'email'|'whatsapp'|'call'|'social'|'other'>('email'),[reason,setReason]=useState('');
 const [responseRequest,setResponseRequest]=useState<ResponseDialogRequest|null>(null),responseSeq=useRef(0);
 const callSession=useCallSession();
 const openResponse=(inbound:InboundMessage|null)=>setResponseRequest({seq:++responseSeq.current,inbound});
 const [expandedInbound,setExpandedInbound]=useState<string|null>(null);
 const [uncertainTarget,setUncertainTarget]=useState<{messageId:string;outcome:'sent'|'not_sent'}|null>(null),[uncertainReason,setUncertainReason]=useState('');
 const [correctingResponse,setCorrectingResponse]=useState<string|null>(null);
 const m=useGuardedMutation({mutationFn:postCommunication,onSuccess:(_data,input)=>{
  void qc.invalidateQueries({queryKey:['communication']});
  void qc.invalidateQueries({queryKey:['work']});
  void qc.invalidateQueries({queryKey:['global-journal']});
  void qc.invalidateQueries({queryKey:['lead-journal']});
  setReason('');
  if(input.action==='email_resolve_uncertain'){setUncertainTarget(null);setUncertainReason('');crmSuccess('Resultado actualizado')}
  if(input.action==='outcome'){void qc.invalidateQueries({queryKey:['commercial-detail']});crmSuccess(input.event==='manual_sent'?'Envío confirmado':'Marcado como no enviado')}
 }});
 const opp=leadId?detail.data?.opportunities.find(o=>String(o.id)===leadId):undefined;
 const canWrite=admin||(leadId?opp?.assignedUserEmail===userEmail:detail.data?.account.assignedUserEmail===userEmail);
 // Decision 1C: an archived business is read-only for every seller, so recording or correcting a response stays with the admin (the server rejects it too).
 const archivedReadOnly=!admin&&!!detail.data?.account.archivedAt;
 // Decision D1: the same rule the server applies to response_create / response_correct with «Pidió no ser contactado».
 const canRecordDnc=canRecordDoNotContact({admin,userEmail,businessOwnerEmail:detail.data?.account.assignedUserEmail,managementOwnerEmails:detail.data?.opportunities.filter(o=>!o.deletedAt).map(o=>o.assignedUserEmail)});
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
  {!!q.data.inbound?.length&&<><h4>Mensajes recibidos</h4>{q.data.inbound.map(item=><article key={item.id} className={styles.inboundCard}><div className={styles.inboundBadges}><ValueBadge value={(item.channel==='whatsapp'?'WhatsApp recibido':'Email recibido')+(item.fromName?' · '+item.fromName:'')} category="review"/>{item.autoRegistrationId&&<ValueBadge value="Automático" category="review"/>}{item.status==='pending_review'&&<ValueBadge value="Por revisar" category="review"/>}{item.status==='registered'&&<ValueBadge value="Registrada" category="review"/>}{item.status==='dismissed'&&<ValueBadge value="Descartada" category="review"/>}{item.status==='voided'&&<ValueBadge value={messageLabels.voided} category="review"/>}{item.isAutomatic&&<ValueBadge value="Respuesta automática" category="review"/>}</div>{item.channel!=='whatsapp'&&<h5 className={styles.mailSubject}>{item.subject||'(sin asunto)'}</h5>}<p className={styles.mailMeta}>{inboundMeta({item,when:formatDateTime(item.receivedAt)})}</p><div className={styles.mailSender}><span className={styles.mailAvatar} aria-hidden="true">{(item.fromName||item.fromAddress).trim().split(/\s+/).slice(0,2).map(part=>part[0]?.toUpperCase()).join('')}</span><div>{item.fromName&&<><strong>{item.fromName}</strong><span>{item.fromAddress}</span></>}</div><time>{formatDateTime(item.receivedAt)}</time></div><div className={styles.mailBody}><pre>{expandedInbound===item.id?item.textBody:item.textBody.slice(0,240)+(item.textBody.length>240?'…':'')}</pre></div>{item.textBody.length>240&&<Button size="sm" variant="ghost" onClick={()=>setExpandedInbound(expandedInbound===item.id?null:item.id)} aria-expanded={expandedInbound===item.id}>{expandedInbound===item.id?'Ocultar completo':'Ver completo'}</Button>}<footer className={styles.actions}><InboundMessageActions item={item} readOnly={readOnly} canWrite={canWrite} onRegister={openResponse}/></footer></article>)}</>}
  {admin&&<Button size="sm" variant={includeVoided?'primary':'outline'} aria-pressed={includeVoided} onClick={()=>setIncludeVoided(value=>!value)}>Anulados</Button>}
  <h4>Mensajes y borradores ({q.data.messages.length})</h4>
  {!q.data.messages.length&&!q.data.responses.length&&!q.data.inbound?.length&&<p className={styles.muted}>{!readOnly&&detail.data&&!detail.data.account.doNotContact&&!detail.data.account.archivedAt?'Todavía no hay mensajes ni respuestas. Cuando prepares un mensaje, por ejemplo «presentación por WhatsApp», queda guardado acá. Lo que te conteste el negocio lo anotás con «Registrar respuesta recibida».':'Todavía no hay mensajes ni respuestas.'}</p>}
  {q.data.messages.map(msg=>{const unconfirmed=!readOnly&&(admin||msg.ownerEmail===userEmail)&&msg.channel==='whatsapp'&&msg.status==='whatsapp_opened';const sentBlock=unconfirmed?confirmSendBlockReason({account:detail.data?.account,message:msg,restrictions:q.data.activeRestrictions??q.data.restrictions,openManagementIds:q.data.openManagements.map(o=>o.id)}):'';const uncertain=admin&&msg.channel==='email'&&(msg.status==='unknown'||msg.status==='submitting'&&new Date(msg.updatedAt).getTime()<Date.now()-15*60*1000);return <React.Fragment key={msg.id}>
  {unconfirmed&&<div role="group" aria-label={'WhatsApp sin confirmar para '+(msg.recipientName||msg.recipient)} className={styles.panel}><p><strong>¿Lo enviaste?</strong> {msg.ownerEmail===userEmail?'Abriste':'Se abrió'} WhatsApp para {msg.recipientName||msg.recipient} ({msg.recipient}) el {formatDateTime(msg.lastInteractionAt??msg.updatedAt)}{msg.ownerEmail===userEmail?'':' · '+actorLabel(msg.ownerEmail,detail.data?.users)}. Abrir WhatsApp no confirma el envío.</p><div className={styles.actions}><Button disabled={m.isPending||!!sentBlock} disabledReason={m.isPending?'La operación está en curso. Esperá a que termine para continuar.':sentBlock} onClick={()=>m.mutate({action:'outcome',id:msg.id,event:'manual_sent',notes:''})}>{m.isPending&&m.variables?.action==='outcome'&&m.variables.id===msg.id&&m.variables.event==='manual_sent'?'Guardando…':'Sí, se envió'}</Button><Button variant="outline" disabled={m.isPending} disabledReason="La operación está en curso. Esperá a que termine para continuar." onClick={()=>m.mutate({action:'outcome',id:msg.id,event:'manual_not_sent',notes:''})}>{m.isPending&&m.variables?.action==='outcome'&&m.variables.id===msg.id&&m.variables.event==='manual_not_sent'?'Guardando…':'No se envió'}</Button></div></div>}
  <Disclosure><DisclosureSummary>{msg.templateSnapshot?.inboundId?'Respuesta · ':''}{messageLabels[msg.status]||msg.status}{msg.autoRegistrationId&&<><span> · </span><ValueBadge value="Automático" category="review"/></>} · {channelLabel(msg.channel)} · {msg.recipient} · {formatDateTime(msg.createdAt)}</DisclosureSummary>{msg.templateSnapshot?.inboundId&&<p>Respuesta al email recibido</p>}{!readOnly&&canWrite&&(admin||msg.ownerEmail===userEmail)&&(msg.channel==='email'||msg.channel==='whatsapp')?<MessageComposer key={msg.id} initial={msg as PreparedMessage} hideWhatsAppResolution={unconfirmed}/>:<p>{msg.subject} · {msg.textBody||msg.body||msg.summary}</p>}{uncertain&&<div className={styles.actions}><Button size="sm" disabled={m.isPending} onClick={()=>{setUncertainReason('');setUncertainTarget({messageId:msg.id,outcome:'sent'})}}>Marcar como enviado</Button><Button size="sm" variant="outline" disabled={m.isPending} onClick={()=>{setUncertainReason('');setUncertainTarget({messageId:msg.id,outcome:'not_sent'})}}>Marcar como no enviado</Button></div>}{!readOnly&&msg.status==='manual_pending'&&(admin||msg.ownerEmail===userEmail)&&<ManualAttemptResolution key={msg.id+'-resolution'} message={msg} />}{['manual_sent','manual_no_contact','manual_not_done'].includes(msg.status)&&(admin||msg.ownerEmail===userEmail)&&<InteractionCorrectionForm key={msg.id+'-correction'} message={msg}/>} {msg.autoRegistrationId&&canVoidAutoRegistration({readOnly,canWrite,admin,userEmail,registrationId:msg.autoRegistrationId,registrationUserEmail:msg.autoRegistrationUserEmail,status:msg.status})&&<AutoRegistrationVoidButton registrationId={msg.autoRegistrationId}/>}</Disclosure></React.Fragment>})}
  {!readOnly&&detail.data&&leadId&&opp&&<Disclosure><DisclosureSummary>Registrar una llamada</DisclosureSummary><PhoneCallPanel session={callSession} account={detail.data.account} contacts={detail.data.contacts} leadId={leadId} blockedReason={!canModifyManagement(authState.type==='authenticated'?authState.user:undefined,opp,detail.data.account)?'Solo la persona responsable de esta gestión o un administrador puede iniciar el contacto.':stages.isPending?'Esperá a que se carguen las etapas de la gestión.':stages.error?'No pudimos revisar la etapa de la gestión. Reintentá la carga.':(stages.data?.stages.find(s=>s.name===opp.estado)?.classification??'open')!=='open'?'La gestión está cerrada: solo admite registrar respuestas recibidas, no llamadas nuevas.':detail.data.account.doNotContact?'El negocio está marcado No contactar; un administrador debe levantar ese bloqueo.':detail.data.account.archivedAt?'El negocio está archivado; un administrador debe desarchivarlo.':''} onFinished={callSession.reset}/></Disclosure>}
  {(!readOnly&&detail.data||!archivedReadOnly)&&<div className={styles.actions}>{!readOnly&&detail.data&&<ManualCommunicationForm detail={detail.data} currentLeadId={leadId??null} userEmail={userEmail} isAdmin={admin}/>} {!archivedReadOnly&&<Button size="sm" variant="outline" style={{width:'fit-content'}} onClick={()=>openResponse(null)}>Registrar respuesta recibida</Button>}</div>}
  <ResponseRecordDialog request={responseRequest} onClose={()=>setResponseRequest(null)} data={q.data} detail={detail.data} leadId={leadId}/>
  <CrmDialog opened={!!uncertainTarget} onClose={()=>{if(!m.isPending)setUncertainTarget(null)}} title={uncertainTarget?.outcome==='sent'?'Marcar como enviado':'Marcar como no enviado'} description={uncertainTarget?.outcome==='sent'?'Confirmás que el proveedor aceptó el email. La entrega todavía no queda confirmada.':'Confirmás que el proveedor no aceptó el email. No se enviará automáticamente.'} busy={m.isPending}><label>Qué revisaste<Input autoFocus value={uncertainReason} onChange={e=>setUncertainReason(e.target.value)} maxLength={500} /></label>{m.error&&<p role="alert">{m.error.message}</p>}<DialogFooter><Button variant="outline" disabled={m.isPending} onClick={()=>setUncertainTarget(null)}>Cancelar</Button><Button disabled={uncertainReason.trim().length<10||m.isPending} onClick={()=>uncertainTarget&&m.mutate({action:'email_resolve_uncertain',id:crypto.randomUUID(),messageId:uncertainTarget.messageId,outcome:uncertainTarget.outcome,reason:uncertainReason.trim()})}>{m.isPending?'Guardando…':'Guardar resultado'}</Button></DialogFooter></CrmDialog>
  {!!q.data.responses.length&&<><h4>Respuestas registradas</h4>{q.data.responses.map((r:any)=><Disclosure key={r.id}><DisclosureSummary>{responseCategoryLabel(r.category)} · {r.contextName} · {formatDateTime(r.occurredAt)}</DisclosureSummary><p>{r.summary}{r.exactText?` · “${r.exactText}”`:''} · {actorLabel(r.actorEmail,detail.data?.users)}</p>{!archivedReadOnly&&(admin||r.actorEmail===userEmail)&&<>{correctingResponse===String(r.id)?<ResponseCorrectionForm response={r} openManagements={q.data.openManagements} canRecordDnc={canRecordDnc} canLiftDnc={admin} onClose={()=>setCorrectingResponse(null)}/>:<Button variant="outline" onClick={()=>setCorrectingResponse(String(r.id))}>Corregir respuesta</Button>}</>}</Disclosure>)}</>}
  {m.error&&<p role="alert">{m.error.message}</p>}
 </section>;
}
