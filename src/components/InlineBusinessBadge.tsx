import { Loader, UnstyledButton } from '@mantine/core';
import React,{useId,useRef,useState} from 'react';
import {Link} from 'react-router-dom';
import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query';
import {Check,ChevronDown,LoaderCircle} from 'lucide-react';
import {Popover,PopoverContent,PopoverTrigger} from './Popover';
import {Tooltip,TooltipTrigger,TooltipContent} from './Tooltip';
import {CrmButton as Button} from './ui/CrmButton';
import {CrmNativeSelect} from './ui/CrmNativeSelect';
import {ValueBadge} from './ValueBadge';
import {useAuth} from '../helpers/useAuth';
import {crmError} from '../helpers/crmErrors';
import {canModifyBusiness,canModifyManagement} from '../helpers/crmPermissions';
import {inlineBadgeFields,type InlineBadgeField} from '../helpers/inlineBadgeFields';
import {getCommercialDetail} from '../endpoints/commercial.schema';
import {getSettings} from '../endpoints/settings_GET.schema';
import {postLeadsQuick} from '../endpoints/leads_quick_POST.schema';
import {getLeads} from '../endpoints/leads_GET.schema';
import {toast} from 'sonner';
import {TOAST_MS} from '../helpers/crmFeedback';
import styles from './InlineBusinessBadge.module.css';
import {DisabledTooltip} from './Tooltip';
import {hasSellerChangeDraft,sellerGroupNotice} from '../helpers/sellerGroupNotice';
import {BusinessClassificationsField,type BusinessClassification} from './BusinessClassificationsField';

