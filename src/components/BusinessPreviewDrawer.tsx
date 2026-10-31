import React,{useEffect,useRef,useState} from 'react';
import {Skeleton} from '@mantine/core';
import {CrmDrawer} from './ui/CrmDialog';
import {useMediaQuery} from '@mantine/hooks';
import {useQuery} from '@tanstack/react-query';
import {getCommercialDetail,type CommercialDetail} from '../endpoints/commercial.schema';
import {commercialDetailKey,canActOnBusiness} from '../helpers/businessActionGates';
import {canModifyBusiness} from '../helpers/crmPermissions';
import {businessStatusLabels} from '../helpers/businessStatus';
import {formatDate,relativeAgo,overdueLabel} from '../helpers/crmDates';
import {journalTitle,stageChangeTitle} from '../helpers/historyLabels';
import {managementDisplayName} from '../content/vocabulary';
import {managementStageByKey} from '../helpers/businessManagement';
import {useAuth} from '../helpers/useAuth';
import {Button} from './Button';
import {ValueBadge} from './ValueBadge';
import {StageStepper} from './StageStepper';
import {BusinessChannel,type BusinessChannelKind} from './BusinessChannel';
import {BusinessContactDialog} from './BusinessContactDialog';
import {CommercialEditor} from './CommercialEditor';
import {QueryErrorNotice} from './QueryErrorNotice';
import styles from './BusinessPreviewDrawer.module.css';

/** List row fields the preview needs; the rest comes from the commercial detail. */
export type BusinessPreviewRow={accountId:string|number;nombre:string;nextActionTitle?:string|null;fechaProximaAccion?:unknown;canModify?:boolean};
/** Props of {@link BusinessPreviewDrawer}. */
export interface BusinessPreviewDrawerProps {
 readonly row:BusinessPreviewRow|null;
 readonly opened:boolean;
 readonly onClose:()=>void;
 readonly onOpenRecord:(row:BusinessPreviewRow)=>void;
 /** Element focused again when the preview closes (the row's name link). */
 readonly returnFocusTo:HTMLElement|null;
 readonly users?:readonly {email:string;displayName:string}[];
}

const channelFields:readonly [BusinessChannelKind,keyof CommercialDetail['account']][]=[['whatsapp','whatsapp'],['email','email'],['phone','telefono'],['instagram','perfilInstagram'],['web','sitioWeb']];
const restrictedReason='Solo el responsable del negocio o un administrador puede realizar esta acción.';
const archivedReason='Un administrador debe desarchivar este negocio antes de usar esta acción.';

/** Three most recent events across the business, contact and management journals, newest first. */
export function recentPreviewEvents(d:CommercialDetail){
 return [...d.journal.map(item=>({id:'c'+item.id,date:item.createdAt,title:journalTitle({kind:'change',action:item.action})})),
  ...d.leadJournal.map(item=>({id:'l'+item.id,date:item.createdAt,title:journalTitle({kind:'change',action:item.action})})),
  ...(d.managementJournal??[]).map(item=>({id:'p'+item.id,date:item.createdAt,title:stageChangeTitle({oldStage:item.oldStage,newStage:item.newStage})}))]
  .sort((a,b)=>new Date(b.date).getTime()-new Date(a.date).getTime()).slice(0,3);
}

/** Managements still in progress: not deleted and not in a won/lost stage (unknown stages stay visible). */
export const openPreviewManagements=(d:CommercialDetail)=>d.opportunities.filter(item=>!item.deletedAt&&(item.estado?managementStageByKey(item.estado)?.classification??'open':'open')==='open');

