import {CrmDateInput} from './ui/CrmDateInput';
import {useGuardedMutation} from '../helpers/useGuardedMutation';
import {crmError} from '../helpers/crmErrors';
import { NativeSelect } from './NativeSelect';
import { Input } from './Input';
import React,{useRef,useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {BusinessViewBadges} from './BusinessViewBadges';
import {MoreViewsMenu} from './MoreViewsMenu';
import {PinnedViewsPanel} from './PinnedViewsPanel';
import {useViewPins} from '../hooks/useViewPins';
import {personalViewKey,resolveViewPins,systemViewKey} from '../helpers/viewPins';
import type {ViewManagementRequest} from './PersonalViewsDialog';
import viewStyles from './BusinessListTools.module.css';
import {Button} from './Button';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from './Dialog';
import {getLeadDuplicates} from '../endpoints/leads_duplicates_GET.schema';
import {AccountMergeDialog} from './AccountMergeDialog';
import {BulkChangeReview} from './BulkChangeReview';
import {postLeadsBulk,type InputType} from '../endpoints/leads_bulk_POST.schema';
import {saveCommercial} from '../endpoints/commercial.schema';
import {getSavedLeadViews} from '../endpoints/saved_views_GET.schema';
import {PersonalViewsDialog} from './PersonalViewsDialog';
import type {FilterFieldDefinition} from './FilterBuilderDialog';
import {getSettings} from '../endpoints/settings_GET.schema';
import {preferencesFromSavedView,type ListPreferences} from '../helpers/businessListPreferences';
import {pruneDeletedGroupPreferences,type BusinessColumnGroup} from '../helpers/businessColumnGroups';
import {applyBusinessSystemView,defaultSystemViews,type BusinessSystemView} from '../helpers/businessSystemViews';
import {toast} from 'sonner';
import {RotateCcw} from 'lucide-react';
import type {BusinessViewSelection} from '../helpers/businessViewSelection';
import type {InputType as ViewInput,OutputType as ViewOutput} from '../endpoints/saved_views_POST.schema';
import styles from '../pages/business-list.module.css';
export function BusinessListTools({saveDialog,onSaveDialogChange:setSaveDialog,onReset,userId,userEmail,systemViews,groups=[],groupsResolved=true,admin,prefs,fields,onChange,selected,onClear,duplicatesOpen:duplicates,onDuplicatesOpenChange:setDuplicates,activeView,viewModified=false,onViewSelect,onViewSaved}:{saveDialog:boolean;onSaveDialogChange:(open:boolean)=>void;onReset:()=>void;userId:number;userEmail:string;systemViews?:BusinessSystemView[];groups?:BusinessColumnGroup[];groupsResolved?:boolean;admin:boolean;prefs:ListPreferences;fields:FilterFieldDefinition[];onChange:(p:ListPreferences)=>void;selected:string[];onClear:()=>void;duplicatesOpen:boolean;onDuplicatesOpenChange:(open:boolean)=>void;activeView:BusinessViewSelection|null;viewModified?:boolean;onViewSelect:(kind:'system'|'personal',id:string,name:string,preferences:ListPreferences)=>void;onViewSaved:(input:ViewInput,result:ViewOutput)=>void}){
 const [pinsOpen,setPinsOpen]=useState(false),pins=useViewPins();
 const [management,setManagement]=useState<ViewManagementRequest|null>(null);
 const qc=useQueryClient();const [pair,setPair]=useState<{sourceId:string;destinationId:string}|null>(null),[field,setField]=useState('ciudad'),[value,setValue]=useState(''),[review,setReview]=useState<InputType|null>(null),[remove,setRemove]=useState(false),[deleteReason,setDeleteReason]=useState('');
 const latch=useRef(false);const dup=useQuery({queryKey:['lead-duplicates'],queryFn:getLeadDuplicates,enabled:admin&&duplicates});const settings=useQuery({queryKey:['settings'],queryFn:getSettings});const views=useQuery({queryKey:['business-saved-views',userId],queryFn:getSavedLeadViews});
 const bulk=useGuardedMutation({mutationFn:postLeadsBulk});const deletion=useGuardedMutation({mutationFn:saveCommercial});
 const options=field==='ciudad'?settings.data?.cities.map(c=>({value:c.name,label:c.name})):field==='assignedUserEmail'?settings.data?.users.map(u=>({value:u.email,label:u.displayName||u.email})):field==='estado'?settings.data?.opportunityStages.map(v=>({value:v,label:v})):field==='tipo'?settings.data?.types.map(v=>({value:v,label:v})):(field==='prioridad'?['alta','media','baja']:['Independiente','Consolidado','Referente']).map(v=>({value:v,label:v}));
 async function apply(fingerprint:string){if(latch.current)return;latch.current=true;try{await bulk.mutateAsync({...review!,expectedFingerprint:fingerprint});setReview(null);onClear();await qc.invalidateQueries({queryKey:['leads']});toast.success('Cambios guardados');}catch(e){toast.error(crmError(e));}finally{latch.current=false;}}
 async function trash(){if(latch.current)return;latch.current=true;try{await deletion.mutateAsync({action:'account_trash',accountIds:selected,deleted:true,reason:deleteReason});setRemove(false);onClear();await qc.invalidateQueries({queryKey:['leads']});await Promise.all(['trash-businesses','commercial','work','lead-stats','crm-search'].map(key=>qc.invalidateQueries({queryKey:[key]})));toast.success('Negocios enviados a Papelera');}catch(e){toast.error(crmError(e));}finally{latch.current=false;}}
 const available=[...(systemViews??defaultSystemViews()).filter(view=>view.enabled).map(view=>({key:systemViewKey(view.id),name:view.name,kind:view.id.startsWith('custom:')?'Del equipo':'Rápida',group:view.id.startsWith('custom:')?'team' as const:'quick' as const,type:'system' as const,id:view.id})),...(views.data?.views.filter(view=>view.id&&(!view.config.entity||view.config.entity==='business')).map(view=>({key:personalViewKey(view.id!),name:view.name,kind:'Tuya',group:'personal' as const,type:'personal' as const,id:view.id!}))??[])];
 const resolved=resolveViewPins(available,pins.isLoading||pins.isError?null:pins.config('business'),systemViewKey('all'));
 const pinControlsDisabled=views.isPending||pins.isLoading||pins.isError;
 const applyView=(kind:'system'|'personal',id:string)=>{if(kind==='system'){const view=(systemViews??defaultSystemViews()).find(view=>view.id===id);if(view){const next=applyBusinessSystemView(prefs,view,userEmail);const resolvedPrefs=groupsResolved?pruneDeletedGroupPreferences(next,groups):next;onViewSelect(kind,id,view.name,resolvedPrefs);onChange(resolvedPrefs);}}else{const view=views.data?.views.find(view=>view.id===id);if(!view)return;const preferences=preferencesFromSavedView(prefs,view.config),next=preferences?(groupsResolved?pruneDeletedGroupPreferences(preferences,groups):preferences):null;if(next){onViewSelect(kind,id,view.name,next);onChange(next);}else toast.error('No pude recuperar los filtros de esta vista. Revisala antes de usarla.');}};
 return <>
 <div className={viewStyles.views}>
  <BusinessViewBadges views={resolved.pinned.map(view=>({...view,kind:view.type}))} active={activeView} onSelect={applyView}/>
  <MoreViewsMenu views={resolved.unpinned.map(view=>({key:view.key,name:view.name,group:view.group}))} activeKey={activeView?(activeView.kind==='system'?systemViewKey(activeView.id):personalViewKey(activeView.id)):''} onSelect={key=>{const view=available.find(item=>item.key===key);if(view)applyView(view.type,view.id);}} onPin={key=>void pins.pin('business',key,resolved.pinned.map(view=>view.key))} onEdit={()=>setPinsOpen(true)} disabled={pinControlsDisabled||pins.isPending}/>
  <div className={viewStyles.footer}><PersonalViewsDialog userId={userId} prefs={prefs} fields={fields} admin={admin} saveOpen={saveDialog} onSaveOpenChange={setSaveDialog} managementRequest={management} onManagementClose={()=>setManagement(null)} saveTarget={activeView?.kind==='personal'?views.data?.views.find(view=>view.id===activeView.id):undefined} onSaved={onViewSaved} onConverted={(sourceId,view)=>{if(activeView?.kind==='personal'&&activeView.id===sourceId){const next=applyBusinessSystemView(prefs,view,userEmail);const resolved=groupsResolved?pruneDeletedGroupPreferences(next,groups):next;onViewSelect('system',view.id,view.name,resolved);onChange(resolved);}}}/>
  <Button size="icon-sm" variant="ghost" aria-label="Restablecer configuraciones por defecto" title="Restablecer vista" onClick={onReset}><RotateCcw size={16} aria-hidden="true"/></Button></div>
  {views.isPending&&<span role="status">Cargando tus vistas…</span>}
  {views.error&&<span role="alert">No pude cargar las vistas. <Button size="sm" variant="ghost" onClick={()=>views.refetch()}>Reintentar</Button></span>}
 </div>
 <PinnedViewsPanel open={pinsOpen} onClose={()=>setPinsOpen(false)} entity="business" views={available.map(view=>({key:view.key,name:view.name,kind:view.kind}))} config={pins.config('business')} externalBusy={pins.isPending} onSave={async config=>{await pins.save('business',config);}} onReset={async()=>{await pins.reset('business');}}/>
 {selected.length>0&&<section aria-label="Modificar negocios seleccionados" className={`${styles.panel} ${viewStyles.bulkBar}`}><strong>{selected.length} seleccionados</strong><div className={styles.toolbar}><NativeSelect aria-label="Campo a modificar" value={field} onChange={e=>{setField(e.target.value);setValue('');}}><option value="ciudad">Ciudad</option>{admin&&<option value="assignedUserEmail">Responsable</option>}<option value="estado">Etapa de las gestiones</option><option value="prioridad">Prioridad</option><option value="tipo">Vertical</option><option value="commercialProfile">Perfil comercial</option><option value="fechaProximaAccion">Próxima acción</option></NativeSelect>
 {field==='fechaProximaAccion'?<CrmDateInput aria-label="Nueva fecha"  value={value} onValueChange={e=>setValue(e)}/>:<NativeSelect aria-label="Nuevo valor" value={value} onChange={e=>setValue(e.target.value)}><option value="">Elegir valor…</option>{['prioridad','commercialProfile','assignedUserEmail'].includes(field)&&<option value="__CLEAR__">Sin valor</option>}{options?.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</NativeSelect>}
 <p>{['ciudad','assignedUserEmail'].includes(field)?'Modifica los datos del negocio.':'Modifica todas las gestiones activas de los negocios seleccionados, incluso las que no coincidan con el filtro.'}</p>
 <Button disabled={!value||bulk.isPending} disabledReason={(bulk.isPending) ? "La operación está en curso. Esperá a que termine para continuar." : "Elegí el valor que querés aplicar."} onClick={()=>{bulk.reset();setReview({entity:'business',ids:selected,changes:{[field]:value==='__CLEAR__'?null:value}});}}>Aplicar</Button><Button variant="outline" onClick={()=>setRemove(true)}>Enviar a Papelera</Button><Button variant="outline" onClick={onClear}>Cancelar selección</Button></div></section>}
 {review&&<BulkChangeReview input={review} onClose={()=>setReview(null)} onConfirm={apply} pending={bulk.isPending} error={bulk.error?.message}/>}
 <Dialog open={remove} onOpenChange={v=>!deletion.isPending&&setRemove(v)}><DialogContent><DialogTitle>Enviar negocios a Papelera</DialogTitle><DialogDescription>Usá esta acción solo para negocios inválidos o cargados por error. Se ocultarán de las listas habituales, pero sus contactos, gestiones, tareas e historial se conservan. Solo un administrador puede restaurarlos desde Papelera. Si el negocio es válido y solo dejás de trabajarlo, usá Archivar.</DialogDescription><label>Motivo para enviar estos negocios a Papelera<Input value={deleteReason} disabled={deletion.isPending} onChange={e=>setDeleteReason(e.target.value)}/></label>{deletion.error&&<p role="alert">{crmError(deletion.error)}</p>}<Button variant="destructive" disabled={deletion.isPending||deleteReason.trim().length<3} disabledReason={(deletion.isPending) ? "La operación está en curso. Esperá a que termine para continuar." : "Completá el motivo obligatorio (mínimo 3 caracteres)."} onClick={trash}>{deletion.isPending?'Enviando a Papelera…':'Confirmar envío a Papelera'}</Button><Button disabled={deletion.isPending} disabledReason="La operación está en curso. Esperá a que termine para continuar." onClick={()=>setRemove(false)}>Cancelar</Button></DialogContent></Dialog>
 <Dialog open={duplicates} onOpenChange={setDuplicates}><DialogContent><DialogTitle>Duplicados potenciales</DialogTitle><DialogDescription>Revisá si son el mismo establecimiento antes de fusionar.</DialogDescription>{dup.isFetching?<p>Cargando duplicados…</p>:dup.error?<p role="alert">{crmError(dup.error)}</p>:dup.data?.groups.map((g,i)=><section key={i} className={viewStyles.duplicateGroup}><h3>{g.reason}</h3>{g.leads.map(l=><div key={l.accountId}><strong>{l.nombre}</strong><p>{l.email} · {l.telefono}</p>{admin&&g.leads.some(x=>x.accountId!==l.accountId)&&<Button onClick={()=>{setDuplicates(false);setPair({sourceId:l.accountId,destinationId:g.leads.find(x=>x.accountId!==l.accountId)!.accountId});}}>Revisar fusión</Button>}<Button variant="outline" onClick={()=>{setDuplicates(false);onChange({...prefs,query:l.nombre,filters:[]});}}>Ver en listado</Button></div>)}</section>)}{dup.data?.groups.length===0&&<p>No encontré duplicados.</p>}</DialogContent></Dialog>
 {pair&&<AccountMergeDialog {...pair} onClose={()=>setPair(null)}/>}
 </>;
}
