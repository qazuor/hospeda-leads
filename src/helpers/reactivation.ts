import type {ManagementType} from './businessManagement';
import type {PipelineStage} from '../endpoints/pipeline.schema';

export function mayReopenManagement(role:string|undefined|null):boolean {
 return role==='admin';
}

export function isValidReactivationStage(stage:Pick<PipelineStage,'active'|'classification'|'managementType'|'name'>|undefined,managementType:ManagementType|null):boolean {
 return Boolean(stage?.active&&stage.classification==='open'&&stage.managementType===managementType&&!stage.name.endsWith(':leandro'));
}

export function getReactivationStages(stages:PipelineStage[],managementType:ManagementType|null):PipelineStage[] {
 return stages.filter(stage=>isValidReactivationStage(stage,managementType));
}
