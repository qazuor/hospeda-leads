import {z} from 'zod';
import {apiJson,postJson} from '../helpers/apiClient';
const id=z.string().regex(/^\d+$/);
export const day=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>!Number.isNaN(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v,'Fecha inválida');
const instant=z.string().datetime({offset:true});
const outcome=z.enum(['no_answer','interested','later','replied','not_interested','do_not_contact','other','delivered','needs_help','awaiting_confirmation','care_completed']).nullable().optional();
const purpose=z.enum(["commercial","delivery","care","reactivation"]);
const continuation=z.enum(['task','wait','done']).optional();
/** Why the seller chose "No agendar nada" (continuation 'done'). */
const continuationReason=z.string().trim().min(3,'Contá en pocas palabras por qué no agendás nada.').max(500).optional();
/** The prepared message a contact outcome belongs to, and the seller's explicit answer to "¿Lo enviaste?" (never inferred). */
const messageLink={messageId:z.string().uuid().optional(),messageSent:z.boolean().optional()};
/** Decision 9A: the seller's explicit "¿Pasar la gestión a …?" answer. Never sent unless she ticked the box; the server re-derives the suggestion and checks the revision she saw. */
const stageChange=z.object({stage:z.string().trim().min(1).max(120),revision:z.number().int().min(0)}).optional();
const nextTask=z.object({purpose:purpose.optional(),title:z.string().trim().min(1).max(200),dueDate:day,typeId:z.string().min(1).max(80)}).optional();
const common={purpose:purpose.optional(),id:id.optional(),accountId:id,leadId:id.nullable().optional(),title:z.string().trim().min(1).max(200),typeId:z.string().min(1).max(80),participants:z.string().max(2000).default(''),contactIds:z.array(id).max(50).default([])};
/** Hoy returns every overdue and today task up to this many per bucket (oldest first); the page explains the cut. */
export const URGENT_CAP=300;
export const followupSettings=z.object({action:z.literal('followup_settings'),stages:z.array(z.string().trim().min(1)).max(50),newAssignmentDays:z.number().int().min(1).max(90)});
export const workMutation=z.discriminatedUnion('action',[
 /** `expectedUpdatedAt` is the version the editor loaded; required to edit an existing task, so a concurrent change answers 409 instead of being overwritten. */
 z.object({action:z.literal('task_save'),...common,description:z.string().max(10000).nullable().optional(),assignedUserEmail:z.string().email().nullable().optional(),dueDate:day,dueAt:instant.nullable().optional(),priority:z.enum(['alta','media','baja']).default('media'),expectedUpdatedAt:instant.optional()}),
 z.object({action:z.literal('task_status'),id,status:z.enum(['completed','cancelled']),purpose:purpose.optional(),contactIds:z.array(id).max(50).optional(),channel:z.string().max(100).nullable().optional(),outcome,continuation,continuationReason,nextTask,result:z.string().trim().min(1).max(4000),completedAt:instant.optional(),stageChange,...messageLink}),
 z.object({action:z.literal('task_delete'),id}),
 /** Moves only the due date/time; `expected*` is what the client saw, so a concurrent change answers 409 instead of being overwritten. */
 z.object({action:z.literal('task_reschedule'),id,expectedDueDate:day,expectedDueAt:instant.nullable(),dueDate:day,dueAt:instant.nullable(),kind:z.enum(['postpone','undo']).optional()}),
 z.object({action:z.literal('activity_save'),...common,occurredAt:instant,outcome,continuation,continuationReason,nextTask,channel:z.string().max(100).nullable().optional(),result:z.string().max(4000).nullable().optional(),notes:z.string().max(10000).nullable().optional(),stageChange,...messageLink}),
 z.object({action:z.literal('activity_delete'),id}),
 followupSettings,
 z.object({action:z.literal('type_save'),id:z.string().regex(/^[a-z][a-z0-9_-]{0,79}$/),name:z.string().trim().min(1).max(100),agenda:z.boolean(),active:z.boolean()})
]);
export type WorkMutation=z.infer<typeof workMutation>;
export const workQuery=z.object({accountId:id.optional(),leadId:id.optional(),responsible:z.string().optional(),city:z.string().optional(),vertical:z.string().optional(),calendar:z.preprocess(v=>v===true||v==="true",z.boolean()).default(false),q:z.string().max(200).optional(),mode:z.enum(['day','agenda','month','detail','lookup','duplicates']).default('day'),duplicateTitle:z.string().trim().min(1).max(200).optional(),duplicateType:z.string().min(1).max(80).optional(),excludeTaskId:id.optional(),taskId:id.optional(),from:day.optional(),to:day.optional(),page:z.coerce.number().int().min(1).default(1)});
export interface WorkTask {continuation?:'task'|'wait'|'done'|null;continuationReason?:string|null;purpose?:import("../helpers/nextStep").WorkPurpose|null;id:string;accountId:string;leadId:string|null;title:string;description:string|null;typeId:string;assignedUserEmail:string|null;dueDate:string;dueAt:Date|null;priority:'alta'|'media'|'baja';status:'pending'|'completed'|'cancelled';outcome?:string|null;result:string|null;completedAt:Date|null;/** Version token sent back as `expectedUpdatedAt` when the task is edited. */updatedAt?:Date;legacy:boolean;participants:string;contactIds:string[];accountName:string;city:string|null;opportunityName:string|null;deletedAt:Date|null;/** The activity created when the task was completed (corrections edit it). */activityId?:string|null;}
export interface WorkActivity {continuation?:'task'|'wait'|'done'|null;continuationReason?:string|null;purpose?:import("../helpers/nextStep").WorkPurpose|null;id:string;accountId:string;leadId:string|null;taskId:string|null;typeId:string;title:string;occurredAt:Date;participants:string;contactIds:string[];channel:string|null;outcome?:string|null;result:string|null;notes:string|null;actorEmail:string|null;accountName:string;city:string|null;}
export interface WorkData {
 tasks:WorkTask[];activities:WorkActivity[];
 types:{id:string;name:string;agenda:boolean;active:boolean}[];
 accounts:{id:string;nombre:string;ciudad:string|null;assignedUserEmail:string|null;doNotContact?:boolean}[];
 opportunities:{id:string;accountId:string;opportunityName:string|null;tipo:string|null;estado:string|null;/** Type and revision feed the optional stage suggestion (decision 9A); the server re-checks both. */managementType:string|null;pipelineRevision:number;assignedUserEmail:string|null;createdAt:Date;fechaUltimoContacto:Date|null}[];
 contacts:{id:string;accountId:string;name:string}[];
 users:{email:string;displayName:string}[];
 attention:{id:string;accountId:string;nombre:string;opportunityName:string|null;reason:string}[];
 journal:{id:string;entity:string;entityId:string;actorEmail:string|null;action:string;beforeValue:unknown;afterValue:unknown;createdAt:Date}[];
 followupStages:string[];newAssignmentDays:number;
 bucketCounts?:{overdue:number;today:number;upcoming:number};
 /** Day mode: tasks completed today (Argentina) and whether overdue/today were cut at the cap. */
 doneToday?:number;truncated?:boolean;
 cities?:string[];verticals?:string[];
 totalTasks:number;totalActivities:number;page:number;
 /** Day mode only: the seller's contacts still waiting for "¿Cómo salió?" (decision 2B). */
 pendingOutcomes?:import('./communication.schema').PendingOutcome[];
 /** Day mode only: which first-use steps the user has really done (U-27). Step 1 (open a task) is client-side. */
 firstSteps?:{contacted:boolean;logged:boolean;scheduled:boolean};
}
/** A pending task as Hoy's mini calendar draws it (`dueDate` is an Argentina calendar day). */
export type WorkMonthTask=Pick<WorkTask,'id'|'title'|'dueDate'|'dueAt'|'typeId'|'accountName'>;
/** Every pending task between `from` and `to` (a calendar grid, at most 42 days) in the same scope as Hoy's list; `truncated` when the server cap cut it. */
export async function getWorkMonth(params:{from:string;to:string;responsible?:string;city?:string;vertical?:string}):Promise<{tasks:WorkMonthTask[];truncated?:boolean}>{
 const search=new URLSearchParams(Object.entries({mode:'month',...params}).filter((x):x is [string,string]=>x[1]!==undefined));
 return apiJson<{tasks:WorkMonthTask[];truncated?:boolean;error?:string}>('/_api/work?'+search);
}
export async function getWork(params:Record<string,string|undefined>={}):Promise<WorkData>{
 const search=new URLSearchParams(Object.entries(params).filter((x):x is [string,string]=>x[1]!==undefined));
 return apiJson<WorkData&{error?:string}>('/_api/work?'+search);
}
export async function postWork(body:WorkMutation){return postJson<{id:string;error?:string}>('/_api/work',workMutation.parse(body));}
export async function getWorkDuplicates(params:{accountId:string;leadId?:string;title:string;typeId:string;date:string;excludeTaskId?:string;responsible?:string}):Promise<{tasks:WorkTask[];total:number}>{
 const search=new URLSearchParams({mode:'duplicates',accountId:params.accountId,duplicateTitle:params.title,duplicateType:params.typeId,from:params.date,to:params.date,...(params.leadId?{leadId:params.leadId}:{}),...(params.excludeTaskId?{excludeTaskId:params.excludeTaskId}:{}),...(params.responsible?{responsible:params.responsible}:{})});
 return apiJson<{tasks:WorkTask[];total:number;error?:string}>('/_api/work?'+search);
}
