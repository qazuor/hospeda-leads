import {useMemo,useState} from 'react';
import {COMMUNICATION_LIST_LIMIT} from '../../endpoints/communication.schema';
import {atListLimit,buildCommunicationTimeline,filterTimeline,timelineChips,visibleTimeline,withDaySeparators,type TimelineChannel} from '../../helpers/communicationTimeline';
import {Button} from '../Button';
import {ConversationItem} from './ConversationItem';
import type {CommunicationView} from './types';
import styles from './CommunicationView.module.css';

/**
 * «Conversación»: one chronological list (oldest first, day separators) of everything sent and received with the business,
 * with or without management. Channel chips filter it on the client; long histories show the latest 30 with «Ver anteriores».
 * The admin «Anulados» toggle asks the server for voided rows (`includeVoided`).
 */
export function Conversation({view,includeVoided,onToggleVoided}:{view:CommunicationView;includeVoided:boolean;onToggleVoided:()=>void}){
 const {data,detail}=view;
 const entries=useMemo(()=>buildCommunicationTimeline({messages:data.messages,inbound:data.inbound,responses:data.responses,users:detail?.users,managements:detail?.opportunities??data.openManagements}),[data,detail]);
 const [channel,setChannel]=useState<TimelineChannel|'all'>('all'),[showOlder,setShowOlder]=useState(false);
 const chips=timelineChips(entries),active=chips.some(chip=>chip.channel===channel)?channel:'all';
 const {items,hidden}=visibleTimeline(filterTimeline(entries,active),{showOlder});
 const writable=!view.readOnly&&!!detail&&!detail.account.doNotContact&&!detail.account.archivedAt;
 return <section className={styles.section} aria-label="Conversación">
  <div className={styles.convHead}>
   <h4 className={styles.sectionTitle}>Conversación</h4>
   <div className={styles.chips}>
    {entries.length>0&&<div role="group" aria-label="Filtrar la conversación por canal" className={styles.chips}>{chips.map(chip=><Button key={chip.channel} size="sm" variant={active===chip.channel?'primary':'outline'} aria-pressed={active===chip.channel} onClick={()=>{setChannel(chip.channel);setShowOlder(false)}}>{chip.label} · {chip.count}</Button>)}</div>}
    {view.admin&&<Button size="sm" variant={includeVoided?'primary':'outline'} aria-pressed={includeVoided} onClick={onToggleVoided}>Anulados</Button>}
   </div>
  </div>
  {!entries.length&&<p className={styles.empty}>{writable?'Todavía no hay mensajes ni respuestas. Lo que envíes con «Contactar» aparece acá, en orden; lo que te conteste el negocio sin un mensaje registrado lo anotás con «Registrar respuesta sin mensaje».':'Todavía no hay mensajes ni respuestas.'}</p>}
  {atListLimit({messages:data.messages,inbound:data.inbound,responses:data.responses,limit:COMMUNICATION_LIST_LIMIT})&&<p className={styles.limitNote} role="note">Mostrando lo más reciente: los mensajes y respuestas más antiguos no se cargan acá. Buscalos en la Bandeja.</p>}
  {hidden>0&&<Button size="sm" variant="outline" style={{alignSelf:'center'}} onClick={()=>setShowOlder(true)}>Ver anteriores ({hidden})</Button>}
  {items.length>0&&<ol className={styles.timeline}>{withDaySeparators(items).map(({entry,separator})=><li key={entry.key}>{separator&&<div className={styles.day}>{separator}</div>}<ConversationItem view={view} entry={entry}/></li>)}</ol>}
 </section>;
}
