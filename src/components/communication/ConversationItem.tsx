import {useState} from 'react';
import {useQueryClient} from '@tanstack/react-query';
import {Reply} from 'lucide-react';
import {postCommunication,type CommunicationResponse,type Message} from '../../endpoints/communication.schema';
import {useGuardedMutation} from '../../helpers/useGuardedMutation';
import {crmSuccess} from '../../helpers/crmFeedback';
import {formatDateTime,formatTime} from '../../helpers/crmDates';
import {actorLabel} from '../../helpers/crmLabels';
import type {CallEntry,ReceivedEntry,ResponseEntry,SentEntry,TimelineEntry} from '../../helpers/communicationTimeline';
import {Button} from '../Button';
import {Input} from '../Input';
import {DialogFooter} from '../Dialog';
import {CrmDialog} from '../ui/CrmDialog';
import {InboundMessageActions} from '../InboundMessageActions';
import {AutoRegistrationVoidButton,canVoidAutoRegistration} from '../AutoRegistrationVoid';
import {ManualAttemptResolution} from '../ManualAttemptResolution';
import {InteractionCorrectionForm} from '../InteractionCorrectionForm';
import {ResponseCorrectionForm} from '../ResponseCorrectionForm';
import {ChannelIcon} from './ChannelIcon';
import {ExpandableText} from './RequiresAction';
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

/** What was registered for a response (summary, exact text, who) and «Corregir respuesta» for its author or an admin. */
function ResponseDetails({view,response}:{view:CommunicationView;response:CommunicationResponse}){
 const [correcting,setCorrecting]=useState(false);
 const canCorrect=!view.archivedReadOnly&&(view.admin||response.actorEmail===view.userEmail);
 return <>
  <p className={styles.note}>{[response.summary,response.exactText?`“${response.exactText}”`:'',actorLabel(response.actorEmail,view.detail?.users)].filter(Boolean).join(' · ')}</p>
  {canCorrect&&(correcting?<ResponseCorrectionForm response={response} openManagements={view.data.openManagements} canRecordDnc={view.canRecordDnc} canLiftDnc={view.admin} onClose={()=>setCorrecting(false)}/>:<div className={styles.itemActions}><Button size="sm" variant="outline" onClick={()=>setCorrecting(true)}>Corregir respuesta</Button></div>)}
 </>;
}

/** «Corregir cómo salió o el resumen» as a text button that opens the correction form in place. */
function CorrectInteraction({message}:{message:Message}){
 const [open,setOpen]=useState(false);
 return open?<div className={styles.inlineForm}><InteractionCorrectionForm message={message} onDone={()=>setOpen(false)}/><Button size="sm" variant="ghost" onClick={()=>setOpen(false)}>Cancelar corrección</Button></div>:<Button size="sm" variant="ghost" aria-expanded={false} onClick={()=>setOpen(true)}>Corregir cómo salió o el resumen</Button>;
}

/** «Ver diseño del email»: the sent email as designed (sandboxed, no scripts), like the old message view. */
function EmailDesign({message}:{message:Message}){
 const [open,setOpen]=useState(false);
 if(message.channel!=='email'||!message.htmlBody)return null;
 return <><Button size="sm" variant="ghost" onClick={()=>setOpen(true)}>Ver diseño del email</Button>
  <CrmDialog opened={open} onClose={()=>setOpen(false)} title={message.subject||'Email enviado'} description={`Así se presentó el email a ${message.recipientName||message.recipient} el ${formatDateTime(message.lastInteractionAt??message.createdAt)}.`}>
   <iframe sandbox="" title="Vista previa del email" srcDoc={message.htmlBody} className={styles.emailPreview}/>
   <DialogFooter><Button variant="outline" onClick={()=>setOpen(false)}>Cerrar</Button></DialogFooter>
  </CrmDialog></>;
}

/** Follow-up actions of a sent message or call: resolve a pending attempt, correct a manual result, void an automatic registration. */
function MessageActions({view,message}:{view:CommunicationView;message:Message}){
 const own=view.admin||message.ownerEmail===view.userEmail;
 const uncertain=view.admin&&isUncertainEmail(message);
 const pending=!view.readOnly&&message.status==='manual_pending'&&own;
 const correct=['manual_sent','manual_no_contact','manual_not_done'].includes(message.status)&&own;
 const canVoid=!!message.autoRegistrationId&&canVoidAutoRegistration({readOnly:view.readOnly,canWrite:view.canWrite,admin:view.admin,userEmail:view.userEmail,registrationId:message.autoRegistrationId,registrationUserEmail:message.autoRegistrationUserEmail,status:message.status});
 const design=message.channel==='email'&&!!message.htmlBody;
 if(!uncertain&&!pending&&!correct&&!canVoid&&!design)return null;
 return <div className={styles.itemActions}>
  {design&&<EmailDesign message={message}/>}
  {uncertain&&<UncertainEmailActions message={message}/>}
  {pending&&<ManualAttemptResolution key={message.id+'-resolution'} message={message}/>}
  {correct&&<CorrectInteraction key={message.id+'-correction'} message={message}/>}
  {canVoid&&message.autoRegistrationId&&<AutoRegistrationVoidButton registrationId={message.autoRegistrationId}/>}
 </div>;
}

