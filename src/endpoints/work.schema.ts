import {z} from 'zod';
import superjson from 'superjson';
const id=z.string().regex(/^\d+$/);
export const day=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>!Number.isNaN(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v,'Fecha inválida');
const instant=z.string().datetime({offset:true});
const outcome=z.enum(['no_answer','interested','replied','not_interested','do_not_contact','other','delivered','needs_help','awaiting_confirmation','care_completed']).nullable().optional();
const purpose=z.enum(["commercial","delivery","care","reactivation"]);
const continuation=z.enum(['task','wait','done']).optional();
const nextTask=z.object({purpose:purpose.optional(),title:z.string().trim().min(1).max(200),dueDate:day,typeId:z.string().min(1).max(80)}).optional();
const common={purpose:purpose.optional(),id:id.optional(),accountId:id,leadId:id.nullable().optional(),title:z.string().trim().min(1).max(200),typeId:z.string().min(1).max(80),participants:z.string().max(2000).default(''),contactIds:z.array(id).max(50).default([])};
export const followupSettings=z.object({action:z.literal('followup_settings'),stages:z.array(z.string().trim().min(1)).max(50),newAssignmentDays:z.number().int().min(1).max(90)});
export const workMutation=z.discriminatedUnion('action',[
 z.object({action:z.literal('task_save'),...common,description:z.string().max(10000).nullable().optional(),assignedUserEmail:z.string().email().nullable().optional(),dueDate:day,dueAt:instant.nullable().optional(),priority:z.enum(['alta','media','baja']).default('media')}),
 z.object({action:z.literal('task_status'),id,status:z.enum(['completed','cancelled']),purpose:purpose.optional(),contactIds:z.array(id).max(50).optional(),channel:z.string().max(100).nullable().optional(),outcome,continuation,nextTask,result:z.string().trim().min(1).max(4000),completedAt:instant.optional()}),
 z.object({action:z.literal('task_delete'),id}),
 z.object({action:z.literal('activity_save'),...common,occurredAt:instant,outcome,continuation,nextTask,channel:z.string().max(100).nullable().optional(),result:z.string().max(4000).nullable().optional(),notes:z.string().max(10000).nullable().optional()}),
 z.object({action:z.literal('activity_delete'),id}),
 followupSettings,
 z.object({action:z.literal('type_save'),id:z.string().regex(/^[a-z][a-z0-9_-]{0,79}$/),name:z.string().trim().min(1).max(100),agenda:z.boolean(),active:z.boolean()})
]);
export type WorkMutation=z.infer<typeof workMutation>;
export const workQuery=z.object({accountId:id.optional(),leadId:id.optional(),responsible:z.string().optional(),city:z.string().optional(),vertical:z.string().optional(),calendar:z.preprocess(v=>v===true||v==="true",z.boolean()).default(false),q:z.string().max(200).optional(),mode:z.enum(['day','agenda','detail','lookup']).default('day'),from:day.optional(),to:day.optional(),page:z.coerce.number().int().min(1).default(1)});
export interface WorkTask {continuation?:'task'|'wait'|'done'|null;purpose?:import("../helpers/nextStep").WorkPurpose|null;id:string;accountId:string;leadId:string|null;title:string;description:string|null;typeId:string;assignedUserEmail:string|null;dueDate:string;dueAt:Date|null;priority:'alta'|'media'|'baja';status:'pending'|'completed'|'cancelled';outcome?:string|null;result:string|null;completedAt:Date|null;legacy:boolean;participants:string;contactIds:string[];accountName:string;city:string|null;opportunityName:string|null;deletedAt:Date|null;}
export interface WorkActivity {continuation?:'task'|'wait'|'done'|null;purpose?:import("../helpers/nextStep").WorkPurpose|null;id:string;accountId:string;leadId:string|null;taskId:string|null;typeId:string;title:string;occurredAt:Date;participants:string;contactIds:string[];channel:string|null;outcome?:string|null;result:string|null;notes:string|null;actorEmail:string|null;accountName:string;city:string|null;}
export interface WorkData {
 tasks:WorkTask[];activities:WorkActivity[];
 types:{id:string;name:string;agenda:boolean;active:boolean}[];
 accounts:{id:string;nombre:string;ciudad:string|null;assignedUserEmail:string|null}[];
 opportunities:{id:string;accountId:string;opportunityName:string|null;tipo:string|null;estado:string|null;assignedUserEmail:string|null;createdAt:Date;fechaUltimoContacto:Date|null}[];
 contacts:{id:string;accountId:string;name:string}[];
 users:{email:string;displayName:string}[];
 attention:{id:string;accountId:string;nombre:string;opportunityName:string|null;reason:string}[];
 journal:{id:string;entity:string;entityId:string;actorEmail:string|null;action:string;beforeValue:unknown;afterValue:unknown;createdAt:Date}[];
 followupStages:string[];newAssignmentDays:number;
 bucketCounts?:{overdue:number;today:number;upcoming:number};
 cities?:string[];verticals?:string[];
 totalTasks:number;totalActivities:number;page:number;
}
export async function getWork(params:Record<string,string|undefined>={}):Promise<WorkData>{
 const search=new URLSearchParams(Object.entries(params).filter((x):x is [string,string]=>x[1]!==undefined));
 const r=await fetch('/_api/work?'+search);const value=superjson.parse<WorkData&{error?:string}>(await r.text());if(!r.ok)throw new Error(value.error);return value;
}
export async function postWork(body:WorkMutation){const r=await fetch('/_api/work',{method:'POST',headers:{'Content-Type':'application/json'},body:superjson.stringify(workMutation.parse(body))});const value=superjson.parse<{id:string;error?:string}>(await r.text());if(!r.ok)throw new Error(value.error);return value;}
