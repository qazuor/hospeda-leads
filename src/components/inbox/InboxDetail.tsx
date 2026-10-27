import {useEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import {useInfiniteQuery,useQuery,useQueryClient} from '@tanstack/react-query';
import {getInboxThread} from '../../endpoints/inbox.schema';
import {getCommunication} from '../../endpoints/communication.schema';
import {getCommercialDetail} from '../../endpoints/commercial.schema';
import {useAuth} from '../../helpers/useAuth';
import {formatDay,formatTime} from '../../helpers/crmDates';
import {messageLabels} from '../../helpers/messageLabels';
import {Button} from '../Button';
import {HelpLink} from '../HelpLink';
import {ValueBadge} from '../ValueBadge';
import {QueryErrorNotice} from '../QueryErrorNotice';
import {CrmEmptyState} from '../ui/CrmEmptyState';
import {BusinessContactDialog} from '../BusinessContactDialog';
import {InboundMessageActions,INBOUND_REPLY_RESTRICTED,canWriteInbound} from '../InboundMessageActions';
import {AutoRegistrationVoidButton,canVoidAutoRegistration} from '../AutoRegistrationVoid';
import {ResponseRecordDialog,type ResponseDialogRequest} from '../ResponseRecordDialog';
import {inboxChannelLabel,inboxEventInbound,inboxMessageKey,type InboxChannel,type InboxEvent,type InboxPage,type InboxThreadRow} from './inboxTypes';
import styles from './Inbox.module.css';

/** Older pages loaded automatically while looking for the message a search result points at. */
export const MAX_AUTO_PAGES=3;
/** Shown when the message a search result points at is not in the newest pages. */
export const INBOX_MESSAGE_NOT_FOUND='No encontramos ese mensaje en las últimas conversaciones cargadas.';
const PAGE_SIZE=50;

/**
 * Detail pane of the Bandeja: the conversation timeline plus the actions shared with the business «Comunicación» tab.
 * The timeline is an infinite query (pages newest-first, rendered oldest-first), so an invalidation refetches every loaded
 * page instead of collapsing them. Inbound actions are built from the thread rows themselves; the `communication` query
 * only feeds the response dialog (linked messages, open managements) and the commercial detail feeds permissions and the
 * «Nuevo mensaje» contact flow.
 */
export function InboxDetail({accountId,thread,channel,accountName,message,back}:{accountId:string;thread:InboxThreadRow|undefined;channel:InboxChannel|null;accountName?:string;message:string|null;back?:ReactNode}){
 const qc=useQueryClient(),{authState}=useAuth();
 const admin=authState.type==='authenticated'&&authState.user.role==='admin',userEmail=authState.type==='authenticated'?authState.user.email:'';
 const [includeVoided,setIncludeVoided]=useState(false),showVoided=admin&&includeVoided;
 const leadId=thread?.leadId??null,threadChannel=channel??thread?.channel??null;
 const detail=useInfiniteQuery({
  queryKey:['inbox','thread',accountId,leadId??'none',threadChannel,showVoided],
  queryFn:({pageParam})=>getInboxThread({accountId,leadId:leadId??'none',channel:threadChannel!,includeVoided:showVoided?'1':undefined,cursor:pageParam,limit:PAGE_SIZE}) as Promise<InboxPage<InboxEvent>>,
  initialPageParam:undefined as string|undefined,getNextPageParam:last=>last.nextCursor??undefined,enabled:!!thread&&!!threadChannel,
 });
 const communication=useQuery({queryKey:['communication',leadId?'lead':'account',leadId??accountId,false],queryFn:()=>getCommunication(leadId??'',leadId?undefined:accountId),enabled:!!thread});
 const commercial=useQuery({queryKey:['commercial-detail',leadId?'':accountId,leadId??''],queryFn:()=>getCommercialDetail(leadId?undefined:accountId,leadId??undefined),enabled:!!thread});
 const [flash,setFlash]=useState<string|null>(null),[contactOpen,setContactOpen]=useState(false);
 const [responseRequest,setResponseRequest]=useState<ResponseDialogRequest|null>(null),responseSeq=useRef(0),timeline=useRef<HTMLDivElement|null>(null),flashed=useRef<string|null>(null);
 const loaded=useMemo(()=>detail.data?.pages.flatMap(page=>page.rows)??[],[detail.data]);
 const events=useMemo(()=>[...loaded].reverse(),[loaded]);
 const loadOlder=()=>{if(detail.hasNextPage&&!detail.isFetchingNextPage)void detail.fetchNextPage()};
 // A search result opens the thread at its message: look for it in up to MAX_AUTO_PAGES older pages. An error stops the
 // automatic loading (the user retries with «Cargar anteriores»); not finding it ends with a short notice.
 const targetFound=!!message&&loaded.some(event=>inboxMessageKey(event)===message);
 const olderPages=Math.max(0,(detail.data?.pages.length??0)-1);
 const autoLoad=!!message&&!!detail.data&&!targetFound&&detail.hasNextPage&&olderPages<MAX_AUTO_PAGES;
 const targetMissing=!!message&&!!detail.data&&!targetFound&&!detail.isFetchingNextPage&&!detail.isFetchNextPageError&&(!detail.hasNextPage||olderPages>=MAX_AUTO_PAGES);
 useEffect(()=>{if(autoLoad&&!detail.isFetching&&!detail.isFetchNextPageError)void detail.fetchNextPage()},[autoLoad,olderPages,detail.isFetching,detail.isFetchNextPageError]);
 useEffect(()=>{
  if(!message||!targetFound||flashed.current===message)return;
  flashed.current=message;setFlash(message);
  timeline.current?.querySelector(`[data-event-key="${message}"]`)?.scrollIntoView?.({block:'center'});
 },[message,targetFound]);
 useEffect(()=>{if(!flash)return;const timer=window.setTimeout(()=>setFlash(null),2500);return()=>window.clearTimeout(timer)},[flash]);
 if(!thread)return <>{back}<CrmEmptyState>Elegí una conversación para ver el detalle.</CrmEmptyState></>;
 const canWrite=canWriteInbound({admin,userEmail,detail:commercial.data,leadId});
 const replyStatus=(messageId:string)=>loaded.find(event=>event.kind==='out'&&event.id===messageId)?.status;
 const contact=loaded.find(event=>event.kind==='in'&&(event.fromName||event.fromAddress));
 const contactBlocked=commercial.isPending?'Estamos cargando los datos del negocio.':commercial.error?'No pudimos cargar los datos del negocio. Reintentá la carga.':'';
 const actions=(event:InboxEvent)=>{
  if(event.voided)return null;
  if(event.kind==='out')return event.autoRegistrationId&&canVoidAutoRegistration({readOnly:false,canWrite,admin,userEmail,registrationId:event.autoRegistrationId,registrationUserEmail:event.autoRegistrationUserEmail,status:event.status})?<div className={styles.messageActions}><AutoRegistrationVoidButton registrationId={event.autoRegistrationId}/></div>:null;
  if(event.dismissed)return null;
  const item=inboxEventInbound({event,leadId});
  return <div className={styles.messageActions}>{item.canReply&&item.replyRestricted&&<p role="note">{INBOUND_REPLY_RESTRICTED}</p>}<InboundMessageActions item={item} canWrite={canWrite} dismissLabel="Descartar" replyStatus={replyStatus} onRegister={inbound=>setResponseRequest({seq:++responseSeq.current,inbound})}/></div>;
 };
 const label=(event:InboxEvent)=>event.kind==='out'?(event.isManualLog?`Registro · ${inboxChannelLabel(event.channel)}`:`Vos · ${messageLabels[event.status]??event.status}`):event.voided?'Anulado':event.dismissed?'Descartado':`${event.pending?'Recibido · a revisar':'Recibido'} · ${formatTime(event.at)}`;
 return <>
  {back}
  <header><h2>{thread.leadId?thread.leadTitle:'General'} · {inboxChannelLabel(threadChannel??thread.channel)}</h2><p>{accountName||commercial.data?.account.nombre} · {contact?.fromName||contact?.fromAddress||'Contacto no identificado'}</p>{thread.leadId&&<a href={`/sales/${thread.leadId}`}>Abrir gestión</a>}{admin&&<><Button size="sm" variant={includeVoided?'primary':'outline'} aria-pressed={includeVoided} onClick={()=>setIncludeVoided(value=>!value)}>Anulados</Button><HelpLink topic="inbox"/></>}</header>
  {detail.isPending?<div className={styles.skeleton} role="status" aria-label="Cargando mensajes"><i/><i/><i/></div>:detail.error&&!detail.data?<QueryErrorNotice error={detail.error} onRetry={detail.refetch} busy={detail.isFetching}/>:<div className={styles.timeline} ref={timeline}>
   {detail.hasNextPage&&<Button variant="outline" disabled={detail.isFetchingNextPage} disabledReason="Estamos cargando mensajes anteriores." onClick={loadOlder}>{detail.isFetchingNextPage?'Cargando…':'Cargar anteriores'}</Button>}
   {detail.isFetchNextPageError&&<p role="alert">No pudimos cargar los mensajes anteriores. Probá de nuevo con «Cargar anteriores».</p>}
   {targetMissing&&<p role="status">{INBOX_MESSAGE_NOT_FOUND}</p>}
   {events.map((event,index)=>{const before=events[index-1],key=inboxMessageKey(event),muted=event.dismissed||!!event.voided;return <div key={`${event.kind}-${event.id}`} className={`${styles.messageRow} ${event.kind==='out'?styles.outboundRow:styles.inboundRow}`}>{(!before||formatDay(before.at)!==formatDay(event.at))&&<div className={styles.day}>{formatDay(event.at)}</div>}<article data-event-key={key} data-kind={event.kind} data-pending={event.pending||undefined} data-dismissed={event.dismissed||undefined} data-voided={event.voided||undefined} data-manual={event.isManualLog||undefined} data-highlighted={flash===key||undefined} className={`${styles.message} ${event.kind==='out'?styles.outbound:styles.inbound} ${event.pending?styles.pendingMessage:''} ${muted?styles.dismissed:''} ${flash===key?styles.flash:''}`}><small>{label(event)}</small>{(event.autoRegistrationId||event.voided)&&<span className={styles.messageBadges}>{event.autoRegistrationId&&<ValueBadge value="Automático" category="review"/>}{event.voided&&<ValueBadge value={messageLabels.voided} category="review"/>}</span>}<p>{event.text||event.summary||'Sin contenido'}</p>{event.kind==='out'&&<small>{messageLabels[event.status]??event.status}</small>}{actions(event)}</article></div>})}
  </div>}
  <footer className={styles.detailFooter}>{commercial.error&&<QueryErrorNotice error={commercial.error} onRetry={commercial.refetch} busy={commercial.isFetching}/>}{communication.error&&responseRequest&&<QueryErrorNotice error={communication.error} onRetry={communication.refetch} busy={communication.isFetching}/>}<Button variant="outline" disabled={!!contactBlocked} disabledReason={contactBlocked} onClick={()=>setContactOpen(true)}>Nuevo mensaje</Button></footer>
  {contactOpen&&commercial.data&&<BusinessContactDialog detail={commercial.data} initialLeadId={leadId??undefined} onClose={()=>{setContactOpen(false);void qc.invalidateQueries({queryKey:['inbox']})}}/>}
  {communication.data&&<ResponseRecordDialog request={responseRequest} onClose={()=>setResponseRequest(null)} data={communication.data} detail={commercial.data} leadId={leadId??undefined}/>}
 </>;
}
