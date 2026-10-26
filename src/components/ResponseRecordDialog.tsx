import {useEffect,useState} from 'react';
import {useQueryClient} from '@tanstack/react-query';
import {postCommunication,type CommunicationDetail,type CommunicationMutation,type InboundMessage} from '../endpoints/communication.schema';
import type {CommercialDetail} from '../endpoints/commercial.schema';
import {useAuth} from '../helpers/useAuth';
import {useGuardedMutation} from '../helpers/useGuardedMutation';
import {formatDateTime,formatDay} from '../helpers/crmDates';
import {channelLabel,inboundNoun,stageLabel,userLabel} from '../helpers/crmLabels';
import {crmSuccess} from '../helpers/crmFeedback';
import {canRecordDoNotContact,DO_NOT_CONTACT_READ_ONLY,DO_NOT_CONTACT_RECORD_DENIED} from '../helpers/doNotContactPermission';
import {Button} from './Button';
import {Input} from './Input';
import {NativeSelect} from './NativeSelect';
import {DisabledTooltip} from './Tooltip';
import {Dialog,DialogContent,DialogDescription,DialogFooter,DialogHeader,DialogTitle} from './Dialog';
import {responseCategoryOptions} from './ResponseCorrectionForm';
import {invalidateInboundViews} from './InboundMessageActions';
import styles from './Communication.module.css';

type Channel='email'|'whatsapp'|'call'|'social'|'other';
type ResponseCategory=Extract<CommunicationMutation,{action:'response_create'}>['category'];
/** Opens the dialog; a new `seq` with an `inbound` pre-fills it from that message, `inbound:null` opens a free response. */
export type ResponseDialogRequest={readonly seq:number;readonly inbound:InboundMessage|null};

/**
 * «Registrar respuesta recibida», shared by the business «Comunicación» tab and the Bandeja. With an inbound message it
 * records that message (`inbound_register`); without one it records a free response (`response_create`). It never sends
 * anything. The draft survives closing and errors, so nothing typed is lost.
 */
