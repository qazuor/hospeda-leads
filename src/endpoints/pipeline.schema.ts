import {z} from 'zod';
import {day} from './work.schema';
import {commercialRequest} from './commercial.schema';
const id=z.string().regex(/^\d+$/);
const text=z.string().trim().min(1).max(120);
export const priorityRule=z.object({id:z.string().regex(/^[a-z][a-z0-9_-]{0,49}$/),name:text,factor:z.enum(['overdue','missing_followup','stage','stale_contact','close_soon']),priority:z.enum(['alta','media','baja']),active:z.boolean(),days:z.number().int().min(0).max(365),stages:z.array(text).max(100)}).refine(r=>r.factor!=='stage'||r.stages.length>0,'Una regla de etapa debe seleccionar al menos una etapa');
export type PriorityRule=z.infer<typeof priorityRule>;
export const pipelineMutation=z.discriminatedUnion('action',[
 z.object({action:z.literal('stage_save'),name:text,sortOrder:z.number().int().min(0).max(10000),active:z.boolean(),classification:z.enum(['open','won','lost'])}),
 z.object({action:z.literal('catalog_save'),catalog:z.enum(['loss','objection']),id:id.optional(),name:text,active:z.boolean()}),
 z.object({action:z.literal('rules_save'),rules:z.array(priorityRule).max(50).refine(r=>new Set(r.map(x=>x.id)).size===r.length,'IDs repetidos')}),
 z.object({action:z.literal('transition'),leadId:id,revision:z.number().int().nonnegative(),stage:text,reasonId:id.optional(),comment:z.string().max(4000).default(''),recontactDate:day.nullable().optional()}),
 z.object({action:z.literal('objection_save'),leadId:id,id:id.optional(),typeId:id,notes:z.string().max(4000).default(''),status:z.enum(['open','resolved','dismissed']).default('open'),deleted:z.boolean().default(false),revision:z.number().int().nonnegative()}),
 z.object({action:z.literal('reactivate'),leadId:id,eventId:id,revision:z.number().int().nonnegative(),mode:z.enum(['followup','reopen','new']),stage:text.optional(),opportunityName:z.string().trim().min(1).max(300).optional(),dueDate:day,title:z.string().trim().min(1).max(200)}),
 z.object({action:z.literal('contact_policy'),accountId:id,blocked:z.boolean(),reason:z.string().trim().min(1).max(2000)})
]);
export type PipelineMutation=z.infer<typeof pipelineMutation>;
export interface PipelineStage {name:string;sortOrder:number;active:boolean;classification:'open'|'won'|'lost';historical:boolean}
export interface PipelineCatalog {id:string;name:string;active:boolean}
export interface PipelineEvent {id:string;action:string;oldStage:string|null;newStage:string|null;classification:string|null;reasonId:string|null;comment:string|null;recontactDate:string|null;actorEmail:string|null;createdAt:Date;taskId:string|null;relatedLeadId:string|null;metadata:unknown}
export interface PipelineObjection {id:string;leadId:string;typeId:string;notes:string;status:'open'|'resolved'|'dismissed';updatedAt:Date}
export interface PrioritySuggestion {priority:'alta'|'media'|'baja'|null;factors:{id:string;name:string;priority:'alta'|'media'|'baja'}[]}
export interface PipelineInsight {id:string;estado:string|null;manualPriority:'alta'|'media'|'baja'|null;assignedUserEmail:string|null;stageSince:Date|null;pipelineRevision:number;pendingFollowup:boolean;doNotContact:boolean;suggestion:PrioritySuggestion}
export interface ReactivationRow {id:string;accountId:string;nombre:string;opportunityName:string|null;tipo:string|null;assignedUserEmail:string|null;estado:string;pipelineRevision:number;eventId:string;reasonId:string;comment:string|null;recontactDate:string;taskId:string|null;doNotContact:boolean}
export interface PipelineData {configJournal:{id:string;entity:string;actorEmail:string|null;beforeValue:unknown;afterValue:unknown;createdAt:Date}[];stages:PipelineStage[];lossReasons:PipelineCatalog[];objectionTypes:PipelineCatalog[];rules:PriorityRule[];insights:PipelineInsight[];events:PipelineEvent[];objections:PipelineObjection[];reactivations:ReactivationRow[];total:number;page:number;users:{email:string;displayName:string}[];verticals:string[]}
export const getPipeline=(params:Record<string,string>={})=>commercialRequest<PipelineData>('pipeline?'+new URLSearchParams(params));
export const postPipeline=(body:PipelineMutation)=>commercialRequest<{id:string}>('pipeline',pipelineMutation.parse(body));
