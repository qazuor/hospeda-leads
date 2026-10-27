import {useState} from 'react';
import {useQueryClient} from '@tanstack/react-query';
import {Reply} from 'lucide-react';
import {postCommunication,type CommunicationResponse,type Message} from '../../endpoints/communication.schema';
import {useGuardedMutation} from '../../helpers/useGuardedMutation';
import {crmSuccess} from '../../helpers/crmFeedback';
import {formatDateTime,formatTime} from '../../helpers/crmDates';
import {actorLabel} from '../../helpers/crmLabels';
import {clampLinesFor,timelineDomId,type CallEntry,type ReceivedEntry,type ResponseEntry,type SentEntry,type TimelineEntry} from '../../helpers/communicationTimeline';
import {Button} from '../Button';
import {Input} from '../Input';
import {DialogFooter} from '../Dialog';
import {CrmDialog} from '../ui/CrmDialog';
import {InboundMessageActions} from '../InboundMessageActions';
import {AutoRegistrationVoidDialog,canVoidAutoRegistration} from '../AutoRegistrationVoid';
import {ManualAttemptResolution} from '../ManualAttemptResolution';
import {InteractionCorrectionForm} from '../InteractionCorrectionForm';
import {ResponseCorrectionForm} from '../ResponseCorrectionForm';
import {SentMaterials,canRevokeMaterialLink} from '../MessageMaterials';
import {ChannelIcon} from './ChannelIcon';
import {ClampedText} from './ClampedText';
import {ConfirmSendButtons,canConfirmSend} from './ConfirmSendButtons';
import {ItemMenu,type ItemAction} from './ItemMenu';
import type {CommunicationView} from './types';
import styles from './CommunicationView.module.css';

/** An admin resolves an email whose provider result is unknown, or one stuck submitting for more than 15 minutes. */
export const isUncertainEmail=(message:Pick<Message,'channel'|'status'|'updatedAt'>,now=Date.now()):boolean=>message.channel==='email'&&(message.status==='unknown'||message.status==='submitting'&&new Date(message.updatedAt).getTime()<now-15*60*1000);

/** «Marcar como enviado / no enviado» for an uncertain email (admin only); requires what was checked and never resends. */
function UncertainEmailActions({message}:{message:Message}){
 const qc=useQueryClient();
 const [target,setTarget]=useState<'sent'|'not_sent'|null>(null),[reason,setReason]=useState('');
 const m=useGuardedMutation({mutationFn:postCommunication,onSuccess:()=>{for(const queryKey of [['communication'],['work'],['global-journal'],['lead-journal']])void qc.invalidateQueries({queryKey});setTarget(null);setReason('');crmSuccess('Resultado actualizado')}});
 return <>
  <Button size="sm" disabled={m.isPending} onClick={()=>{setReason('');setTarget('sent')}}>Marcar como enviado</Button>
  <Button size="sm" variant="outline" disabled={m.isPending} onClick={()=>{setReason('');setTarget('not_sent')}}>Marcar como no enviado</Button>
  <CrmDialog opened={!!target} onClose={()=>{if(!m.isPending)setTarget(null)}} title={target==='sent'?'Marcar como enviado':'Marcar como no enviado'} description={target==='sent'?'Confirmás que el proveedor aceptó el email. La entrega todavía no queda confirmada.':'Confirmás que el proveedor no aceptó el email. No se enviará automáticamente.'} busy={m.isPending}>
   <label>Qué revisaste<Input autoFocus value={reason} onChange={e=>setReason(e.target.value)} maxLength={500}/></label>{m.error&&<p role="alert">{m.error.message}</p>}
   <DialogFooter><Button variant="outline" disabled={m.isPending} onClick={()=>setTarget(null)}>Cancelar</Button><Button disabled={reason.trim().length<10||m.isPending} onClick={()=>target&&m.mutate({action:'email_resolve_uncertain',id:crypto.randomUUID(),messageId:message.id,outcome:target,reason:reason.trim()})}>{m.isPending?'Guardando…':'Guardar resultado'}</Button></DialogFooter>
  </CrmDialog>
 </>;
}

