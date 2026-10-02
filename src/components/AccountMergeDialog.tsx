import React,{useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {useNavigate} from 'react-router-dom';
import {qualityRequest,type MergePreview} from '../endpoints/dataQuality.schema';
import {businessFields} from '../helpers/dataNormalization';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from './Dialog';
import {Button} from './Button';
import {Textarea} from './Textarea';
import styles from './DataQuality.module.css';
export function AccountMergeDialog({sourceId,destinationId,onClose}:{sourceId:string;destinationId:string;onClose:()=>void}){
 const qc=useQueryClient(),navigate=useNavigate();const [pair,setPair]=useState({sourceId,destinationId});
 const q=useQuery({queryKey:['merge-preview',pair.sourceId,pair.destinationId],queryFn:()=>qualityRequest<MergePreview>({action:'merge_preview',...pair}),refetchOnWindowFocus:false,staleTime:Infinity,retry:false});
 const [selections,setSelections]=useState<Record<string,'source'|'destination'>>(Object.fromEntries(businessFields.map(f=>[f,'destination']))),[reason,setReason]=useState(''),[confirm,setConfirm]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function merge(){if(!q.data)return;setBusy(true);setError('');try{const r=await qualityRequest<{id:string}>({action:'merge_confirm',...pair,token:q.data.token,selections,reason,confirm:true});onClose();navigate('/accounts/'+r.id);void qc.invalidateQueries({predicate:q=>q.queryKey[0]!=='merge-preview'});}catch(e){setError((e as Error).message);setConfirm(false);}finally{setBusy(false);}}
 return <Dialog open onOpenChange={o=>{if(!o&&!busy)onClose();}}><DialogContent className={styles.dialog}><DialogHeader><DialogTitle>Fusionar negocios</DialogTitle><DialogDescription>Acción definitiva, sin deshacer. Conserva todas las oportunidades, personas, notas, documentos y seguimiento; no deduplica personas ni ventas.</DialogDescription></DialogHeader><div className={styles.content}>
 {q.isPending?<p>Cargando preview…</p>:q.error?<p role="alert">{q.error.message}</p>:q.data&&<><p>Origen: #{q.data.source.id} {q.data.source.nombre} → Destino: #{q.data.destination.id} {q.data.destination.nombre}</p><Button variant="outline" disabled={busy} onClick={()=>{setPair({sourceId:pair.destinationId,destinationId:pair.sourceId});setConfirm(false);setSelections(Object.fromEntries(businessFields.map(f=>[f,'destination'])));}}>Invertir destino</Button>
 <div className={styles.scroll}><table className={styles.table}><thead><tr><th>Campo</th><th>Origen</th><th>Destino</th><th>Conservar</th></tr></thead><tbody>{businessFields.map(f=><tr key={f}><th>{f}</th><td>{q.data!.source[f]||'Vacío'}</td><td>{q.data!.destination[f]||'Vacío'}</td><td><select aria-label={'Conservar '+f} className={styles.select} value={selections[f]} onChange={e=>{setSelections(s=>({...s,[f]:e.target.value as 'source'|'destination'}));setConfirm(false);}}><option value="destination">Destino</option><option value="source">Origen</option></select></td></tr>)}</tbody></table></div>
 <details><summary>Relaciones conservadas (ambos negocios)</summary>{Object.entries(q.data.counts).map(([k,v])=><p key={k}>{k}: {v}</p>)}</details><p className={styles.muted}>No contactar: {q.data.policy.doNotContact?'Sí':'No'} · Condición: {q.data.policy.commercialStatus==='client'?'Cliente comercial':'Prospecto'}. Responsables y ventas mantienen su asignación. Principal del destino prevalece; el del origen se conserva como persona. Los enlaces al origen abren el destino.</p>
 <label className={styles.field}>Motivo<Textarea value={reason} onChange={e=>setReason(e.target.value)}/></label>
 <label><input type="checkbox" checked={confirm} onChange={e=>setConfirm(e.target.checked)}/> Verifiqué que son el mismo negocio y revisé los valores finales.</label>
 {error&&<p role="alert" className={styles.error}>{error}</p>}{error&&<Button variant="outline" onClick={()=>{void q.refetch();setConfirm(false);}}>Actualizar preview</Button>}
 <Button disabled={!confirm||reason.trim().length<3||busy} onClick={()=>void merge()}>{busy?'Fusionando…':'Fusionar definitivamente'}</Button></>}
 </div></DialogContent></Dialog>;
}
