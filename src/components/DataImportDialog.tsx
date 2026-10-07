import React,{useState} from 'react';
import Papa from 'papaparse';
import {useQueryClient} from '@tanstack/react-query';
import {toast} from 'sonner';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from './Dialog';
import {Input} from './Input';
import {Button} from './Button';
import {getQuality,qualityRequest,type ImportReview,type ImportResult,type QualityMutation} from '../endpoints/dataQuality.schema';
import {businessImportFields,businessFields,dataFieldLabels,comparisonName} from '../helpers/dataNormalization';
import styles from './DataQuality.module.css';
type Decision=Extract<QualityMutation,{action:'import_confirm'}>['decisions'][number];
export function DataImportDialog({onClose}:{onClose:()=>void}){
 const qc=useQueryClient();
 const mode='business' as const;
 const availableFields=businessImportFields;
 const [raw,setRaw]=useState<Record<string,string>[]>([]),[headers,setHeaders]=useState<string[]>([]),[mapping,setMapping]=useState<Record<string,string>>({});
 const [source,setSource]=useState(''),[sourceUrl,setSourceUrl]=useState(''),[obtainedAt,setObtainedAt]=useState('');
 const [review,setReview]=useState<ImportReview|null>(null),[decisions,setDecisions]=useState<Decision[]>([]),[result,setResult]=useState<ImportResult|null>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[confirm,setConfirm]=useState(false);
 async function upload(file:File){setBusy(true);setError('');try{
  const {config}=await getQuality();if(file.size>config.maxFileBytes)throw new Error('Archivo demasiado grande. Máximo '+config.maxFileBytes+' bytes.');
  const parsed=Papa.parse<Record<string,string>>(await file.text(),{header:true,skipEmptyLines:'greedy',transformHeader:s=>s.trim()});
  if(parsed.errors.length)throw new Error(parsed.errors.map(e=>e.message).join('; '));
  if(!parsed.meta.fields?.length||new Set(parsed.meta.fields).size!==parsed.meta.fields.length||parsed.meta.renamedHeaders&&Object.keys(parsed.meta.renamedHeaders).length)throw new Error('Encabezados vacíos o repetidos.');
  if(parsed.data.length>config.maxRows)throw new Error('Máximo '+config.maxRows+' filas por lote. Dividí el CSV.');
  setRaw(parsed.data);setHeaders(parsed.meta.fields);setMapping(Object.fromEntries(availableFields.map(f=>[f,parsed.meta.fields!.find(h=>h.toLowerCase()===f.toLowerCase()||comparisonName(h)===comparisonName(dataFieldLabels[f]))??''])));setReview(null);setResult(null);
 }catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 async function preview(){setBusy(true);setError('');try{
  const used=availableFields.map(f=>mapping[f]).filter(Boolean);if(new Set(used).size!==used.length)throw new Error('Una columna no puede mapearse a dos campos.');
  const rows=raw.map(row=>Object.fromEntries(Object.entries(mapping).filter(([f,h])=>h&&(availableFields as readonly string[]).includes(f)).map(([f,h])=>[f,row[h]??''])));
  const r=await qualityRequest<ImportReview>({action:'import_preview',rows,mode,source,sourceUrl:sourceUrl||null,obtainedAt:obtainedAt?new Date(obtainedAt+'T00:00:00-03:00').toISOString():null});
  setReview(r);setConfirm(false);if(r.status==='completed'&&r.result){setResult(r.result);return;}
  setDecisions(r.rows.map(row=>({index:row.index,action:row.errors.length||row.matches.length||row.withinBatch.length?'skip':'create',acknowledge:false})));
 }catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 const change=(index:number,values:Partial<Decision>)=>setDecisions(ds=>ds.map(d=>d.index===index?{...d,...values}:d));
 async function commit(){if(!review)return;setBusy(true);setError('');try{
  const r=await qualityRequest<ImportResult>({action:'import_confirm',batchId:review.batchId,decisions,confirm:true});setResult(r);await qc.invalidateQueries();toast.success('Lote confirmado');
 }catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <Dialog open onOpenChange={open=>{if(!open&&!busy)onClose();}}><DialogContent className={styles.dialog}><DialogHeader><DialogTitle>Importar CSV con revisión</DialogTitle><DialogDescription>Vacíos al actualizar se omiten. Ningún dato comercial se escribe hasta confirmar. No se normalizan silenciosamente los valores originales.</DialogDescription></DialogHeader><div className={styles.content}>
  {error&&<p role="alert" className={styles.error}>{error}</p>}
  {result?<div><h3>Lote {result.batchId}</h3><p>{result.imported} creados · {result.updated} actualizados · {result.skipped} omitidos · {result.errors} errores</p><details><summary>Informe por fila</summary>{result.details.map(d=><p key={d.index}>Fila {d.index+1}: {d.action} {d.id?<a href={'/accounts/'+(d.accountId||d.id)}>Negocio #{d.accountId||d.id}</a>:''}{d.entity==='opportunity'?' · Gestión #'+d.id:''}</p>)}</details><p className={styles.muted}>El lote queda cerrado. Confirmarlo nuevamente devuelve este mismo informe.</p><Button onClick={onClose}>Cerrar</Button></div>:!review?<>
   <p>Importa solo negocios, sin gestiones, tareas ni personas de contacto. Sin responsable en el archivo, quedan sin asignar. Iniciá una gestión cuando prepares una propuesta.</p>
   <label className={styles.field}>Archivo CSV (hasta 250 filas)<input type="file" accept=".csv,text/csv" disabled={busy} onChange={e=>{if(e.target.files?.[0])void upload(e.target.files[0]);}}/></label>
   <div className={styles.grid}><label>Fuente<Input value={source} onChange={e=>setSource(e.target.value)} placeholder="Planilla comercial / relevamiento manual"/></label><label>URL de origen (opcional)<Input value={sourceUrl} onChange={e=>setSourceUrl(e.target.value)}/></label><label>Fecha de obtención (opcional)<Input type="date" value={obtainedAt} onChange={e=>setObtainedAt(e.target.value)}/></label></div>
   {!!raw.length&&<><h3>Mapear columnas · {raw.length} filas</h3><div className={styles.grid}>{availableFields.map(f=><label key={f}>{dataFieldLabels[f]}{f==='nombre'?' *':''}<select className={styles.select} value={mapping[f]??''} onChange={e=>setMapping(m=>({...m,[f]:e.target.value}))}><option value="">No importar</option>{headers.map(h=><option key={h}>{h}</option>)}</select></label>)}</div><Button disabled={busy||!source.trim()||!mapping.nombre} onClick={()=>void preview()}>{busy?'Validando…':'Revisar lote'}</Button></>}
  </>:<><div className={styles.heading}><span>Lote {review.batchId} · {review.mode==='business'?'Solo negocios':'Con gestión inicial'} · Fuente: {review.source}</span><Button variant="outline" disabled={busy} onClick={()=>{setReview(null);setConfirm(false);}}>Volver al mapeo / refrescar preview</Button></div><p className={styles.muted}>Actualizar modifica datos del negocio. Las coincidencias requieren revisión y no acreditan identidad. Las filas coincidentes se omiten inicialmente.</p>
   <div className={styles.scroll}>{review.rows.map(row=>{const d=decisions[row.index];return <section className={styles.row} key={row.index}><div className={styles.heading}><strong>Fila {row.index+1}: {row.values.nombre||'Sin nombre'}</strong><select aria-label={'Acción fila '+(row.index+1)} className={styles.select} value={d.action} onChange={e=>change(row.index,{action:e.target.value as Decision['action'],targetId:undefined,revision:undefined})}><option value="skip">Omitir</option><option value="create" disabled={!!row.errors.length}>Crear</option><option value="update" disabled={!!row.errors.length}>Actualizar negocio</option></select></div>
    {!!row.errors.length&&<p className={styles.error}>{row.errors.join(' · ')}</p>}{!!row.warnings.length&&<p>{row.warnings.join(' · ')}</p>}
    {row.matches.map(m=><p key={m.id}>#{m.id} {m.nombre} · {m.kind==='duplicate_candidate'?'Posible duplicado':'Persona compartida / negocio relacionado'}: {m.reasons.join('; ')}</p>)}{!!row.withinBatch.length&&<p>Coincidencia dentro del archivo con filas {row.withinBatch.map(i=>i+1).join(', ')}. Revisá si son negocios distintos.</p>}
    {d.action==='update'&&<><select aria-label={'Destino fila '+(row.index+1)} className={styles.select} value={d.targetId??''} onChange={e=>{const m=row.matches.find(m=>m.id===e.target.value);change(row.index,{targetId:m?.id,revision:m?.revision});}}><option value="">Elegí coincidencia destino</option>{row.matches.map(m=><option key={m.id} value={m.id}>#{m.id} {m.nombre} · {m.ciudad}</option>)}</select>{d.targetId&&<details open><summary>Cambios en el destino</summary><dl>{Object.entries(row.values).filter(([f,v])=>v.trim()&&(businessFields as readonly string[]).includes(f)).map(([f,v])=><div key={f}><dt>{dataFieldLabels[f]||f}</dt><dd>{row.matches.find(m=>m.id===d.targetId)?.current[f]||'Vacío'} → {v}</dd></div>)}</dl></details>}{Object.keys(row.values).some(f=>row.values[f].trim()&&!(businessFields as readonly string[]).includes(f))&&<p className={styles.error}>Hay campos de gestión mapeados. Volvé al mapeo y excluilos para actualizar.</p>}</>}
    <details><summary>Ver datos originales que se importarán</summary><dl>{Object.entries(row.values).map(([f,v])=><div key={f}><dt>{dataFieldLabels[f]||f}</dt><dd>{v||'Vacío: se omite al actualizar'}</dd></div>)}</dl></details>
    {d.action!=='skip'&&!!(row.warnings.length||row.matches.length||row.withinBatch.length)&&<label><input type="checkbox" checked={d.acknowledge} onChange={e=>change(row.index,{acknowledge:e.target.checked})}/> Revisé las coincidencias y los datos ambiguos de esta fila.</label>}
   </section>;})}</div>
   <label><input type="checkbox" checked={confirm} onChange={e=>setConfirm(e.target.checked)}/> Confirmo {decisions.filter(d=>d.action==='create').length} altas, {decisions.filter(d=>d.action==='update').length} actualizaciones y {decisions.filter(d=>d.action==='skip').length} omisiones. Los vacíos no borran datos.</label>
   <Button disabled={!confirm||busy} onClick={()=>void commit()}>{busy?'Confirmando…':'Confirmar lote'}</Button>
  </>}
 </div></DialogContent></Dialog>;
}
