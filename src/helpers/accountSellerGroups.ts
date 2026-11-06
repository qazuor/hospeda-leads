import {sql,type Kysely,type Transaction} from 'kysely';
import type {DB} from './schema';
import {updateBusinessResponsibleForLockedAccounts} from './updateBusinessFields';
import {sellerChoiceState} from './sellerChoice';

type Executor=Kysely<DB>|Transaction<DB>;
export type SellerGroupMember={id:string;nombre:string;ciudad:string|null;status:string|null;assignedUserEmail:string|null;referredToLeandro:boolean;referredOriginalOwnerEmail:string|null;deletedAt:unknown|null;archivedAt:unknown|null;mergedIntoId:string|null};
export type SellerGroup={groupId:string;members:SellerGroupMember[]};
export type GroupSellerState={state:'empty'}|{state:'consistent';sellerEmail:string|null}|{state:'inconsistent';sellerEmails:(string|null)[]};
export const isActiveSellerGroupMember=(member:Pick<SellerGroupMember,'deletedAt'|'archivedAt'|'mergedIntoId'>)=>!member.deletedAt&&!member.archivedAt&&!member.mergedIntoId;
export const effectiveSellerEmail=(member:Pick<SellerGroupMember,'referredToLeandro'|'referredOriginalOwnerEmail'|'assignedUserEmail'>)=>member.referredToLeandro?member.referredOriginalOwnerEmail:member.assignedUserEmail;
export function sellerGroupMembershipChanged(before:SellerGroup[],after:SellerGroup[]):boolean{
 const snapshot=(groups:SellerGroup[])=>groups.map(group=>`${group.groupId}:${group.members.map(member=>member.id).sort((a,b)=>BigInt(a)<BigInt(b)?-1:BigInt(a)>BigInt(b)?1:0).join(',')}`).sort().join('|');
 return snapshot(before)!==snapshot(after);
}
export function expandSellerGroupIds(accountIds:string[],groups:SellerGroup[]):string[]{
 const result=new Set(accountIds);
 for(const group of groups)for(const member of group.members)if(isActiveSellerGroupMember(member))result.add(member.id);
 return [...result].sort((a,b)=>BigInt(a)<BigInt(b)?-1:BigInt(a)>BigInt(b)?1:0);
}

export async function loadSellerGroups({trx,accountIds}:{trx:Executor;accountIds:string[]}):Promise<SellerGroup[]>{
 if(!accountIds.length)return [];
 const rows=(await sql<{groupId:string;id:string;nombre:string;ciudad:string|null;status:string|null;assignedUserEmail:string|null;referredToLeandro:boolean;referredOriginalOwnerEmail:string|null;deletedAt:Date|null;archivedAt:Date|null;mergedIntoId:string|null}>`SELECT member.group_id::text AS "groupId",account.id::text AS id,account.nombre,account.ciudad,account.status,account.assigned_user_email AS "assignedUserEmail",account.referred_to_leandro AS "referredToLeandro",account.referred_original_owner_email AS "referredOriginalOwnerEmail",account.deleted_at AS "deletedAt",account.archived_at AS "archivedAt",account.merged_into_id::text AS "mergedIntoId" FROM crm_account_seller_group_members member JOIN crm_account_seller_group_members related ON related.group_id=member.group_id JOIN crm_accounts account ON account.id=related.account_id WHERE member.account_id IN (${sql.join(accountIds.map(id=>sql`${id}::bigint`))}) ORDER BY member.group_id,account.id`.execute(trx)).rows;
 const groups=new Map<string,SellerGroup>();
 for(const row of rows){const groupId=String(row.groupId),group=groups.get(groupId)??{groupId,members:[]};if(!group.members.some(member=>member.id===String(row.id)))group.members.push({...row,id:String(row.id),mergedIntoId:row.mergedIntoId===null?null:String(row.mergedIntoId)});groups.set(groupId,group);}
 return [...groups.values()];
}

export async function expandToSellerGroups({trx,accountIds}:{trx:Executor;accountIds:string[]}):Promise<string[]>{
 return expandSellerGroupIds(accountIds,await loadSellerGroups({trx,accountIds}));
}

export function groupSellerState({members}:{members:Pick<SellerGroupMember,'deletedAt'|'archivedAt'|'mergedIntoId'|'referredToLeandro'|'referredOriginalOwnerEmail'|'assignedUserEmail'>[]}):GroupSellerState{
 const sellers=[...new Set(members.filter(isActiveSellerGroupMember).map(effectiveSellerEmail))];
 if(!sellers.length)return {state:'empty'};
 return sellers.length===1?{state:'consistent',sellerEmail:sellers[0]!}:{state:'inconsistent',sellerEmails:sellers};
}

