import superjson from 'superjson';import {z} from 'zod';
import {db} from '../helpers/db';import {getServerUserSession} from '../helpers/getServerUserSession';import {NotAuthenticatedError} from '../helpers/getSetServerSession';import {crmError,fallbackStatus} from '../helpers/crmErrors';
import {CrmForbidden} from '../helpers/crmPermissions';import {CommunicationConflict,CommunicationForbidden} from '../helpers/communicationService';import {R2NotConfigured,R2Unavailable} from '../helpers/r2';
import {SalesMaterialNotFound,createSalesMaterialUpload,listSalesMaterials,mutateSalesMaterial,salesMaterialCover,salesMaterialFileLocation} from '../helpers/salesMaterialService';
import {salesMaterialListQuery,salesMaterialMutation,salesMaterialShareRevokeInput,salesMaterialUploadInput} from './salesMaterials.schema';
import {revokeSalesMaterialShare} from '../helpers/salesMaterialDraft';
const response=(v:unknown,status=200)=>new Response(superjson.stringify(v),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
/** 401 session, 403 permission, 404 missing, 409 revision/consumed upload, 503 storage not configured or down; otherwise 400/500 as in /_api/resources. */
export const salesMaterialStatus=(e:unknown)=>e instanceof NotAuthenticatedError?401:e instanceof CrmForbidden||e instanceof CommunicationForbidden?403:e instanceof SalesMaterialNotFound?404:e instanceof CommunicationConflict?409:e instanceof R2NotConfigured||e instanceof R2Unavailable?503:fallbackStatus(e);
const failure=(e:unknown)=>response({error:crmError(e)},salesMaterialStatus(e));
const body=async(request:Request)=>{const raw=await request.text();if(Buffer.byteLength(raw)>64000)throw new Error('Solicitud demasiado grande');try{return superjson.parse(raw)}catch{throw new Error('Solicitud inválida.')}};
/** GET /_api/sales_materials: any authenticated user; archived material and older versions only for admins. */
export async function get(request:Request){try{
 const {user}=await getServerUserSession(request);
 const query=salesMaterialListQuery.parse(Object.fromEntries(new URL(request.url).searchParams));
 return response(await listSalesMaterials(db,{user,query}));
}catch(e){return failure(e)}}
/** POST /_api/sales_materials: admin mutations. */
export async function post(request:Request){try{const {user}=await getServerUserSession(request);return response(await mutateSalesMaterial(db,{input:salesMaterialMutation.parse(await body(request)),user}));}catch(e){return failure(e)}}
/** POST /_api/sales_materials/upload_url: admin only; presigned PUT for the browser. */
export async function uploadUrl(request:Request){try{const {user}=await getServerUserSession(request);return response(await createSalesMaterialUpload(db,{input:salesMaterialUploadInput.parse(await body(request)),user}));}catch(e){return failure(e)}}
const fileQuery=z.object({versionId:z.string().uuid(),disposition:z.enum(['inline','attachment']).default('inline')});
const page=(message:string,status:number)=>new Response(`<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Material de venta</title><p style="font:16px system-ui,sans-serif;margin:24px">${message.replace(/[&<>"']/g,c=>'&#'+c.charCodeAt(0)+';')}</p></html>`,{status,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}});
/** GET /_api/sales_materials/file: any authenticated user; 302 to a 5-minute presigned GET (or the external URL). Errors are a small HTML page because it is opened as a link or media src. */
export async function file(request:Request){try{
 const {user}=await getServerUserSession(request);
 const q=fileQuery.parse(Object.fromEntries(new URL(request.url).searchParams));
 const location=await salesMaterialFileLocation(db,{versionId:q.versionId,disposition:q.disposition,user});
 return new Response(null,{status:302,headers:{Location:location,'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
}catch(e){return page(crmError(e),salesMaterialStatus(e))}}
/** GET /_api/sales_materials/cover: any authenticated user; the cover bytes (at most 1 MB) through our server, cacheable per revision. */
export async function cover(request:Request){try{
 const {user}=await getServerUserSession(request);
 const materialId=z.string().uuid().parse(new URL(request.url).searchParams.get('materialId'));
 const found=await salesMaterialCover(db,{materialId,user});
 if(!found)return new Response(null,{status:404,headers:{'Cache-Control':'no-store'}});
 return new Response(found.body,{headers:{'Content-Type':found.contentType,'Cache-Control':'private, max-age=3600','Vary':'Cookie','X-Content-Type-Options':'nosniff'}});
}catch(e){return new Response(null,{status:salesMaterialStatus(e),headers:{'Cache-Control':'no-store'}})}}
/** POST /_api/sales_materials/share_revoke: admin, the author of the send or whoever can write on the business (spec 89 §10). */
export async function shareRevoke(request:Request){try{const {user}=await getServerUserSession(request);return response(await revokeSalesMaterialShare(db,{input:salesMaterialShareRevokeInput.parse(await body(request)),user}));}catch(e){return failure(e)}}
