import React,{useEffect,useMemo,useState} from 'react';
import {useQuery,useMutation,useQueryClient} from '@tanstack/react-query';
import {Dialog,DialogContent,DialogDescription,DialogFooter,DialogHeader,DialogTitle} from './Dialog';
import {Button} from './Button';
import {NativeSelect} from './NativeSelect';
import {MessageComposer} from './MessageComposer';
import {postCommunication,getCommunication,type PreparedMessage} from '../endpoints/communication.schema';
import {templateCompatibility,orderTemplatesBySpecificity} from '../helpers/messageTemplatePolicy';
import {useAuth} from '../helpers/useAuth';
import {canModifyBusiness} from '../helpers/crmPermissions';
import {confirmSendBlockReason} from '../helpers/communicationRecipient';
import {messageLabels} from '../helpers/messageLabels';
import {formatDate,formatDateTime} from '../helpers/crmDates';
import {userLabel} from '../helpers/crmLabels';
import type {ContactPurpose} from '../helpers/contactPurpose';
import {OutcomeAfterContact,leaveWithoutOutcome} from './OutcomeAfterContact';
import {useUnsavedChanges} from './UnsavedChanges';
import {canLogContactOutcome} from '../helpers/contactOutcome';
import {VOCAB} from '../content/vocabulary';
import styles from './Communication.module.css';
import {PersonPhoneDncNotice} from './PersonPhoneDncWarning';

type Data={account:{id:string|number;nombre:string;email:string|null;telefono:string|null;whatsapp:string|null;tipo:string|null;status:string;archivedAt:Date|string|null;recontactAt:Date|string|null;doNotContact:boolean;isClient:boolean;assignedUserEmail:string|null};contacts:{id:string|number;name:string;email:string|null;phone:string|null;deletedAt:Date|string|null;dncPhoneBusinesses?:{nombre:string;ciudad:string|null}[]}[];users?:{email:string;displayName:string}[]};
type Template={id:string|number;channel:string;name:string;subject:string|null;body:string;vertical:string|null;managementType:string|null;commercialProfile:string|null;active?:boolean};
/**
 * Email or WhatsApp for a business without a management (the "Sin gestión" case of the Contactar dialog). The purpose comes already chosen.
 * A used message chains into "¿Cómo salió?" → "¿Cómo sigue?" (decision 2B); `onFinished` closes the whole contact flow afterwards; with `onLog` (a task's own completion path) it hands over to the task instead.
 */
