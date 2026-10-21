import superjson from 'superjson';
import {sql,type Kysely,type Transaction} from 'kysely';
import {z} from 'zod';
import {db} from '../helpers/db';
import type {DB} from '../helpers/schema';
import {getServerUserSession} from '../helpers/getServerUserSession';
import {errorResponse} from '../helpers/errorResponse';
import {normalizeSearchSql} from '../helpers/searchSql';
import {matchAccounts,phoneSignificantKeys,strictComparisonName} from '../helpers/dataNormalization';
import {assertAccountReadable} from '../helpers/crmPermissions';
import {DNC_DUPLICATE_MESSAGE,type DuplicateCandidate} from './business_duplicate_check.schema';
export {DNC_DUPLICATE_MESSAGE};

const text=z.string().trim().max(200).optional();
const querySchema=z.object({nombre:text,ciudad:text,telefono:text,email:text,whatsapp:text,personPhone:text});
type Input=Omit<z.infer<typeof querySchema>,'personPhone'>;
type Executor=Kysely<DB>|Transaction<DB>;

/** Existing businesses (archived and No contactar included; trash and merged excluded) that look like `input`: SQL prefilter, then `matchAccounts` with the ñ-preserving name rule. No contactar first so they survive the limit. */
export async function findDuplicateAccounts(executor:Executor,input:Input,options:{excludeId?:string}={}){
 const name=input.nombre?.trim(),email=input.email?.trim().toLowerCase();
 const tails=[...new Set([input.telefono,input.whatsapp].flatMap(v=>phoneSignificantKeys(v)).map(k=>k.slice(-6)))];
 const digits=(col:string)=>sql<string>`regexp_replace(coalesce(${sql.ref(col)},''),'\\D','','g')`;
 const clauses=[
  ...(name?[sql<boolean>`${normalizeSearchSql(sql<string>`nombre`)} = ${normalizeSearchSql(sql<string>`${name}`)}`]:[]),
  ...(email?[sql<boolean>`lower(email) = ${email}`]:[]),
  ...tails.flatMap(t=>[sql<boolean>`${digits('telefono')} like ${'%'+t+'%'}`,sql<boolean>`${digits('whatsapp')} like ${'%'+t+'%'}`]),
  ...[input.telefono,input.whatsapp].flatMap(v=>v?.trim()?[sql<boolean>`telefono = ${v.trim()}`,sql<boolean>`whatsapp = ${v.trim()}`]:[]),
 ];
 if(!clauses.length)return [];
 let query=executor.selectFrom('crmAccounts').selectAll().where('mergedIntoId','is',null).where('deletedAt','is',null).where(sql<boolean>`(${sql.join(clauses,sql` or `)})`);
 if(options.excludeId)query=query.where('id','!=',options.excludeId);
 const rows=await query.orderBy('doNotContact','desc').orderBy('id').limit(50).execute();
 // Emails are compared case-insensitively here (matchAccounts keeps the local-part case).
 const lower=(v:string|null|undefined)=>v?.toLowerCase()??v;
 const matches=matchAccounts({...input,email:lower(input.email)},rows.map(r=>({...r,email:lower(r.email)??null})),{similarPhone:true});
 const byId=new Map(rows.map(r=>[String(r.id),r]));
 const nameLabel='Nombre y localidad normalizados coinciden';
 return matches.flatMap(m=>{
  const account=byId.get(m.id)!,strict=!!strictComparisonName(input.nombre)&&strictComparisonName(account.nombre)===strictComparisonName(input.nombre)&&!!strictComparisonName(input.ciudad)&&strictComparisonName(account.ciudad)===strictComparisonName(input.ciudad);
  const reasons=m.reasons.filter(r=>r!==nameLabel).concat(strict?[nameLabel]:[]);
  return reasons.length?[{match:{...m,reasons,kind:strict?'duplicate_candidate' as const:'shared_person_or_related' as const},account}]:[];
 });
}

/** Blocks only on same name and city (ñ-preserving) or an exactly shared normalized phone/WhatsApp. Similar phones and shared emails only warn. */
export const isBlockingMatch=(m:{kind:string;reasons:string[]})=>m.kind==='duplicate_candidate'||m.reasons.some(r=>r==='Teléfono compartido'||r==='WhatsApp compartido');