/** «Ver diseño del email»: the sent email as designed (sandboxed, no scripts), opened from the «⋯» menu. */
function EmailDesignDialog({message,open,onClose}:{message:Message;open:boolean;onClose:()=>void}){
 return <CrmDialog opened={open} onClose={onClose} title={message.subject||'Email enviado'} description={`Así se presentó el email a ${message.recipientName||message.recipient} el ${formatDateTime(message.lastInteractionAt??message.createdAt)}.`}>
  <iframe sandbox="" title="Vista previa del email" srcDoc={message.htmlBody??''} className={styles.emailPreview}/>
  <DialogFooter><Button variant="outline" onClick={onClose}>Cerrar</Button></DialogFooter>
 </CrmDialog>;
}

/** What was registered for a response: summary, exact text and who registered it. */
const responseNote=(view:CommunicationView,response:CommunicationResponse)=>[response.summary,response.exactText?`“${response.exactText}”`:'',actorLabel(response.actorEmail,view.detail?.users)].filter(Boolean).join(' · ');
/** «Corregir respuesta» is for its author or an admin, never on an archived business for a seller (decision 1C). */
const canCorrectResponse=(view:CommunicationView,response:CommunicationResponse)=>!view.archivedReadOnly&&(view.admin||response.actorEmail===view.userEmail);

/** State of the forms and dialogs a «⋯» menu opens; they render outside the menu, so closing it never unmounts them. */
function useItemPanels(){
 const [correcting,setCorrecting]=useState(false),[voiding,setVoiding]=useState(false),[design,setDesign]=useState(false);
 return {correcting,setCorrecting,voiding,setVoiding,design,setDesign};
}
type Panels=ReturnType<typeof useItemPanels>;

/** Secondary actions of a sent message or call (spec 91 §3): see the email design, correct a manual result, void an automatic registration. */
function messageActions(view:CommunicationView,message:Message,panels:Panels):ItemAction[]{
 const own=view.admin||message.ownerEmail===view.userEmail;
 const correct=['manual_sent','manual_no_contact','manual_not_done'].includes(message.status)&&own;
 const canVoid=!!message.autoRegistrationId&&canVoidAutoRegistration({readOnly:view.readOnly,canWrite:view.canWrite,admin:view.admin,userEmail:view.userEmail,registrationId:message.autoRegistrationId,registrationUserEmail:message.autoRegistrationUserEmail,status:message.status});
 return [
  ...(message.channel==='email'&&message.htmlBody?[{label:'Ver diseño del email',onSelect:()=>panels.setDesign(true)}]:[]),
  ...(correct?[{label:'Corregir cómo salió o el resumen',onSelect:()=>panels.setCorrecting(true)}]:[]),
  ...(canVoid?[{label:'Anular registro',onSelect:()=>panels.setVoiding(true)}]:[]),
 ];
}

/** The forms and dialogs of a sent message or call, opened from its «⋯» menu. */
function MessagePanels({message,panels}:{message:Message;panels:Panels}){
 return <>
  {panels.correcting&&<div className={styles.inlineForm}><InteractionCorrectionForm message={message} onDone={()=>panels.setCorrecting(false)}/><Button size="sm" variant="ghost" onClick={()=>panels.setCorrecting(false)}>Cancelar corrección</Button></div>}
  {message.autoRegistrationId&&<AutoRegistrationVoidDialog registrationId={message.autoRegistrationId} open={panels.voiding} onClose={()=>panels.setVoiding(false)}/>}
  {message.channel==='email'&&!!message.htmlBody&&<EmailDesignDialog message={message} open={panels.design} onClose={()=>panels.setDesign(false)}/>}
 </>;
}

/** Spec 91 §1: channel and label, sender, time and the management chip only when there is one, above the bubble. */
function Meta({entry,sender}:{entry:TimelineEntry;sender:string}){
 return <div className={styles.meta}>
  <span className={styles.channel} data-channel={entry.channel}><ChannelIcon channel={entry.channel} size={14}/>{entry.channelLabel}</span>
  <span aria-hidden="true">·</span><strong>{sender}</strong><span aria-hidden="true">·</span><time dateTime={entry.at.toISOString()}>{formatTime(entry.at)}</time>
  {entry.managementId!=null&&<span className={styles.context}>{entry.context}</span>}
 </div>;
}