export async function lockSellerGroupAccounts(trx:Transaction<DB>,ids:string[]){
 return trx.selectFrom('crmAccounts').selectAll().where('id','in',ids).orderBy('id').forUpdate().execute();
}
export async function linkAccounts({trx,accountIds,sellerEmail,actor,note}:{trx:Transaction<DB>;accountIds:string[];sellerEmail:string|null;actor:{email:string;displayName:string};note?:string|null}){
 const ids=[...new Set(accountIds)].sort((a,b)=>BigInt(a)<BigInt(b)?-1:BigInt(a)>BigInt(b)?1:0);
 const groups=await loadSellerGroups({trx,accountIds:ids});
 let groupIds=[...new Set(groups.map(g=>g.groupId))];
 const membersById=new Map<string,SellerGroupMember>();
 for(const group of groups)for(const member of group.members)membersById.set(member.id,member);
 const allIds=[...new Set([...ids,...membersById.keys()])].sort((a,b)=>BigInt(a)<BigInt(b)?-1:BigInt(a)>BigInt(b)?1:0);
 const accounts=await lockSellerGroupAccounts(trx,allIds);
 if(accounts.length!==allIds.length)throw new Error('Algún negocio ya no existe. Actualizá la ficha.');
 const latest=await loadSellerGroups({trx,accountIds:ids});if(sellerGroupMembershipChanged(groups,latest))throw new Error('GROUP_CHANGED');
 groupIds=[...new Set(latest.map(g=>g.groupId))];
 const latestMembersById=new Map<string,SellerGroupMember>();for(const group of latest)for(const member of group.members)latestMembersById.set(member.id,member);
 const lockedIds=[...new Set([...ids,...latestMembersById.keys()])];if(lockedIds.some(id=>!allIds.includes(id)))throw new Error('GROUP_CHANGED');
 if(ids.some(id=>accounts.find(a=>String(a.id)===id)?.mergedIntoId))throw new Error('NEGOCIO_FUSIONADO');
 if(allIds.length>10)throw new Error('GROUP_LIMIT');
 const membership=accounts.map(account=>({id:String(account.id),effectiveSellerEmail:account.referredToLeandro?account.referredOriginalOwnerEmail:account.assignedUserEmail,active:isActiveSellerGroupMember(account)}));
 for(const id of ids){const account=accounts.find(item=>String(item.id)===id)!;if(isActiveSellerGroupMember({...account,id} as SellerGroupMember)&&!latestMembersById.has(id))membership.push({id,effectiveSellerEmail:account.referredToLeandro?account.referredOriginalOwnerEmail:account.assignedUserEmail,active:true});}
 const choiceState=sellerChoiceState(membership);
 if(choiceState.requiresChoice&&!sellerEmail)throw new Error('SELLER_REQUIRED');
 const effectiveSeller=sellerEmail??choiceState.sellers[0]??null;
 const groupId=groupIds[0]??String((await trx.insertInto('crmAccountSellerGroups').values({createdBy:actor.email,note:note??null}).returning('id').executeTakeFirstOrThrow()).id);
 for(const other of [...new Set(latest.map(g=>g.groupId))].slice(1))await trx.updateTable('crmAccountSellerGroupMembers').set({groupId}).where('groupId','=',other).execute();
 const existing=new Set([...latestMembersById.keys()]);
 for(const id of ids)if(!existing.has(id))await trx.insertInto('crmAccountSellerGroupMembers').values({groupId,accountId:id,addedBy:actor.email}).execute();
 const members=allIds.map(id=>({id,nombre:String(accounts.find(a=>String(a.id)===id)?.nombre??latestMembersById.get(id)?.nombre??'')}));
 if(effectiveSeller){const active=accounts.filter(account=>isActiveSellerGroupMember({...account,id:String(account.id)} as SellerGroupMember));await updateBusinessResponsibleForLockedAccounts(trx,active,effectiveSeller,{...actor,role:'admin'});}
 for(const id of allIds)await trx.insertInto('crmCommercialJournal').values({accountId:id,contactId:null,action:'account_seller_group_linked',actorEmail:actor.email,actorName:actor.displayName,metadata:sql`${JSON.stringify({groupId,members,sellerEmail:effectiveSeller})}::text::jsonb`}).execute();
 return {groupId,accountIds:allIds,sellerEmail:effectiveSeller};
}
export async function unlinkAccount({trx,accountId,actor,reason}:{trx:Transaction<DB>;accountId:string;actor:{email:string;displayName:string};reason?:string|null}){
 const groups=await loadSellerGroups({trx,accountIds:[accountId]});const group=groups[0];if(!group)return null;
 const allIds=group.members.map(m=>m.id).sort((a,b)=>BigInt(a)<BigInt(b)?-1:BigInt(a)>BigInt(b)?1:0);await lockSellerGroupAccounts(trx,allIds);
 const latest=await loadSellerGroups({trx,accountIds:[accountId]});const latestGroup=latest.find(g=>g.members.some(m=>m.id===accountId));if(!latestGroup)return null;if(latestGroup.members.some(m=>!allIds.includes(m.id)))throw new Error('GROUP_CHANGED');
 const remaining=latestGroup.members.filter(m=>m.id!==accountId);
 await trx.deleteFrom('crmAccountSellerGroupMembers').where('accountId','=',accountId).execute();
 if(remaining.length<=1)await trx.deleteFrom('crmAccountSellerGroupMembers').where('groupId','=',latestGroup.groupId).execute();
 if(remaining.length<=1)await trx.deleteFrom('crmAccountSellerGroups').where('id','=',latestGroup.groupId).execute();
 const members=remaining.map(m=>({id:m.id,nombre:m.nombre}));
 for(const id of [accountId,...remaining.map(m=>m.id)])await trx.insertInto('crmCommercialJournal').values({accountId:id,contactId:null,action:'account_seller_group_unlinked',actorEmail:actor.email,actorName:actor.displayName,metadata:sql`${JSON.stringify({groupId:latestGroup.groupId,members,sellerEmail:remaining[0]?effectiveSellerEmail(remaining[0]):null,...(reason?{reason}:{})})}::text::jsonb`}).execute();
 return {groupId:latestGroup.groupId,accountIds:remaining.map(m=>m.id)};
}