function Meta({entry,sender}:{entry:TimelineEntry;sender:string}){
 const channel=<span className={styles.channel} data-channel={entry.channel}><ChannelIcon channel={entry.channel}/>{entry.channelLabel}</span>;
 const context=<span className={styles.context}>{entry.context}</span>;
 return entry.kind==='sent'
  ?<div className={styles.meta}>{context}<strong>{sender}</strong><span aria-hidden="true">·</span>{channel}<span aria-hidden="true">·</span><time dateTime={entry.at.toISOString()}>{formatTime(entry.at)}</time></div>
  :<div className={styles.meta}>{channel}<span aria-hidden="true">·</span><strong>{sender}</strong><span aria-hidden="true">·</span><time dateTime={entry.at.toISOString()}>{formatTime(entry.at)}</time>{context}</div>;
}

function Received({view,entry}:{view:CommunicationView;entry:ReceivedEntry}){
 const item=entry.inbound;
 return <div className={styles.row} data-side="in" data-voided={item.status==='voided'||undefined}><article className={styles.bubbleWrap} aria-label={`${entry.channelLabel} recibido de ${entry.sender}`}>
  <Meta entry={entry} sender={entry.sender}/>
  <div className={styles.bubble}>{entry.subject&&<strong className={styles.subject}>{entry.subject}</strong>}<ExpandableText className={styles.text} text={entry.text||'Sin contenido'}/></div>
  {!!entry.tags.length&&<div className={styles.tags}>{entry.tags.map(tag=><span key={tag.kind} className={styles.tag} data-kind={tag.kind}>{tag.label}</span>)}</div>}
  {entry.response&&<ResponseDetails view={view} response={entry.response}/>}
  {/* «Por revisar» actions live in «Requiere acción»; here only reply and voiding for the rest. */}
  {item.status!=='pending_review'&&item.status!=='voided'&&<div className={styles.itemActions}><InboundMessageActions item={item} readOnly={view.readOnly} canWrite={view.canWrite} onRegister={view.openResponse} replyStatus={view.replyStatus}/></div>}
 </article></div>;
}

function Sent({view,entry}:{view:CommunicationView;entry:SentEntry}){
 // `data-tone` marks unconfirmed, not done or failed rows (dashed, muted) so they never look sent.
 return <div className={styles.row} data-side="out" data-tone={entry.tone} data-voided={entry.voided||undefined}><article className={styles.bubbleWrap} aria-label={entry.label}>
  <Meta entry={entry} sender={entry.sender}/>
  <div className={styles.bubble}>{entry.subject&&<strong className={styles.subject}>{entry.subject}</strong>}<p className={styles.text}>{entry.text||'Sin contenido registrado'}</p></div>
  <span className={styles.status}>{entry.replyToInbound?'Respuesta al email recibido · ':''}{entry.status}</span>
  {entry.autoRegistered&&!entry.echo&&<div className={styles.tags}><span className={styles.tag} data-kind="auto_registered">Registrado automáticamente</span></div>}
  <MessageActions view={view} message={entry.message}/>
 </article></div>;
}

function Call({view,entry}:{view:CommunicationView;entry:CallEntry}){
 return <div className={styles.row} data-side="event" data-voided={entry.voided||undefined}><article className={styles.event} aria-label={'Llamada registrada · '+entry.result}>
  <div className={styles.eventPill}><ChannelIcon channel="call"/><strong>Llamada registrada</strong><span>· {entry.result} · {entry.sender} · <time dateTime={entry.at.toISOString()}>{formatTime(entry.at)}</time></span><span className={styles.context}>{entry.context}</span></div>
  {entry.text&&<p className={styles.note}>{entry.text}</p>}
  {entry.autoRegistered&&<div className={styles.tags}><span className={styles.tag} data-kind="auto_registered">Registrado automáticamente</span></div>}
  <MessageActions view={view} message={entry.message}/>
 </article></div>;
}

function ResponseEvent({view,entry}:{view:CommunicationView;entry:ResponseEntry}){
 return <div className={styles.row} data-side="event"><article className={styles.event} aria-label={entry.text}>
  <div className={styles.eventPill}><Reply size={16} aria-hidden="true"/><strong>{entry.text}</strong><span>· {entry.channelLabel} · <time dateTime={entry.at.toISOString()}>{formatTime(entry.at)}</time></span><span className={styles.context}>{entry.context}</span></div>
  <ResponseDetails view={view} response={entry.response}/>
 </article></div>;
}

/** One item of «Conversación»: received bubble (left), sent bubble (right), or a centred call / response-without-message event. */
export function ConversationItem({view,entry}:{view:CommunicationView;entry:TimelineEntry}){
 switch(entry.kind){
  case 'received':return <Received view={view} entry={entry}/>;
  case 'sent':return <Sent view={view} entry={entry}/>;
  case 'call':return <Call view={view} entry={entry}/>;
  default:return <ResponseEvent view={view} entry={entry}/>;
 }
}