/** Follow-up actions that stay visible: a pending attempt, an uncertain email (admin) and «¿Lo enviaste?» for an opened WhatsApp. */
function PendingActions({view,message}:{view:CommunicationView;message:Message}){
 const own=view.admin||message.ownerEmail===view.userEmail;
 const uncertain=view.admin&&isUncertainEmail(message),pending=!view.readOnly&&message.status==='manual_pending'&&own,confirm=canConfirmSend({view,message});
 if(!uncertain&&!pending&&!confirm)return null;
 return <div className={styles.itemActions}>
  {uncertain&&<UncertainEmailActions message={message}/>}
  {pending&&<ManualAttemptResolution key={message.id+'-resolution'} message={message}/>}
  {confirm&&<ConfirmSendButtons view={view} message={message} size="sm"/>}
 </div>;
}

/** Spec 89 §8.4: the sales material sent with a message and «Revocar enlace» for its author, the responsibles or an admin (also under No contactar). */
function MessageMaterialRecord({view,message}:{view:CommunicationView;message:Message}){
 if(message.status==='draft'||!message.materials?.length)return null;
 const managementOwner=message.leadId==null?null:view.detail?.opportunities.find(o=>String(o.id)===String(message.leadId))?.assignedUserEmail;
 return <SentMaterials materials={message.materials} message={message} users={view.detail?.users} canRevoke={x=>canRevokeMaterialLink({admin:view.admin,userEmail:view.userEmail,authorEmail:x.createdByEmail,businessOwnerEmail:view.detail?.account.assignedUserEmail,managementOwnerEmail:managementOwner})}/>;
}

type ItemProps<T>={view:CommunicationView;entry:T;highlighted:boolean};
/** Every row can be scrolled to and briefly highlighted from «Requiere acción» (spec 91 §9). */
const rowProps=(entry:TimelineEntry,highlighted:boolean)=>({id:timelineDomId(entry.key),tabIndex:-1,'data-highlight':highlighted||undefined});

function Received({view,entry,highlighted}:ItemProps<ReceivedEntry>){
 const item=entry.inbound,panels=useItemPanels(),label=`${entry.channelLabel} recibido de ${entry.sender}`;
 const correct=!!entry.response&&canCorrectResponse(view,entry.response);
 const canVoid=canVoidAutoRegistration({readOnly:view.readOnly,canWrite:view.canWrite,admin:view.admin,userEmail:view.userEmail,registrationId:item.autoRegistrationId,registrationUserEmail:item.autoRegistrationUserEmail,status:item.status});
 const actions:ItemAction[]=[...(correct?[{label:'Corregir respuesta',onSelect:()=>panels.setCorrecting(true)}]:[]),...(canVoid?[{label:'Anular registro',onSelect:()=>panels.setVoiding(true)}]:[])];
 return <div className={styles.row} data-side="in" data-voided={item.status==='voided'||undefined} {...rowProps(entry,highlighted)}><article className={styles.bubbleWrap} aria-label={label}>
  <Meta entry={entry} sender={entry.sender}/>
  <div className={styles.bubbleLine}><div className={styles.bubble}>{entry.subject&&<strong className={styles.subject}>{entry.subject}</strong>}<ClampedText className={styles.text} text={entry.text||'Sin contenido'} lines={clampLinesFor(entry.channel)}/></div><ItemMenu label={label} actions={actions}/></div>
  {!!entry.tags.length&&<div className={styles.tags}>{entry.tags.map(tag=><span key={tag.kind} className={styles.tag} data-kind={tag.kind}>{tag.label}</span>)}</div>}
  {entry.response&&<p className={styles.note}>{responseNote(view,entry.response)}</p>}
  {entry.response&&panels.correcting&&<ResponseCorrectionForm response={entry.response} openManagements={view.data.openManagements} canRecordDnc={view.canRecordDnc} canLiftDnc={view.admin} onClose={()=>panels.setCorrecting(false)}/>}
  {/* Spec 91 §9: «Registrar respuesta» / «No es una respuesta» of a «Por revisar» message live on its bubble only. */}
  {item.status!=='voided'&&<div className={styles.itemActions}><InboundMessageActions item={item} readOnly={view.readOnly} canWrite={view.canWrite} onRegister={view.openResponse} replyStatus={view.replyStatus} showVoid={false}/></div>}
  {item.autoRegistrationId&&<AutoRegistrationVoidDialog registrationId={item.autoRegistrationId} open={panels.voiding} onClose={()=>panels.setVoiding(false)}/>}
 </article></div>;
}

