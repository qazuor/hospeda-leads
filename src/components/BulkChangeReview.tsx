import { Checkbox } from './Checkbox';
import React,{useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {postLeadsBulk,type InputType} from '../endpoints/leads_bulk_POST.schema';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from './Dialog';
import {Button} from './Button';
import styles from './Commercial.module.css';
export function BulkChangeReview({input,onClose,onConfirm,pending,error}:{input:InputType;onClose:()=>void;onConfirm:(fingerprint:string)=>void;pending:boolean;error?:string}){
 const [confirmed,setConfirmed]=useState(false);
 const q=useQuery({queryKey:['bulk-preview',input],queryFn:()=>postLeadsBulk({...input,preview:true}),staleTime:0,refetchOnWindowFocus:false,refetchOnReconnect:false});
 const p=q.data?.preview;const businessFields=input.entity==='business'&&Object.keys(input.changes).every(k=>['ciudad','assignedUserEmail'].includes(k));
 return <Dialog open onOpenChange={v=>!v&&!pending&&onClose()}><DialogContent className={styles.editor}><DialogTitle>Revisar cambios antes de aplicar</DialogTitle><DialogDescription>Revisá el alcance completo. Cerrar esta gestiónna no modifica datos.</DialogDescription>
 <p>Cambio solicitado: {Object.entries(input.changes).map(([k,v])=>({estado:'Etapa',prioridad:'Prioridad',assignedUserEmail:'Responsable',fechaProximaAccion:'Próxima acción',tipo:'Vertical',ciudad:'Localidad',commercialProfile:'Perfil comercial'}[k]??k)+': '+(v??'Sin valor')).join(' · ')}</p>
 {q.isPending&&<p role="status">Buscando todos los registros afectados…</p>}{q.error&&<p role="alert">{q.error.message}</p>}
 {p&&<><p><strong>{businessFields?p.businesses.length:p.rows.length} {businessFields?'negocios':'gestiones'} {businessFields?'afectados':'afectadas'}</strong>. {input.entity==='business'&&!businessFields?'Incluye todas las gestiones no retiradas de los negocios seleccionados, aunque no aparezcan en el filtro.':''}</p>
 <div style={{maxHeight:'40dvh',overflow:'auto'}} aria-label="Registros afectados">{businessFields?p.businesses.map(a=><article key={a.id}><strong>{a.nombre}</strong><p>Negocio #{a.id} · {a.ciudad||'Sin localidad'} · {a.assignedUserEmail||'Sin responsable'}</p></article>):p.rows.map(l=><article key={l.id}><strong>{l.opportunityName||'Gestión sin nombre'}</strong><p>{l.nombre} · Gestión #{l.id} · {l.estado||'Sin etapa'} · {l.assignedUserEmail||'Sin responsable'}</p></article>)}</div>
 <label className={styles.checkbox}><Checkbox  disabled={pending||q.isFetching} checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>Revisé los registros y quiero aplicar este cambio</label>
 {error&&<p role="alert">{error}</p>}
 <div className={styles.actions}><Button disabled={!confirmed||pending||q.isFetching||!(businessFields?p.businesses.length:p.rows.length)} onClick={()=>onConfirm(p.fingerprint)}>{pending?'Aplicando…':'Confirmar cambios'}</Button><Button variant="outline" disabled={pending} onClick={()=>{setConfirmed(false);void q.refetch()}}>Volver a revisar</Button><Button variant="ghost" disabled={pending} onClick={onClose}>Cancelar</Button></div></>}
 </DialogContent></Dialog>;
}
