import {useState} from 'react';
import type {Message,PreparedMessage} from '../../endpoints/communication.schema';
import {formatDateTime} from '../../helpers/crmDates';
import {userLabel} from '../../helpers/crmLabels';
import {draftMessages} from '../../helpers/communicationTimeline';
import {Button} from '../Button';
import {MessageComposer} from '../MessageComposer';
import type {CommunicationView} from './types';
import styles from './CommunicationView.module.css';

/** Who may reopen a draft here: its author or an admin on a writable view; delegated drafts are edited from their task. */
export const canEditDraft=({view,message}:{view:Pick<CommunicationView,'readOnly'|'canWrite'|'admin'|'userEmail'>;message:Pick<Message,'channel'|'ownerEmail'|'delegatedTaskId'>}):boolean=>!view.readOnly&&view.canWrite&&(view.admin||message.ownerEmail===view.userEmail)&&!message.delegatedTaskId&&(message.channel==='email'||message.channel==='whatsapp');

function Draft({view,message}:{view:CommunicationView;message:Message}){
 const [open,setOpen]=useState(false),editable=canEditDraft({view,message});
 const channel=message.channel==='email'?'Email':'WhatsApp';
 return <article className={styles.draft} aria-label={`Borrador de ${channel} a ${message.recipientName||message.recipient}`}>
  <div className={styles.draftHead}>
   <div><strong>Borrador · {channel} a {message.recipientName||message.recipient}{message.subject?` · «${message.subject}»`:''}</strong><span>Preparado por {userLabel(view.detail?.users,message.ownerEmail)} el {formatDateTime(message.createdAt)} · {message.channel==='email'?'todavía no se envió':'todavía no se abrió WhatsApp'}</span></div>
   {editable?<Button size="sm" variant="outline" aria-expanded={open} onClick={()=>setOpen(value=>!value)}>{open?'Cerrar borrador':'Seguir editando'}</Button>:<span>{message.delegatedTaskId?'Se edita desde la tarea delegada.':'Solo quien lo preparó o un administrador puede editarlo.'}</span>}
  </div>
  {open&&editable&&<MessageComposer key={message.id} initial={message as PreparedMessage} startEditing/>}
 </article>;
}

/** «Borradores · N»: drafts (not sent, not opened) apart from the conversation, each with «Seguir editando». */
export function DraftsBlock({view}:{view:CommunicationView}){
 const drafts=draftMessages(view.data.messages);
 if(!drafts.length)return null;
 return <section className={styles.drafts} aria-label="Borradores">
  <h4 className={styles.sectionTitle}>Borradores · {drafts.length}</h4>
  {drafts.map(message=><Draft key={message.id} view={view} message={message}/>)}
 </section>;
}
