import React,{useRef,useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {getBusinessListDefaults,saveBusinessListDefaults} from '../endpoints/business_list_defaults.schema';
import {basePreferences,BUSINESS_COLUMNS,BUSINESS_FILTER_COLUMNS,type TeamDefaults} from '../helpers/businessListPreferences';
import {BusinessListOptions} from './BusinessListOptions';
import {FilterBuilderDialog,type FilterFieldDefinition} from './FilterBuilderDialog';
import {Button} from './Button';
import {Skeleton} from './Skeleton';
import {toast} from 'sonner';
import styles from '../pages/business-list.module.css';
export function BusinessListDefaults(){const q=useQuery({queryKey:['business-list-defaults'],queryFn:getBusinessListDefaults});return q.isPending?<Skeleton className={styles.skeleton}/>:q.error?<p role="alert">{q.error.message}<Button onClick={()=>q.refetch()}>Reintentar</Button></p>:<DefaultsEditor key={q.dataUpdatedAt} initial={q.data!.defaults??{preferences:basePreferences(),presets:[],initialPresetId:null}}/>;}
function DefaultsEditor({initial}:{initial:TeamDefaults}){
 const [value,setValue]=useState(initial),[name,setName]=useState(''),[filterId,setFilterId]=useState<string|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');const latch=useRef(false),qc=useQueryClient();
 const p=value.preferences;const change=(patch:Partial<typeof p>)=>setValue({...value,preferences:{...p,...patch}});
 const fields:FilterFieldDefinition[]=BUSINESS_FILTER_COLUMNS.map(c=>({key:c.key as FilterFieldDefinition['key'],label:c.label,kind:c.key.startsWith('fecha')||c.key.endsWith('At')?'date':c.key==='id'?'number':c.key==='clientePotencialRecurrente'?'boolean':c.key==='notes'?'notes':'text'}));
 async function save(){if(latch.current)return;latch.current=true;setBusy(true);setError('');try{await saveBusinessListDefaults(value);toast.success('Valores iniciales del equipo guardados');await qc.invalidateQueries({queryKey:['business-list-defaults']});}catch(e){setError((e as Error).message);}finally{latch.current=false;setBusy(false);}}
 return <section className={styles.panel}><h2>Listado inicial de negocios</h2><p>Estos valores se aplican al comenzar o al restablecer. Las preferencias personales tienen prioridad. En mobile, la presentación inicial es grilla.</p><fieldset disabled={busy} style={{border:0,padding:0}}><div className={styles.toolbar}>
 <label>Presentación inicial<select value={p.presentation} onChange={e=>change({presentation:e.target.value as typeof p.presentation})}><option value="table">Tabla</option><option value="grid">Grilla</option></select></label>
 <label>Cantidad inicial de resultados<select value={p.pageSize} onChange={e=>change({pageSize:Number(e.target.value)})}>{[10,25,50,100].map(n=><option key={n}>{n}</option>)}</select></label>
 <label>Forma inicial de carga<select value={p.loadMode} onChange={e=>change({loadMode:e.target.value as typeof p.loadMode})}><option value="pages">Paginación</option><option value="continuous">Carga continua</option></select></label>
 <label>Ordenamiento inicial<select value={p.sortBy} onChange={e=>change({sortBy:e.target.value as typeof p.sortBy})}>{BUSINESS_COLUMNS.map(c=><option value={c.key} key={c.key}>{c.label}</option>)}</select></label>
 <label>Dirección inicial<select value={p.sortDir} onChange={e=>change({sortDir:e.target.value as typeof p.sortDir})}><option value="asc">Ascendente</option><option value="desc">Descendente</option></select></label>
 </div><BusinessListOptions value={p} onChange={preferences=>setValue({...value,preferences})}/>
 <h3>Filtros preestablecidos disponibles</h3><p>Crear un filtro no lo activa automáticamente.</p>
 <label>Nombre del filtro<input value={name} onChange={e=>setName(e.target.value)} maxLength={80}/></label> <Button variant="outline" disabled={!name.trim()} onClick={()=>{const id=crypto.randomUUID();setValue({...value,presets:[...value.presets,{id,name:name.trim(),filters:[]}]});setName('');setFilterId(id);}}>Crear filtro preestablecido</Button>
 {value.presets.map(preset=><p key={preset.id}>{preset.name} · {preset.filters.reduce((n,g)=>n+g.rules.length,0)} condiciones <Button variant="outline" onClick={()=>setFilterId(preset.id)}>Editar filtro</Button> <Button variant="outline" onClick={()=>setValue({...value,presets:value.presets.filter(p=>p.id!==preset.id),initialPresetId:value.initialPresetId===preset.id?null:value.initialPresetId})}>Quitar filtro</Button></p>)}
 <label>Filtro aplicado inicialmente<select value={value.initialPresetId??''} onChange={e=>setValue({...value,initialPresetId:e.target.value||null})}><option value="">Ninguno</option>{value.presets.map(preset=><option key={preset.id} value={preset.id}>{preset.name}</option>)}</select></label>
 <p><Button onClick={save} disabled={busy}>{busy?'Guardando valores del equipo…':'Guardar valores del equipo'}</Button></p></fieldset>
 {error&&<p role="alert" className={styles.error}>{error}</p>}
 <FilterBuilderDialog open={!!filterId} onOpenChange={open=>{if(!open)setFilterId(null);}} fields={fields} value={value.presets.find(p=>p.id===filterId)?.filters??[]} title="Configurar filtro preestablecido" search="" onApply={filters=>{setValue({...value,presets:value.presets.map(p=>p.id===filterId?{...p,filters}:p)});setFilterId(null);}}/>
 </section>;
}
