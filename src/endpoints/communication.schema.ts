import {z} from 'zod';
import superjson from 'superjson';
import {day} from './work.schema';
const id=z.string().regex(/^[1-9]\d*$/),uuid=z.string().uuid(),channel=z.enum(['email','whatsapp']);
export const step=z.object({waitDays:z.number().int().min(0).max(365),channel,templateId:id});
export const communicationMutation=z.discriminatedUnion('action',[
 z.object({action:z.literal('prepare'),id:uuid,leadId:id,contactId:id.nullable(),channel,templateId:id.nullable()}),
 z.object({action:z.literal('cancel_draft'),id:uuid,revision:z.number().int()}),
 z.object({action:z.literal('edit'),id:uuid,revision:z.number().int(),subject:z.string().max(500),body:z.string().max(50000)}),
 z.object({action:z.literal('dispatch'),id:uuid,revision:z.number().int(),confirm:z.literal(true)}),
 z.object({action:z.literal('outcome'),id:uuid,event:z.enum(['manual_sent','replied','rejected']),notes:z.string().max(4000)}),
 z.object({action:z.literal('restrict'),leadId:id,contactId:id.nullable(),channel:z.enum(['email','whatsapp','all']),reason:z.string().trim().min(3).max(1000)}),
 z.object({action:z.literal('lift'),id,reason:z.string().trim().min(3).max(1000)}),
 z.object({action:z.literal('sequence_save'),id:id.optional(),name:z.string().trim().min(3).max(150),scope:z.string().trim().min(3).max(500),steps:z.array(step).min(1).max(12),active:z.boolean()}),
 z.object({action:z.literal('sequence_start'),id:uuid,sequenceId:id,leadId:id,contactId:id.nullable(),confirm:z.literal(true)}),
 z.object({action:z.literal('sequence_control'),id:uuid,state:z.enum(['paused','active','cancelled']),resumeDate:day.optional(),reason:z.string().trim().min(3).max(1000)})
]);
export type CommunicationMutation=z.infer<typeof communicationMutation>;
export type Message={id:string;accountId:string;leadId:string|null;contactId:string|null;channel:'email'|'whatsapp';recipient:string;recipientName:string;subject:string;body:string;htmlBody:string|null;textBody:string|null;templateSnapshot:any;ownerEmail:string;activityId:string|null;outboxId:string|null;runId:string|null;stepIndex:number|null;taskId:string|null;status:string;revision:number;lastInteractionAt:Date|null;lastActorEmail:string|null;createdAt:Date;updatedAt:Date};
export type CommunicationDetail={messages:Message[];recentMessages:Message[];restrictions:any[];sequences:any[];runs:any[];recentContactHours:number;webhookConfigured:boolean};
export async function postCommunication(body:CommunicationMutation):Promise<any>{const r=await fetch('/_api/communication',{method:'POST',headers:{'Content-Type':'application/json'},body:superjson.stringify(communicationMutation.parse(body))});const d=superjson.parse<any>(await r.text());if(!r.ok)throw new Error(d.error);return d;}
export async function getCommunication(leadId:string,accountId?:string):Promise<CommunicationDetail>{const r=await fetch('/_api/communication?'+(accountId?'accountId='+accountId:'leadId='+leadId));const d=superjson.parse<any>(await r.text());if(!r.ok)throw new Error(d.error);return d;}
