import {createHash,timingSafeEqual} from 'node:crypto';
import {z} from 'zod';
import {db} from '../helpers/db';
import {mutateQuality,QualityConflict,QualityForbidden,QualityValidation,qualityConfig} from '../helpers/dataQualityService';
import {importRow,type ImportResult} from './dataQuality.schema';

// Plain JSON contract; intentionally separate from cookie/SuperJSON endpoints.
export const businessImportMutation=z.discriminatedUnion('action',[
 z.object({action:z.literal('import_preview'),rows:z.array(importRow).min(1).max(30),source:z.string().trim().min(1).max(200),sourceUrl:z.string().url().refine(s=>/^https?:\/\//.test(s)).nullable().optional(),obtainedAt:z.string().datetime({offset:true}).nullable().optional()}).strict(),
 z.object({action:z.literal('import_confirm'),batchId:z.string().uuid(),decisions:z.array(z.object({index:z.number().int().nonnegative(),action:z.enum(['create','skip']),acknowledge:z.boolean().default(false)}).strict()).max(30),confirm:z.literal(true)}).strict(),
]);
class ImportHttpError extends Error{constructor(public status:number,message:string){super(message);}}
const reply=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
const fail=(error:unknown)=>reply({error:error instanceof ImportHttpError||error instanceof QualityForbidden||error instanceof QualityConflict||error instanceof QualityValidation?error.message:error instanceof z.ZodError||error instanceof SyntaxError?'Solicitud de importación inválida.':'No se pudo procesar la importación.'},error instanceof ImportHttpError?error.status:error instanceof QualityForbidden?403:error instanceof QualityConflict?409:error instanceof z.ZodError||error instanceof SyntaxError||error instanceof QualityValidation?400:500);

async function actor(request:Request){
 const expected=process.env.BUSINESS_IMPORT_TOKEN_SHA256??'',email=process.env.BUSINESS_IMPORT_ACTOR_EMAIL||process.env.ADMIN_EMAIL||'';
 if(!/^[a-f0-9]{64}$/.test(expected)||!email)throw new ImportHttpError(503,'Importación automatizada no configurada.');
 const token=request.headers.get('Authorization')?.match(/^Bearer ([A-Za-z0-9_-]{43,200})$/)?.[1];
 if(!token||!timingSafeEqual(createHash('sha256').update(token).digest(),Buffer.from(expected,'hex')))throw new ImportHttpError(401,'Clave de importación inválida.');
 const user=await db.selectFrom('users').select(['id','email','displayName','fullName','avatarUrl','role']).where('email','=',email).executeTakeFirst();
 if(!user||user.role!=='admin')throw new ImportHttpError(503,'Responsable de importación no disponible.');
 // The audit actor is real, but the credential never inherits administrator permissions.
 return {...user,role:'user' as const};
}

async function body(request:Request){
 if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type')??''))throw new ImportHttpError(415,'Usá application/json.');
 const reader=request.body?.getReader();if(!reader)throw new ImportHttpError(400,'Falta el cuerpo JSON.');
 const chunks:Uint8Array[]=[];let size=0;
 try{while(true){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.byteLength;if(size>2097152){await reader.cancel();throw new ImportHttpError(413,'El cuerpo supera 2 MiB.');}chunks.push(chunk.value);}}finally{reader.releaseLock();}
 return businessImportMutation.parse(JSON.parse(Buffer.concat(chunks).toString('utf8')));
}

export async function post(request:Request){try{
 const user=await actor(request),input=await body(request);
 const result=await mutateQuality(db,input.action==='import_preview'?{...input,mode:'business'}:input,user,{businessCreateOnly:true});
 return reply(result);
}catch(error){return fail(error);}}

export async function get(request:Request){try{
 const user=await actor(request),batchId=new URL(request.url).searchParams.get('batchId');
 if(!batchId){
  const [config,verticals,subtypes]=await Promise.all([qualityConfig(db),db.selectFrom('crmVerticals').select('name').where('active','=',true).execute(),db.selectFrom('crmSubtypes').select(['name','typeName']).where('active','=',true).execute()]);
  return reply({mode:'business',maxRows:Math.min(30,config.maxRows),maxFileBytes:config.maxFileBytes,verticals,subtypes:subtypes.filter(s=>verticals.some(v=>v.name===s.typeName))});
 }
 if(!z.string().uuid().safeParse(batchId).success)throw new ImportHttpError(400,'ID de lote inválido.');
 const batch=await db.selectFrom('crmImportBatches').select(['id','status','result','createdAt','completedAt']).where('id','=',batchId).where('ownerEmail','=',user.email).where('mode','=','business').executeTakeFirst();
 if(!batch)throw new ImportHttpError(404,'Lote no encontrado.');
 const result=batch.result as ImportResult|null;
 const ids=result?.details.filter(d=>d.action==='create'&&d.entity==='business').map(d=>d.accountId!).filter(Boolean)??[];
 const accounts=ids.length?await db.selectFrom('crmAccounts').select(['id','nombre','ciudad','tipo','subtipo','commercialStatus','assignedUserEmail','mergedIntoId','archivedAt']).where('id','in',ids).execute():[];
 return reply({...batch,accounts,allCreatedAccountsPresent:batch.status==='completed'&&ids.length===accounts.length});
}catch(error){return fail(error);}}
