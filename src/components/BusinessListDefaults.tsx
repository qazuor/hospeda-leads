import { NativeSelect } from './NativeSelect';
import { Checkbox } from './Checkbox';
import { Input } from './Input';
import React,{useRef,useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {getBusinessListDefaults,saveBusinessListDefaults} from '../endpoints/business_list_defaults.schema';
import {availableListPreferences,BUSINESS_PAGINATION_CONTROLS_ENABLED,BUSINESS_RESULTS_CONTROL_ENABLED,basePreferences,BUSINESS_COLUMNS,BUSINESS_FILTER_COLUMNS,type TeamDefaults} from '../helpers/businessListPreferences';
import {BusinessListOptions} from './BusinessListOptions';
import {FilterBuilderDialog,type FilterFieldDefinition} from './FilterBuilderDialog';
import {Button} from './Button';
import {Skeleton} from './Skeleton';
import {defaultSystemViews,systemViewHelp} from '../helpers/businessSystemViews';
import {ArrowUp,ArrowDown} from 'lucide-react';
import viewStyles from './BusinessListDefaults.module.css';
import {toast} from 'sonner';
import styles from '../pages/business-list.module.css';
export function BusinessListDefaults(){const q=useQuery({queryKey:['business-list-defaults'],queryFn:getBusinessListDefaults});return q.isPending?<Skeleton className={styles.skeleton}/>:q.error?<p role="alert">{q.error.message}<Button onClick={()=>q.refetch()}>Reintentar</Button></p>:<DefaultsEditor key={q.dataUpdatedAt} initial={q.data!.defaults??{preferences:basePreferences(),presets:[],initialPresetId:null}}/>;}
function DefaultsEditor({initial}:{initial:TeamDefaults}){
 const [value,setValue]=useState(()=>({...initial,systemViews:initial.systemViews??defaultSystemViews(),preferences:availableListPreferences(initial.preferences)})),[name,setName]=useState(''),[filterId,setFilterId]=useState<string|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');const latch=useRef(false),qc=useQueryClient();
 const p=value.preferences;const change=(patch:Partial<typeof p>)=>setValue({...value,preferences:{...p,...patch}});
 const fields:FilterFieldDefinition[]=BUSINESS_FILTER_COLUMNS.map(c=>({key:c.key as FilterFieldDefinition['key'],label:c.label,kind:c.key.startsWith('fecha')||c.key.endsWith('At')?'date':c.key==='id'?'number':c.key==='clientePotencialRecurrente'?'boolean':c.key==='notes'?'notes':'text'}));
 async function save(){if(latch.current)return;latch.current=true;setBusy(true);setError('');try{await saveBusinessListDefaults(value);toast.success('Configuraciones por defecto guardadas');await qc.invalidateQueries({queryKey:['business-list-defaults']});}catch(e){setError((e as Error).message);}finally{latch.current=false;setBusy(false);}}
 return <section className={styles.panel}><h2>Configuraciones por defecto del listado</h2><p>Estas configuraciones se aplican al comenzar o al restablecer. Las preferencias personales tienen prioridad. En mobile, la presentación inicial es grilla.</p><fieldset disabled={busy} style={{border:0,padding:0}}><div className={styles.toolbar}>
 <label>Presentación inicial<NativeSelect value={p.presentation} onChange={e=>change({presentation:e.target.value as typeof p.presentation})}><option value="table">Tabla</option><option value="grid">Grilla</option></NativeSelect></label>
 {BUSINESS_RESULTS_CONTROL_ENABLED&&<label>Cantidad inicial de resultados<NativeSelect value={p.pageSize} onChange={e=>change({pageSize:Number(e.target.value)})}>{[10,25,50,100].map(n=><option key={n}>{n}</option>)}</NativeSelect></label>}
 {BUSINESS_PAGINATION_CONTROLS_ENABLED&&<label>Forma inicial de carga<NativeSelect value={p.loadMode} onChange={e=>change({loadMode:e.target.value as typeof p.loadMode})}><option value="pages">Paginación</option><option value="continuous">Carga continua</option></NativeSelect></label>}
 <label>Ordenamiento inicial<NativeSelect value={p.sortBy} onChange={e=>change({sortBy:e.target.value as typeof p.sortBy})}>{BUSINESS_COLUMNS.filter(c=>c.key!=='actions').map(c=><option value={c.key} key={c.key}>{c.label}</option>)}</NativeSelect></label>
 <label>Dirección inicial<NativeSelect value={p.sortDir} onChange={e=>change({sortDir:e.target.value as typeof p.sortDir})}><option value="asc">Ascendente</option><option value="desc">Descendente</option></NativeSelect></label>
 </div><BusinessListOptions value={p} onChange={preferences=>setValue({...value,preferences})}/>
 <section className={viewStyles.systemViews} aria-label="Configurar vistas del sistema"><h3>Vistas del sistema</h3><p>Elegí cuáles aparecen en Negocios, sus nombres y su orden. Mis negocios usa el usuario que aplica la vista; las fechas se calculan al aplicarla. No modifica preferencias personales ni activa filtros.</p>
 {value.systemViews.map((view,index)=><div className={viewStyles.viewRow} key={view.id}><label className={viewStyles.visibility}><Checkbox  aria-label={'Mostrar vista '+view.id} checked={view.enabled} onChange={e=>setValue({...value,systemViews:value.systemViews.map(v=>v.id===view.id?{...v,enabled:e.target.checked}:v)})}/><span>Visible</span></label><label className={viewStyles.name}><span>Nombre</span><Input aria-label={'Nombre de vista '+view.id} value={view.name} maxLength={80} onChange={e=>setValue({...value,systemViews:value.systemViews.map(v=>v.id===view.id?{...v,name:e.target.value}:v)})}/><small>{systemViewHelp[view.id]}</small></label><div className={viewStyles.order}>{[-1,1].map(direction=><Button key={direction} type="button" size="icon-sm" variant="ghost" aria-label={(direction<0?'Subir':'Bajar')+' vista '+view.id} disabled={index+direction<0||index+direction>=value.systemViews.length} onClick={()=>{const next=[...value.systemViews];[next[index],next[index+direction]]=[next[index+direction],next[index]];setValue({...value,systemViews:next});}}>{direction<0?<ArrowUp size={16} aria-hidden="true"/>:<ArrowDown size={16} aria-hidden="true"/>}</Button>)}</div></div>)}
 </section>
 <h3>Filtros preestablecidos disponibles</h3><p>Crear un filtro no lo activa automáticamente.</p>
 <label>Nombre del filtro<Input value={name} onChange={e=>setName(e.target.value)} maxLength={80}/></label> <Button variant="outline" disabled={!name.trim()} onClick={()=>{const id=crypto.randomUUID();setValue({...value,presets:[...value.presets,{id,name:name.trim(),filters:[]}]});setName('');setFilterId(id);}}>Crear filtro preestablecido</Button>
 {value.presets.map(preset=><p key={preset.id}>{preset.name} · {preset.filters.reduce((n,g)=>n+g.rules.length,0)} condiciones <Button variant="outline" onClick={()=>setFilterId(preset.id)}>Editar filtro</Button> <Button variant="outline" onClick={()=>setValue({...value,presets:value.presets.filter(p=>p.id!==preset.id),initialPresetId:value.initialPresetId===preset.id?null:value.initialPresetId})}>Quitar filtro</Button></p>)}
 <label>Filtro aplicado inicialmente<NativeSelect value={value.initialPresetId??''} onChange={e=>setValue({...value,initialPresetId:e.target.value||null})}><option value="">Ninguno</option>{value.presets.map(preset=><option key={preset.id} value={preset.id}>{preset.name}</option>)}</NativeSelect></label>
 <p><Button onClick={save} disabled={busy}>{busy?'Guardando configuraciones por defecto…':'Guardar configuraciones por defecto'}</Button></p></fieldset>
 {error&&<p role="alert" className={styles.error}>{error}</p>}
 <FilterBuilderDialog open={!!filterId} onOpenChange={open=>{if(!open)setFilterId(null);}} fields={fields} value={value.presets.find(p=>p.id===filterId)?.filters??[]} title="Configurar filtro preestablecido" search={value.presets.find(p=>p.id===filterId)?.query??''} onApply={(filters,query)=>{setValue({...value,presets:value.presets.map(p=>p.id===filterId?{...p,filters,query}:p)});setFilterId(null);}}/>
 </section>;
}
