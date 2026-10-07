import React,{useRef,useState} from 'react';
import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query';
import {ChevronDown,LoaderCircle} from 'lucide-react';
import {Popover,PopoverContent,PopoverTrigger} from './Popover';
import {Button} from './Button';
import {ValueBadge} from './ValueBadge';
import {useAuth} from '../helpers/useAuth';
import {getCommercialDetail} from '../endpoints/commercial.schema';
import {getSettings} from '../endpoints/settings_GET.schema';
import {postLeadsQuick} from '../endpoints/leads_quick_POST.schema';
import {toast} from 'sonner';
import styles from './InlineBusinessBadge.module.css';
export function InlineBusinessBadge({accountId,name,field,value,label}:{accountId:string;name:string;field:'ciudad'|'assignedUserEmail';value:string|null;label:string}){
 const [processing,setProcessing]=useState(false);
 const [open,setOpen]=useState(false),[draft,setDraft]=useState<{value:string;expected:string|null}|null>(null);const lock=useRef(false),qc=useQueryClient(),{authState}=useAuth();
 const detail=useQuery({queryKey:['commercial-detail',accountId],queryFn:()=>getCommercialDetail(accountId),enabled:open,refetchOnMount:'always'});
 const settings=useQuery({queryKey:['settings'],queryFn:getSettings,enabled:open});const save=useMutation({mutationFn:postLeadsQuick});
 const title=field==='ciudad'?'Ciudad':'Responsable',empty=field==='ciudad'?'Sin ciudad':'Sin responsable';const current=detail.data?.account[field]??null;
 const allowed=authState.type==='authenticated'&&!!detail.data&&!detail.data.account.archivedAt&&(authState.user.role==='admin'||field==='ciudad'&&detail.data.account.assignedUserEmail===authState.user.email);
 const loading=detail.isFetching||settings.isPending,options=field==='ciudad'?settings.data?.cities.map(v=>({value:v.name,label:v.name}))??[]:settings.data?.users.map(v=>({value:v.email,label:v.displayName||v.email}))??[];
 async function submit(){if(lock.current||!draft||!allowed)return;lock.current=true;setProcessing(true);try{
  await save.mutateAsync({id:accountId,accountId,field,value:draft.value||null,expectedValue:draft.expected});
  await Promise.all([qc.invalidateQueries({queryKey:['leads']}),qc.invalidateQueries({queryKey:['commercial-detail',accountId]})]);setOpen(false);toast.success(title+' actualizado',{duration:8000});
 }catch(error){toast.error((error as Error).message);}finally{lock.current=false;setProcessing(false);}}
 return <Popover open={open} onOpenChange={next=>{if(lock.current)return;if(next){setDraft(null);save.reset();void detail.refetch();}setOpen(next);}}>
  <PopoverTrigger asChild><button type="button" className={styles.trigger} aria-label={'Editar '+title.toLowerCase()+' de '+name}><ValueBadge category={field==='ciudad'?'city':'person'} value={label||empty} muted={!value} nativeTooltip={false} className={styles.badge}/><ChevronDown size={12} aria-hidden="true"/></button></PopoverTrigger>
  <PopoverContent aria-label={'Editar '+title.toLowerCase()} className={styles.popover} align="start" onEscapeKeyDown={event=>{if(lock.current)event.preventDefault();}} onInteractOutside={event=>{if(lock.current)event.preventDefault();}}>
   <h3>Editar {title.toLowerCase()}</h3><p className={styles.help}>{name}</p>
   {loading?<p role="status">Cargando opciones…</p>:detail.error||settings.error?<p role="alert">{detail.error?.message||settings.error?.message}<Button variant="outline" size="sm" onClick={()=>{void detail.refetch();void settings.refetch();}}>Reintentar</Button></p>:!allowed?<p role="alert">Ya no tenés permiso para modificar este dato. Actualizá el listado.</p>:<form onSubmit={event=>{event.preventDefault();void submit();}}>
    <label>{title}<select autoFocus aria-label={'Nuevo valor de '+title.toLowerCase()} disabled={processing} value={draft?.value??current??''} onChange={event=>setDraft({value:event.target.value,expected:draft?draft.expected:current})}><option value="">{empty}</option>{current&&!options.some(v=>v.value===current)&&<option value={current}>{current} (valor actual)</option>}{options.map(v=><option key={v.value} value={v.value}>{v.label}</option>)}</select></label>
    <p className={styles.help}>Se modifica solo este dato del negocio. Sus gestiones y compromisos se conservan. Con filtros activos, el negocio podría dejar de aparecer.</p>
    {save.error&&<div className={styles.error} role="alert"><p>{save.error.message}</p><Button type="button" size="sm" variant="outline" disabled={processing} onClick={()=>{setDraft(null);save.reset();void detail.refetch();}}>Recargar datos</Button></div>}
    <div className={styles.actions}><Button variant="outline" size="sm" disabled={processing} onClick={()=>setOpen(false)}>Cancelar</Button><Button type="submit" size="sm" disabled={processing||!draft||(draft.value||null)===current}>{processing&&<LoaderCircle size={14} aria-hidden="true"/>}{processing?'Guardando '+title.toLowerCase()+'…':'Guardar'}</Button></div>
   </form>}
   {(loading||detail.error||settings.error||!allowed)&&<Button variant="outline" size="sm" onClick={()=>setOpen(false)}>Cerrar</Button>}
  </PopoverContent>
 </Popover>;
}
