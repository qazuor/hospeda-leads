import {useEffect,useMemo,useRef,useState} from 'react';
import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query';
import {toast} from 'sonner';
import {getCommunication,markCommunicationSeen,type InboundMessage} from '../endpoints/communication.schema';
import {getCommercialDetail} from '../endpoints/commercial.schema';
import {useAuth} from '../helpers/useAuth';
import {canRecordDoNotContact} from '../helpers/doNotContactPermission';
import {buildCommunicationTimeline,lastReceived,newestAt,replyTarget} from '../helpers/communicationTimeline';
import {QueryErrorNotice} from './QueryErrorNotice';
import {QueryLoadingNotice} from './QueryLoadingNotice';
import {ResponseRecordDialog,type ResponseDialogRequest} from './ResponseRecordDialog';
import {TechnicalRestrictions,restrictionChannelLabel} from './TechnicalRestrictions';
import {CONTACT_DNC_REASON,CommunicationActionBar} from './communication/CommunicationActionBar';
import {RequiresAction} from './communication/RequiresAction';
import {Conversation,type FocusRequest,type ReplyAction} from './communication/Conversation';
import {DraftsBlock} from './communication/DraftsBlock';
import type {CommunicationView,ContactChannel,ContactOptions} from './communication/types';
import type {PickedSalesMaterial} from './SalesMaterialPicker';
import styles from './Communication.module.css';
import view from './communication/CommunicationView.module.css';

export {isInstagramEcho} from '../helpers/communicationTimeline';

/** Active technical restrictions in one line; the editor lives in «Preferencias y restricciones» (spec 90). */
function RestrictionNotice({data,contacts}:{data:CommunicationView['data'];contacts:{id:string|number;name:string}[]}){
 const active=((data.activeRestrictions??data.restrictions.filter(r=>!r.liftedAt)) as {id:string|number;channel:string;contactId:string|number|null;reason:string}[]);
 if(!active.length)return null;
 const parts=active.map(r=>[restrictionChannelLabel(r.channel),r.contactId?contacts.find(c=>String(c.id)===String(r.contactId))?.name:'',r.reason].filter(Boolean).join(' · '));
 return <p className={view.notice} role="note"><strong>{active.length===1?'Restricción activa':'Restricciones activas'}: {parts.join('; ')}</strong> · Se edita en «Preferencias y restricciones».</p>;
}

/**
 * Spec 91 §12, business view only: the previous visit as the first load after mount returned it (kept for the whole visit, so
 * the divider does not move when the data refreshes), and the visit marked with the newest loaded item's time after the tab
 * renders. The tab remounts on every visit (`keepMounted={false}`), so a cached payload from an earlier visit is never used as
 * «previous»: only data fetched after this mount counts, and a successful mark also updates the cached `lastSeenAt`.
 * A management view shows a subset of the business, so it neither reads nor marks the business visit.
 */
function useVisit({accountId,enabled,fresh,data,newest}:{accountId:string;enabled:boolean;fresh:boolean;data:{lastSeenAt?:Date|null}|undefined;newest:Date|null}){
 const client=useQueryClient(),previous=useRef<{value:Date|null}|null>(null);
 if(enabled&&fresh&&!previous.current&&data&&data.lastSeenAt!==undefined)previous.current={value:data.lastSeenAt?new Date(data.lastSeenAt):null};
 const marked=useRef(0),{mutate}=useMutation({mutationFn:markCommunicationSeen,onSuccess:result=>{
  const seen=result?.lastSeenAt?new Date(result.lastSeenAt):null;if(!seen)return;
  client.setQueriesData<{lastSeenAt?:Date|null}>({queryKey:['communication','account',accountId]},old=>old&&old.lastSeenAt!==undefined&&(!old.lastSeenAt||new Date(old.lastSeenAt)<seen)?{...old,lastSeenAt:seen}:old);
 }});
 const known=enabled&&fresh&&data?.lastSeenAt!==undefined,stored=data?.lastSeenAt?new Date(data.lastSeenAt).getTime():0,time=newest?.getTime()??0;
 useEffect(()=>{
  if(!known||!time||time<=Math.max(marked.current,stored))return;
  marked.current=time;
  // Not contact and not a business write: a failure only leaves the next divider earlier, so it is not retried or reported.
  mutate({accountId,seenAt:new Date(time)});
 },[known,time,stored,accountId,mutate]);
 return previous.current?.value??null;
}

/**
 * «Comunicación» of a business (or of a management, `leadId`), specs 90 and 91: title and Bandeja link, action bar, restriction
 * notice, «Requiere acción» (a summary that scrolls to its items), one chronological «Conversación» with «Preparar respuesta» and
 * «Borradores». Permissions are mirrored here and checked again by the server on every write. `onContact` opens the page's
 * «Contactar» dialog (business page only), optionally with a recipient. `onSendMaterial` adds «Enviar material» (spec 89 §8.2).
 */
