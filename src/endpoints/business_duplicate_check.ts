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
import {instagramProfilePattern,normalizeInstagramUsername} from '../helpers/instagramChat';
import {DNC_DUPLICATE_MESSAGE,type DuplicateCandidate} from './business_duplicate_check.schema';
export {DNC_DUPLICATE_MESSAGE};

const text=z.string().trim().max(200).optional();
const querySchema=z.object({nombre:text,ciudad:text,telefono:text,email:text,whatsapp:text,instagram:text,personPhone:text});
/** Reason of a business whose Instagram profile is the same username (spec 98 §17). An exactly shared Instagram blocks like a shared phone. */
export const INSTAGRAM_SHARED='Instagram compartido';
type MatchLike={id:string;reasons:string[];kind:'duplicate_candidate'|'shared_person_or_related'};
/**
 * Adds «Instagram compartido» to the matches of every row whose stored profile (URL, `@user` or bare username) normalizes to `username`,
 * creating the match when the row matched nothing else. Pure: the SQL only prefilters.
 */
export function withInstagramMatches<M extends MatchLike>({matches,rows,username}:{matches:readonly M[];rows:readonly {id:string|number;perfilInstagram?:string|null}[];username:string|null}):(M|MatchLike)[]{
 if(!username)return [...matches];
 const out:(M|MatchLike)[]=matches.map(m=>({...m,reasons:[...m.reasons]}));
 for(const row of rows){
  if(normalizeInstagramUsername(row.perfilInstagram)!==username)continue;
  const found=out.find(m=>m.id===String(row.id));
  if(!found)out.push({id:String(row.id),reasons:[INSTAGRAM_SHARED],kind:'shared_person_or_related'});
  else if(!found.reasons.includes(INSTAGRAM_SHARED))found.reasons.push(INSTAGRAM_SHARED);
 }
 return out;
}
type Input=Omit<z.infer<typeof querySchema>,'personPhone'>;
type Executor=Kysely<DB>|Transaction<DB>;

/** Existing businesses (archived and No contactar included; trash and merged excluded) that look like `input`: SQL prefilter, then `matchAccounts` with the ñ-preserving name rule. No contactar first so they survive the limit. */
export async function findDuplicateAccounts(executor:Executor,input:Input,options:{excludeId?:string}={}){
 const name=input.nombre?.trim(),email=input.email?.trim().toLowerCase(),instagram=normalizeInstagramUsername(input.instagram);
 const tails=[...new Set([input.telefono,input.whatsapp].flatMap(v=>phoneSignificantKeys(v)).map(k=>k.slice(-6)))];
 const digits=(col:string)=>sql<string>`regexp_replace(coalesce(${sql.ref(col)},''),'\\D','','g')`;
 const clauses=[
  ...(name?[sql<boolean>`${normalizeSearchSql(sql<string>`nombre`)} = ${normalizeSearchSql(sql<string>`${name}`)}`]:[]),
  ...(email?[sql<boolean>`lower(email) = ${email}`]:[]),
  ...tails.flatMap(t=>[sql<boolean>`${digits('telefono')} like ${'%'+t+'%'}`,sql<boolean>`${digits('whatsapp')} like ${'%'+t+'%'}`]),
  ...[input.telefono,input.whatsapp].flatMap(v=>v?.trim()?[sql<boolean>`telefono = ${v.trim()}`,sql<boolean>`whatsapp = ${v.trim()}`]:[]),
  // Anchored on the profile (spec 98 review): never a substring search, so a short username does not flood the 50-row limit.
  ...(instagram?[sql<boolean>`perfil_instagram ~* ${instagramProfilePattern(instagram)}`]:[]),
 ];
 if(!clauses.length)return [];
 let query=executor.selectFrom('crmAccounts').selectAll().where('mergedIntoId','is',null).where('deletedAt','is',null).where(sql<boolean>`(${sql.join(clauses,sql` or `)})`);
 if(options.excludeId)query=query.where('id','!=',options.excludeId);
 const rows=await query.orderBy('doNotContact','desc').orderBy('id').limit(50).execute();
 // Emails are compared case-insensitively here (matchAccounts keeps the local-part case).
 const lower=(v:string|null|undefined)=>v?.toLowerCase()??v;
 const {instagram:_instagram,...matchInput}=input;
 const matches=withInstagramMatches({matches:matchAccounts({...matchInput,email:lower(input.email)},rows.map(r=>({...r,email:lower(r.email)??null})),{similarPhone:true}),rows,username:instagram});
 const byId=new Map(rows.map(r=>[String(r.id),r]));
 const nameLabel='Nombre y localidad normalizados coinciden';
 return matches.flatMap(m=>{
  const account=byId.get(m.id)!,strict=!!strictComparisonName(input.nombre)&&strictComparisonName(account.nombre)===strictComparisonName(input.nombre)&&!!strictComparisonName(input.ciudad)&&strictComparisonName(account.ciudad)===strictComparisonName(input.ciudad);
  const reasons=m.reasons.filter(r=>r!==nameLabel).concat(strict?[nameLabel]:[]);
  return reasons.length?[{match:{...m,reasons,kind:strict?'duplicate_candidate' as const:'shared_person_or_related' as const},account}]:[];
 });
}