type Draft={value:string;expected:string|null;classification:{tipo:string|null;subtipo:string|null};classifications:BusinessClassification[];expectedClassifications:BusinessClassification[]};
export function InlineBusinessBadge({accountId,name,field,value,label,trigger}:{accountId:string;name:string;field:InlineBadgeField;value:string|null;label:string;trigger?:React.ReactNode}){
 const [tooltipOpen,setTooltipOpen]=useState(false);
 const [processing,setProcessing]=useState(false),[open,setOpen]=useState(false),[draft,setDraft]=useState<Draft|null>(null),[managementId,setManagementId]=useState('');
 const lock=useRef(false),inlineEditorId=useId(),qc=useQueryClient(),{authState}=useAuth();const [conflictMessage,setConflictMessage]=useState(''),[retryPayload,setRetryPayload]=useState<Draft|null>(null);
 const detail=useQuery({queryKey:['commercial-detail',accountId],queryFn:()=>getCommercialDetail(accountId),enabled:open,refetchOnMount:'always',refetchOnWindowFocus:false});
 const filterOptions=useQuery({queryKey:['business-inline-filter-options'],queryFn:()=>getLeads({entity:'business',filterOptions:'include',page:1,pageSize:10}),enabled:open&&['origen','quienCargo','creadoPor'].includes(field),staleTime:5*60*1000});
 const settings=useQuery({queryKey:['settings'],queryFn:getSettings,enabled:open});const save=useMutation({mutationFn:postLeadsQuick});
 const config=inlineBadgeFields[field],{title,empty,scope,category}=config;
 const account=detail.data?.account,gestions=detail.data?.opportunities??[];
 const management=scope==='management'?(managementId?gestions.find(item=>String(item.id)===managementId):gestions.length===1?gestions[0]:undefined):undefined;
 const current=(scope==='business'&&field==='assignedUserEmail'&&account?.referredToLeandro?account.referredOriginalOwnerEmail:scope==='business'?account?.[field as 'ciudad'|'assignedUserEmail'|'tipo'|'subtipo']:management?.[field as 'commercialProfile'|'medioContactoPreferido'|'origen'|'quienCargo'|'creadoPor'])??null;
 const user=authState.type==='authenticated'?authState.user:undefined;
 const allowed=scope==='business'?canModifyBusiness(user,account)&&(field!=='assignedUserEmail'||user?.role==='admin'):canModifyManagement(user,management,account);
 const loading=detail.isFetching&&!processing||settings.isPending||filterOptions.isPending&&['origen','quienCargo','creadoPor'].includes(field);
 const plainOptions=field==='tipo'?settings.data?.types??[]:field==='subtipo'?settings.data?.subtypes.filter(item=>item.typeName===account?.tipo).map(item=>item.name)??[]:field==='commercialProfile'?['Independiente','Consolidado','Referente']:field==='medioContactoPreferido'?settings.data?.contactChannels??[]:field==='ciudad'?settings.data?.cities.map(item=>item.name)??[]:field==='origen'?filterOptions.data?.filters.origenes??[]:field==='quienCargo'?filterOptions.data?.filters.quienesCargaron??[]:field==='creadoPor'?filterOptions.data?.filters.creadosPor??[]:[];
 const options=field==='assignedUserEmail'?settings.data?.users.filter(item=>!item.deactivatedAt).map(item=>({value:item.email,label:item.displayName||item.email}))??[]:Array.from(new Set([...plainOptions,...(['quienCargo','creadoPor'].includes(field)?settings.data?.users.map(item=>item.displayName)??[]:[])])).map(value=>({value,label:value}));
 const missingManagement=scope==='management'&&!management;
 const hasEditableManagement=gestions.some(item=>canModifyManagement(user,item,account));
 const compact=field!=='tipo'&&field!=='subtipo'&&!(scope==='management'&&gestions.length>1);
 // Spec 107 §7.1: one click, so the linked-group notice is shown before choosing instead of after.
 const groupNotice=field==='assignedUserEmail'&&detail.data?.sellerGroup&&!account?.archivedAt&&!account?.deletedAt&&!account?.mergedIntoId?sellerGroupNotice(detail.data.sellerGroup.members,accountId):'';
 async function submit(nextDraft=draft){if(lock.current||!nextDraft||!allowed)return;lock.current=true;setProcessing(true);setConflictMessage('');try{
  await save.mutateAsync({id:management?String(management.id):accountId,accountId,field,value:nextDraft.value||null,expectedValue:nextDraft.expected,scope,...(['tipo','subtipo'].includes(field)?{scope:'business',classifications:nextDraft.classifications.filter(item=>item.tipo.trim()),expectedClassifications:nextDraft.expectedClassifications}:{})});
  await Promise.all([qc.invalidateQueries({queryKey:['leads']}),qc.invalidateQueries({queryKey:['commercial-detail',accountId]})]);setRetryPayload(null);setOpen(false);toast.success(title+' actualizado',{duration:TOAST_MS.success});
 }catch(error){if(['tipo','subtipo'].includes(field)&&(error as {status?:number})?.status===409){const fresh=await detail.refetch();if(fresh.error||!fresh.data){toast.error('Otra persona cambió las verticales y no pudimos leer la lista actual. Cerrá y volvé a abrir para revisarla.');return;}const latest=fresh.data.account;const pairs=latest?.classifications??(latest?.tipo?[{tipo:latest.tipo,subtipo:latest.subtipo??null}]:[]);setDraft({value:'classifications',expected:latest?.tipo??null,classification:{tipo:latest?.tipo??null,subtipo:latest?.subtipo??null},classifications:pairs,expectedClassifications:pairs});setRetryPayload(null);save.reset();setConflictMessage('Otra persona cambió las verticales. Revisá la lista actual y guardá de nuevo.');}else if(['tipo','subtipo'].includes(field))setRetryPayload(nextDraft);else toast.error(crmError(error));}finally{lock.current=false;setProcessing(false);}}
 function reload(){setDraft(null);setRetryPayload(null);setConflictMessage('');save.reset();void detail.refetch();}
 return <Popover open={open} onOpenChange={next=>{if(lock.current)return;if(next){setDraft(null);setRetryPayload(null);setConflictMessage('');setManagementId('');save.reset();void detail.refetch();}setOpen(next);}}>
  <Tooltip open={tooltipOpen&&!open} onOpenChange={setTooltipOpen}><TooltipTrigger asChild><PopoverTrigger asChild><UnstyledButton type="button" className={styles.trigger} aria-label={'Editar '+title.toLowerCase()+' de '+name} aria-expanded={open} data-inline-editor-id={inlineEditorId}>{trigger??<><ValueBadge category={category} value={label||empty} muted={!value} nativeTooltip={false} className={styles.badge}/><ChevronDown size={12} aria-hidden="true"/></>}</UnstyledButton></PopoverTrigger></TooltipTrigger><TooltipContent className={styles.tooltip}>{label||empty}</TooltipContent></Tooltip>
  <PopoverContent data-inline-editor-dropdown={inlineEditorId} aria-label={compact?'Opciones de '+title.toLowerCase():'Editar '+title.toLowerCase()} className={compact?styles.compactPopover:styles.popover} align="start" onEscapeKeyDown={event=>{if(lock.current)event.preventDefault();}} onInteractOutside={event=>{if(lock.current)event.preventDefault();}}>
   {compact?<>
    {loading?<p className={styles.compactStatus} role="status"><Loader size={13} aria-hidden="true"/> Cargando…</p>:detail.error||settings.error||filterOptions.error?<div className={styles.compactError} role="alert"><span>{detail.error?.message||settings.error?.message||filterOptions.error?.message}</span><Button variant="outline" size="sm" onClick={()=>{void detail.refetch();void settings.refetch();void filterOptions.refetch();}}>Reintentar</Button></div>:missingManagement?<div className={styles.compactError} role="alert">Sin gestiones iniciadas. <Link to={'/accounts/'+accountId}>Abrir negocio</Link></div>:!allowed?<p className={styles.compactError} role="alert">No tenés permiso para modificar este dato.</p>:<>
     {groupNotice?<p className={styles.compactStatus} role="note">Si cambiás el responsable, también cambia el de: {groupNotice}.</p>:null}
     <div className={styles.optionList} role="group" aria-label={'Opciones de '+title.toLowerCase()}>
      {[{value:'',label:empty},...((current&&!options.some(item=>item.value===current))?[{value:current,label:current}]:[]),...options].map(item=>{
       const isCurrent=(item.value||null)===current;
       const currentClassifications=account?.classifications??(account?.tipo?[{tipo:account.tipo,subtipo:account.subtipo??null}]:[]);const nextDraft:Draft={value:item.value,expected:current,classification:{tipo:account?.tipo??null,subtipo:account?.subtipo??null},classifications:currentClassifications,expectedClassifications:currentClassifications};
       return <DisabledTooltip key={item.value||'__empty__'} disabled={processing||isCurrent} reason={processing?'Guardando el cambio. Esperá a que termine.':'Este es el valor actual; elegí otro valor para guardar un cambio.'} style={{width:'100%'}}><UnstyledButton type="button" className={styles.option} data-current={isCurrent||undefined} aria-pressed={isCurrent} disabled={processing||isCurrent} onClick={()=>{setDraft(nextDraft);void submit(nextDraft);}}>
        <ValueBadge category={category} value={item.label} muted={!item.value} nativeTooltip={false}/>{isCurrent?<Check size={14} aria-label="Valor actual"/>:null}
       </UnstyledButton></DisabledTooltip>;
      })}
     </div>
     {processing?<p className={styles.compactStatus} role="status"><LoaderCircle size={13} aria-hidden="true"/>Guardando…</p>:null}
     {save.error&&!processing?<div className={styles.compactError} role="alert"><span>{save.error.message}</span><Button size="sm" variant="outline" onClick={()=>{if(draft)void submit(draft);}}>Reintentar</Button></div>:null}
    </>}
   </>:<>
   <h3>Editar {title.toLowerCase()}</h3><p className={styles.help}>{name}</p>
   {loading?<p role="status"><Loader size="sm" aria-hidden="true"/> Cargando opciones…</p>:detail.error||settings.error||filterOptions.error?<p role="alert">{detail.error?.message||settings.error?.message||filterOptions.error?.message}<Button variant="outline" size="sm" onClick={()=>{void detail.refetch();void settings.refetch();void filterOptions.refetch();}}>Reintentar</Button></p>:<>
    {scope==='management'&&(gestions.length>1?<label className={styles.management}>Gestión a modificar<CrmNativeSelect aria-label="Gestión a modificar" disabled={processing||!hasEditableManagement} value={managementId} onChange={event=>{setManagementId(event.target.value);setDraft(null);save.reset();}}><option value="">Elegir gestión</option>{gestions.map(item=><option key={item.id} value={String(item.id)} disabled={!canModifyManagement(user,item,account)}>{item.opportunityName||'Gestión '+item.id} · {item.estado||'Sin etapa'}{canModifyManagement(user,item,account)?'':' · Solo consulta'}</option>)}</CrmNativeSelect></label>:gestions.length===1?<p className={styles.help}>Gestión: {gestions[0].opportunityName||'Gestión '+gestions[0].id}</p>:<p className={styles.help}>Sin gestiones iniciadas. Este dato pertenece a una gestión.<br/><Link to={'/accounts/'+accountId}>Abrir negocio</Link></p>)}
    {missingManagement?gestions.length>1&&(hasEditableManagement?<p className={styles.help}>Elegí la gestión que querés modificar. Las demás conservan sus datos.</p>:<p role="alert">Estas gestiones están en modo consulta. Solo su responsable o un administrador puede modificarlas.</p>):!allowed?<p role="alert">Ya no tenés permiso para modificar este dato. Actualizá el listado.</p>:<form onSubmit={event=>{event.preventDefault();void submit();}}>
     {['tipo','subtipo'].includes(field)?<BusinessClassificationsField value={draft?.classifications??account?.classifications??(account?.tipo?[{tipo:account.tipo,subtipo:account.subtipo??null}]:[{tipo:'',subtipo:null}])} settings={settings.data} disabled={processing} onChange={classifications=>{const expectedClassifications=draft?.expectedClassifications??account?.classifications??(account?.tipo?[{tipo:account.tipo,subtipo:account.subtipo??null}]:[]);setDraft({value:'classifications',expected:draft?.expected??current,classification:draft?.classification??{tipo:account?.tipo??null,subtipo:account?.subtipo??null},classifications,expectedClassifications});}}/>:<label>{title}<CrmNativeSelect autoFocus aria-label={'Nuevo valor de '+title.toLowerCase()} disabled={processing} value={draft?.value??current??''} onChange={event=>setDraft({value:event.target.value,expected:draft?draft.expected:current,classification:{tipo:null,subtipo:null},classifications:[],expectedClassifications:[]})}><option value="">{empty}</option>{current&&!options.some(item=>item.value===current)&&<option value={current}>{current} (valor actual)</option>}{options.map(item=><option key={item.value} value={item.value}>{item.label}</option>)}</CrmNativeSelect></label>}
     
     {field==='assignedUserEmail'&&hasSellerChangeDraft(draft?.value,current)&&detail.data?.sellerGroup&&!account?.archivedAt&&!account?.deletedAt&&!account?.mergedIntoId&&sellerGroupNotice(detail.data.sellerGroup.members,accountId)&&<p role="note">También cambia el responsable de: {sellerGroupNotice(detail.data.sellerGroup.members,accountId)}.</p>}
     <p className={styles.help}>{scope==='business'?'Se modifica este dato del negocio. Sus gestiones y compromisos se conservan.':'Se modifica únicamente esta gestión. Los demás datos, gestiones y compromisos se conservan.'} Con filtros activos, el negocio podría dejar de aparecer.</p>
     {['quienCargo','creadoPor','origen'].includes(field)&&<p className={styles.help}>Es un dato histórico importado. La autoría real de las acciones permanece en el historial.</p>}
     {conflictMessage&&<p className={styles.error} role="alert">{conflictMessage}</p>}
     {save.error&&!conflictMessage&&<div className={styles.error} role="alert"><p>{save.error.message}</p>{['tipo','subtipo'].includes(field)&&retryPayload?<Button type="button" size="sm" variant="outline" disabled={processing} disabledReason="La operación está en curso. Esperá a que termine para continuar." onClick={()=>void submit(retryPayload)}>Reintentar</Button>:<Button type="button" size="sm" variant="outline" disabled={processing} disabledReason="La operación está en curso. Esperá a que termine para continuar." onClick={reload}>Recargar datos</Button>}</div>}
     <div className={styles.actions}><Button variant="outline" size="sm" disabled={processing} disabledReason="La operación está en curso. Esperá a que termine para continuar." onClick={()=>setOpen(false)}>Cancelar</Button><Button type="submit" size="sm" disabled={processing||!draft||(draft.value||null)===current} disabledReason={(processing) ? "La operación está en curso. Esperá a que termine para continuar." : "Elegí un valor distinto del actual."}>{processing&&<LoaderCircle size={14} aria-hidden="true"/>}{processing?'Guardando '+title.toLowerCase()+'…':'Guardar'}</Button></div>
    </form>}
   </>}
   {(loading||detail.error||settings.error||missingManagement||!allowed)&&<Button variant="outline" size="sm" disabled={processing} disabledReason="La operación está en curso. Esperá a que termine para continuar." onClick={()=>setOpen(false)}>Cerrar</Button>}
   </>}
  </PopoverContent>
 </Popover>;
}