type Values={nombre?:string|null;ciudad?:string|null;telefono?:string|null;email?:string|null;whatsapp?:string|null};
const pick=(v:Values):Input=>({nombre:v.nombre??undefined,ciudad:v.ciudad??undefined,telefono:v.telefono??undefined,email:v.email??undefined,whatsapp:v.whatsapp??undefined});
/** First No contactar business that `after` newly duplicates, or null. On edits (`before` given) only identity fields that changed count, and a business the record already matched before the change does not block. */
export async function findNewDncBlocker(executor:Executor,{after,before,excludeId}:{after:Values;before?:Values;excludeId?:string}){
 const keys=['nombre','ciudad','telefono','email','whatsapp'] as const;
 if(before&&keys.every(k=>(before[k]?.trim()||null)===(after[k]?.trim()||null)))return null;
 const blockers=async(v:Values)=>(await findDuplicateAccounts(executor,pick(v),{excludeId})).filter(f=>f.account.doNotContact&&isBlockingMatch(f.match));
 const previous=before?new Set((await blockers(before)).map(f=>String(f.account.id))):new Set<string>();
 return (await blockers(after)).find(f=>!previous.has(String(f.account.id)))?.account??null;
}

const personReasons:Record<string,string>={'Teléfono compartido':'Teléfono de la persona compartido','Teléfono parecido':'Teléfono de la persona parecido'};
/** Businesses whose phone matches a person's phone (No contactar first). Never blocking (decision 13B): a person's phone, even exactly shared with a No contactar business, only warns. Business phones are what block (`isBlockingMatch`). */
export async function findPersonPhoneMatches(executor:Executor,phone:string|null|undefined,options:{excludeId?:string}={}){
 if(!phone?.trim())return [];
 return (await findDuplicateAccounts(executor,{telefono:phone},options)).map(f=>({...f,blocking:false,match:{...f.match,reasons:f.match.reasons.map(r=>personReasons[r]??r)}}));
}

/** GET /_api/business/duplicate-check: any authenticated user. Exposes only id, name, city, archived/No contactar flags and the match reasons; status and the responsible's display name (never email) only for businesses the caller can open. */
export async function handle(request:Request){try{
 const {user}=await getServerUserSession(request);
 const input=querySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
 const {personPhone,...business}=input;
 const merged=new Map<string,{match:{id:string;reasons:string[]};account:Awaited<ReturnType<typeof findDuplicateAccounts>>[number]['account'];blocking:boolean}>();
 for(const f of [...(await findDuplicateAccounts(db,business)).map(f=>({...f,blocking:f.account.doNotContact&&isBlockingMatch(f.match)})),...await findPersonPhoneMatches(db,personPhone)]){
  const previous=merged.get(f.match.id);
  merged.set(f.match.id,previous?{...previous,blocking:previous.blocking||f.blocking,match:{...previous.match,reasons:[...new Set([...previous.match.reasons,...f.match.reasons])]}}:f);
 }
 const found=[...merged.values()].sort((a,b)=>Number(b.account.doNotContact)-Number(a.account.doNotContact));
 const names=new Map((await db.selectFrom('users').select(['email','displayName']).where('email','in',[...new Set(found.flatMap(f=>f.account.assignedUserEmail?[f.account.assignedUserEmail]:[]))].concat('')).execute()).map(u=>[u.email,u.displayName]));
 const candidates:DuplicateCandidate[]=found.map(({match,account,blocking})=>{
  let canOpen=true;try{assertAccountReadable(user,account);}catch{canOpen=false;}
  const status=(account as typeof account&{status?:string|null}).status??null;
  return {id:match.id,nombre:account.nombre,ciudad:account.ciudad,doNotContact:account.doNotContact,archived:!!account.archivedAt,deleted:false,...(canOpen?{status,responsibleName:account.assignedUserEmail?names.get(account.assignedUserEmail)??null:null}:{}),reasons:match.reasons,canOpen,blocking};
 });
 return new Response(superjson.stringify({candidates}),{headers:{'Content-Type':'application/json'}});
}catch(e){return errorResponse(e);}}
