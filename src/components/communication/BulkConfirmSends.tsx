import {useCallback,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {useQueryClient} from '@tanstack/react-query';
import {toast} from 'sonner';
import {postCommunication,type Message} from '../../endpoints/communication.schema';
import {useGuardedMutation} from '../../helpers/useGuardedMutation';
import {crmSuccess} from '../../helpers/crmFeedback';
import {formatDateTime} from '../../helpers/crmDates';
import {CrmApiError,GENERIC_MESSAGE} from '../../helpers/apiClient';
import {actorLabel} from '../../helpers/crmLabels';
import {isAlreadyConfirmed} from '../../helpers/contactOutcome';
import {isInstagramAttempt} from '../../helpers/instagramChat';
import {CrmDialog} from '../ui/CrmDialog';
import {Button} from '../Button';
import {Checkbox} from '../Checkbox';
import {invalidateAfterOutcome,sendBlockReason} from './ConfirmSendButtons';
import {BUSY_REASON,type CommunicationView} from './types';
import styles from './CommunicationView.module.css';

/** The two bulk answers of «¿Lo enviaste?» (spec 100 §8): the same `outcome` events as the per-entry buttons. */
export type BulkEvent='manual_sent'|'manual_not_sent';
/**
 * What happened to one selected open: marked, already confirmed (source not inferred), blocked before any call, refused by the server
 * (`error`, a 4xx: the only kind offered again), `uncertain` (no HTTP answer, a 5xx or an unreadable answer: it may be saved, so it is
 * never called a failure) or `skipped` (not attempted because an earlier one was uncertain).
 */
export type BulkResult={id:string;kind:'ok'|'already'|'blocked'|'error'|'uncertain'|'skipped';text:string};
const ALREADY_TEXT='Ya estaba confirmado',UNCERTAIN_TEXT='No pudimos confirmar si se guardó. Revisá antes de repetir.',SKIPPED_TEXT='No se intentó';
const NONE_MARKABLE='Ninguno se puede marcar como enviado.';
/** Only an HTTP 4xx is a certain refusal; anything else on a write may have been applied. */
const isUncertain=(error:unknown)=>error instanceof CrmApiError&&!(error.status>=400&&error.status<500);

/**
 * Spec 100 §8 execution: one existing `outcome` call per open, strictly one after another, each through the server checks of the
 * per-entry button. Every outcome is collected and nothing is ever retried here. The first uncertain result stops the run (the
 * connection or the server is in doubt): the rest are reported as not attempted.
 * `onProgress(i)` runs before the i-th call (1-based), for «Guardando {i} de {N}…».
 */
export async function runBulkOutcome({ids,event,post,onProgress}:{ids:readonly string[];event:BulkEvent;post:(input:{action:'outcome';id:string;event:BulkEvent;notes:string})=>Promise<unknown>;onProgress?:(done:number)=>void}):Promise<BulkResult[]>{
 const results:BulkResult[]=[];
 for(const [i,id] of ids.entries()){
  onProgress?.(i+1);
  try{await post({action:'outcome',id,event,notes:''});results.push({id,kind:'ok',text:event==='manual_sent'?'Marcado como enviado':'Marcado como no enviado'});}
  catch(error){
   if(isUncertain(error)){results.push({id,kind:'uncertain',text:UNCERTAIN_TEXT},...ids.slice(i+1).map(rest=>({id:rest,kind:'skipped' as const,text:SKIPPED_TEXT})));break;}
   results.push(isAlreadyConfirmed(error)?{id,kind:'already',text:ALREADY_TEXT}:{id,kind:'error',text:error instanceof Error&&error.message?error.message:GENERIC_MESSAGE});
  }
 }
 return results;
}

/**
 * «3 de 4 marcados. 1 no se pudo marcar.»: blocked and refused items count as not marked; already confirmed, uncertain («sin confirmar
 * si se guardó») and not attempted ones are told apart. `warn` when anything did not end marked or already confirmed.
 */
export function bulkSummary(results:readonly BulkResult[]):{text:string;warn:boolean}{
 const count=(kind:BulkResult['kind'])=>results.filter(r=>r.kind===kind).length,ok=count('ok'),failed=count('error')+count('blocked'),already=count('already'),uncertain=count('uncertain'),skipped=count('skipped');
 const one=(n:number,singular:string,plural:string)=>n?`${n} ${n===1?singular:plural}.`:'';
 const text=[`${ok} de ${results.length} ${ok===1?'marcado':'marcados'}.`,one(failed,'no se pudo marcar','no se pudieron marcar'),one(already,'ya estaba confirmado','ya estaban confirmados'),one(uncertain,'sin confirmar si se guardó','sin confirmar si se guardaron'),one(skipped,'no se intentó','no se intentaron')].filter(Boolean).join(' ');
 return {text,warn:failed+uncertain+skipped>0};
}

type Pending={readonly event:BulkEvent;readonly items:readonly Message[]};
/**
 * Bulk state of «Requiere acción»: the selection shared by the bars of «¿Lo enviaste?» and «Vencidos» (every box starts unchecked, D3),
 * the confirmation being asked (`request`), and `busy` while it runs, which locks every box and per-entry button.
 */
export type BulkSelection={readonly selected:ReadonlySet<string>;readonly busy:boolean;readonly request:Pending|null;readonly select:(ids:readonly string[],on:boolean)=>void;readonly setBusy:(busy:boolean)=>void;readonly open:(event:BulkEvent,items:readonly Message[])=>void;readonly close:()=>void};
/**
 * Holds a {@link BulkSelection}. `blocks` are the eligible ids of each block («¿Lo enviaste?», «Vencidos»): whenever they change the
 * selection keeps only ids still eligible in the same block, so an open that moved to «Vencidos» (or stopped being answerable) arrives unchecked.
 */
export function useBulkSelection({blocks}:{blocks:readonly (readonly string[])[]}):BulkSelection{
 const [selected,setSelected]=useState<ReadonlySet<string>>(()=>new Set()),[busy,setBusy]=useState(false),[request,setRequest]=useState<Pending|null>(null);
 const select=useCallback((ids:readonly string[],on:boolean)=>setSelected(current=>{const next=new Set(current);for(const id of ids){if(on)next.add(id);else next.delete(id);}return next;}),[]);
 const open=useCallback((event:BulkEvent,items:readonly Message[])=>setRequest({event,items}),[]),close=useCallback(()=>setRequest(null),[]);
 const where=useRef(new Map<string,number>()),key=blocks.map(ids=>ids.join(',')).join('|');
 useLayoutEffect(()=>{
  const now=new Map(blocks.flatMap((ids,block)=>ids.map(id=>[id,block] as const))),before=where.current;where.current=now;
  setSelected(current=>{const next=new Set([...current].filter(id=>now.has(id)&&now.get(id)===before.get(id)));return next.size===current.size?current:next;});
  // `key` stands for the content of `blocks`.
 },[key]);
 return useMemo(()=>({selected,busy,request,select,setBusy,open,close}),[selected,busy,request,select,open,close]);
}

const channelName=(m:Message)=>isInstagramAttempt(m)?'Instagram':'WhatsApp';
/** The box of one eligible open, «Seleccionar WhatsApp para Ana». */
export function BulkCheckbox({message,bulk}:{message:Message;bulk:BulkSelection}){
 return <Checkbox className={styles.bulkPick} aria-label={`Seleccionar ${channelName(message)} para ${message.recipientName||message.recipient}`} checked={bulk.selected.has(String(message.id))} disabled={bulk.busy} disabledReason={BUSY_REASON} onChange={e=>bulk.select([String(message.id)],e.currentTarget.checked)}/>;
}

/**
 * The bulk bar of a «¿Lo enviaste?» (or «Vencidos») block, spec 100 §8 / D3, business view only: «Seleccionar todos ({N})» (or
 * «Deseleccionar todos» once every box is checked) and, with a
 * selection, «Sí, se enviaron (n)» / «No se enviaron (n)», which ask {@link BulkConfirmDialog}. `messages` are the block's eligible
 * opens; with fewer than 2 nothing renders.
 */
export function BulkConfirmBar({messages,bulk}:{messages:readonly Message[];bulk:BulkSelection}){
 if(messages.length<2)return null;
 const chosen=messages.filter(m=>bulk.selected.has(String(m.id)));
 return <div className={styles.bulkBar}>
  {chosen.length<messages.length?<Button size="sm" variant="link" disabled={bulk.busy} disabledReason={BUSY_REASON} onClick={()=>bulk.select(messages.map(m=>String(m.id)),true)}>Seleccionar todos ({messages.length})</Button>
   :<Button size="sm" variant="link" disabled={bulk.busy} disabledReason={BUSY_REASON} onClick={()=>bulk.select(messages.map(m=>String(m.id)),false)}>Deseleccionar todos</Button>}
  {chosen.length>0&&<><Button size="sm" disabled={bulk.busy} disabledReason={BUSY_REASON} onClick={()=>bulk.open('manual_sent',chosen)}>Sí, se enviaron ({chosen.length})</Button>
   <Button size="sm" variant="outline" disabled={bulk.busy} disabledReason={BUSY_REASON} onClick={()=>bulk.open('manual_not_sent',chosen)}>No se enviaron ({chosen.length})</Button></>}
 </div>;
}

type Blocked={message:Message;reason:string};
/** «¿Confirmás que enviaste estos {N} mensajes?» counting only what will be marked, singular for one. */
const confirmTitle=({sent,n}:{sent:boolean;n:number})=>!n?'Marcar como enviados':n===1?(sent?'¿Confirmás que enviaste este mensaje?':'¿Confirmás que este mensaje no se envió?'):sent?`¿Confirmás que enviaste estos ${n} mensajes?`:`¿Confirmás que estos ${n} mensajes no se enviaron?`;
/**
 * The mandatory confirmation of a bulk answer (spec 100 §8): what will be marked and, for «Sí», what is blocked with its
 * {@link sendBlockReason}. «Sí, marcar» runs {@link runBulkOutcome} with the dialog locked («Guardando {i} de {N}…»), then shows the
 * result per item under the fixed title «Resultado», a summary toast and reloads the lists. Only the items the server refused stay
 * selected, and only an explicit «Reintentar los que fallaron» sends them again, back through this confirmation with the reloaded state;
 * an uncertain or not attempted item is never offered (the seller checks the reloaded state first). Owned by «Requiere acción»
 * outside the strip, so the result stays visible when the reload empties the block. `eligible` are the opens still answerable now.
 */
export function BulkConfirmDialog({view,bulk,eligible}:{view:CommunicationView;bulk:BulkSelection;eligible:readonly Message[]}){
 const qc=useQueryClient(),[results,setResults]=useState<{items:readonly Message[];list:BulkResult[]}|null>(null),[progress,setProgress]=useState(0);
 const run=useGuardedMutation({
  mutationFn:async({event,markable,blocked}:{event:BulkEvent;markable:readonly Message[];blocked:readonly Blocked[]})=>{
   const done=await runBulkOutcome({ids:markable.map(m=>String(m.id)),event,post:postCommunication,onProgress:setProgress});
   const byId=new Map<string,BulkResult>([...done.map(r=>[r.id,r] as const),...blocked.map(b=>[String(b.message.id),{id:String(b.message.id),kind:'blocked',text:b.reason}] as const)]);
   return [...markable,...blocked.map(b=>b.message)].map(m=>byId.get(String(m.id))!);
  },
  onMutate:()=>{bulk.setBusy(true);setProgress(0);},
  onSuccess:(list,{markable,blocked})=>{
   const items=[...markable,...blocked.map(b=>b.message)];setResults({items,list});invalidateAfterOutcome(qc);
   const {text,warn}=bulkSummary(list);if(warn)toast.warning(text);else crmSuccess(text);
   bulk.select(items.map(m=>String(m.id)),false);bulk.select(list.filter(r=>r.kind==='error').map(r=>r.id),true);
  },
  onSettled:()=>bulk.setBusy(false),
 });
 const request=bulk.request;if(!request)return null;
 const close=()=>{setResults(null);bulk.close();};
 const management=(m:Message)=>{if(m.leadId==null)return 'General';const id=String(m.leadId);return view.detail?.opportunities.find(o=>String(o.id)===id)?.opportunityName??view.data.openManagements.find(o=>String(o.id)===id)?.opportunityName??'General';};
 // Only an admin can select someone else's open (`canConfirmSend`): the line then says who opened it.
 const line=(m:Message)=>`${channelName(m)} · ${m.recipientName||m.recipient} · ${formatDateTime(m.lastInteractionAt??m.updatedAt)} · ${management(m)}${m.ownerEmail===view.userEmail?'':' · abrió '+actorLabel(m.ownerEmail,view.detail?.users)}`;
 const sent=request.event==='manual_sent',running=run.isPending;
 if(results){
  const shown=new Map(results.items.map(m=>[String(m.id),m])),retry=eligible.filter(m=>results.list.some(r=>r.kind==='error'&&r.id===String(m.id)));
  return <CrmDialog opened onClose={close} title="Resultado">
   <ul className={styles.bulkList} aria-label="Resultado">{results.list.map(r=><li key={r.id} data-kind={r.kind}>{line(shown.get(r.id)!)}<span className={styles.bulkNote}> · {r.text}</span></li>)}</ul>
   <div className={styles.bulkActions}>{retry.length>0&&<Button onClick={()=>{setResults(null);bulk.open(request.event,retry);}}>Reintentar los que fallaron ({retry.length})</Button>}<Button variant="outline" onClick={close}>Listo</Button></div>
  </CrmDialog>;
 }
 const blocked:Blocked[]=sent?request.items.flatMap(m=>{const reason=sendBlockReason({view,message:m});return reason?[{message:m,reason}]:[];}):[];
 const off=new Set(blocked.map(b=>String(b.message.id))),markable=request.items.filter(m=>!off.has(String(m.id))),n=markable.length;
 return <CrmDialog opened busy={running} onClose={close} title={confirmTitle({sent,n})}>
  {n>0&&<ul className={styles.bulkList} aria-label="Se van a marcar">{markable.map(m=><li key={m.id}>{line(m)}</li>)}</ul>}
  {blocked.length>0&&<><h6 className={styles.blockTitle}>No se van a marcar</h6><ul className={styles.bulkList} aria-label="No se van a marcar">{blocked.map(b=><li key={b.message.id}>{line(b.message)}<span className={styles.bulkNote}> · {b.reason}</span></li>)}</ul></>}
  <p className={styles.blockHelp}>{sent?'Marcar como enviado es tu confirmación: queda registrado como contacto.':'Marcarlos como no enviados los saca de los pendientes.'}</p>
  {!n&&<p role="status" className={styles.blockHelp}>{NONE_MARKABLE}</p>}
  <div className={styles.bulkActions}>
   <Button disabled={running||!n} disabledReason={running?BUSY_REASON:NONE_MARKABLE} onClick={()=>run.mutate({event:request.event,markable,blocked})}>{running?`Guardando ${progress} de ${n}…`:`Sí, marcar ${n}`}</Button>
   <Button variant="outline" disabled={running} disabledReason={BUSY_REASON} onClick={close}>Volver</Button>
  </div>
 </CrmDialog>;
}
