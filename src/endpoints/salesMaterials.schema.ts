import {z} from 'zod';import {apiJson,postJson} from '../helpers/apiClient';
import {SALES_MATERIAL_MIMES,uploadDeclarationError,externalUrlError} from '../helpers/salesMaterialTypes';
const uuid=z.string().uuid(),id=z.string().regex(/^[1-9]\d*$/),revision=z.number().int().min(1);
const title=z.string().trim().min(3).max(200),description=z.string().trim().max(4000),kind=z.enum(['deliverable','internal']);
const categoryIds=z.array(id).max(20).transform(ids=>[...new Set(ids)]);
const categoryName=z.string().trim().min(2).max(100);
/** An external https URL without credentials. */
export const salesMaterialUrl=z.string().trim().max(2000).superRefine((value,ctx)=>{const error=externalUrlError({url:value});if(error)ctx.addIssue({code:'custom',message:error})});
/** A version source: a completed upload or an external URL. */
export const salesMaterialVersionSource=z.union([z.object({uploadId:uuid}).strict(),z.object({url:salesMaterialUrl}).strict()]);
/** Admin mutations on sales material (POST /_api/sales_materials). */
export const salesMaterialMutation=z.discriminatedUnion('action',[
 z.object({action:z.literal('create'),id:uuid,title,description,kind,source:z.enum(['file','url']),categoryIds,version:salesMaterialVersionSource}),
 z.object({action:z.literal('update'),id:uuid,revision,title,description,kind,categoryIds}),
 z.object({action:z.literal('version'),id:uuid,revision,version:salesMaterialVersionSource}),
 z.object({action:z.literal('cover'),id:uuid,revision,uploadId:uuid.nullable()}),
 z.object({action:z.literal('archive'),id:uuid,revision}),
 z.object({action:z.literal('restore'),id:uuid,revision}),
 z.object({action:z.literal('category_create'),name:categoryName}),
 z.object({action:z.literal('category_update'),id,name:categoryName,active:z.boolean()})
]);
export type SalesMaterialMutation=z.infer<typeof salesMaterialMutation>;
/** Presigned upload request (POST /_api/sales_materials/upload_url). */
export const salesMaterialUploadInput=z.object({purpose:z.enum(['file','cover']),fileName:z.string().trim().min(1).max(150),mimeType:z.enum(SALES_MATERIAL_MIMES),byteSize:z.number().int().min(1),materialId:uuid}).superRefine((v,ctx)=>{const error=uploadDeclarationError(v);if(error)ctx.addIssue({code:'custom',message:error,path:['byteSize']})});
export type SalesMaterialUploadInput=z.infer<typeof salesMaterialUploadInput>;
/** List filters (GET /_api/sales_materials). `categoryIds` is a comma-separated list: a material matches when it has ANY of them. */
export const salesMaterialListQuery=z.object({search:z.string().max(200).default(''),categoryId:id.optional(),categoryIds:z.string().regex(/^[1-9]\d*(,[1-9]\d*){0,19}$/).transform(v=>[...new Set(v.split(','))]).optional(),kind:kind.optional(),includeArchived:z.enum(['0','1']).default('0')});
export type SalesMaterialListQuery=z.output<typeof salesMaterialListQuery>;
export type SalesMaterialCategory={id:string;name:string;active:boolean};
/** A version as the client sees it: never the object key. */
export type SalesMaterialVersion={id:string;version:number;url:string|null;fileName:string|null;mimeType:string|null;byteSize:number|null;actorEmail:string;createdAt:Date};
export type SalesMaterial={id:string;title:string;description:string;kind:'deliverable'|'internal';source:'file'|'url';status:'active'|'archived';archivedAt:Date|null;archivedByEmail:string|null;revision:number;createdByEmail:string;createdAt:Date;updatedAt:Date;hasCover:boolean;categories:SalesMaterialCategory[];currentVersion:SalesMaterialVersion|null;versions?:SalesMaterialVersion[]};
export type SalesMaterialLimits={maxUploadBytes:number;maxCoverBytes:number;storageConfigured:boolean;/** Sum of the files attached to one email (spec 89 §8.3). */maxEmailAttachmentBytes:number};
/** `truncated` is true when more materials matched than the listing returns: narrow the search. */
export type SalesMaterialList={materials:SalesMaterial[];truncated:boolean;categories:SalesMaterialCategory[];limits:SalesMaterialLimits};
export type SalesMaterialUpload={uploadId:string;putUrl:string;headers:{'Content-Type':string};expiresAt:Date};
/** Lists sales material with optional filters. */
export async function getSalesMaterials(input:{search?:string;categoryIds?:readonly string[];kind?:'deliverable'|'internal';includeArchived?:boolean}={}):Promise<SalesMaterialList>{
 const params=new URLSearchParams();if(input.search)params.set('search',input.search);if(input.categoryIds?.length)params.set('categoryIds',input.categoryIds.join(','));if(input.kind)params.set('kind',input.kind);if(input.includeArchived)params.set('includeArchived','1');
 return apiJson<SalesMaterialList>('/_api/sales_materials?'+params);
}
/** Runs an admin mutation. */
export async function postSalesMaterial(input:SalesMaterialMutation):Promise<{id?:string;ok?:boolean;revision?:number}>{return postJson('/_api/sales_materials',salesMaterialMutation.parse(input));}
/** Asks for a presigned PUT URL. */
export async function requestSalesMaterialUpload(input:SalesMaterialUploadInput):Promise<SalesMaterialUpload>{return postJson('/_api/sales_materials/upload_url',salesMaterialUploadInput.parse(input));}
/** Same-origin URL that redirects to a short-lived presigned GET of a version. */
export const salesMaterialFileUrl=({versionId,disposition='inline'}:{versionId:string;disposition?:'inline'|'attachment'})=>`/_api/sales_materials/file?${new URLSearchParams({versionId,disposition})}`;
/** Same-origin URL of a material's cover (its own cover or, for small images, the image itself). */
export const salesMaterialCoverUrl=({materialId,revision}:{materialId:string;revision:number})=>`/_api/sales_materials/cover?${new URLSearchParams({materialId,r:String(revision)})}`;
/** Revocation of one share link (POST /_api/sales_materials/share_revoke): admin, its author or whoever can write on the business (spec 89 §10). */
export const salesMaterialShareRevokeInput=z.object({shareId:uuid,reason:z.string().trim().min(3).max(500)});
export type SalesMaterialShareRevokeInput=z.infer<typeof salesMaterialShareRevokeInput>;
/**
 * A sales material tied to a message (spec 89 §8.4). The link itself is never returned: only its hash is stored, the URL lives in the message body.
 * `available` is false when the material was archived, became internal or lost its version. `attachBlockedReason` explains why «Adjuntar el archivo» is off.
 */
export type MessageMaterial={shareId:string;messageId:string;materialId:string;title:string;channel:'email'|'whatsapp';source:'file'|'url';fileName:string|null;byteSize:number|null;available:boolean;preparedVersion:number|null;sentVersion:number|null;attach:boolean;attachedVersion:number|null;attachBlockedReason:string|null;createdByEmail:string;createdAt:Date;revokedAt:Date|null;revokedByEmail:string|null;revokeReason:string|null;technicalAccessCount:number;lastTechnicalAccessAt:Date|null};
/** Revokes a share link: the public page answers 410 from then on. */
export async function revokeSalesMaterialShare(input:SalesMaterialShareRevokeInput):Promise<{ok:true}>{return postJson('/_api/sales_materials/share_revoke',salesMaterialShareRevokeInput.parse(input));}
