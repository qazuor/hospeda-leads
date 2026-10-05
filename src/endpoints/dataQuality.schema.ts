import {z} from 'zod';
import superjson from 'superjson';
import {businessFields,importFields,type Match,type Normalized} from '../helpers/dataNormalization';
import type {Selectable} from 'kysely';
import type {CrmDataEvidence,CrmAccounts,CrmAccountMerges} from '../helpers/schema';
const id=z.string().regex(/^\d+$/);
const date=z.string().datetime({offset:true}).nullable().optional();
const source={source:z.string().trim().min(1).max(200),sourceUrl:z.string().url().refine(s=>/^https?:\/\//.test(s)).nullable().optional(),obtainedAt:date};
export const importRow=z.record(z.enum(importFields),z.string().max(10000));
export const decision=z.object({index:z.number().int().nonnegative(),action:z.enum(['create','update','skip']),targetId:id.optional(),revision:z.string().optional(),acknowledge:z.boolean().default(false)});
export const qualityMutation=z.discriminatedUnion('action',[
 z.object({action:z.literal('import_preview'),rows:z.array(importRow).min(1).max(250),mode:z.enum(['business','opportunity']).default('opportunity'),...source}),
 z.object({action:z.literal('import_confirm'),batchId:z.string().uuid(),decisions:z.array(decision).max(250),confirm:z.literal(true)}),
 z.object({action:z.literal('merge_preview'),sourceId:id,destinationId:id}),
 z.object({action:z.literal('merge_confirm'),sourceId:id,destinationId:id,token:z.string().length(64),reason:z.string().trim().min(3).max(2000),selections:z.record(z.enum(businessFields),z.enum(['source','destination'])),confirm:z.literal(true)}),
 z.object({action:z.literal('evidence'),accountId:id,contactId:id.optional(),leadId:id.optional(),field:z.enum([...importFields,'name','phone','position','preferredChannel']),revision:z.string(),...source,verifiedAt:date,validity:z.enum(['valid','invalid','ambiguous','missing','unverified']),observations:z.string().max(2000)}),
]);
export type QualityMutation=z.infer<typeof qualityMutation>;
export type ReviewRow={index:number;values:Record<string,string>;errors:string[];warnings:string[];matches:Match[];withinBatch:number[]};
export type ImportReview={batchId:string;status:string;mode:'business'|'opportunity';source:string;sourceUrl:string|null;rows:ReviewRow[];result?:ImportResult};
export type ImportResult={batchId:string;imported:number;updated:number;skipped:number;errors:number;details:Array<{index:number;action:string;id?:string;accountId?:string;entity?:'business'|'opportunity'}>};
export type MergePreview={source:Selectable<CrmAccounts>;destination:Selectable<CrmAccounts>;token:string;counts:Record<string,number>;policy:{doNotContact:boolean;commercialStatus:string;clientSince:string|null}};
export type QualityDetail={canEdit:boolean;fields:Array<Normalized&{field:string;label:string;contactId?:string;leadId?:string;revision:string;latest?:Selectable<CrmDataEvidence>;stale:boolean}>;evidence:Array<Selectable<CrmDataEvidence>>;merges:Array<Selectable<CrmAccountMerges>>;config:{maxRows:number;maxFileBytes:number}};
export async function qualityRequest<T>(body:QualityMutation):Promise<T>{const r=await fetch('/_api/data_quality',{method:'POST',headers:{'Content-Type':'application/json'},body:superjson.stringify(qualityMutation.parse(body))});const value=superjson.parse<T&{error?:string}>(await r.text());if(!r.ok)throw new Error(value.error);return value;}
export async function getQuality(accountId?:string):Promise<QualityDetail>{const r=await fetch('/_api/data_quality'+(accountId?'?accountId='+accountId:''));const v=superjson.parse<QualityDetail&{error?:string}>(await r.text());if(!r.ok)throw new Error(v.error);return v;}
