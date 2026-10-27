import {useRef,useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {getCommunication,type InboundMessage} from '../endpoints/communication.schema';
import {getCommercialDetail} from '../endpoints/commercial.schema';
import {useAuth} from '../helpers/useAuth';
import {canRecordDoNotContact} from '../helpers/doNotContactPermission';
import {QueryErrorNotice} from './QueryErrorNotice';
import {QueryLoadingNotice} from './QueryLoadingNotice';
import {ResponseRecordDialog,type ResponseDialogRequest} from './ResponseRecordDialog';
import {TechnicalRestrictions,restrictionChannelLabel} from './TechnicalRestrictions';
import {CommunicationActionBar} from './communication/CommunicationActionBar';
import {RequiresAction} from './communication/RequiresAction';
import {Conversation} from './communication/Conversation';
import {DraftsBlock} from './communication/DraftsBlock';
import type {CommunicationView,ContactChannel} from './communication/types';
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
 * «Comunicación» of a business (or of a management, `leadId`), spec 90: title and Bandeja link, action bar, restriction
 * notice, «Requiere acción», one chronological «Conversación» and «Borradores». Permissions are mirrored here and checked
 * again by the server on every write. `onContact` opens the page's «Contactar» dialog (business page only). `onSendMaterial` adds
 * «Enviar material» to the action bar (spec 89 §8.2): the business page opens «Contactar» with the picked material already added.
 */
export function CommunicationPanel({leadId,accountId,readOnly=false,onContact,onSendMaterial}:{leadId?:string;accountId?:string;readOnly?:boolean;onContact?:(channel?:ContactChannel)=>void;onSendMaterial?:(material:PickedSalesMaterial)=>void}){
 const recordId=leadId??accountId??'';
 const {authState}=useAuth();
 const admin=authState.type==='authenticated'&&authState.user.role==='admin';
 const userEmail=authState.type==='authenticated'?authState.user.email:'';
 const [includeVoided,setIncludeVoided]=useState(false);
 const q=useQuery({queryKey:['communication',leadId?'lead':'account',recordId,admin&&includeVoided],queryFn:()=>getCommunication(leadId??'',accountId,admin&&includeVoided)});
 const detail=useQuery({queryKey:['commercial-detail',accountId??'',leadId??''],queryFn:()=>getCommercialDetail(accountId,leadId)});
 const [responseRequest,setResponseRequest]=useState<ResponseDialogRequest|null>(null),responseSeq=useRef(0);
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
 return <section className={styles.panel+' '+view.view} aria-label="Comunicación">
  {q.error&&<QueryErrorNotice error={q.error} onRetry={q.refetch} busy={q.isFetching}/>}
  {detail.error&&<QueryErrorNotice error={detail.error} onRetry={detail.refetch} busy={detail.isFetching}/>}
  <header className={view.head}><div><h3>Comunicación</h3><p>{leadId?'Lo enviado en esta gestión y todo lo recibido del negocio, en orden.':'Todo lo enviado y recibido con este negocio, en orden, con o sin gestión.'}</p></div>{inboxHref&&<a href={inboxHref}>Abrir en la Bandeja</a>}</header>
  <CommunicationActionBar view={v} leadId={leadId} onContact={onContact} onSendMaterial={onSendMaterial}/>
  {leadId?<TechnicalRestrictions leadId={leadId} accountId={accountId} collapsible/>:<RestrictionNotice data={q.data} contacts={d?.contacts??[]}/>}
  <RequiresAction view={v}/>
  <Conversation view={v} includeVoided={admin&&includeVoided} onToggleVoided={()=>setIncludeVoided(value=>!value)}/>
  <DraftsBlock view={v}/>
  <ResponseRecordDialog request={responseRequest} onClose={()=>setResponseRequest(null)} data={q.data} detail={d} leadId={leadId}/>
 </section>;
}
