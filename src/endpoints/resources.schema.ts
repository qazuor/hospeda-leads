import {z} from 'zod';import superjson from 'superjson';
const id=z.string().regex(/^[1-9]\d*$/),uuid=z.string().uuid();
export const versionInput=z.object({url:z.string().max(2000).optional(),fileData:z.string().max(2796204).optional(),fileName:z.string().max(150).optional(),mimeType:z.enum(['application/pdf','image/png','image/jpeg','text/plain']).optional(),expiresOn:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional()});
export const resourceMutation=z.discriminatedUnion('action',[
 z.object({action:z.literal('create'),id:uuid,title:z.string().trim().min(3).max(200),type:z.string().trim().min(2).max(100),accountId:id.nullable(),leadId:id.nullable(),activityId:id.nullable(),library:z.boolean(),categoryId:id.nullable(),version:versionInput}),
 z.object({action:z.literal('version'),id:uuid,revision:z.number().int(),version:versionInput}),
 z.object({action:z.literal('status'),id:uuid,status:z.enum(['draft','approved','archived']),revision:z.number().int()}),
 z.object({action:z.literal('delete'),id:uuid,revision:z.number().int()}),
 z.object({action:z.literal('category'),id:id.optional(),name:z.string().trim().min(2).max(100),active:z.boolean()}),
 z.object({action:z.literal('link'),id:uuid,accountId:id,leadId:id.nullable(),activityId:id.nullable()})
]);
export type ResourceMutation=z.infer<typeof resourceMutation>;
export type ResourceVersion={id:string;documentId:string;version:number;url:string|null;fileName:string|null;mimeType:string|null;byteSize:number|null;expiresOn:Date|string|null;actorEmail:string;createdAt:Date};
export type ResourceDocument={id:string;title:string;type:string;ownerEmail:string;accountId:string|null;leadId:string|null;activityId:string|null;library:boolean;categoryId:string|null;status:string;approvedBy:string|null;approvedAt:Date|null;deletedAt:Date|null;createdAt:Date;updatedAt:Date;versions:ResourceVersion[]};
export type ResourcesDetail={documents:ResourceDocument[];categories:{id:string;name:string;active:boolean}[];maxDocumentBytes:number};
export async function getResources(accountId?:string,search=''):Promise<ResourcesDetail>{const r=await fetch('/_api/resources?'+new URLSearchParams({...(accountId?{accountId}:{}),search}));const d=superjson.parse<any>(await r.text());if(!r.ok)throw new Error(d.error);return d;}
export async function postResource(input:ResourceMutation):Promise<any>{const r=await fetch('/_api/resources',{method:'POST',headers:{'Content-Type':'application/json'},body:superjson.stringify(resourceMutation.parse(input))});const d=superjson.parse<any>(await r.text());if(!r.ok)throw new Error(d.error);return d;}
