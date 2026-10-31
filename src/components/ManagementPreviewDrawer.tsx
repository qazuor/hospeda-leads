import {useEffect,useRef} from 'react';
import {CrmDrawer} from './ui/CrmDialog';
import {useMediaQuery} from '@mantine/hooks';
import {CalendarDays,Clock3,Layers3,Tag,UserRound} from 'lucide-react';
import {managementDisplayName} from '../content/vocabulary';
import type {Opportunity} from '../endpoints/commercial.schema';
import type {PipelineData,PipelineInsight,PipelineStage} from '../endpoints/pipeline.schema';
import {managementTypeLabels} from '../helpers/businessManagement';
import {formatDate} from '../helpers/crmDates';
import {localDay,calendarDay} from '../helpers/workDates';
import {userLabel} from '../helpers/crmLabels';
import {Button} from './Button';
import {StageStepper} from './StageStepper';
import {pipelineStageAccess} from './PipelineCard';
import styles from './ManagementPreviewDrawer.module.css';

/** Read-only management preview from the pipeline's already loaded rows and insights. */
export function ManagementPreviewDrawer({lead,insight,data,stage,role,opened,onClose,onOpen,onChangeStage,returnFocusTo,nestedDialogOpen=false}:{lead:Opportunity|null;insight?:PipelineInsight;data:PipelineData;stage:PipelineStage|undefined;role:string|null;opened:boolean;onClose:()=>void;onOpen:(lead:Opportunity)=>void;onChangeStage:()=>void;returnFocusTo:HTMLElement|null;nestedDialogOpen?:boolean}){
 const narrow=useMediaQuery('(max-width: 767px)')??false,wasOpen=useRef(false),{can,locked,disabledReason}=lead?pipelineStageAccess(lead,insight,data,stage,role):{can:false,locked:false,disabledReason:undefined};
 useEffect(()=>{if(opened){wasOpen.current=true;return;}if(wasOpen.current){wasOpen.current=false;requestAnimationFrame(()=>{if(returnFocusTo?.isConnected)returnFocusTo.focus({preventScroll:true})})}},[opened,returnFocusTo]);
 if(!lead)return null;
 const due=(lead as Opportunity&{fechaProximaAccion?:Date|string|null}).fechaProximaAccion,lastContact=(lead as Opportunity&{fechaUltimoContacto?:Date|string|null}).fechaUltimoContacto,dueDay=due?calendarDay(due):null,today=localDay(),dueTone=dueDay&&dueDay<today?styles.overdue:dueDay===today?styles.today:styles.upcoming;
 const days=insight?.stageSince?Math.max(0,Math.floor((Date.now()-new Date(insight.stageSince).getTime())/86400000)):null,priority=insight?.manualPriority??lead.prioridad;
 return <CrmDrawer opened={opened} onClose={onClose} closeOnEscape={!nestedDialogOpen} closeOnClickOutside={!nestedDialogOpen} position={narrow?'bottom':'right'} size={narrow?'85dvh':'min(440px, 100vw)'} returnFocus={false} classNames={{content:narrow?styles.sheet:undefined,body:styles.body,title:styles.drawerTitle}} overlayProps={{backgroundOpacity:.45,blur:2}} title={managementDisplayName(lead)} closeButtonProps={{'aria-label':'Cerrar vista previa de la gestión'}}>
  <div className={styles.content}>
   <p className={styles.eyebrow}>Vista previa de la gestión</p><p className={styles.subtitle}>{lead.nombre} · {lead.managementType?managementTypeLabels[lead.managementType]:'Tipo sin especificar'}</p>
   <section className={styles.section}><h3>Etapa</h3><StageStepper stage={lead.estado} type={lead.managementType}/></section>
   {due&&<section className={`${styles.nextStep} ${dueTone}`}><CalendarDays size={18} aria-hidden="true"/><div><h3>Próximo paso</h3><p>{formatDate(due)}</p></div></section>}
   <dl className={styles.facts}>
    <div><dt><UserRound aria-hidden="true"/>Responsable</dt><dd>{lead.assignedUserEmail?userLabel(data.users,lead.assignedUserEmail):'Sin responsable'}</dd></div>
    <div><dt><Tag aria-hidden="true"/>Vertical</dt><dd>{lead.tipo||'Sin vertical'}</dd></div>
    <div><dt><Clock3 aria-hidden="true"/>En la etapa</dt><dd>{days===null?'Tiempo en etapa histórico desconocido':`${days} días en etapa`}</dd></div>
    <div><dt><CalendarDays aria-hidden="true"/>Último contacto</dt><dd>{lastContact?formatDate(lastContact):'Sin contacto registrado'}</dd></div>
    <div><dt><Layers3 aria-hidden="true"/>Prioridad</dt><dd>{priority?`Prioridad manual: ${priority}`:'Sin prioridad manual'}</dd></div>
   </dl>
   {insight&&!insight.pendingFollowup&&<p className={styles.flag}>Sin seguimiento pendiente</p>}
  </div>
  <footer className={styles.footer}><Button variant="secondary" disabled={!can||locked} disabledReason={disabledReason} onClick={onChangeStage}>Cambiar etapa</Button><Button onClick={()=>onOpen(lead)}>Abrir gestión</Button></footer>
 </CrmDrawer>;
}
