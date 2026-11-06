import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {db} from '../src/helpers/db.tsx';
import {linkAccounts,loadSellerGroups,groupSellerState} from '../src/helpers/accountSellerGroups.ts';

const args=process.argv.slice(2),flag=(name)=>args.includes(name),value=(name)=>{const i=args.indexOf(name);return i<0?undefined:args[i+1];};
const file=value('--file'),apply=flag('--apply'),actorEmail=value('--actor');
if(!process.env.DATABASE_URL){console.error('DATABASE_URL is required.');process.exit(1);}
if(!file){console.error('Usage: node --import tsx scripts/load-seller-groups.mjs --file <json> [--apply --actor <email>]');process.exit(1);}
if(apply&&!actorEmail){console.error('--actor <email> is required with --apply.');process.exit(1);}
const normalize=(data)=>{
 const items=Array.isArray(data)?data:Array.isArray(data.accounts)&&data.accounts.every(id=>typeof id==='number'||typeof id==='string')?[data]:data.accounts;
 if(!Array.isArray(items))throw new Error('Input must be an array or an object with accounts.')
 return items.map((item,index)=>{const accounts=Array.isArray(item)?item:item.accounts;if(!Array.isArray(accounts)||accounts.length<2)throw new Error(`Pair ${index+1} must include at least two account IDs.`);const ids=accounts.map(id=>String(id));if(ids.some(id=>!/^[1-9]\d*$/.test(id))||new Set(ids).size!==ids.length)throw new Error(`Pair ${index+1} must list distinct numeric account IDs.`);return {ids,sellerEmail:Array.isArray(item)?null:item.sellerEmail??data.sellerEmail??null};});
};
const status=(a)=>a.mergedIntoId?'fusionado':a.deletedAt?'papelera':a.archivedAt?'archivado':a.status??'sin estado';
const seller=(a)=>a.referredToLeandro?a.referredOriginalOwnerEmail:a.assignedUserEmail;
const main=async()=>{
 const pairs=normalize(JSON.parse(await readFile(resolve(file),'utf8')));
 const actor=apply?await db.selectFrom('users').select(['email','displayName','role','deactivatedAt']).where('email','=',actorEmail).executeTakeFirst():undefined;
 if(apply&&(!actor||actor.role!=='admin'||actor.deactivatedAt))throw new Error('--actor must be an active admin.');
 const activeUsers=new Set((await db.selectFrom('users').select('email').where('deactivatedAt','is',null).execute()).map(u=>u.email));
 let applied=0,skipped=0,noops=0,failed=0;
 for(let i=0;i<pairs.length;i++){
  const pair=pairs[i],rows=await db.selectFrom('crmAccounts').selectAll().where('id','in',pair.ids).orderBy('id').execute();
  const existing=new Map(rows.map(row=>[String(row.id),row]));
  if(rows.length!==pair.ids.length){console.log(`Pair ${i+1}: missing account(s) ${pair.ids.filter(id=>!existing.has(id)).join(', ')}`);skipped++;continue;}
  const groups=await loadSellerGroups({trx:db,accountIds:pair.ids}),groupIds=[...new Set(groups.map(g=>g.groupId))],inactive=(a)=>a.mergedIntoId||a.deletedAt||a.archivedAt;
  // linkAccounts aligns every active member of the groups it joins, so sellers outside the file count too and are listed.
  const outside=groups.flatMap(g=>g.members).filter(m=>!pair.ids.includes(m.id)&&!inactive(m));
  const effective=[...new Set([...rows.filter(a=>!inactive(a)),...outside].map(seller).filter(Boolean))];
  const flags=[...(effective.length>1?['different sellers']:[]),...(effective.length===0&&!pair.sellerEmail?['no seller']:[]),...(pair.sellerEmail&&!activeUsers.has(pair.sellerEmail)?['unknown sellerEmail']:[]),...(rows.some(a=>a.mergedIntoId)?['merged']:[]),...(rows.some(a=>a.deletedAt)?['trashed']:[]),...(rows.some(a=>a.archivedAt)?['archived']:[])];
  console.log(`Pair ${i+1}: ${rows.map(a=>`H${a.id} ${a.nombre} [${status(a)}; seller=${seller(a)??'none'}]`).join(' + ')}; group=${groupIds.join(',')||'none'}; flags=${flags.join(',')||'none'}`);
  if(outside.length)console.log(`  also in the group (seller aligned too): ${outside.map(m=>`H${m.id} ${m.nombre} [seller=${seller(m)??'none'}]`).join(' + ')}`);
  // Only active businesses are loaded: merged, trashed or archived ones are reported and left to the owner.
  if(flags.some(f=>['merged','trashed','archived','no seller','unknown sellerEmail'].includes(f))){console.log('  skipped: '+flags.filter(f=>f!=='different sellers').join(','));skipped++;continue;}
  if(effective.length>1&&!pair.sellerEmail){console.log('  skipped: different sellers and no sellerEmail');skipped++;continue;}
  if(groupIds.length===1&&rows.every(a=>groups.some(g=>g.groupId===groupIds[0]&&g.members.some(m=>m.id===String(a.id))))){console.log('  already linked; no-op');noops++;continue;}
  if(!apply)continue;
  try{await db.transaction().execute(async trx=>linkAccounts({trx,accountIds:pair.ids,sellerEmail:pair.sellerEmail??effective[0]??null,actor:{email:actor.email,displayName:actor.displayName},note:'Mismo dueño, cargado desde la deduplicación del 06/11/2026'}));applied++;console.log('  applied');}
  // One pair per transaction: a failure rolls back only that pair and the run continues.
  catch(error){failed++;console.log('  failed: '+(error instanceof Error?error.message:'unknown error'));}
 }
 const all=(await db.selectFrom('crmAccountSellerGroups').select('id').orderBy('id').execute()).map(g=>String(g.id));let members=0,consistent=0,inconsistent=0,empty=0;
 for(const id of all){const groups=await loadSellerGroups({trx:db,accountIds:(await db.selectFrom('crmAccountSellerGroupMembers').select('accountId').where('groupId','=',''+id).execute()).map(m=>String(m.accountId))});const group=groups.find(g=>g.groupId===id);if(!group)continue;members+=group.members.length;const state=groupSellerState({members:group.members});if(state.state==='consistent')consistent++;else if(state.state==='inconsistent')inconsistent++;else empty++;}
 if(failed)process.exitCode=1;
 console.log(`Summary: applied=${applied}, failed=${failed}, skipped=${skipped}, alreadyLinked=${noops}, groups=${all.length}, members=${members}, consistent=${consistent}, inconsistent=${inconsistent}, empty=${empty}.`);
};
main().catch(error=>{console.error(error instanceof Error?error.message:'Load failed.');process.exitCode=1;}).finally(()=>db.destroy());
