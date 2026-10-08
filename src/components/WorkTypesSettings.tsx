import { Input } from './Input';
import { Checkbox } from './Checkbox';
import React,{useState} from 'react';
import {useQuery,useMutation,useQueryClient} from '@tanstack/react-query';
import {getWork,postWork} from '../endpoints/work.schema';
import {Button} from './Button';
import styles from './Commercial.module.css';
export function WorkTypesSettings(){
 const qc=useQueryClient();const q=useQuery({queryKey:['work','types'],queryFn:()=>getWork()});
 const [followupDraft,setFollowupDraft]=useState<{stages:string;days:number}|null>(null);
 const [draft,setDraft]=useState({id:'',name:'',agenda:false,active:true});const [editing,setEditing]=useState(false);
 const save=useMutation({mutationFn:postWork,onSuccess:async()=>{await qc.invalidateQueries({queryKey:['work']});setDraft({id:'',name:'',agenda:false,active:true});setEditing(false);}});
 return <article className={styles.panel}><h2>Tipos de tareas y actividades</h2><p className={styles.muted}>Los mismos tipos se usan para planificar y registrar. Marcá Agenda para incluir visitas, reuniones u otros encuentros en el calendario. Desactivar conserva el historial.</p>
  {q.error&&<p role="alert">{q.error.message}</p>}<div className={styles.rows}>{q.data?.types.map(t=><article key={t.id}><div><strong>{t.name}</strong><span>{t.agenda?'Incluido en agenda':'Seguimiento'} · {t.active?'Activo':'Desactivado'}</span></div><Button size="sm" variant="outline" onClick={()=>{setDraft(t);setEditing(true);}}>Editar</Button></article>)}</div>
  <form className={styles.form} onSubmit={e=>{e.preventDefault();save.mutate({action:'type_save',...draft});}}>
   <label>Identificador estable<Input required pattern="[a-z][a-z0-9_-]{0,79}" value={draft.id} disabled={editing} onChange={e=>setDraft({...draft,id:e.target.value})} placeholder="ej.: demostracion"/></label>
   <label>Nombre visible<Input required value={draft.name} onChange={e=>setDraft({...draft,name:e.target.value})}/></label>
   <label className={styles.checkbox}><Checkbox  checked={draft.agenda} onChange={e=>setDraft({...draft,agenda:e.target.checked})}/>Mostrar en agenda</label>
   <label className={styles.checkbox}><Checkbox  checked={draft.active} disabled={draft.id==='followup'} onChange={e=>setDraft({...draft,active:e.target.checked})}/>Activo</label>
   {save.error&&<p role="alert">{save.error.message}</p>}<div className={styles.actions}><Button disabled={save.isPending} type="submit">{editing?'Guardar tipo':'Agregar tipo'}</Button>{editing&&<Button variant="outline" type="button" onClick={()=>{setEditing(false);setDraft({id:'',name:'',agenda:false,active:true});}}>Volver</Button>}</div>
  </form>
 <h3>Interesados sin seguimiento</h3><p className={styles.muted}>Definí las etapas que indican interés y cuántos días una nueva asignación aparece en Mi día.</p>
  <form className={styles.form} onSubmit={e=>{e.preventDefault();save.mutate({action:'followup_settings',stages:(followupDraft?.stages??q.data?.followupStages.join(',')??'').split(',').map(s=>s.trim()).filter(Boolean),newAssignmentDays:followupDraft?.days??q.data?.newAssignmentDays??7});}}>
   <label>Etapas interesadas (separadas por coma)<Input value={followupDraft?.stages??q.data?.followupStages.join(', ')??''} onChange={e=>setFollowupDraft({stages:e.target.value,days:followupDraft?.days??q.data?.newAssignmentDays??7})}/></label>
   <label>Días para nuevas asignaciones<Input type="number" min={1} max={90} value={followupDraft?.days??q.data?.newAssignmentDays??7} onChange={e=>setFollowupDraft({stages:followupDraft?.stages??q.data?.followupStages.join(', ')??'',days:Number(e.target.value)})}/></label>
   <div className={styles.actions}><Button type="submit" disabled={save.isPending}>Guardar seguimiento</Button></div>
  </form>
 </article>;
}
