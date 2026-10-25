import type {KeyboardEvent,MouseEvent} from 'react';
import {Calendar,Clock,Store,Tag} from 'lucide-react';
import {managementDisplayName} from '../content/vocabulary';
import {calendarDay,localDay} from '../helpers/workDates';
import {formatDate} from '../helpers/crmDates';
import type {Opportunity} from '../endpoints/commercial.schema';
import {stageLabel,userLabel} from '../helpers/crmLabels';
import {Button} from './Button';
import {ValueBadge} from './ValueBadge';
import type {PipelineData,PipelineInsight} from '../endpoints/pipeline.schema';
import type {PipelineStage} from '../endpoints/pipeline.schema';
import styles from './PipelineBoard.module.css';
import {CLOSED_MANAGEMENT_NOTICE,isReopenLocked} from '../helpers/stageTransition';
import {shouldPreviewFromTarget} from '../helpers/businessActionGates';

/** Stage button access and explanation shared by the card and its preview. */
export function pipelineStageAccess(lead:Opportunity,insight:PipelineInsight|undefined,data:PipelineData,stage:PipelineStage|undefined,role:string|null){
 const can=insight?.canModify===true,locked=isReopenLocked({managementType:lead.managementType,current:stage,role});
 const disabledReason=locked?CLOSED_MANAGEMENT_NOTICE:can?undefined:`Solo ${lead.assignedUserEmail?userLabel(data.users,lead.assignedUserEmail):'el responsable asignado'} o un administrador puede cambiar la etapa.`;
 return {can,locked,disabledReason};
}

/** A management card in the commercial pipeline. */
export function PipelineCard({lead,insight,data,stage,role,simple,onOpen,onPreview,onChangeStage,previewOpen=false,now=new Date()}:{lead:Opportunity;insight?:PipelineInsight;data:PipelineData;stage:PipelineStage|undefined;role:string|null;simple:boolean;onOpen:(lead:Opportunity)=>void;onPreview:(lead:Opportunity,card:HTMLElement)=>void;onChangeStage:()=>void;previewOpen?:boolean;now?:Date}){
 const days=insight?.stageSince?Math.max(0,Math.floor((now.getTime()-new Date(insight.stageSince).getTime())/86400000)):null;const due=(lead as Opportunity&{fechaProximaAccion?:Date|string|null}).fechaProximaAccion;const dueDay=due?calendarDay(due):null,today=localDay(now),late=!!dueDay&&dueDay<today,isToday=dueDay===today;const {can,locked,disabledReason}=pipelineStageAccess(lead,insight,data,stage,role);
 const initials=userLabel(data.users,lead.assignedUserEmail).split(/\s+/).map(part=>part[0]).slice(0,2).join('').toUpperCase();
 const previewClick=(event:MouseEvent<HTMLElement>)=>{const target=event.target;if(!(target instanceof Element)||!event.currentTarget.contains(target)||!shouldPreviewFromTarget(target))return;onPreview(lead,event.currentTarget)};
 const previewKey=(event:KeyboardEvent<HTMLElement>)=>{if((event.key==='Enter'||event.key===' ')&&event.target===event.currentTarget){event.preventDefault();onPreview(lead,event.currentTarget)}};
 return <article className={`${styles.card} ${previewOpen?styles.previewOpen:''}`} tabIndex={0} aria-label={`${managementDisplayName(lead)} · ${lead.nombre}`} onClick={previewClick} onKeyDown={previewKey}>
  <button className={styles.managementName} type="button" onClick={()=>onOpen(lead)}>{managementDisplayName(lead)}</button>
  <div className={styles.business}><Store size={15} aria-hidden="true"/><span>{lead.nombre}</span></div>
  {simple&&<ValueBadge value={stageLabel(lead.estado)} category="status"/>}
  <div className={styles.metaLine}><span><Tag size={14} aria-hidden="true"/>{lead.tipo||'Sin vertical'}</span><span><Clock size={14} aria-hidden="true"/>{days===null?'Tiempo en etapa histórico desconocido':`${days} días en etapa`}</span>{dueDay&&<span className={late?styles.overdue:isToday?styles.today:undefined}><Calendar size={14} aria-hidden="true"/>{formatDate(dueDay)}</span>}</div>
  {insight&&!insight.pendingFollowup&&<span className={styles.flagOrange}>Sin seguimiento pendiente</span>}{lead.prioridad&&<span className={lead.prioridad==='alta'?styles.flagRed:styles.flagSlate}>Prioridad manual: {lead.prioridad}</span>}
  <footer className={styles.cardFooter}><span className={styles.responsible}><span className={styles.avatar} aria-hidden="true">{initials||'?'}</span>{userLabel(data.users,lead.assignedUserEmail)}</span><Button size="sm" variant="outline" disabled={!can||locked} disabledReason={disabledReason} onClick={onChangeStage}>Cambiar etapa</Button></footer>
 </article>;
}
