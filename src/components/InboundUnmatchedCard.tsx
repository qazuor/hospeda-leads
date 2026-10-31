import {useState} from 'react';
import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query';
import {toast} from 'sonner';
import {postJson} from '../helpers/apiClient';
import {getCommercialList,getCommercialDetail} from '../endpoints/commercial.schema';
import {openPreviewManagements} from './BusinessPreviewDrawer';
import {Button} from './Button';
import {Input} from './Input';
import {QueryErrorNotice} from './QueryErrorNotice';
import styles from '../pages/trash.module.css';

/** One row of `GET /_api/inbound/unmatched`. */
export type InboundUnmatchedRow={id:string;channel:string;channelDetail:string|null;isOutgoing:boolean;fromAddress:string;fromName:string;subject:string;excerpt:string;receivedAt:Date};
/** `POST /_api/inbound/assign` answer: `movedCount` is how many messages of an Instagram chat moved with it (older servers omit it). */
export type InboundAssignResult={ok:true;accountName:string;associatedChat?:boolean;movedCount?:number};
/** Spec 103 B3: homonyms are told apart by code and city («H123 · Nombre · Ciudad»). */
export const businessOptionLabel=({id,nombre,ciudad}:{id:string|number;nombre:string;ciudad?:string|null}):string=>[`H${id}`,nombre,ciudad?.trim()||null].filter(Boolean).join(' · ');
/** Spec 103 B3: the success notice; an Instagram chat says how many messages moved. */
export const associationNotice=({accountId,result}:{accountId:string;result:InboundAssignResult}):string=>{const target=`H${accountId} · ${result.accountName}`;return result.associatedChat?`Chat asociado a ${target}${result.movedCount?`: se movieron ${result.movedCount} ${result.movedCount===1?'mensaje':'mensajes'}`:''}.`:`Mensaje asociado a ${target}.`;};

/** A card with its own search, business, management, person, pending state and error: associating one never uses another card's choice.
 * After a successful association the card locks («Asociado») until the refetch removes it, so a second click cannot associate the message again. */
export function InboundUnmatchedCard({row}:{row:InboundUnmatchedRow}){
 const qc=useQueryClient(),[term,setTerm]=useState(''),[selected,setSelected]=useState(''),[leadId,setLeadId]=useState(''),[contactId,setContactId]=useState('');
 const businesses=useQuery({queryKey:['inbound-business-picker',term],queryFn:()=>getCommercialList(term,'',1),enabled:term.trim().length>=2});
 const detail=useQuery({queryKey:['inbound-account-detail',selected],queryFn:()=>getCommercialDetail(selected),enabled:!!selected});
 const assign=useMutation({mutationFn:(input:{id:string;accountId:string;leadId:string|null;contactId:string|null})=>postJson<InboundAssignResult>('/_api/inbound/assign',input),onSuccess:(result,input)=>{setSelected('');setLeadId('');setContactId('');toast.success(associationNotice({accountId:input.accountId,result}));void qc.invalidateQueries({queryKey:['communication']});}});
 const done=assign.isSuccess;
 return <article className={styles.card}><strong>{row.fromName||row.fromAddress}</strong><p>{row.channelDetail==='instagram'?(row.isOutgoing?'Eco saliente de Instagram':'Instagram Direct'):'Email'} · {row.fromAddress} · {row.subject||'(sin asunto)'} · {new Date(row.receivedAt).toLocaleDateString('es-AR')}</p><p>{row.excerpt}</p><label>Buscar negocio<Input value={term} disabled={done} onChange={e=>{setTerm(e.target.value);setSelected('');setLeadId('');setContactId('')}} placeholder="Escribí al menos dos caracteres"/></label>{businesses.data?.rows&&<select aria-label="Negocio" value={selected} disabled={done} onChange={e=>{setSelected(e.target.value);setLeadId('');setContactId('')}}><option value="">Elegí un negocio</option>{businesses.data.rows.map(b=><option key={b.id} value={String(b.id)}>{businessOptionLabel(b)}</option>)}</select>}{selected&&<>{detail.isPending?<p role="status">Cargando gestiones y personas…</p>:detail.error?<QueryErrorNotice error={detail.error} onRetry={detail.refetch} busy={detail.isFetching}/>:detail.data?<><label>Gestión abierta (opcional)<select value={leadId} onChange={e=>setLeadId(e.target.value)}><option value="">Sin gestión</option>{openPreviewManagements(detail.data).map(o=><option key={o.id} value={String(o.id)}>{o.opportunityName||o.nombre}</option>)}</select></label><label>Persona (opcional)<select value={contactId} onChange={e=>setContactId(e.target.value)}><option value="">Sin persona</option>{detail.data.contacts.filter(c=>!c.deletedAt).map(c=><option key={c.id} value={String(c.id)}>{c.name}</option>)}</select></label></>:null}</>}<Button disabled={done||!selected||detail.isPending||!!detail.error||assign.isPending} disabledReason={done?'Este mensaje ya quedó asociado.':assign.isPending?'La operación está en curso. Esperá a que termine para continuar.':'Elegí un negocio para asociar el email.'} onClick={()=>{if(!done)assign.mutate({id:row.id,accountId:selected,leadId:leadId||null,contactId:contactId||null});}}>{done?'Asociado':assign.isPending?'Asociando…':'Asociar'}</Button>{assign.error&&<p role="alert">{(assign.error as Error).message}</p>}</article>;
}
