import {CrmDateInput} from './ui/CrmDateInput';
import {useGuardedMutation} from '../helpers/useGuardedMutation';
import { NativeSelect } from './NativeSelect';
import { Input } from './Input';
import React,{useRef,useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {BusinessViewBadges} from './BusinessViewBadges';
import type {ViewManagementRequest} from './PersonalViewsDialog';
import viewStyles from './BusinessListTools.module.css';
import {Button} from './Button';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from './Dialog';
import {getLeadDuplicates} from '../endpoints/leads_duplicates_GET.schema';
import {AccountMergeDialog} from './AccountMergeDialog';
import {BulkChangeReview} from './BulkChangeReview';
import {postLeadsBulk,type InputType} from '../endpoints/leads_bulk_POST.schema';
import {postLeadsBulkDelete} from '../endpoints/leads_bulk_delete_POST.schema';
import {getSavedLeadViews} from '../endpoints/saved_views_GET.schema';
import {PersonalViewsDialog} from './PersonalViewsDialog';
import {getSettings} from '../endpoints/settings_GET.schema';
import {preferencesFromSavedView,type ListPreferences} from '../helpers/businessListPreferences';
import {applyBusinessSystemView,defaultSystemViews,type BusinessSystemView} from '../helpers/businessSystemViews';
import {toast} from 'sonner';
import type {BusinessViewSelection} from '../helpers/businessViewSelection';
import type {InputType as ViewInput,OutputType as ViewOutput} from '../endpoints/saved_views_POST.schema';
import styles from '../pages/business-list.module.css';
export function BusinessListTools({saveDialog,onSaveDialogChange:setSaveDialog,userId,userEmail,systemViews,admin,prefs,onChange,selected,onClear,duplicatesOpen:duplicates,onDuplicatesOpenChange:setDuplicates,activeView,viewModified,onViewSelect,onViewSaved}:{saveDialog:boolean;onSaveDialogChange:(open:boolean)=>void;userId:number;userEmail:string;systemViews?:BusinessSystemView[];admin:boolean;prefs:ListPreferences;onChange:(p:ListPreferences)=>void;selected:string[];onClear:()=>void;duplicatesOpen:boolean;onDuplicatesOpenChange:(open:boolean)=>void;activeView:BusinessViewSelection|null;viewModified:boolean;onViewSelect:(kind:'system'|'personal',id:string,name:string,preferences:ListPreferences)=>void;onViewSaved:(input:ViewInput,result:ViewOutput)=>void}){
 const [management,setManagement]=useState<ViewManagementRequest|null>(null);
 const qc=useQueryClient();const [pair,setPair]=useState<{sourceId:string;destinationId:string}|null>(null),[field,setField]=useState('ciudad'),[value,setValue]=useState(''),[review,setReview]=useState<InputType|null>(null),[remove,setRemove]=useState(false);
 const latch=useRef(false);const dup=useQuery({queryKey:['lead-duplicates'],queryFn:getLeadDuplicates,enabled:admin&&duplicates});const settings=useQuery({queryKey:['settings'],queryFn:getSettings});const views=useQuery({queryKey:['business-saved-views',userId],queryFn:getSavedLeadViews});
 const bulk=useGuardedMutation({mutationFn:postLeadsBulk});const deletion=useGuardedMutation({mutationFn:postLeadsBulkDelete});
 const options=field==='ciudad'?settings.data?.cities.map(c=>({value:c.name,label:c.name})):field==='assignedUserEmail'?settings.data?.users.map(u=>({value:u.email,label:u.displayName||u.email})):field==='estado'?settings.data?.opportunityStages.map(v=>({value:v,label:v})):field==='tipo'?settings.data?.types.map(v=>({value:v,label:v})):(field==='prioridad'?['alta','media','baja']:['Independiente','Consolidado','Referente']).map(v=>({value:v,label:v}));
 async function apply(fingerprint:string){if(latch.current)return;latch.current=true;try{await bulk.mutateAsync({...review!,expectedFingerprint:fingerprint});setReview(null);onClear();await qc.invalidateQueries({queryKey:['leads']});toast.success('Cambios guardados');}catch(e){toast.error((e as Error).message);}finally{latch.current=false;}}
 async function trash(){if(latch.current)return;latch.current=true;try{await deletion.mutateAsync({entity:'business',ids:selected});setRemove(false);onClear();await qc.invalidateQueries({queryKey:['leads']});toast.success('Gestiones enviadas a papelera');}catch(e){toast.error((e as Error).message);}finally{latch.current=false;}}
 return <>
 <div className={viewStyles.views}>
  <BusinessViewBadges system={(systemViews??defaultSystemViews()).filter(view=>view.enabled)} personal={views.data?.views.filter(view=>!view.config.entity||view.config.entity==='business')??[]} active={activeView} onManage={(kind,view,opener)=>setManagement({kind,view,opener})} onSelect={(kind,id)=>{if(kind==='system'){const view=(systemViews??defaultSystemViews()).find(view=>view.id===id);if(view){const next=applyBusinessSystemView(prefs,view.id,userEmail);onViewSelect(kind,id,view.name,next);onChange(next);}}else{const view=views.data?.views.find(view=>view.id===id);if(!view)return;const next=preferencesFromSavedView(prefs,view.config);if(next){onViewSelect(kind,id,view.name,next);onChange(next);}else toast.error('No pude recuperar los filtros de esta vista. Revisala antes de usarla.');}}}/>
  <div className={viewStyles.footer}>{activeView&&<span className={viewStyles.viewState} role="status" title={activeView.name}>Vista activa: <strong>{activeView.name}</strong> · {viewModified?'Modificada':'Sin cambios'}</span>}
  <PersonalViewsDialog key={saveDialog?'save':'manage'} userId={userId} prefs={prefs} saveOpen={saveDialog} onSaveOpenChange={setSaveDialog} managementRequest={management} onManagementClose={()=>setManagement(null)} saveTarget={activeView?.kind==='personal'?views.data?.views.find(view=>view.id===activeView.id):undefined} onSaved={onViewSaved}/></div>
  {views.isPending&&<span role="status">Cargando tus vistas…</span>}
  {views.error&&<span role="alert">No pude cargar las vistas. <Button size="sm" variant="ghost" onClick={()=>views.refetch()}>Reintentar</Button></span>}
 </div>
 {selected.length>0&&<section aria-label="Modificar negocios seleccionados" className={styles.panel}><strong>{selected.length} seleccionados</strong><div className={styles.toolbar}><NativeSelect aria-label="Campo a modificar" value={field} onChange={e=>{setField(e.target.value);setValue('');}}><option value="ciudad">Ciudad</option>{admin&&<option value="assignedUserEmail">Responsable</option>}<option value="estado">Etapa de las gestiones</option><option value="prioridad">Prioridad</option><option value="tipo">Vertical</option><option value="commercialProfile">Perfil comercial</option><option value="fechaProximaAccion">Próxima acción</option></NativeSelect>
 {field==='fechaProximaAccion'?<CrmDateInput aria-label="Nueva fecha"  value={value} onValueChange={e=>setValue(e)}/>:<NativeSelect aria-label="Nuevo valor" value={value} onChange={e=>setValue(e.target.value)}><option value="">Elegir valor…</option>{['prioridad','commercialProfile','assignedUserEmail'].includes(field)&&<option value="__CLEAR__">Sin valor</option>}{options?.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</NativeSelect>}
 <p>{['ciudad','assignedUserEmail'].includes(field)?'Modifica los datos del negocio.':'Modifica todas las gestiones activas de los negocios seleccionados, incluso las que no coincidan con el filtro.'}</p>
 <Button disabled={!value||bulk.isPending} onClick={()=>{bulk.reset();setReview({entity:'business',ids:selected,changes:{[field]:value==='__CLEAR__'?null:value}});}}>Aplicar</Button><Button variant="outline" onClick={()=>setRemove(true)}>Enviar a papelera</Button><Button variant="outline" onClick={onClear}>Cancelar selección</Button></div></section>}
 {review&&<BulkChangeReview input={review} onClose={()=>setReview(null)} onConfirm={apply} pending={bulk.isPending} error={bulk.error?.message}/>}
 <Dialog open={remove} onOpenChange={v=>!deletion.isPending&&setRemove(v)}><DialogContent><DialogTitle>Enviar gestiones a papelera</DialogTitle><DialogDescription>Se retirarán todas las gestiones activas de los negocios seleccionados, aunque no coincidan con el filtro. Los negocios, personas y asignaciones se conservan.</DialogDescription>{deletion.error&&<p role="alert">{deletion.error.message}</p>}<Button disabled={deletion.isPending} onClick={trash}>{deletion.isPending?'Enviando a papelera…':'Confirmar'}</Button><Button disabled={deletion.isPending} onClick={()=>setRemove(false)}>Cancelar</Button></DialogContent></Dialog>
 <Dialog open={duplicates} onOpenChange={setDuplicates}><DialogContent><DialogTitle>Duplicados potenciales</DialogTitle><DialogDescription>Revisá si son el mismo establecimiento antes de fusionar.</DialogDescription>{dup.isFetching?<p>Cargando duplicados…</p>:dup.error?<p role="alert">{dup.error.message}</p>:dup.data?.groups.map((g,i)=><section key={i} className={viewStyles.duplicateGroup}><h3>{g.reason}</h3>{g.leads.map(l=><div key={l.accountId}><strong>{l.nombre}</strong><p>{l.email} · {l.telefono}</p>{admin&&g.leads.some(x=>x.accountId!==l.accountId)&&<Button onClick={()=>{setDuplicates(false);setPair({sourceId:l.accountId,destinationId:g.leads.find(x=>x.accountId!==l.accountId)!.accountId});}}>Revisar fusión</Button>}<Button variant="outline" onClick={()=>{setDuplicates(false);onChange({...prefs,query:l.nombre,filters:[]});}}>Ver en listado</Button></div>)}</section>)}{dup.data?.groups.length===0&&<p>No encontré duplicados.</p>}</DialogContent></Dialog>
 {pair&&<AccountMergeDialog {...pair} onClose={()=>setPair(null)}/>}
 </>;
}