export function CommunicationPanel({leadId,accountId,readOnly=false,onContact,onSendMaterial}:{leadId?:string;accountId?:string;readOnly?:boolean;onContact?:(channel?:ContactChannel,options?:ContactOptions)=>void;onSendMaterial?:(material:PickedSalesMaterial)=>void}){
 const recordId=leadId??accountId??'';
 const {authState}=useAuth();
 const admin=authState.type==='authenticated'&&authState.user.role==='admin';
 const userEmail=authState.type==='authenticated'?authState.user.email:'';
 const [includeVoided,setIncludeVoided]=useState(false);
 const q=useQuery({queryKey:['communication',leadId?'lead':'account',recordId,admin&&includeVoided],queryFn:()=>getCommunication(leadId??'',accountId,admin&&includeVoided)});
 const detail=useQuery({queryKey:['commercial-detail',accountId??'',leadId??''],queryFn:()=>getCommercialDetail(accountId,leadId)});
 const [responseRequest,setResponseRequest]=useState<ResponseDialogRequest|null>(null),responseSeq=useRef(0);
 const [focus,setFocus]=useState<FocusRequest|null>(null),focusSeq=useRef(0);
 const newest=useMemo(()=>q.data?newestAt(buildCommunicationTimeline({messages:q.data.messages,inbound:q.data.inbound,responses:q.data.responses})):null,[q.data]);
 const lastSeenAt=useVisit({accountId:accountId??'',enabled:!!accountId&&!leadId,fresh:q.isFetchedAfterMount,data:q.data,newest});
 const openResponse=(inbound:InboundMessage|null)=>setResponseRequest({seq:++responseSeq.current,inbound});
 if(!q.data&&q.isPending)return <QueryLoadingNotice>Cargando comunicación…</QueryLoadingNotice>;
 if(!q.data)return <QueryErrorNotice error={q.error!} onRetry={q.refetch} busy={q.isFetching}/>;
 const d=detail.data;
 const opp=leadId?d?.opportunities.find(o=>String(o.id)===leadId):undefined;
 const v:CommunicationView={
  data:q.data,detail:d,admin,userEmail,readOnly,
  canWrite:admin||(leadId?opp?.assignedUserEmail===userEmail:d?.account.assignedUserEmail===userEmail),
  archivedReadOnly:!admin&&!!d?.account.archivedAt,
  canRecordDnc:canRecordDoNotContact({admin,userEmail,businessOwnerEmail:d?.account.assignedUserEmail,managementOwnerEmails:d?.opportunities.filter(o=>!o.deletedAt).map(o=>o.assignedUserEmail)}),
  openResponse,
  replyStatus:messageId=>q.data?.messages.find(m=>m.id===messageId)?.status,
 };
 const businessId=accountId??(d?String(d.account.id):'');
 const inboxHref=businessId?'/inbox?account='+businessId+(leadId?'&lead='+leadId:''):'';
 // Spec 91 §10: «Preparar respuesta» prepares a message to the last received one; it opens the composer, it is not contact.
 const last=lastReceived(q.data.inbound),data=q.data;
 const reply:ReplyAction|undefined=!readOnly&&onContact&&last?{disabledReason:!d?'Estamos cargando los datos del negocio.':d.account.doNotContact?CONTACT_DNC_REASON:'',onReply:()=>{
  if(!d)return;
  const target=replyTarget({item:last,recipients:{account:d.account,contacts:d.contacts},restrictions:data.activeRestrictions??data.restrictions});
  if(target.reason)toast.info(target.reason);
  onContact(target.channel,target.contactId===undefined?undefined:{contactId:target.contactId});
 }}:undefined;
 return <section className={styles.panel+' '+view.view} aria-label="Comunicación">
  {q.error&&<QueryErrorNotice error={q.error} onRetry={q.refetch} busy={q.isFetching}/>}
  {detail.error&&<QueryErrorNotice error={detail.error} onRetry={detail.refetch} busy={detail.isFetching}/>}
  <header className={view.head}><div><h3>Comunicación</h3><p>{leadId?'Lo enviado en esta gestión y todo lo recibido del negocio, en orden.':'Todo lo enviado y recibido con este negocio, en orden, con o sin gestión.'}</p></div>{inboxHref&&<a href={inboxHref}>Abrir en la Bandeja</a>}</header>
  <CommunicationActionBar view={v} leadId={leadId} onContact={onContact} onSendMaterial={onSendMaterial}/>
  {leadId?<TechnicalRestrictions leadId={leadId} accountId={accountId} collapsible/>:<RestrictionNotice data={q.data} contacts={d?.contacts??[]}/>}
  <RequiresAction view={v} onFocus={key=>setFocus({key,seq:++focusSeq.current})}/>
  <Conversation view={v} includeVoided={admin&&includeVoided} onToggleVoided={()=>setIncludeVoided(value=>!value)} lastSeenAt={lastSeenAt} focus={focus} reply={reply}/>
  <DraftsBlock view={v}/>
  <ResponseRecordDialog request={responseRequest} onClose={()=>setResponseRequest(null)} data={q.data} detail={d} leadId={leadId}/>
 </section>;
}