export function GeneralMessageStep({detail,templates,channel,purpose,onClose,onFinished,onLog}:{detail:Data;templates:Template[];channel:'email'|'whatsapp';purpose:{purpose:ContactPurpose;otherPurpose:string};onClose:()=>void;onFinished?:()=>void;onLog?:(contactId:string,channel:string)=>void}){
 const {authState}=useAuth(),user=authState.type==='authenticated'?authState.user:undefined,allowed=canModifyBusiness(user,detail.account),qc=useQueryClient(),chainOutcome=!onLog;
 const history=useQuery({queryKey:['communication','account',String(detail.account.id)],queryFn:()=>getCommunication('',String(detail.account.id))});
 const [contactId,setContactId]=useState(''),[templateId,setTemplateId]=useState(''),[message,setMessage]=useState<PreparedMessage|null>(null);
 const candidates=useMemo(()=>detail.contacts.filter(c=>!c.deletedAt&&String(channel==='email'?c.email:c.phone??'').trim()),[detail.contacts,channel]);
 useEffect(()=>{setContactId(candidates.length===1?String(candidates[0].id):'')},[candidates]);
 const applicable=orderTemplatesBySpecificity(templates.filter(t=>t.active!==false&&templateCompatibility(t,{channel,vertical:detail.account.tipo,commercialProfile:null})===null));
 const target=contactId?candidates.find(c=>String(c.id)===contactId):null;const businessTarget=channel==='email'?detail.account.email:(detail.account.whatsapp||detail.account.telefono);const canUseBusiness=!candidates.length&&!!businessTarget;
 const recipient=target?(channel==='email'?target.email:target.phone):businessTarget;
 const recent=history.data?.recentMessages.find(m=>((target?String(m.contactId??'')===String(target.id):!m.contactId&&String(m.recipient)===String(recipient))&&(m.channel===channel||target))&&!!m.lastInteractionAt&&Date.now()-new Date(m.lastInteractionAt).getTime()<(history.data?.recentContactHours??72)*3600000);
 const blocked=detail.account.doNotContact||!!detail.account.archivedAt;
 const prepare=useMutation({mutationFn:postCommunication,onSuccess:(v)=>{setMessage(v as PreparedMessage);void qc.invalidateQueries({queryKey:['communication']});}});
 const disabledReason=prepare.isPending?'La operación está en curso. Esperá a que termine para continuar.':!allowed?'Solo la persona responsable del negocio o un administrador puede preparar un contacto.':detail.account.doNotContact?'El negocio está marcado No contactar; un administrador debe levantar el bloqueo.':detail.account.archivedAt?'El negocio está archivado; un administrador debe desarchivarlo.':!contactId&&candidates.length>0?'Elegí la persona de contacto que recibirá este mensaje.':!contactId&&!canUseBusiness?'No hay un dato válido para este canal. Agregá el email o teléfono al negocio o a una persona.':'';
 const start=()=>{if(!user||!allowed||disabledReason)return;prepare.mutate({action:'prepare_general',id:crypto.randomUUID(),accountId:String(detail.account.id),leadId:null,contactId:contactId||null,channel,purpose:purpose.purpose,otherPurpose:purpose.purpose==='other'?purpose.otherPurpose:null,templateId:templateId||null})};
 const [outcome,setOutcome]=useState(false),[busy,setBusy]=useState(false),[dirty,setDirty]=useState(false);const pendingOutcome=chainOutcome&&!!message&&canLogContactOutcome(message.status);const finish=onFinished??onClose;
 const leaveGuard=useUnsavedChanges(pendingOutcome&&!dirty,onClose,busy,leaveWithoutOutcome(message?.status));
 // The server rechecks this; here "Sí, se envió" just stays off while the business, the management or the person cannot be contacted.
 const sentBlock=message?(history.data?confirmSendBlockReason({account:detail.account,message,restrictions:history.data.activeRestrictions??history.data.restrictions,openManagementIds:history.data.openManagements?.map(o=>o.id)}):'Cargando las restricciones de contacto…'):'';
 if(outcome&&message)return <OutcomeAfterContact contact={{accountId:String(message.accountId),leadId:null,contactIds:message.contactId?[String(message.contactId)]:[],channel:message.channel,purpose:message.purpose,messageId:message.id,messageStatus:message.status}} onDone={finish}/>;
 return <Dialog open onOpenChange={open=>{if(!open&&!busy&&!prepare.isPending)leaveGuard.requestClose()}}><DialogContent><DialogHeader><DialogTitle>{channel==='email'?'Preparar email':'Preparar WhatsApp'}</DialogTitle><DialogDescription>{detail.account.nombre} · sin gestión · {VOCAB.businessOwner}: {userLabel(detail.users,detail.account.assignedUserEmail)}</DialogDescription></DialogHeader>
  {!message?<div className={styles.generalForm}>
   {detail.account.status==='recontact'&&detail.account.recontactAt&&<p>Fecha sugerida de recontacto: {formatDate(detail.account.recontactAt)}. Podés contactar antes si hace falta.</p>}
   {recent&&<p role="status"><strong>Contacto reciente</strong> · {formatDateTime(recent.lastInteractionAt!)} · {recent.channel} · {messageLabels[recent.status]??recent.status}. Revisalo antes de iniciar otro.</p>}
   <label>Persona de contacto<NativeSelect value={contactId} onChange={e=>setContactId(e.target.value)}><option value="">{candidates.length?'Elegí una persona':'Usar el dato general del negocio'}</option>{candidates.map(c=><option key={c.id} value={String(c.id)}>{c.name} · {channel==='email'?c.email:c.phone}</option>)}</NativeSelect></label>
   {channel==='whatsapp'&&<PersonPhoneDncNotice businesses={target?.dncPhoneBusinesses}/>}
   {canUseBusiness&&<p>Destinatario: {businessTarget} · negocio</p>}{!candidates.length&&!businessTarget&&<p role="alert">No hay un dato válido para este canal. Agregalo a la ficha del negocio o a una persona.</p>}
   <label>Mensaje modelo (opcional)<NativeSelect value={templateId} onChange={e=>setTemplateId(e.target.value)}><option value="">Escribir desde cero</option>{applicable.map(t=><option key={t.id} value={String(t.id)}>{t.name}{t.managementType?` · ${t.managementType}`:t.vertical?` · ${t.vertical}`:''}</option>)}</NativeSelect></label>
   {blocked&&<p role="alert">{detail.account.doNotContact?'No contactar bloquea todos los canales.':'El negocio está archivado y requiere desarchivo administrativo.'}</p>}
   {prepare.error&&<p role="alert">{prepare.error.message}</p>}
   <Button disabled={!!disabledReason} disabledReason={disabledReason} onClick={start}>{prepare.isPending?'Preparando borrador…':'Preparar mensaje'}</Button>
  </div>:<MessageComposer initial={message} onChange={setMessage} onDirtyChange={setDirty} onBusyChange={setBusy} hideWhatsAppResolution={chainOutcome} sentBlockReason={sentBlock}/>}
  <DialogFooter>{pendingOutcome&&<Button disabled={dirty||busy} disabledReason={busy?'La operación está en curso. Esperá a que termine para continuar.':'Guardá o descartá los cambios pendientes antes de continuar.'} onClick={()=>setOutcome(true)}>{VOCAB.logOutcome}</Button>}{onLog&&message&&!['draft','cancelled','submitting'].includes(message.status)&&<Button disabled={dirty||busy} disabledReason={busy?'La operación está en curso. Esperá a que termine para continuar.':'Guardá o descartá los cambios pendientes antes de continuar.'} onClick={()=>onLog(message.contactId??'',message.channel)}>{VOCAB.logWhatHappened}</Button>}<Button variant="outline" disabled={prepare.isPending||busy} disabledReason="La operación está en curso. Esperá a que termine para continuar." onClick={leaveGuard.requestClose}>Cerrar</Button></DialogFooter></DialogContent>{leaveGuard.confirmation}</Dialog>;
}