/** Read-only business preview opened from a list row; it only reads the same detail as the row actions. */
export function BusinessPreviewDrawer({row,opened,onClose,onOpenRecord,returnFocusTo,users=[]}:BusinessPreviewDrawerProps){
 const {authState}=useAuth(),narrow=useMediaQuery('(max-width: 767px)')??false,accountId=row?String(row.accountId):'';
 const query=useQuery({queryKey:commercialDetailKey(accountId),queryFn:()=>getCommercialDetail(accountId),enabled:opened&&!!row});
 const [contact,setContact]=useState(false),[edit,setEdit]=useState(false),wasOpen=useRef(false);
 useEffect(()=>{
  if(opened){wasOpen.current=true;return;}
  setContact(false);setEdit(false);
  if(wasOpen.current){wasOpen.current=false;requestAnimationFrame(()=>{if(returnFocusTo?.isConnected)returnFocusTo.focus({preventScroll:true});});}
 },[opened,returnFocusTo]);
 const d=query.data,openManagements=d?openPreviewManagements(d):[],allowed=canActOnBusiness(d,authState),canEdit=canModifyBusiness(authState.type==='authenticated'?authState.user:undefined,d?.account),reason=d?.account.archivedAt?archivedReason:restrictedReason;
 const responsible=d?.account.assignedUserEmail?users.find(u=>u.email===d.account.assignedUserEmail)?.displayName??d.account.assignedUserEmail:null;
 const overdue=row?.fechaProximaAccion?overdueLabel(row.fechaProximaAccion):'';
 return <><CrmDrawer opened={opened} onClose={onClose} closeOnEscape={!contact&&!edit} closeOnClickOutside={!contact&&!edit} position={narrow?'bottom':'right'} size={narrow?'85dvh':'min(420px, 100vw)'} returnFocus={false}
  classNames={{content:narrow?styles.sheet:undefined,body:styles.body}} overlayProps={{backgroundOpacity:.45,blur:2}}
  title={row?.nombre??'Vista previa'} closeButtonProps={{'aria-label':'Cerrar vista previa'}}>
  <div className={styles.content} aria-busy={query.isPending}>
   {query.isPending?<div role="status" aria-label="Cargando vista previa" className={styles.loading}><Skeleton height={22}/><Skeleton height={80}/><Skeleton height={60}/></div>
   :query.error?<QueryErrorNotice error={query.error} onRetry={()=>void query.refetch()} busy={query.isFetching}/>
   :d&&<>
    <p className={styles.meta}><ValueBadge category="status" value={d.account.status?businessStatusLabels[d.account.status]:'Pendiente de migración'} nativeTooltip={false}/><span>H{d.account.id}</span></p>
    <dl className={styles.facts}>
     <dt>Rubro</dt><dd>{d.account.tipo||'—'}</dd>
     <dt>Ciudad</dt><dd>{d.account.ciudad||'—'}</dd>
     <dt>Responsable</dt><dd>{responsible||'Sin responsable'}</dd>
     <dt>Persona de contacto</dt><dd>{d.contacts.find(c=>c.isPrimary)?.name??'Sin persona de contacto'}</dd>
     <dt>Canales</dt><dd className={styles.channels}>{channelFields.some(([,key])=>d.account[key])?channelFields.filter(([,key])=>d.account[key]).map(([kind,key])=><BusinessChannel key={kind} kind={kind} value={d.account[key]} blocked={!!d.account.doNotContact}/>):d.account.doNotContact?<ValueBadge category="status" value="No contactar"/>:'—'}</dd>
    </dl>
    <section className={styles.section}><h3>Próximo paso</h3>{row?.fechaProximaAccion?<p><strong>{row.nextActionTitle||'Próximo paso'}</strong> · <span className={overdue?styles.overdue:undefined}>{overdue||formatDate(row.fechaProximaAccion)}</span></p>:<p className={styles.muted}>Sin próximo paso</p>}</section>
    <section className={styles.section}><h3>Actividad reciente</h3>{recentPreviewEvents(d).map(item=><p key={item.id}>{item.title} · <span className={styles.muted}>{relativeAgo(item.date)}</span></p>)}{!recentPreviewEvents(d).length&&<p className={styles.muted}>Todavía no hay actividad registrada.</p>}</section>
    <section className={styles.section}><h3>Gestiones abiertas</h3>{openManagements.map(item=><div key={item.id} className={styles.management}><span>{managementDisplayName(item)}</span><StageStepper stage={item.estado} type={item.managementType}/></div>)}{!openManagements.length&&<p className={styles.muted}>No hay gestiones abiertas.</p>}</section>
   </>}
  </div>
  <footer className={styles.footer}>
   <Button variant="outline" disabled={!row} onClick={()=>{onClose();if(row)onOpenRecord(row);}}>Abrir ficha</Button>
   <Button disabled={!allowed} disabledReason={d?reason:'Esperá a que cargue la vista previa.'} onClick={()=>setContact(true)}>Contactar</Button>
   <Button variant="outline" disabled={!canEdit} disabledReason={d?reason:'Esperá a que cargue la vista previa.'} onClick={()=>setEdit(true)}>Editar</Button>
  </footer>
 </CrmDrawer>{contact&&d&&<BusinessContactDialog detail={d} onClose={()=>setContact(false)}/ >}{edit&&d&&<CommercialEditor target={{kind:'account'}} detail={d} onClose={()=>setEdit(false)} onSaved={()=>setEdit(false)}/>}</>;
}
