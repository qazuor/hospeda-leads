import React,{useEffect,useMemo,useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {useMutation,useQueryClient} from '@tanstack/react-query';
import {Dialog,DialogContent,DialogDescription,DialogFooter,DialogHeader,DialogTitle} from './Dialog';
import {Button} from './Button';
import {NativeSelect} from './NativeSelect';
import {Input} from './Input';
import {MessageComposer} from './MessageComposer';
import {postCommunication,type PreparedMessage} from '../endpoints/communication.schema';
import {templateCompatibility,orderTemplatesBySpecificity} from '../helpers/messageTemplatePolicy';
import {useAuth} from '../helpers/useAuth';
import {canModifyBusiness} from '../helpers/crmPermissions';
import {getCommunication} from '../endpoints/communication.schema';
import {messageLabels} from '../helpers/messageLabels';
import styles from './Communication.module.css';

type Data={account:{id:string|number;nombre:string;email:string|null;telefono:string|null;whatsapp:string|null;tipo:string|null;status:string;archivedAt:Date|string|null;recontactAt:Date|string|null;doNotContact:boolean;isClient:boolean;assignedUserEmail:string|null};contacts:{id:string|number;name:string;email:string|null;phone:string|null;deletedAt:Date|string|null}[]};
type Template={id:string|number;channel:string;name:string;subject:string|null;body:string;vertical:string|null;managementType:string|null;commercialProfile:string|null;active?:boolean};
const purposeOptions=[['verification','Verificar el negocio'],['first_contact','Presentación / primer contacto'],['resume','Retomar conversación'],['relationship','Relación y novedades'],['care','Acompañamiento / atención al cliente'],['operations','Coordinación operativa'],['other','Otro']];
type Purpose='verification'|'first_contact'|'resume'|'relationship'|'care'|'operations'|'other';
export function GeneralContactDialog({detail,templates,onClose}:{detail:Data;templates:Template[];onClose:()=>void}){
 const {authState}=useAuth(),user=authState.type==='authenticated'?authState.user:undefined,allowed=canModifyBusiness(user,detail.account),qc=useQueryClient();
 const history=useQuery({queryKey:['communication','account',String(detail.account.id)],queryFn:()=>getCommunication('',String(detail.account.id))});
 const [channel,setChannel]=useState<'email'|'whatsapp'>('email'),[contactId,setContactId]=useState(''),[purpose,setPurpose]=useState<Purpose>(detail.account.status==='new'?'verification':'first_contact'),[otherPurpose,setOtherPurpose]=useState(''),[templateId,setTemplateId]=useState(''),[confirmedClient,setConfirmedClient]=useState(false),[message,setMessage]=useState<PreparedMessage|null>(null);
 const candidates=useMemo(()=>detail.contacts.filter(c=>!c.deletedAt&&String(channel==='email'?c.email:c.phone??'').trim()),[detail.contacts,channel]);
 useEffect(()=>{setContactId(candidates.length===1?String(candidates[0].id):'')},[candidates]);
 const applicable=orderTemplatesBySpecificity(templates.filter(t=>t.active!==false&&templateCompatibility(t,{channel,vertical:detail.account.tipo,commercialProfile:null})===null));
 const target=contactId?candidates.find(c=>String(c.id)===contactId):null;const businessTarget=channel==='email'?detail.account.email:(detail.account.whatsapp||detail.account.telefono);const canUseBusiness=!candidates.length&&!!businessTarget;
 const recipient=target?(channel==='email'?target.email:target.phone):businessTarget;
 const recent=history.data?.recentMessages.find(m=>((target?String(m.contactId??'')===String(target.id):!m.contactId&&String(m.recipient)===String(recipient))&&(m.channel===channel||target))&&!!m.lastInteractionAt&&Date.now()-new Date(m.lastInteractionAt).getTime()<(history.data?.recentContactHours??72)*3600000);
 const blocked=detail.account.doNotContact||!!detail.account.archivedAt;
 const prepare=useMutation({mutationFn:postCommunication,onSuccess:(v)=>{setMessage(v as PreparedMessage);void qc.invalidateQueries({queryKey:['communication']});}});
 const disabledReason=prepare.isPending?'La operación está en curso. Esperá a que termine para continuar.':!allowed?'Solo la persona responsable del negocio o un administrador puede preparar un contacto.':detail.account.doNotContact?'El negocio está marcado No contactar; un administrador debe levantar el bloqueo.':detail.account.archivedAt?'El negocio está archivado; un administrador debe desarchivarlo.':!contactId&&candidates.length>0?'Elegí la persona de contacto que recibirá este mensaje.':!contactId&&!canUseBusiness?'No hay un dato válido para este canal. Agregá el email o teléfono al negocio o a una persona.':purpose==='other'&&!otherPurpose.trim()?'Escribí la aclaración del propósito.':purpose==='care'&&!detail.account.isClient&&!confirmedClient?'Confirmá que el negocio se marcará como Cliente cuando registres el contacto como realizado.':'';
 const start=()=>{if(!user||!allowed)return;prepare.mutate({action:'prepare_general',id:crypto.randomUUID(),accountId:String(detail.account.id),leadId:null,contactId:contactId||null,channel,purpose,otherPurpose:purpose==='other'?otherPurpose:null,templateId:templateId||null})};
 return <Dialog open onOpenChange={open=>{if(!open)onClose()}}><DialogContent><DialogHeader><DialogTitle>Contacto general</DialogTitle><DialogDescription>{detail.account.nombre} · sin asociar a una gestión</DialogDescription></DialogHeader>
  {!message?<div className={styles.generalForm}>
   <label>Canal<NativeSelect value={channel} onChange={e=>{setChannel(e.target.value as typeof channel);setTemplateId('')}}><option value="email">Email · Brevo</option><option value="whatsapp">WhatsApp</option></NativeSelect></label>
   {detail.account.status==='recontact'&&detail.account.recontactAt&&<p>Fecha sugerida de recontacto: {new Date(detail.account.recontactAt).toLocaleDateString('es-AR')}. Podés contactar antes si hace falta.</p>}
   {recent&&<p role="status"><strong>Contacto reciente</strong> · {new Date(recent.lastInteractionAt!).toLocaleString('es-AR')} · {recent.channel} · {messageLabels[recent.status]??recent.status}. Revisalo antes de iniciar otro.</p>}
   <label>Persona de contacto<NativeSelect value={contactId} onChange={e=>setContactId(e.target.value)}><option value="">{candidates.length?'Elegí una persona':'Usar el dato general del negocio'}</option>{candidates.map(c=><option key={c.id} value={String(c.id)}>{c.name} · {channel==='email'?c.email:c.phone}</option>)}</NativeSelect></label>
   {canUseBusiness&&<p>Destinatario: {businessTarget} · negocio</p>}{!candidates.length&&!businessTarget&&<p role="alert">No hay un dato válido para este canal. Agregalo a la ficha del negocio o a una persona.</p>}
   <label>Propósito<NativeSelect value={purpose} onChange={e=>{setPurpose(e.target.value as Purpose);setConfirmedClient(false)}}>{purposeOptions.filter(([key])=>detail.account.status==='new'?key==='verification':key!=='verification').map(([key,label])=><option key={key} value={key}>{label}</option>)}</NativeSelect></label>
   {purpose==='other'&&<label>Aclaración<Input value={otherPurpose} onChange={e=>setOtherPurpose(e.target.value)} /></label>}
   {purpose==='care'&&!detail.account.isClient&&<label><input type="checkbox" checked={confirmedClient} onChange={e=>setConfirmedClient(e.target.checked)}/> Si registrás el contacto como realizado, se marcará Es cliente. ¿Continuar?</label>}
   <label>Mensaje modelo (opcional)<NativeSelect value={templateId} onChange={e=>setTemplateId(e.target.value)}><option value="">Escribir desde cero</option>{applicable.map(t=><option key={t.id} value={String(t.id)}>{t.name}{t.managementType?` · ${t.managementType}`:t.vertical?` · ${t.vertical}`:''}</option>)}</NativeSelect></label>
   {blocked&&<p role="alert">{detail.account.doNotContact?'No contactar bloquea todos los canales.':'El negocio está archivado y requiere desarchivo administrativo.'}</p>}
   {prepare.error&&<p role="alert">{prepare.error.message}</p>}
   <Button disabled={!allowed||blocked||prepare.isPending||(!contactId&&candidates.length>0)||(!contactId&&!canUseBusiness)||(purpose==='other'&&!otherPurpose.trim())||(purpose==='care'&&!detail.account.isClient&&!confirmedClient)} disabledReason={disabledReason} onClick={start}>{prepare.isPending?'Preparando borrador…':'Preparar mensaje'}</Button>
  </div>:<MessageComposer initial={message} onChange={setMessage}/ >}
  <DialogFooter><Button variant="outline" disabled={prepare.isPending} disabledReason="La operación está en curso. Esperá a que termine para continuar." onClick={onClose}>Cerrar</Button></DialogFooter></DialogContent></Dialog>;
}