/** Blocks only on same name and city (ñ-preserving), an exactly shared normalized phone/WhatsApp or (spec 98 §17) the same Instagram username. Similar phones and shared emails only warn. */
export const isBlockingMatch=(m:{kind:string;reasons:string[]})=>m.kind==='duplicate_candidate'||m.reasons.some(r=>r==='Teléfono compartido'||r==='WhatsApp compartido'||r===INSTAGRAM_SHARED);

type Values={nombre?:string|null;ciudad?:string|null;telefono?:string|null;email?:string|null;whatsapp?:string|null;perfilInstagram?:string|null};
const pick=(v:Values):Input=>({nombre:v.nombre??undefined,ciudad:v.ciudad??undefined,telefono:v.telefono??undefined,email:v.email??undefined,whatsapp:v.whatsapp??undefined,instagram:v.perfilInstagram??undefined});
/** First No contactar business that `after` newly duplicates, or null. On edits (`before` given) only identity fields that changed count, and a business the record already matched before the change does not block. */
export async function findNewDncBlocker(executor:Executor,{after,before,excludeId}:{after:Values;before?:Values;excludeId?:string}){
 const keys=['nombre','ciudad','telefono','email','whatsapp','perfilInstagram'] as const;
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

/** Name and city of a No contactar business: the same exposure the duplicate check already gives every seller. */
export type DncPhoneBusiness={nombre:string;ciudad:string|null};
/**
 * Decision D2: for each person, the No contactar businesses (archived included; trash, merged and `excludeAccountId` left out) whose phone is exactly the person's phone.
 * One query for all people (the No contactar set is small and served by `crm_accounts_dnc_idx`); only an exactly shared phone counts, never a similar one. Never blocks and writes nothing.
 */
export async function findDncPhoneBusinessesForPeople(executor:Executor,people:readonly {id:string|number;phone:string|null|undefined}[],excludeAccountId:string):Promise<Map<string,DncPhoneBusiness[]>>{
 const result=new Map<string,DncPhoneBusiness[]>();
 const withPhone=people.filter(p=>p.phone?.trim());
 const tails=[...new Set(withPhone.flatMap(p=>phoneSignificantKeys(p.phone)).map(k=>k.slice(-6)))];
 if(!tails.length)return result;
 const digits=(col:string)=>sql<string>`regexp_replace(coalesce(${sql.ref(col)},''),'\\D','','g')`;
 const clauses=tails.flatMap(t=>[sql<boolean>`${digits('telefono')} like ${'%'+t+'%'}`,sql<boolean>`${digits('whatsapp')} like ${'%'+t+'%'}`]);
 const rows=await executor.selectFrom('crmAccounts').selectAll().where('doNotContact','=',true).where('mergedIntoId','is',null).where('deletedAt','is',null).where('id','!=',excludeAccountId).where(sql<boolean>`(${sql.join(clauses,sql` or `)})`).orderBy('id').limit(200).execute();
 if(!rows.length)return result;
 const lower=(v:string|null|undefined)=>v?.toLowerCase()??v;
 const candidates=rows.map(r=>({...r,email:lower(r.email)??null}));
 const byId=new Map(rows.map(r=>[String(r.id),r]));
 for(const p of withPhone){
  const found=matchAccounts({telefono:p.phone!},candidates,{similarPhone:true}).filter(m=>m.reasons.includes('Teléfono compartido')).map(m=>byId.get(m.id)!);
  if(found.length)result.set(String(p.id),found.map(a=>({nombre:a.nombre,ciudad:a.ciudad})));
 }
 return result;
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
