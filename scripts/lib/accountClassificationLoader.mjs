import {sql} from 'kysely';
import {parseClassificationImport} from '../../src/helpers/classificationImport.ts';
import {displayClassification,setAccountClassifications,normalizeClassifications} from '../../src/helpers/accountClassification.ts';

const labelOf=pair=>pair.tipo+(pair.subtipo?`/${pair.subtipo}`:'');
const keyOf=pair=>JSON.stringify([pair.tipo,pair.subtipo]);
const issue=reason=>`requiere revisión manual: ${reason}`;
export const rawIssue=rows=>{
 const clean=normalizeClassifications({pairs:rows.map(({tipo,subtipo})=>({tipo,subtipo}))});
 if(clean.length!==rows.length)return 'las clasificaciones actuales tienen duplicados o pares incompatibles';
 if(rows.some(row=>!row.tipo?.trim()||row.tipo!==row.tipo.trim()||row.subtipo!==null&&(!row.subtipo.trim()||row.subtipo!==row.subtipo.trim())))return 'hay campos vacíos o texto sin recortar en las clasificaciones actuales';
 return null;
};

export function planCandidateOutcomes({currentRows,candidates}){
 const current=normalizeClassifications({pairs:currentRows.map(({tipo,subtipo})=>({tipo,subtipo}))}),known=[...current],wanted=new Set(current.map(keyOf)),outcomes=[],accepted=[];
 for(const item of candidates){const pair=item.pair,k=keyOf(pair);
  if(wanted.has(k)){outcomes.push({label:item.label,kind:'unchanged',reason:`sin cambios (ya tiene ${labelOf(pair)})`});continue;}
  if(pair.subtipo===null&&known.some(old=>old.tipo===pair.tipo&&old.subtipo)){outcomes.push({label:item.label,kind:'unchanged',reason:`sin cambios (ya tiene ${pair.tipo})`});continue;}
  if(pair.subtipo!==null&&known.some(old=>old.tipo===pair.tipo&&old.subtipo===null)){outcomes.push({label:item.label,kind:'rejected',reason:`reemplazaría "${pair.tipo}" sin subtipo: hacelo desde la ficha`});continue;}
  const final=normalizeClassifications({pairs:[...known,pair]});if(final.length>8){outcomes.push({label:item.label,kind:'rejected',reason:'maximum of 8 classifications after merging'});continue;}
  known.push(pair);wanted.add(k);accepted.push(item);outcomes.push({label:item.label,kind:'added',reason:''});
 }
 return {outcomes,finalWanted:normalizeClassifications({pairs:known}),candidates:accepted};
}

async function plan({db,accountId,account,rows,entries}){
 const current=normalizeClassifications({pairs:rows.map(({tipo,subtipo})=>({tipo,subtipo}))});
 let blocked=!account?'business does not exist':account.mergedIntoId?'business is merged':account.deletedAt?'business is in trash':rawIssue(rows);
 const outcomes=[],candidates=[];
 const add=(label,kind,reason='')=>outcomes.push({label,kind,reason});
 for(const label of entries){
  const parsed=parseClassificationImport(label),pair=parsed.length===1?parsed[0]:null;
  if(label.includes(';')||!pair){add(label,'rejected','label must contain exactly one classification pair; semicolons are not allowed');continue;}
  if(!pair.tipo){add(label,'rejected','empty vertical');continue;}
  if(blocked){add(label,'rejected',issue(blocked));continue;}
  const k=keyOf(pair);
  if(current.some(old=>keyOf(old)===k)){add(label,'unchanged',`sin cambios (ya tiene ${labelOf(pair)})`);continue;}
  const vertical=await db.selectFrom('crmVerticals').select(['name','active']).where('name','=',pair.tipo).executeTakeFirst();
  let reason=vertical?.active?null:vertical?'vertical is inactive':'vertical does not exist';
  if(!reason&&pair.subtipo){const subtype=await db.selectFrom('crmSubtypes').select(['typeName','active']).where('name','=',pair.subtipo).where('typeName','=',pair.tipo).executeTakeFirst();reason=!subtype?'subtype does not exist for this vertical':!subtype.active?'subtype is inactive':null;}
  if(reason){add(label,'rejected',reason);continue;}
  candidates.push({label,pair});
 }
 const planned=planCandidateOutcomes({currentRows:rows,candidates}),ordered=[...outcomes,...planned.outcomes].sort((a,b)=>entries.indexOf(a.label)-entries.indexOf(b.label));
 return {outcomes:ordered,candidates:planned.candidates,finalWanted:planned.finalWanted};
}

