import type {PipelineEvent,PipelineReason,PipelineStage} from '../endpoints/pipeline.schema';
import {stageLabel} from './crmLabels';

/** Stage fields needed to name and group a stage. */
export type StageOption=Pick<PipelineStage,'name'|'displayName'|'classification'|'active'|'managementType'>;

/** Seller copy shown instead of a reopen action on a closed management (report item 1.10). */
export const CLOSED_MANAGEMENT_NOTICE='Cerrada. Para reabrirla pedíselo a un administrador.';

/** Visible stage name: the configured display name, or the catalog label when there is none (or it is just the key). Never a raw key. */
export const stageDisplayName=(stage:Pick<PipelineStage,'name'|'displayName'>|undefined,fallback?:string|null):string=>{
 if(!stage)return stageLabel(fallback);
 const display=stage.displayName?.trim();
 return display&&display!==stage.name?display:stageLabel(stage.name);
};

/**
 * Mirrors the server rule: only an admin can reopen a typed management that is already closed.
 * Legacy (untyped) managements keep their historical behaviour.
 */
export const isReopenLocked=({managementType,current,role}:{managementType:string|null|undefined;current:Pick<PipelineStage,'classification'>|undefined;role:string|null|undefined}):boolean=>
 Boolean(managementType)&&!!current&&current.classification!=='open'&&role!=='admin';

/**
 * Options of the stage dialog: active stages of the management's type, without the current stage,
 * grouped as "Sigue abierta" (open) and "Cerrar la gestión" (won/lost).
 * A closed management only offers open stages ("Reabrir la gestión"); an unknown current stage also only offers open stages.
 */
export const stageOptionGroups=({stages,currentStage,managementType}:{stages:readonly StageOption[];currentStage:string|null|undefined;managementType:string|null|undefined}):{label:string;options:StageOption[]}[]=>{
 const currentClassification=stages.find(stage=>stage.name===currentStage)?.classification;
 const closed=currentClassification!==undefined&&currentClassification!=='open';
 // Unknown or closed current stage: only open stages, as before (closing needs a known open stage).
 const openOnly=currentClassification!=='open';
 const available=stages.filter(stage=>stage.active&&stage.name!==currentStage&&(managementType?stage.managementType===managementType:stage.managementType===null)&&(!openOnly||stage.classification==='open'));
 return [
  {label:closed?'Reabrir la gestión':'Sigue abierta',options:available.filter(stage=>stage.classification==='open')},
  {label:'Cerrar la gestión',options:available.filter(stage=>stage.classification!=='open')}
 ].filter(group=>group.options.length>0);
};

/**
 * Success toast of a stage change: reopened, closed (with the No contactar special case) or moved.
 * `canViewArchived` is false for sellers: the server does not let them read an archived business yet, so the copy must not promise it.
 */
export const stageChangeMessage=({stages,reasons,from,to,reasonId,canViewArchived=true}:{stages:readonly StageOption[];reasons:readonly Pick<PipelineReason,'id'|'doNotContact'>[];from:string|null|undefined;to:string;reasonId?:string|null;canViewArchived?:boolean}):string=>{
 const target=stages.find(stage=>stage.name===to);
 const name=stageDisplayName(target,to);
 if(reasonId&&reasons.some(reason=>reason.id===reasonId&&reason.doNotContact))return canViewArchived?'El negocio quedó en No contactar y archivado. Podés seguir consultándolo.':'El negocio quedó en No contactar y archivado. Para volver a verlo, pedíselo a un administrador.';
 if(target&&target.classification!=='open')return `Gestión cerrada como ${name}`;
 const previous=stages.find(stage=>stage.name===from)?.classification;
 return previous&&previous!=='open'?`Gestión reabierta en ${name}`:`Etapa cambiada a ${name}`;
};

const eventTitles:Record<string,string>={closing_checklist:'Acuerdo y entrega registrados',reactivation:'Reactivación planificada',objection:'Objeción actualizada',contact_policy:'Preferencias de contacto actualizadas',leandro_referral_removed:'Derivación a Leandro desactivada'};

/** One-line title of a pipeline history event, with stage names instead of keys; unknown actions get a plain generic title. */
export const pipelineEventTitle=(event:Pick<PipelineEvent,'action'|'oldStage'|'newStage'>,stages:readonly StageOption[]):string=>{
 if(event.action==='stage'){
  const name=(key:string|null)=>key?stageDisplayName(stages.find(stage=>stage.name===key),key):'Sin etapa';
  return `${name(event.oldStage)} → ${name(event.newStage)}`;
 }
 return eventTitles[event.action]??'Otro cambio en la gestión';
};
