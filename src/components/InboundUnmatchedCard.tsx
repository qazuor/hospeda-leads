import {useState} from 'react';
import {useMutation,useQueryClient} from '@tanstack/react-query';
import {toast} from 'sonner';
import {postJson} from '../helpers/apiClient';
import {formatDateShort,formatTime} from '../helpers/crmDates';
import {DISMISS_REASONS,addressOwnedElsewhere,saveAddressOffer,type DismissReason,type UnmatchedGroup,type UnmatchedSuggestion,type UnmatchedView} from '../helpers/inboundUnmatchedShared';
import {Button} from './Button';
import {Checkbox} from './Checkbox';
import {Input} from './Input';
import {InboundBusinessPicker,businessOptionLabel,type AssignChoice} from './InboundBusinessPicker';
import styles from '../pages/trash.module.css';

export {businessOptionLabel};
/** `POST /_api/inbound/assign` answer: `movedCount` is how many messages moved, `skipped` how many ticked ones were no longer unmatched, `savedAddress` what D4 stored. */
export type InboundAssignResult={ok:true;accountName:string;associatedChat?:boolean;movedCount?:number;skipped?:number;savedAddress?:'instagram'|'email'|null};
const plural=(n:number,one:string,many:string)=>`${n} ${n===1?one:many}`;
/** Spec 103 B3/D2/D4: the success notice; says how many messages moved, how many were skipped and whether the address was stored. */
export const associationNotice=({accountId,result}:{accountId:string;result:InboundAssignResult}):string=>{
 const target=`H${accountId} · ${result.accountName}`,moved=result.movedCount;
 const base=result.associatedChat?`Chat asociado a ${target}${moved?`: se movieron ${plural(moved,'mensaje','mensajes')}`:''}.`:moved&&moved>1?`${plural(moved,'mensaje asociado','mensajes asociados')} a ${target}.`:`Mensaje asociado a ${target}.`;
 return base+(result.skipped?` ${plural(result.skipped,'mensaje ya se había asociado o descartado','mensajes ya se habían asociado o descartado')}.`:'')+(result.savedAddress==='instagram'?' Se guardó el Instagram en el negocio.':result.savedAddress==='email'?' Se guardó el email.':'');
};
const reasonText=(s:UnmatchedSuggestion)=>s.reason==='instagram'?'El @usuario está cargado en el Instagram del negocio.':s.reason==='email_contact'?`El email es de la persona ${s.contactName??''}.`:s.reason==='email_account'?'El email está cargado en el negocio.':'Mismo dominio que el email o el sitio del negocio.';
const channelLabel=(g:UnmatchedGroup)=>g.channel==='instagram'?'Instagram Direct':g.channel==='email'?'Email':'Mensaje';

/**
 * Spec 103 D1–D3: one card per conversation. Suggested businesses associate with one click («Asociar a H123»), «Otro negocio» opens the manual search,
 * an email card ticks every message (D2), the D4 box stores the address only where it is empty, and «Descartar» asks for a reason (D3).
 * In «Descartados» the card shows the reason and «Restaurar». Each card has its own state; after an action it locks until the refetch removes it.
 */