function Sent({view,entry,highlighted}:ItemProps<SentEntry>){
 const panels=useItemPanels();
 // `data-tone` marks unconfirmed, not done or failed rows (dashed, muted) so they never look sent.
 return <div className={styles.row} data-side="out" data-tone={entry.tone} data-voided={entry.voided||undefined} {...rowProps(entry,highlighted)}><article className={styles.bubbleWrap} aria-label={entry.label}>
  <Meta entry={entry} sender={entry.sender}/>
  <div className={styles.bubbleLine}><div className={styles.bubble}>{entry.subject&&<strong className={styles.subject}>{entry.subject}</strong>}<ClampedText className={styles.text} text={entry.text||'Sin contenido registrado'} lines={clampLinesFor(entry.channel)}/></div><ItemMenu label={entry.label} actions={messageActions(view,entry.message,panels)}/></div>
  <span className={styles.status}>{entry.replyToInbound?'Respuesta al email recibido · ':''}{entry.status}</span>
  {entry.autoRegistered&&!entry.echo&&<div className={styles.tags}><span className={styles.tag} data-kind="auto_registered">Registrado automáticamente</span></div>}
  <MessageMaterialRecord view={view} message={entry.message}/>
  <PendingActions view={view} message={entry.message}/>
  <MessagePanels message={entry.message} panels={panels}/>
 </article></div>;
}

/** Spec 91 §4: a call as a slim centred line («Llamada · No atendió · Ana · 11:30»), its summary as a second muted line. */
function Call({view,entry,highlighted}:ItemProps<CallEntry>){
 const panels=useItemPanels(),label='Llamada registrada · '+entry.result;
 return <div className={styles.row} data-side="event" data-voided={entry.voided||undefined} {...rowProps(entry,highlighted)}><article className={styles.event} aria-label={label}>
  <div className={styles.eventLine}><ChannelIcon channel="call" size={14}/><span><strong>Llamada</strong> · {entry.result} · {entry.sender} · <time dateTime={entry.at.toISOString()}>{formatTime(entry.at)}</time></span><span className={styles.eventTail}>{entry.managementId!=null&&<span className={styles.context}>{entry.context}</span>}<ItemMenu label={label} actions={messageActions(view,entry.message,panels)}/></span></div>
  {entry.text&&<p className={styles.eventNote}>{entry.text}</p>}
  {entry.autoRegistered&&<div className={styles.tags}><span className={styles.tag} data-kind="auto_registered">Registrado automáticamente</span></div>}
  <PendingActions view={view} message={entry.message}/>
  <MessagePanels message={entry.message} panels={panels}/>
 </article></div>;
}

/** Spec 91 §4: a response without a message as a slim centred line, with what was registered as a second muted line. */
function ResponseEvent({view,entry,highlighted}:ItemProps<ResponseEntry>){
 const panels=useItemPanels();
 const actions:ItemAction[]=canCorrectResponse(view,entry.response)?[{label:'Corregir respuesta',onSelect:()=>panels.setCorrecting(true)}]:[];
 return <div className={styles.row} data-side="event" {...rowProps(entry,highlighted)}><article className={styles.event} aria-label={entry.text}>
  <div className={styles.eventLine}><Reply size={14} aria-hidden="true"/><span><strong>{entry.text}</strong> · {entry.channelLabel} · <time dateTime={entry.at.toISOString()}>{formatTime(entry.at)}</time></span><span className={styles.eventTail}>{entry.managementId!=null&&<span className={styles.context}>{entry.context}</span>}<ItemMenu label={entry.text} actions={actions}/></span></div>
  <p className={styles.eventNote}>{responseNote(view,entry.response)}</p>
  {panels.correcting&&<ResponseCorrectionForm response={entry.response} openManagements={view.data.openManagements} canRecordDnc={view.canRecordDnc} canLiftDnc={view.admin} onClose={()=>panels.setCorrecting(false)}/>}
 </article></div>;
}

/** One item of «Conversación»: received bubble (left), sent bubble (right), or a centred call / response-without-message line. */
export function ConversationItem({view,entry,highlighted=false}:{view:CommunicationView;entry:TimelineEntry;highlighted?:boolean}){
 switch(entry.kind){
  case 'received':return <Received view={view} entry={entry} highlighted={highlighted}/>;
  case 'sent':return <Sent view={view} entry={entry} highlighted={highlighted}/>;
  case 'call':return <Call view={view} entry={entry} highlighted={highlighted}/>;
  default:return <ResponseEvent view={view} entry={entry} highlighted={highlighted}/>;
 }
}