export function ResponseRecordDialog({request,onClose,data,detail,leadId}:{request:ResponseDialogRequest|null;onClose:()=>void;data:CommunicationDetail;detail:CommercialDetail|undefined;leadId?:string}){
 const {authState}=useAuth(),qc=useQueryClient();
 const admin=authState.type==='authenticated'&&authState.user.role==='admin';
 const userEmail=authState.type==='authenticated'?authState.user.email:'';
 const [responseContext,setResponseContext]=useState(leadId??''),[responseChannel,setResponseChannel]=useState<Channel>('call'),[responseContact,setResponseContact]=useState(''),[responseRecipient,setResponseRecipient]=useState(''),[responseDestination,setResponseDestination]=useState(''),[responseLinkedMessageId,setResponseLinkedMessageId]=useState(''),[responseCategory,setResponseCategory]=useState<ResponseCategory>('interested'),[responseSummary,setResponseSummary]=useState(''),[responseText,setResponseText]=useState(''),[responseOther,setResponseOther]=useState('');
 const [confirmGlobalBlock,setConfirmGlobalBlock]=useState(false),[closeLeadIds,setCloseLeadIds]=useState<string[]>([]);
 const [createReminder,setCreateReminder]=useState(false),[reminderDate,setReminderDate]=useState(''),[reminderAssignee,setReminderAssignee]=useState('');
 const inbound=request?.inbound??null;
 useEffect(()=>{if(!inbound)return;setResponseChannel(inbound.channel==='whatsapp'?'whatsapp':'email');setResponseRecipient(inbound.fromName||inbound.fromAddress);setResponseDestination(inbound.fromAddress);setResponseLinkedMessageId(inbound.linkedMessageId||'');setResponseText(inbound.textBody.slice(0,20000));setResponseContext(inbound.leadId||'');setResponseSummary('')},[request?.seq]);
 useEffect(()=>{if(detail&&!responseRecipient.trim())setResponseRecipient(detail.account.nombre)},[detail?.account.id]);
 const m=useGuardedMutation({mutationFn:postCommunication,onSuccess:()=>{invalidateInboundViews({queryClient:qc});onClose();crmSuccess('Respuesta guardada')}});
 // Decision D1: the same rule the server applies to response_create / response_correct with «Pidió no ser contactado».
 const canRecordDnc=canRecordDoNotContact({admin,userEmail,businessOwnerEmail:detail?.account.assignedUserEmail,managementOwnerEmails:detail?.opportunities.filter(o=>!o.deletedAt).map(o=>o.assignedUserEmail)});
 const reminderLead=detail?.opportunities.find(o=>String(o.id)===responseContext);
 // Decision 1C: tasks of a No contactar business are admin-only, so a reminder is too (the server rejects the whole response otherwise).
 const dncLocked=!admin&&!!detail?.account.doNotContact;
 const canCreateReminder=!dncLocked&&(admin||(responseContext?reminderLead?.assignedUserEmail===userEmail:detail?.account.assignedUserEmail===userEmail));
 const save=()=>inbound?m.mutate({action:'inbound_register',id:crypto.randomUUID(),inboundId:inbound.id,category:responseCategory,summary:responseSummary.trim(),otherDetail:responseCategory==='other'?responseOther.trim():null,confirmDoNotContact:responseCategory==='do_not_contact'?confirmGlobalBlock:undefined}):m.mutate({action:'response_create',id:crypto.randomUUID(),accountId:String(detail!.account.id),leadId:responseContext||null,contactId:responseContact||null,channel:responseChannel,recipient:responseDestination.trim(),recipientName:responseRecipient.trim(),destination:responseDestination.trim()||null,linkedMessageId:responseLinkedMessageId||null,category:responseCategory,summary:responseSummary.trim(),exactText:responseText.trim()||null,otherDetail:responseCategory==='other'?responseOther.trim():null,confirmDoNotContact:responseCategory==='do_not_contact'?confirmGlobalBlock:undefined,closeLeadIds:responseCategory==='do_not_contact'?closeLeadIds:undefined,reminder:responseCategory==='later'&&createReminder?{dueDate:reminderDate,assignedUserEmail:admin?(reminderAssignee||reminderLead?.assignedUserEmail||detail!.account.assignedUserEmail):null}:null});
 return <Dialog open={!!request} onOpenChange={open=>{if(!m.isPending&&!open)onClose()}}><DialogContent><DialogHeader><DialogTitle>Registrar respuesta recibida</DialogTitle><DialogDescription>Guardá lo que respondió la persona; esto no envía mensajes ni cambia la etapa de la gestión.</DialogDescription></DialogHeader><div className={styles.panel}>
  {inbound&&<p role="note">Registrás el {inboundNoun(inbound.channel)} recibido de {inbound.fromName||inbound.fromAddress} del {formatDateTime(inbound.receivedAt)}.</p>}
  <label>¿Sobre qué gestión?<NativeSelect value={responseContext} onChange={e=>setResponseContext(e.target.value)}><option value="">Ninguna (todo el negocio)</option>{detail?.opportunities.filter(o=>!o.deletedAt).map(o=><option key={o.id} value={o.id}>{o.opportunityName||'Gestión #'+o.id}{o.id===leadId?' · actual':''}</option>)}</NativeSelect></label>
  <label>¿Por dónde?<NativeSelect value={responseChannel} onChange={e=>{setResponseChannel(e.target.value as Channel);setResponseDestination('')}}>{[['email','Email'],['whatsapp','WhatsApp'],['call','Llamada'],['social','Red social'],['other','Otro']].map(([v,l])=><option key={v} value={v}>{l}</option>)}</NativeSelect></label>
  <label>¿De quién vino? (opcional)<NativeSelect value={responseContact} onChange={e=>{const value=e.target.value;setResponseContact(value);const contact=detail?.contacts.find(c=>String(c.id)===value);if(contact){setResponseRecipient(contact.name);setResponseDestination(responseChannel==='email'?contact.email??'':contact.phone??'')}else{setResponseRecipient(detail?.account.nombre??'');setResponseDestination(responseChannel==='email'?detail?.account.email??'':detail?.account.telefono??'')}}}><option value="">El negocio (no sé quién)</option>{detail?.contacts.filter(c=>!c.deletedAt).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</NativeSelect></label>
  <label>Nombre de quien respondió<Input value={responseRecipient} onChange={e=>setResponseRecipient(e.target.value)} placeholder="Ej.: Marta, o el nombre del negocio"/></label>
  <label>Desde dónde respondió (opcional)<Input value={responseDestination} onChange={e=>setResponseDestination(e.target.value)} placeholder="Ej.: su email, teléfono o usuario"/></label>
  <label>¿Responde a un mensaje que mandaste? (opcional)<NativeSelect value={responseLinkedMessageId} onChange={e=>{const value=e.target.value;setResponseLinkedMessageId(value);const message=data.messages.find(msg=>msg.id===value);if(message){setResponseContact(message.contactId??'');setResponseRecipient(message.recipientName||message.recipient);setResponseDestination(message.recipient)}}}><option value="">No, es una respuesta nueva</option>{data.messages.filter(msg=>!['draft','cancelled'].includes(msg.status)&&(!responseContext||String(msg.leadId??'')===responseContext)&&String(msg.contactId??'')===responseContact).map(msg=><option key={msg.id} value={msg.id}>{channelLabel(msg.channel)} · {msg.recipientName||msg.recipient} · {formatDay(msg.createdAt)}</option>)}</NativeSelect></label>
  <label>¿Qué respondió?<NativeSelect value={responseCategory} onChange={e=>{setResponseCategory(e.target.value as ResponseCategory);setConfirmGlobalBlock(false);setCloseLeadIds([]);setCreateReminder(false);setReminderDate('')}}>{responseCategoryOptions().map(([v,l])=><option key={v} value={v} disabled={v==='do_not_contact'&&!canRecordDnc}>{l}</option>)}</NativeSelect></label>{!canRecordDnc&&<p role="note" data-testid="dnc-record-denied">{DO_NOT_CONTACT_RECORD_DENIED}</p>}
  {responseCategory==='later'&&<><label><DisabledTooltip disabled={!canCreateReminder} reason={dncLocked?DO_NOT_CONTACT_READ_ONLY:'Solo el responsable del contexto o un administrador puede crear este recordatorio.'}><input type="checkbox" disabled={!canCreateReminder} checked={createReminder} onChange={e=>setCreateReminder(e.target.checked)}/></DisabledTooltip> Crear recordatorio para retomar</label>{!canCreateReminder&&<p>{dncLocked?DO_NOT_CONTACT_READ_ONLY:'Solo el responsable del contexto o un administrador puede crear el recordatorio.'} Podés guardar la respuesta igualmente.</p>}{createReminder&&canCreateReminder&&<><label>Fecha del recordatorio<Input type="date" value={reminderDate} onChange={e=>setReminderDate(e.target.value)}/></label>{admin&&<label>Asignada a<NativeSelect value={reminderAssignee||reminderLead?.assignedUserEmail||detail?.account.assignedUserEmail||''} onChange={e=>setReminderAssignee(e.target.value)}>{detail?.users?.map(u=><option key={u.email} value={u.email}>{userLabel(detail?.users,u.email)}</option>)}</NativeSelect></label>}<p>Se asignará por defecto al responsable del {responseContext?'contexto':'negocio'}.</p></>}</>}
  {responseCategory==='other'&&<label>Aclaración (contame)<Input value={responseOther} onChange={e=>setResponseOther(e.target.value)} placeholder="Ej.: Está de viaje hasta fin de mes"/></label>}
  <label>¿Qué te dijo? Resumen (obligatorio)<Input value={responseSummary} onChange={e=>setResponseSummary(e.target.value)} placeholder="Ej.: Le interesa y pidió que lo llame el lunes"/></label>
  <label>Texto exacto (opcional)<Input value={responseText} onChange={e=>setResponseText(e.target.value)} placeholder="Ej.: «Mandame el precio por mail»"/></label>
  {responseCategory==='do_not_contact'&&<>
   <p>No vas a poder mandarle mensajes ni llamarlo desde el CRM. Si cerrás todas sus gestiones abiertas, el negocio queda archivado. Podés elegir qué gestiones cerrar; ninguna viene marcada.</p>
   {data.openManagements.length>0&&<fieldset><legend>Gestiones abiertas · ninguna seleccionada inicialmente</legend>{data.openManagements.map(item=><label key={item.id}><DisabledTooltip disabled={!item.canClose||m.isPending} reason={m.isPending?'Se está guardando la respuesta. Esperá a que termine.':'Solo la persona responsable de esta gestión o un administrador puede cerrarla.'}><input type="checkbox" disabled={!item.canClose||m.isPending} checked={closeLeadIds.includes(String(item.id))} onChange={e=>setCloseLeadIds(ids=>e.target.checked?[...ids,String(item.id)]:ids.filter(id=>id!==String(item.id)))}/></DisabledTooltip>{item.opportunityName||`Gestión #${item.id}`} · {stageLabel(item.estado??'')}{item.canClose?'':' · Solo su responsable o un administrador puede cerrarla'}</label>)}</fieldset>}
   <label><input type="checkbox" checked={confirmGlobalBlock} onChange={e=>setConfirmGlobalBlock(e.target.checked)}/> Confirmo que no se le va a poder contactar desde el CRM.</label>
  </>}
  {m.error&&<p role="alert">{m.error.message}</p>}
  <DialogFooter><Button variant="outline" disabled={m.isPending} disabledReason="La operación está en curso. Esperá a que termine para continuar." onClick={onClose}>Cancelar</Button><Button disabled={!responseSummary.trim()||!responseRecipient.trim()||m.isPending||(responseCategory==='other'&&!responseOther.trim())||(responseCategory==='do_not_contact'&&!confirmGlobalBlock)||(responseCategory==='later'&&createReminder&&!reminderDate)} disabledReason={m.isPending?'La operación está en curso. Esperá a que termine para continuar.':'Completá el nombre, el resumen y las confirmaciones que pide la pantalla.'} onClick={save}>{m.isPending?'Guardando respuesta…':'Guardar respuesta'}</Button></DialogFooter>
 </div></DialogContent></Dialog>;
}
