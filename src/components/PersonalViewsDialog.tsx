import {useGuardedMutation} from '../helpers/useGuardedMutation';
import { Input } from './Input';
import { Checkbox } from './Checkbox';
import React,{useEffect,useRef,useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {Bookmark,LoaderCircle,Pencil,Settings2,Trash2} from 'lucide-react';
import {Button} from './Button';
import {Dialog,DialogContent,DialogDescription,DialogTitle} from './Dialog';
import {getSavedLeadViews,type SavedLeadView} from '../endpoints/saved_views_GET.schema';
import {postSavedLeadView,type InputType,type OutputType} from '../endpoints/saved_views_POST.schema';
import type {ListPreferences} from '../helpers/businessListPreferences';
import {toast} from 'sonner';
import styles from './PersonalViewsDialog.module.css';
type Screen={kind:'list'}|{kind:'edit'|'delete';view:SavedLeadView};
export type ViewManagementRequest={kind:'edit'|'delete';view:SavedLeadView;opener:HTMLButtonElement};
export function PersonalViewsDialog({userId,prefs,saveOpen,onSaveOpenChange,saveTarget,onSaved,managementRequest,onManagementClose}:{userId:number;prefs:ListPreferences;saveOpen:boolean;onSaveOpenChange:(open:boolean)=>void;saveTarget?:SavedLeadView;onSaved?:(input:InputType,result:OutputType)=>void;managementRequest?:ViewManagementRequest|null;onManagementClose?:()=>void}){
 const [manageOpen,setManageOpen]=useState(false),[screen,setScreen]=useState<Screen>({kind:'list'}),[name,setName]=useState(''),[replaceConfig,setReplaceConfig]=useState(false);
 const [saveMode,setSaveMode]=useState<'choice'|'new'|'update'>(saveTarget?'choice':'new');
 const focusReturn=useRef<HTMLButtonElement|null>(null);
 const direct=useRef(false);
 const manageButton=useRef<HTMLButtonElement>(null);
 const lock=useRef(false),qc=useQueryClient();const key=['business-saved-views',userId];
 const views=useQuery({queryKey:key,queryFn:getSavedLeadViews,enabled:saveOpen||manageOpen});
 const mutation=useGuardedMutation({mutationFn:postSavedLeadView,onSuccess:()=>qc.invalidateQueries({queryKey:key})});
 const pending=mutation.isPending,open=saveOpen||manageOpen;
 function close(){if(lock.current)return;setManageOpen(false);onSaveOpenChange(false);onManagementClose?.();}
 function show(next:Screen){mutation.reset();setScreen(next);setName(next.kind==='edit'?next.view.name:'');setReplaceConfig(false);}
 useEffect(()=>{if(managementRequest){direct.current=true;focusReturn.current=managementRequest.opener;show(managementRequest);setManageOpen(true);}},[managementRequest]);
 async function submit(input:InputType){if(lock.current)return;lock.current=true;try{
  const result=await mutation.mutateAsync(input);onSaved?.(input,result);
  if(saveOpen){onSaveOpenChange(false);toast.success(input.action==='save'?'Vista guardada':'Vista actualizada',{duration:8000});}
  else{if(direct.current){setManageOpen(false);onManagementClose?.();}else show({kind:'list'});toast.success(input.action==='delete'?'Vista eliminada. Los filtros actuales se conservan.':'Vista actualizada. Los filtros actuales se conservan.',{duration:8000});}
 }catch(error){toast.error((error as Error).message);/* Keep the error and entered values beside the action. */}finally{lock.current=false;}}
 const title=saveOpen?(saveMode==='choice'?'Guardar vista':saveMode==='update'?'Actualizar vista':'Guardar como vista'):screen.kind==='edit'?'Editar vista':screen.kind==='delete'?'Eliminar vista':'Tus vistas';
 return <>
  <Button ref={manageButton} variant="ghost" size="sm" aria-label="Administrar tus vistas" onClick={()=>{direct.current=false;focusReturn.current=manageButton.current;show({kind:'list'});setManageOpen(true);}}><Settings2 size={15} aria-hidden="true"/><span data-view-manage-label>Administrar</span></Button>
  <Dialog open={open} onOpenChange={value=>{if(!value)close();}}><DialogContent className={styles.dialog} showCloseButton={!pending} onCloseAutoFocus={event=>{event.preventDefault();const target=saveOpen?document.querySelector<HTMLButtonElement>('[data-view-id][aria-pressed="true"]'):focusReturn.current;if(target?.isConnected)target.focus();else manageButton.current?.focus();}}>
   <DialogTitle>{title}</DialogTitle>
   <DialogDescription>{saveOpen?(saveMode==='new'?'Guardá la búsqueda, los filtros y la presentación actuales.':`Elegí cómo guardar los cambios de «${saveTarget?.name}».`):screen.kind==='edit'?'Cambiá el nombre o reemplazá la configuración guardada con la del listado actual.':screen.kind==='delete'?'Solo se elimina la vista guardada. Los negocios y los filtros del listado se conservan.':'Editá o eliminá tus vistas personales. Las vistas del sistema se configuran desde Administración.'}</DialogDescription>
   {mutation.error&&<p className={styles.error} role="alert">{mutation.error.message}</p>}
   {saveOpen&&saveMode==='choice'?<div className={styles.form}>
    <Button className={styles.saveOption} variant="outline" onClick={()=>setSaveMode('new')}><Bookmark size={16} aria-hidden="true"/>Guardar como vista nueva</Button>
    <Button className={styles.saveOption} onClick={()=>setSaveMode('update')}><Pencil size={16} aria-hidden="true"/>Actualizar la vista actual</Button>
    <div className={styles.actions}><Button variant="ghost" onClick={close}>Cancelar</Button></div>
   </div>:saveOpen&&saveMode==='update'&&saveTarget?<div className={styles.form}>
    <p className={styles.viewName}>{saveTarget.name}</p><p>Se reemplazarán la búsqueda, los filtros y la presentación guardados. El nombre se conserva.</p>
    <div className={styles.actions}><Button variant="outline" disabled={pending} onClick={close}>Cancelar</Button><Button disabled={pending} onClick={()=>void submit({action:'update',id:saveTarget.id,name:saveTarget.name,view:{name:saveTarget.name,config:{...saveTarget.config,entity:'business',preferences:prefs}}})}>{pending&&<LoaderCircle size={16} aria-hidden="true"/>}{pending?'Guardando vista…':'Actualizar vista'}</Button></div>
   </div>:saveOpen||screen.kind==='edit'?<form className={styles.form} onSubmit={event=>{event.preventDefault();if(!name.trim())return;void submit(saveOpen?{action:'save',view:{name:name.trim(),config:{entity:'business',preferences:prefs}}}:{action:'update',id:screen.kind==='edit'?screen.view.id:undefined,name:screen.kind==='edit'?screen.view.name:'',view:{name:name.trim(),config:replaceConfig?{entity:'business',preferences:prefs}:screen.kind==='edit'?screen.view.config:{}}});}}>
    <label className={styles.field}>Nombre de la vista<Input autoFocus required maxLength={80} value={name} disabled={pending} onChange={event=>setName(event.target.value)}/></label>
    {!saveOpen&&<label className={styles.choice}><Checkbox  checked={replaceConfig} disabled={pending} onChange={event=>setReplaceConfig(event.target.checked)}/><span>Usar la búsqueda, los filtros y la presentación actuales<small>Si lo dejás sin marcar, solo cambia el nombre.</small></span></label>}
    <div className={styles.actions}><Button type="button" variant="outline" disabled={pending} onClick={()=>saveOpen||direct.current?close():show({kind:'list'})}>Cancelar</Button><Button type="submit" disabled={pending||!name.trim()}>{pending&&<LoaderCircle size={16} aria-hidden="true"/>}{pending?'Guardando vista…':saveOpen?'Guardar vista':'Guardar cambios'}</Button></div>
   </form>:screen.kind==='delete'?<div className={styles.form}><p className={styles.viewName}>{screen.view.name}</p><div className={styles.actions}><Button variant="outline" disabled={pending} onClick={()=>direct.current?close():show({kind:'list'})}>Cancelar</Button><Button variant="destructive" disabled={pending} onClick={()=>void submit({action:'delete',id:screen.view.id,name:screen.view.name})}>{pending&&<LoaderCircle size={16} aria-hidden="true"/>}{pending?'Eliminando vista…':'Eliminar vista'}</Button></div></div>:<>
    {views.isPending?<p role="status">Cargando tus vistas…</p>:views.error?<p role="alert">No pude cargar tus vistas. <Button variant="outline" size="sm" disabled={views.isFetching} onClick={()=>views.refetch()}>Reintentar</Button></p>:<ul className={styles.list}>{views.data?.views.filter(view=>!view.config.entity||view.config.entity==='business').map(view=><li key={view.id??view.name}><Bookmark size={16} aria-hidden="true"/><span className={styles.viewName}>{view.name}</span><Button variant="ghost" size="icon-sm" aria-label={'Editar vista '+view.name} onClick={()=>show({kind:'edit',view})}><Pencil size={16} aria-hidden="true"/></Button><Button variant="ghost" size="icon-sm" aria-label={'Eliminar vista '+view.name} onClick={()=>show({kind:'delete',view})}><Trash2 size={16} aria-hidden="true"/></Button></li>)}</ul>}
    {views.isSuccess&&!views.data.views.some(view=>!view.config.entity||view.config.entity==='business')&&<p className={styles.empty}>Todavía no guardaste vistas personales. Usá “Guardar como vista” desde la barra de filtros.</p>}
    <div className={styles.actions}><Button variant="outline" onClick={close}>Listo</Button></div>
   </>}
  </DialogContent></Dialog>
 </>;
}
