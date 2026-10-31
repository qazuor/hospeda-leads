import {useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {getCommunication,postCommunication} from '../endpoints/communication.schema';
import {getCommercialDetail} from '../endpoints/commercial.schema';
import {useAuth} from '../helpers/useAuth';
import {useGuardedMutation} from '../helpers/useGuardedMutation';
import {canRecordDoNotContact,DO_NOT_CONTACT_READ_ONLY} from '../helpers/doNotContactPermission';
import {formatDateTime} from '../helpers/crmDates';
import {actorLabel,channelLabel} from '../helpers/crmLabels';
import {Button} from './Button';
import {Input} from './Input';
import {NativeSelect} from './NativeSelect';
import {Disclosure,DisclosureSummary} from './Disclosure';
import {QueryErrorNotice} from './QueryErrorNotice';
import {LiftRestrictionDialog,type RestrictionTarget} from './LiftRestrictionDialog';
import styles from './Communication.module.css';

type RestrictionChannel='email'|'whatsapp'|'call'|'social'|'other';
/** Restriction row as GET /_api/communication returns it. */
type Restriction={id:string|number;channel:string;contactId:string|number|null;reason:string;actorEmail:string|null;createdAt:Date;liftedAt:Date|null;liftReason:string|null;liftedBy:string|null};
/** Spec 104 D2: who registers channel restrictions, for a seller who may not add one, and who may record «Pidió no ser contactado» (decision D1, `canRecordDoNotContact`). */
export const SELLER_RESTRICTIONS_NOTE='Las restricciones por canal las registra el responsable del negocio, el de una de sus gestiones o un administrador. Si el negocio pidió que no le escriban por un canal, avisale al responsable. Si pidió no ser contactado por ningún medio, lo registra el responsable desde «Anotar lo que pasó» → «Pidió no ser contactado»; si no sos responsable, avisale a un administrador.';
/** Spec 104 D2: for a responsible who is not an admin, who adds restrictions but cannot lift them. */
export const RESPONSIBLE_RESTRICTIONS_NOTE='Solo un administrador puede levantar una restricción. Si el negocio pidió no ser contactado por ningún medio, registralo desde «Anotar lo que pasó» → «Pidió no ser contactado».';
/** «Todos los canales» for `all`, otherwise the channel label. */
export const restrictionChannelLabel=(channel:string)=>channel==='all'?'Todos los canales':channelLabel(channel);

/**
 * Technical contact restrictions (per channel or person): the list, «Registrar restricción técnica» for an admin or the responsible of the
 * business or of one of its managements (spec 104 D2, same rule as «Pidió no ser contactado»; never on a No contactar business for a
 * seller), and «Levantar restricción» only for an admin. Spec 90: on the business page this lives only in the left «Preferencias y restricciones»;
 * the management view keeps it in its «Comunicación» tab (`collapsible`, titled «Restricciones de contacto»).
 */
export function TechnicalRestrictions({accountId,leadId,collapsible=false}:{accountId?:string;leadId?:string;collapsible?:boolean}){
 const {authState}=useAuth(),qc=useQueryClient();
 const admin=authState.type==='authenticated'&&authState.user.role==='admin',userEmail=authState.type==='authenticated'?authState.user.email:null;
 const q=useQuery({queryKey:['communication',leadId?'lead':'account',leadId??accountId??'',false],queryFn:()=>getCommunication(leadId??'',accountId,false)});
 const detail=useQuery({queryKey:['commercial-detail',accountId??'',leadId??''],queryFn:()=>getCommercialDetail(accountId,leadId)});
 const [person,setPerson]=useState(''),[channel,setChannel]=useState<RestrictionChannel>('email'),[reason,setReason]=useState('');
 const [liftTarget,setLiftTarget]=useState<RestrictionTarget|null>(null),[liftedNotice,setLiftedNotice]=useState<{id:string;text:string}|null>(null);
 const m=useGuardedMutation({mutationFn:postCommunication,onSuccess:()=>{for(const queryKey of [['communication'],['work'],['global-journal'],['lead-journal']])void qc.invalidateQueries({queryKey});setReason('')}});
 const contactName=(id:string|number|null)=>id?detail.data?.contacts.find(c=>String(c.id)===String(id))?.name||'Persona #'+id:'Negocio o contexto original';
 const restrictions=(q.data?.restrictions??[]) as Restriction[];
 const account=detail.data?.account,dncReadOnly=!admin&&!!account?.doNotContact;
 const canAdd=admin||(!dncReadOnly&&!!account&&!account.archivedAt&&canRecordDoNotContact({admin,userEmail,businessOwnerEmail:account.assignedUserEmail,managementOwnerEmails:detail.data?.opportunities?.filter(o=>!o.deletedAt).map(o=>o.assignedUserEmail)}));
 const body=<div className={styles.panel}>
  {q.error&&<QueryErrorNotice error={q.error} onRetry={q.refetch} busy={q.isFetching}/>}
  {canAdd&&<>
   <label>Persona<NativeSelect value={person} onChange={e=>setPerson(e.target.value)}><option value="">Negocio o persona</option>{detail.data?.contacts.filter(c=>!c.deletedAt).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</NativeSelect></label>
   <label>Canal<NativeSelect aria-label="Canal de restricción" value={channel} onChange={e=>setChannel(e.target.value as RestrictionChannel)}><option value="email">Email</option><option value="whatsapp">WhatsApp</option><option value="call">Llamada</option><option value="social">Red social</option><option value="other">Otro</option></NativeSelect></label>
   <label>Motivo de restricción<Input value={reason} onChange={e=>setReason(e.target.value)} placeholder="Ej.: Pidió que no le escribamos por WhatsApp"/></label>
   <Button disabled={reason.trim().length<3||m.isPending||!detail.data?.account.id} disabledReason={m.isPending?'La operación está en curso. Esperá a que termine para continuar.':'Completá el motivo obligatorio (mínimo 3 caracteres).'} onClick={()=>m.mutate({action:'restrict',accountId:String(detail.data!.account.id),leadId:null,contactId:person||null,channel,reason})}>{m.isPending?'Guardando…':'Registrar restricción técnica'}</Button>
   {m.error&&<p role="alert">{m.error.message}</p>}
  </>}
  {!admin&&!restrictions.length&&q.data&&<p className={styles.muted}>No hay restricciones técnicas por canal.</p>}
  {restrictions.map(r=><article key={r.id}>
   <strong>{restrictionChannelLabel(r.channel)} · {r.liftedAt?'Levantada':'Restricción activa'}</strong>
   <p>{contactName(r.contactId)} · {r.reason} · {actorLabel(r.actorEmail,detail.data?.users)} · {formatDateTime(r.createdAt)}</p>
   {r.liftedAt?<p>{r.liftReason} · {actorLabel(r.liftedBy,detail.data?.users)} · {formatDateTime(r.liftedAt)}</p>:admin&&<Button variant="outline" disabled={m.isPending} disabledReason="La operación está en curso. Esperá a que termine para continuar." onClick={()=>{setLiftedNotice(null);setLiftTarget({id:String(r.id),channel:r.channel,reason:r.reason,contact:contactName(r.contactId)})}}>Levantar restricción</Button>}
  </article>)}
  {!admin&&q.data&&detail.data&&<p className={styles.muted}>{dncReadOnly?DO_NOT_CONTACT_READ_ONLY:canAdd?RESPONSIBLE_RESTRICTIONS_NOTE:SELLER_RESTRICTIONS_NOTE}</p>}
 </div>;
 return <>
  {collapsible?<Disclosure><DisclosureSummary>Restricciones de contacto</DisclosureSummary>{body}</Disclosure>:<section aria-label="Restricciones técnicas por canal"><h4>Restricciones técnicas por canal</h4>{body}</section>}
  {liftedNotice&&<p role="status" tabIndex={-1} data-lifted-restriction={liftedNotice.id}>{liftedNotice.text}</p>}
  {admin&&liftTarget&&<LiftRestrictionDialog key={liftTarget.id} target={liftTarget} onClose={()=>setLiftTarget(null)} onLifted={()=>{setLiftedNotice({id:liftTarget.id,text:'Restricción levantada. No se enviaron mensajes.'});setLiftTarget(null)}}/>}
 </>;
}