export function InboundUnmatchedCard({group,view='unmatched'}:{group:UnmatchedGroup;view?:UnmatchedView}){
 const qc=useQueryClient(),all=group.messages.map(m=>m.id);
 const [ticked,setTicked]=useState<string[]>(all),[skipSave,setSkipSave]=useState<Record<string,boolean>>({}),[manual,setManual]=useState(false),[dismissing,setDismissing]=useState(false),[reason,setReason]=useState<DismissReason|''>(''),[detail,setDetail]=useState('');
 const refresh=()=>void qc.invalidateQueries({queryKey:['communication']});
 const ids=group.channel==='email'?ticked:all;
 const assign=useMutation({mutationFn:(input:AssignChoice&{ids:string[]})=>postJson<InboundAssignResult>('/_api/inbound/assign',input),onSuccess:(result,input)=>{toast.success(associationNotice({accountId:input.accountId,result}));refresh();}});
 const dismiss=useMutation({mutationFn:(input:{ids:string[];reason:DismissReason;detail:string|null})=>postJson<{dismissed:number;skipped?:number}>('/_api/inbound/unmatched/dismiss',input),onSuccess:r=>{toast.success(`Se ${r.dismissed===1?'descartó 1 mensaje':`descartaron ${r.dismissed} mensajes`}. Quedan en «Descartados».${r.skipped?` ${plural(r.skipped,'mensaje ya se había asociado o descartado','mensajes ya se habían asociado o descartado')}.`:''}`);refresh();}});
 const restore=useMutation({mutationFn:(input:{ids:string[]})=>postJson<{restored:number}>('/_api/inbound/unmatched/restore',input),onSuccess:r=>{toast.success(`Se ${r.restored===1?'restauró 1 mensaje':`restauraron ${r.restored} mensajes`} a «Sin asociar».`);refresh();}});
 const busy=assign.isPending||dismiss.isPending||restore.isPending,done=assign.isSuccess||dismiss.isSuccess||restore.isSuccess;
 const noneTicked=!ids.length,blockedReason=busy?'La operación está en curso. Esperá a que termine para continuar.':done?'Este mensaje ya quedó asociado.':noneTicked?'Tildá al menos un mensaje.':undefined;
 const associate=(choice:AssignChoice)=>{if(!busy&&!done&&!noneTicked)assign.mutate({...choice,ids});};
 const error=(assign.error??dismiss.error??restore.error) as Error|null;
 const last=group.messages[0],ambiguous=group.suggestions.length>1&&group.suggestions.some(s=>!s.exact&&s.reason!=='domain');
 const reasonReady=!!reason&&(reason!=='other'||!!detail.trim());
 return <article className={styles.card}>
  <strong>{group.name||group.address}</strong>
  <p>{channelLabel(group)} · {group.address} · {plural(group.messages.length,'mensaje','mensajes')} · último el {formatDateShort(group.lastAt)} a las {formatTime(group.lastAt)}</p>
  {group.channel==='instagram'&&!group.instagramUsername&&<p>Instagram sin usuario (la clave de integraciones no estaba bien cuando llegó). «Volver a buscar negocios» intenta conseguirlo.</p>}
  {group.channel==='email'&&group.messages.length>1&&view==='unmatched'?<fieldset disabled={done||busy}><legend>Mensajes a asociar o descartar</legend>{group.messages.map(m=><label key={m.id}><Checkbox checked={ticked.includes(m.id)} onChange={e=>setTicked(e.target.checked?[...ticked,m.id]:ticked.filter(id=>id!==m.id))}/> {m.subject||'(sin asunto)'} · {formatDateShort(m.receivedAt)}: {m.excerpt}</label>)}</fieldset>:<>
   <p>{last.subject?`${last.subject}: `:''}{last.isOutgoing?'Respuesta de Hospeda: ':''}{last.excerpt}</p>
   {group.messages.length>1&&<details><summary>Ver los {group.messages.length} mensajes</summary>{group.messages.map(m=><p key={m.id}>{formatDateShort(m.receivedAt)} {formatTime(m.receivedAt)} · {m.isOutgoing?'Respuesta de Hospeda':'Recibido'}: {m.excerpt}</p>)}</details>}
  </>}
  {view==='dismissed'?<>
   {group.dismissal&&<p>Descartado: {group.dismissal.reason}{group.dismissal.by?` · por ${group.dismissal.by}`:''} · el {formatDateShort(group.dismissal.at)}</p>}
   <Button disabled={busy||done} disabledReason={blockedReason} onClick={()=>{if(!busy&&!done)restore.mutate({ids:all});}}>{done?'Restaurado':restore.isPending?'Restaurando…':'Restaurar'}</Button>
  </>:<>
   {group.channel==='email'&&!group.verified&&group.suggestions.length>0&&<p>El remitente no está verificado: confirmá que sea quien dice antes de asociar.</p>}
   {ambiguous&&<p>Hay varios negocios con este dato: elegí el correcto.</p>}
   {group.suggestions.map(s=>{const owned=addressOwnedElsewhere({group,accountId:s.accountId}),offer=owned?null:saveAddressOffer({group,account:s,alreadyStored:s.reason==='email_account'||s.reason==='email_contact'});return <div key={s.accountId}>
    <p>{s.exact?'¿Es de ':'Posible: '}<strong>{businessOptionLabel({id:s.accountId,nombre:s.nombre,ciudad:s.ciudad})}</strong>{s.archived?' (archivado)':''}{s.exact?'?':''} {reasonText(s)}</p>
    {owned&&saveAddressOffer({group,account:s,alreadyStored:s.reason==='email_account'||s.reason==='email_contact'})&&<p>{owned} No se guarda acá: con el dato en dos negocios los próximos mensajes quedarían sin asociar.</p>}
    {offer&&<label><Checkbox checked={!skipSave[s.accountId]} disabled={done||busy} onChange={e=>setSkipSave({...skipSave,[s.accountId]:!e.target.checked})}/> {offer.label}</label>}
    <Button disabled={busy||done||noneTicked} disabledReason={blockedReason} onClick={()=>associate({accountId:s.accountId,leadId:s.openLeadId,contactId:s.contactId,...(offer?{saveAddress:!skipSave[s.accountId]}:{})})}>{`Asociar a H${s.accountId}`}</Button>
   </div>;})}
   {group.suggestions.length>0&&!manual?<Button variant="outline" disabled={done} disabledReason={done?'Este mensaje ya quedó asociado.':undefined} onClick={()=>setManual(true)}>Otro negocio</Button>:<InboundBusinessPicker group={group} disabled={noneTicked} disabledReason={blockedReason} busy={assign.isPending} done={done} onAssign={associate}/>}
   {dismissing?<div>
    <label>Motivo<select value={reason} disabled={busy||done} onChange={e=>setReason(e.target.value as DismissReason|'')}><option value="">Elegí un motivo</option>{Object.entries(DISMISS_REASONS).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
    {reason==='other'&&<label>Contá el motivo<Input value={detail} maxLength={300} disabled={busy||done} onChange={e=>setDetail(e.target.value)}/></label>}
    <p>Se descartan {plural(ids.length,'mensaje','mensajes')} de {group.address}. No se borran: quedan en «Descartados».</p>
    <Button disabled={busy||done||noneTicked||!reasonReady} disabledReason={blockedReason??'Elegí un motivo para descartar.'} onClick={()=>{if(!busy&&!done&&reason&&reasonReady)dismiss.mutate({ids,reason,detail:reason==='other'?detail.trim():null});}}>{dismiss.isPending?'Descartando…':done?'Descartado':'Confirmar descarte'}</Button>
    <Button variant="outline" disabled={busy||done} disabledReason={blockedReason} onClick={()=>setDismissing(false)}>Cancelar</Button>
   </div>:<Button variant="outline" disabled={busy||done} disabledReason={blockedReason} onClick={()=>setDismissing(true)}>Descartar</Button>}
  </>}
  {error&&<p role="alert">{error.message}</p>}
 </article>;
}
