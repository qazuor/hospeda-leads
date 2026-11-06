import {sql,type Kysely,type Transaction} from 'kysely';
import type {DB} from './schema';

export type AccountClassification={tipo:string;subtipo:string|null};
type PreviousClassification={tipo:string|null;subtipo:string|null};
type Executor=Kysely<DB>|Transaction<DB>;
type Actor={email:string;displayName:string};

export function normalizeClassifications({pairs}:{pairs:readonly AccountClassification[]}):AccountClassification[]{
 const seen=new Set<string>(),normalized:AccountClassification[]=[];
 for(const pair of pairs){const tipo=pair.tipo.trim(),subtipo=pair.subtipo?.trim()||null;if(!tipo)continue;
  const key=JSON.stringify([tipo,subtipo]);if(seen.has(key))continue;seen.add(key);normalized.push({tipo,subtipo});}
 const withSubtype=new Set(normalized.filter(pair=>pair.subtipo).map(pair=>pair.tipo));
 return normalized.filter(pair=>pair.subtipo||!withSubtype.has(pair.tipo));
}

export async function classificationErrors(database:Executor,tipo:string|null,subtipo:string|null,previous?:PreviousClassification){
 const errors:string[]=[];if(previous&&tipo===previous.tipo&&subtipo===previous.subtipo)return errors;
 if(tipo&&!await database.selectFrom('crmVerticals').select('id').where('name','=',tipo).where('active','=',true).executeTakeFirst())errors.push('Vertical no disponible en Configuración.');
 if(subtipo&&(!tipo||!await database.selectFrom('crmSubtypes').select('id').where('name','=',subtipo).where('typeName','=',tipo).where('active','=',true).executeTakeFirst()))errors.push('Subtipo no disponible para esta vertical.');
 return errors;
}

export async function classificationListErrors({db,pairs,previous=[]}:{db:Executor;pairs:readonly AccountClassification[];previous?:readonly AccountClassification[]}):Promise<string[]>{
 const errors:string[]=[],normalized=normalizeClassifications({pairs}),old=new Set(normalizeClassifications({pairs:previous}).map(pair=>JSON.stringify([pair.tipo,pair.subtipo])));
 if(normalized.length>8)errors.push('Un negocio puede tener como máximo 8 verticales.');
 for(const pair of normalized){if(old.has(JSON.stringify([pair.tipo,pair.subtipo])))continue;errors.push(...await classificationErrors(db,pair.tipo,pair.subtipo));}
 return [...new Set(errors)];
}

export function displayClassification({pairs,verticalOrder}:{pairs:readonly AccountClassification[];verticalOrder:readonly string[]}):AccountClassification|null{
 const order=new Map(verticalOrder.map((name,index)=>[name,index]));
 return [...pairs].sort((a,b)=>(order.get(a.tipo)??Number.MAX_SAFE_INTEGER)-(order.get(b.tipo)??Number.MAX_SAFE_INTEGER)||a.tipo.localeCompare(b.tipo)||Number(!!a.subtipo)-Number(!!b.subtipo)||(a.subtipo??'').localeCompare(b.subtipo??''))[0]??null;
}

export async function setAccountClassifications({trx,accountId,pairs,actor,reason,trustedPairs=[]}:{trx:Transaction<DB>;accountId:string;pairs:readonly AccountClassification[];actor:Actor;reason:string;trustedPairs?:readonly AccountClassification[]}):Promise<void>{
 const normalized=normalizeClassifications({pairs});if(normalized.length>8)throw new Error('Un negocio puede tener como máximo 8 verticales.');
 await trx.selectFrom('crmAccounts').select('id').where('id','=',accountId).forUpdate().executeTakeFirstOrThrow();
 const currentRows=await trx.selectFrom('crmAccountClassifications').selectAll().where('accountId','=',accountId).orderBy('id').execute();
 const previous=currentRows.map(({tipo,subtipo})=>({tipo,subtipo}));
 const same=(a:readonly AccountClassification[],b:readonly AccountClassification[])=>{const aa=normalizeClassifications({pairs:a}).map(pair=>JSON.stringify([pair.tipo,pair.subtipo])).sort(),bb=normalizeClassifications({pairs:b}).map(pair=>JSON.stringify([pair.tipo,pair.subtipo])).sort();return aa.length===bb.length&&aa.every((pair,index)=>pair===bb[index]);};
 if(same(previous,normalized))return;
 const trusted=new Set(normalizeClassifications({pairs:trustedPairs}).map(pair=>JSON.stringify([pair.tipo,pair.subtipo]))),newPairs=normalized.filter(pair=>!previous.some(old=>old.tipo===pair.tipo&&old.subtipo===pair.subtipo)&&!trusted.has(JSON.stringify([pair.tipo,pair.subtipo])));
 const errors=await classificationListErrors({db:trx,pairs:newPairs,previous});if(normalized.length>8)errors.push('Un negocio puede tener como máximo 8 verticales.');if(errors.length)throw new Error(errors.join(' '));
 const verticalOrder=(await trx.selectFrom('crmVerticals').select('name').orderBy('sortOrder').orderBy('name').execute()).map(row=>row.name);
 const display=displayClassification({pairs:normalized,verticalOrder});
 // Only the difference is written: unchanged pairs keep their id, author and date (spec §5.2).
 const key=(pair:AccountClassification)=>JSON.stringify([pair.tipo,pair.subtipo]),wanted=new Set(normalized.map(key)),kept=new Set(currentRows.map(key));
 const removed=currentRows.filter(row=>!wanted.has(key(row))).map(row=>String(row.id)),added=normalized.filter(pair=>!kept.has(key(pair)));
 if(removed.length)await trx.deleteFrom('crmAccountClassifications').where('id','in',removed).execute();
 if(added.length)await trx.insertInto('crmAccountClassifications').values(added.map(pair=>({accountId,tipo:pair.tipo,subtipo:pair.subtipo,createdBy:actor.email}))).execute();
 await trx.updateTable('crmAccounts').set({tipo:display?.tipo??null,subtipo:display?.subtipo??null,updatedAt:new Date()}).where('id','=',accountId).execute();
 await trx.insertInto('crmCommercialJournal').values({accountId,contactId:null,action:'account_classifications_changed',actorEmail:actor.email,actorName:actor.displayName,metadata:sql`${JSON.stringify({before:previous,after:normalized,reason})}::text::jsonb`}).execute();
}
