import {useEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {getInboxThread} from '../../endpoints/inbox.schema';
import {getCommunication,type InboundMessage} from '../../endpoints/communication.schema';
import {getCommercialDetail} from '../../endpoints/commercial.schema';
import {useAuth} from '../../helpers/useAuth';
import {formatDay,formatTime} from '../../helpers/crmDates';
import {messageLabels} from '../../helpers/messageLabels';
import {Button} from '../Button';
import {QueryErrorNotice} from '../QueryErrorNotice';
import {CrmEmptyState} from '../ui/CrmEmptyState';
import {BusinessContactDialog} from '../BusinessContactDialog';
import {InboundMessageActions,INBOUND_REPLY_RESTRICTED,canWriteInbound} from '../InboundMessageActions';
import {ResponseRecordDialog,type ResponseDialogRequest} from '../ResponseRecordDialog';
import {inboxChannelLabel,inboxMessageKey,type InboxChannel,type InboxEvent,type InboxPage,type InboxThreadRow} from './inboxTypes';
import styles from './Inbox.module.css';

/** Older pages loaded automatically while looking for the message a search result points at. */
const MAX_AUTO_PAGES=3;

/**
 * Detail pane of the Bandeja: the conversation timeline plus the actions shared with the business «Comunicación» tab.
 * Inbound actions need the full inbound row (subject, body, permissions), read from the same `communication` query the tab
 * uses; the commercial detail feeds permissions and the «Nuevo mensaje» contact flow.
 */
export function InboxDetail({accountId,thread,channel,accountName,message,back}:{accountId:string;thread:InboxThreadRow|undefined;channel:InboxChannel|null;accountName?:string;message:string|null;back?:ReactNode}){
 const qc=useQueryClient(),{authState}=useAuth();
 const admin=authState.type==='authenticated'&&authState.user.role==='admin',userEmail=authState.type==='authenticated'?authState.user.email:'';
 const leadId=thread?.leadId??null,threadChannel=channel??thread?.channel??null,detailKey=['inbox','thread',accountId,leadId??'none',threadChannel];
 const detail=useQuery({queryKey:detailKey,queryFn:()=>getInboxThread({accountId,leadId:leadId??'none',channel:threadChannel!,limit:50}) as Promise<InboxPage<InboxEvent>>,enabled:!!thread&&!!threadChannel});
 const communication=useQuery({queryKey:['communication',leadId?'lead':'account',leadId??accountId],queryFn:()=>getCommunication(leadId??'',leadId?undefined:accountId),enabled:!!thread});
 const commercial=useQuery({queryKey:['commercial-detail',leadId?'':accountId,leadId??''],queryFn:()=>getCommercialDetail(leadId?undefined:accountId,leadId??undefined),enabled:!!thread});
 const [olderBusy,setOlderBusy]=useState(false),[olderError,setOlderError]=useState(false),[flash,setFlash]=useState<string|null>(null),[contactOpen,setContactOpen]=useState(false);
 const [responseRequest,setResponseRequest]=useState<ResponseDialogRequest|null>(null),responseSeq=useRef(0),timeline=useRef<HTMLDivElement|null>(null),target=useRef<{key:string|null;pages:number;done:boolean}>({key:null,pages:0,done:false});
 const events=useMemo(()=>[...(detail.data?.rows??[])].reverse(),[detail.data]);
 async function loadOlder(){
  const cursor=detail.data?.nextCursor;if(!cursor||!detail.data||!threadChannel||olderBusy)return;
  const previous=detail.data;setOlderBusy(true);setOlderError(false);
  try{const page=await getInboxThread({accountId,leadId:leadId??'none',channel:threadChannel,cursor,limit:50}) as InboxPage<InboxEvent>;qc.setQueryData(detailKey,{rows:[...previous.rows,...page.rows],nextCursor:page.nextCursor});}
  catch{setOlderError(true);}finally{setOlderBusy(false);}
 }
 // A search result opens the thread at its message: look for it, load a few older pages if needed, then scroll and flash it.
 useEffect(()=>{
  if(target.current.key!==message)target.current={key:message,pages:0,done:false};
  if(!message||target.current.done||!detail.data)return;
  if(detail.data.rows.some(event=>inboxMessageKey(event)===message)){
   target.current.done=true;setFlash(message);
   timeline.current?.querySelector(`[data-event-key="${message}"]`)?.scrollIntoView?.({block:'center'});
   return;
  }
  if(detail.data.nextCursor&&target.current.pages<MAX_AUTO_PAGES&&!olderBusy){target.current.pages+=1;void loadOlder();}
  else if(!olderBusy)target.current.done=true;
 },[message,detail.data,olderBusy]);
 useEffect(()=>{if(!flash)return;const timer=window.setTimeout(()=>setFlash(null),2500);return()=>window.clearTimeout(timer)},[flash]);
 if(!thread)return <>{back}<CrmEmptyState>Elegí una conversación para ver el detalle.</CrmEmptyState></>;
 const inboundById=new Map((communication.data?.inbound??[]).map(item=>[item.id,item]));
 const canWrite=canWriteInbound({admin,userEmail,detail:commercial.data,leadId});
 const contact=detail.data?.rows.find(event=>event.kind==='in'&&(event.fromName||event.fromAddress));
 const contactBlocked=commercial.isPending?'Estamos cargando los datos del negocio.':commercial.error?'No pudimos cargar los datos del negocio. Reintentá la carga.':'';
 const actions=(event:InboxEvent,item:InboundMessage|undefined)=>event.kind==='in'&&!event.dismissed&&item&&<div className={styles.messageActions}>{item.canReply&&item.replyRestricted&&<p role="note">{INBOUND_REPLY_RESTRICTED}</p>}<InboundMessageActions item={item} canWrite={canWrite} dismissLabel="Descartar" onRegister={inbound=>setResponseRequest({seq:++responseSeq.current,inbound})}/></div>;
 return <>
  {back}
  <header><h2>{thread.leadId?thread.leadTitle:'General'} · {inboxChannelLabel(threadChannel??thread.channel)}</h2><p>{accountName||commercial.data?.account.nombre} · {contact?.fromName||contact?.fromAddress||'Contacto no identificado'}</p>{thread.leadId&&<a href={`/sales/${thread.leadId}`}>Abrir gestión</a>}</header>
  {detail.isPending?<div className={styles.skeleton} role="status" aria-label="Cargando mensajes"><i/><i/><i/></div>:detail.error?<QueryErrorNotice error={detail.error} onRetry={detail.refetch} busy={detail.isFetching}/>:<div className={styles.timeline} ref={timeline}>
   {detail.data?.nextCursor&&<Button variant="outline" disabled={olderBusy} disabledReason="Estamos cargando mensajes anteriores." onClick={()=>void loadOlder()}>{olderBusy?'Cargando…':'Cargar anteriores'}</Button>}
   {olderError&&<p role="alert">No pudimos cargar los mensajes anteriores. Probá de nuevo con «Cargar anteriores».</p>}
   {communication.error&&<QueryErrorNotice error={communication.error} onRetry={communication.refetch} busy={communication.isFetching}/>}
   {events.map((event,index)=>{const before=events[index-1],key=inboxMessageKey(event);return <div key={`${event.kind}-${event.id}`}>{(!before||formatDay(before.at)!==formatDay(event.at))&&<div className={styles.day}>{formatDay(event.at)}</div>}<article data-event-key={key} data-kind={event.kind} data-pending={event.pending||undefined} data-dismissed={event.dismissed||undefined} data-manual={event.isManualLog||undefined} data-highlighted={flash===key||undefined} className={`${styles.message} ${event.kind==='out'?styles.outbound:styles.inbound} ${event.pending?styles.pendingMessage:''} ${event.dismissed?styles.dismissed:''} ${flash===key?styles.flash:''}`}><small>{event.kind==='out'?(event.isManualLog?`Registro · ${inboxChannelLabel(event.channel)}`:`Vos · ${messageLabels[event.status]??event.status}`):event.dismissed?'Descartado':`${event.pending?'Recibido · a revisar':'Recibido'} · ${formatTime(event.at)}`}</small><p>{event.text||event.summary||'Sin contenido'}</p>{event.kind==='out'&&<small>{messageLabels[event.status]??event.status}</small>}{actions(event,inboundById.get(event.id))}</article></div>})}
  </div>}
  <footer className={styles.detailFooter}>{commercial.error&&<QueryErrorNotice error={commercial.error} onRetry={commercial.refetch} busy={commercial.isFetching}/>}<Button variant="outline" disabled={!!contactBlocked} disabledReason={contactBlocked} onClick={()=>setContactOpen(true)}>Nuevo mensaje</Button></footer>
  {contactOpen&&commercial.data&&<BusinessContactDialog detail={commercial.data} initialLeadId={leadId??undefined} onClose={()=>{setContactOpen(false);void qc.invalidateQueries({queryKey:['inbox']})}}/>}
  {communication.data&&<ResponseRecordDialog request={responseRequest} onClose={()=>setResponseRequest(null)} data={communication.data} detail={commercial.data} leadId={leadId??undefined}/>}
 </>;
}