export async function loadAccountClassifications({db,entries,actor,apply,onAfterPlan,write=setAccountClassifications,log=()=>{}}){
 if(apply&&typeof actor==='string'){actor=await db.selectFrom('users').select(['email','displayName']).where('email','=',actor).where('deactivatedAt','is',null).executeTakeFirst();if(!actor)throw new Error('Actor must be an existing active user.');}
 if(apply&&!actor)throw new Error('Actor must be an existing active user.');
 const outcomes=new Map(), lines=[],ids=Object.keys(entries),catalogOrder=(await db.selectFrom('crmVerticals').select('name').orderBy('sortOrder').orderBy('name').execute()).map(row=>row.name);
 const emit=line=>{lines.push(line);log(line);};
 let inputMismatch=false;
 for(const accountId of ids){
  const labels=[...new Set(entries[accountId])];
  const businessLines=[];
  try{
   const account=await db.selectFrom('crmAccounts').selectAll().where('id','=',accountId).executeTakeFirst();
   const rows=account?await db.selectFrom('crmAccountClassifications').selectAll().where('accountId','=',accountId).orderBy('id').execute():[];
   businessLines.push(`H${accountId} ${account?`${account.nombre} [${account.mergedIntoId?'merged':account.deletedAt?'trash':'active'}]`:'[missing]'}; current=${normalizeClassifications({pairs:rows}).map(labelOf).join('; ')||'(none)'}`);
   let result=await plan({db,accountId,account,rows,entries:labels});
   if(onAfterPlan)await onAfterPlan({accountId,db,result});
   if(apply&&result.candidates.length){
    const txResult=new Map();
    await db.transaction().execute(async trx=>{
     await trx.selectFrom('crmAccounts').select('id').where('id','=',accountId).forUpdate().executeTakeFirstOrThrow();
     const lockedAccount=await trx.selectFrom('crmAccounts').select(['mergedIntoId','deletedAt']).where('id','=',accountId).executeTakeFirstOrThrow();
     const lockedRows=await trx.selectFrom('crmAccountClassifications').selectAll().where('accountId','=',accountId).orderBy('id').execute();
     const block=lockedAccount.mergedIntoId?'business is merged':lockedAccount.deletedAt?'business is in trash':rawIssue(lockedRows);
     if(block)throw new Error(issue(block));
     result=await plan({db:trx,accountId,account:lockedAccount,rows:lockedRows,entries:labels});
     const toWrite=result.candidates.filter(item=>result.outcomes.some(o=>o.label===item.label&&o.kind==='added'));
     if(toWrite.length){
      const prior=new Set(lockedRows.map(row=>String(row.id)));
      await write({trx,accountId,pairs:result.finalWanted,actor,reason:'dedup2_secondary_verticals'});
      const after=await trx.selectFrom('crmAccountClassifications').select('id').where('accountId','=',accountId).execute();
      if([...prior].some(id=>!after.some(row=>String(row.id)===id)))throw new Error('write removed an existing classification row');
     }
     for(const o of result.outcomes)txResult.set(o.label,o);
    });
    result.outcomes=result.outcomes.map(o=>txResult.get(o.label)??o);
   }
   outcomes.set(accountId,result.outcomes);
  }catch(error){outcomes.set(accountId,labels.map(label=>({label,kind:'failed',reason:error instanceof Error?error.message:'unknown error'})));}
  const account=await db.selectFrom('crmAccounts').select(['mergedIntoId','deletedAt','tipo','subtipo']).where('id','=',accountId).executeTakeFirst();
  if(account&&!account.mergedIntoId&&!account.deletedAt){
   const rows=await db.selectFrom('crmAccountClassifications').select(['tipo','subtipo']).where('accountId','=',accountId).execute(),display=displayClassification({pairs:rows,verticalOrder:catalogOrder});
   businessLines.push(`H${accountId}: ${rows.map(labelOf).join('; ')||'(none)'}`);
   if((account.tipo??null)!==(display?.tipo??null)||(account.subtipo??null)!==(display?.subtipo??null)){
    inputMismatch=true;
    const expected=display?labelOf(display):'(none)',actual=account.tipo??'(none)';
    businessLines.push(`  display mismatch: tipo/subtipo ${actual}${account.subtipo?`/${account.subtipo}`:''} vs ${expected} → failed`);
    const list=outcomes.get(accountId)??[],index=list.findIndex(item=>item.kind!=='failed');
    if(index>=0)list[index]={...list[index],kind:'failed',reason:list[index].reason?`${list[index].reason}; display copy does not match classification rows`:'display copy does not match classification rows'};
    else if(list.length)list[0]={...list[0],reason:`${list[0].reason}; display copy does not match classification rows`};
    outcomes.set(accountId,list);
   }
  }
  for(const outcome of outcomes.get(accountId)??[])businessLines.push(`  ${outcome.kind} ${outcome.label}${outcome.reason?`: ${outcome.reason}`:''}`);
  for(const line of businessLines)emit(line);
 }
 const totals={added:0,unchanged:0,rejected:0,failed:0};
 for(const list of outcomes.values())for(const outcome of list)totals[outcome.kind]++;
 try{
  emit('Final read-only verification:');
  const mismatch=await sql`SELECT count(*)::text AS count FROM crm_accounts a LEFT JOIN LATERAL (SELECT c.tipo,c.subtipo FROM crm_account_classifications c LEFT JOIN crm_verticals v ON v.name=c.tipo WHERE c.account_id=a.id ORDER BY v.sort_order NULLS LAST,c.tipo,(c.subtipo IS NOT NULL),c.subtipo LIMIT 1) d ON true WHERE a.merged_into_id IS NULL AND a.deleted_at IS NULL AND (a.tipo IS DISTINCT FROM d.tipo OR a.subtipo IS DISTINCT FROM d.subtipo)`.execute(db);
  emit(`Display-copy mismatches: ${Number(mismatch.rows[0]?.count??0)}`);
 }catch(error){emit(`Final verification failed: ${error instanceof Error?error.message:'unknown error'}`);}
 const candidateCount=ids.reduce((sum,id)=>sum+new Set(entries[id]).size,0);
 emit(`Summary: added=${totals.added}, unchanged=${totals.unchanged}, rejected=${totals.rejected}, failed=${totals.failed}; candidates=${candidateCount}.`);
 return {lines,totals,candidateCount,exitCode:totals.failed||inputMismatch?1:0,outcomes};
}
