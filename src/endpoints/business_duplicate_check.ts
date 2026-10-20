import superjson from 'superjson';
import {sql,type Kysely,type Transaction} from 'kysely';
import {z} from 'zod';
import {db} from '../helpers/db';
import type {DB} from '../helpers/schema';
import {getServerUserSession} from '../helpers/getServerUserSession';
import {errorResponse} from '../helpers/errorResponse';
import {normalizeSearchSql} from '../helpers/searchSql';
import {matchAccounts,phoneSignificantKeys} from '../helpers/dataNormalization';
import {assertAccountReadable} from '../helpers/crmPermissions';
import type {DuplicateCandidate} from './business_duplicate_check.schema';

const text=z.string().trim().max(200).optional();
const querySchema=z.object({nombre:text,ciudad:text,telefono:text,email:text,whatsapp:text});
type Input=z.infer<typeof querySchema>;
type Executor=Kysely<DB>|Transaction<DB>;

/** Existing businesses (archived and No contactar included; trash and merged excluded) that look like `input`: SQL prefilter, then exact `matchAccounts`. */
export async function findDuplicateAccounts(executor:Executor,input:Input){
 const name=input.nombre?.trim(),email=input.email?.trim().toLowerCase();
 const tails=[...new Set([input.telefono,input.whatsapp].flatMap(v=>phoneSignificantKeys(v)).map(k=>k.slice(-6)))];
 const digits=(col:string)=>sql<string>`regexp_replace(coalesce(${sql.ref(col)},''),'\\D','','g')`;
 const clauses=[
  ...(name?[sql<boolean>`${normalizeSearchSql(sql<string>`nombre`)} = ${normalizeSearchSql(sql<string>`${name}`)}`]:[]),
  ...(email?[sql<boolean>`lower(email) = ${email}`]:[]),
  ...tails.flatMap(t=>[sql<boolean>`${digits('telefono')} like ${'%'+t+'%'}`,sql<boolean>`${digits('whatsapp')} like ${'%'+t+'%'}`]),
 ];
 if(!clauses.length)return [];
 const rows=await executor.selectFrom('crmAccounts').selectAll().where('mergedIntoId','is',null).where('deletedAt','is',null).where(sql<boolean>`(${sql.join(clauses,sql` or `)})`).orderBy('id').limit(50).execute();
 // Emails are compared case-insensitively here (matchAccounts keeps the local-part case).
 const lower=(v:string|null|undefined)=>v?.toLowerCase()??v;
 const matches=matchAccounts({...input,email:lower(input.email)},rows.map(r=>({...r,email:lower(r.email)??null})));
 const byId=new Map(rows.map(r=>[String(r.id),r]));
 return matches.map(m=>({match:m,account:byId.get(m.id)!}));
}

/** True for a match that must block creating a new business: same name and city, or a shared/similar phone. */
export const isBlockingMatch=(m:{kind:string;reasons:string[]})=>m.kind==='duplicate_candidate'||m.reasons.some(r=>r==='Teléfono compartido'||r==='Teléfono parecido');

/** GET /_api/business/duplicate-check: any authenticated user. Exposes only name, city, flags, status, the responsible's display name and the match reasons. */
export async function handle(request:Request){try{
 const {user}=await getServerUserSession(request);
 const input=querySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
 const found=await findDuplicateAccounts(db,input);
 const names=new Map((await db.selectFrom('users').select(['email','displayName']).where('email','in',[...new Set(found.flatMap(f=>f.account.assignedUserEmail?[f.account.assignedUserEmail]:[]))].concat('')).execute()).map(u=>[u.email,u.displayName]));
 const candidates:DuplicateCandidate[]=found.map(({match,account})=>{
  let canOpen=true;try{assertAccountReadable(user,account);}catch{canOpen=false;}
  const status=(account as typeof account&{status?:string|null}).status??null;
  return {id:match.id,nombre:account.nombre,ciudad:account.ciudad,doNotContact:account.doNotContact,archived:!!account.archivedAt,deleted:false,status,responsibleName:account.assignedUserEmail?names.get(account.assignedUserEmail)??null:null,reasons:match.reasons,canOpen};
 });
 return new Response(superjson.stringify({candidates}),{headers:{'Content-Type':'application/json'}});
}catch(e){return errorResponse(e);}}
