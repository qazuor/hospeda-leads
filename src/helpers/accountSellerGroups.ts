import {sql,type Kysely,type Transaction} from 'kysely';
import type {DB} from './schema';

type Executor=Kysely<DB>|Transaction<DB>;
export type SellerGroupMember={id:string;nombre:string;ciudad:string|null;status:string|null;assignedUserEmail:string|null;referredToLeandro:boolean;referredOriginalOwnerEmail:string|null;deletedAt:unknown|null;archivedAt:unknown|null;mergedIntoId:string|null};
export type SellerGroup={groupId:string;members:SellerGroupMember[]};
export type GroupSellerState={state:'empty'}|{state:'consistent';sellerEmail:string|null}|{state:'inconsistent';sellerEmails:(string|null)[]};
export const isActiveSellerGroupMember=(member:Pick<SellerGroupMember,'deletedAt'|'archivedAt'|'mergedIntoId'>)=>!member.deletedAt&&!member.archivedAt&&!member.mergedIntoId;
export const effectiveSellerEmail=(member:Pick<SellerGroupMember,'referredToLeandro'|'referredOriginalOwnerEmail'|'assignedUserEmail'>)=>member.referredToLeandro?member.referredOriginalOwnerEmail:member.assignedUserEmail;
export function expandSellerGroupIds(accountIds:string[],groups:SellerGroup[]):string[]{
 const result=new Set(accountIds);
 for(const group of groups)for(const member of group.members)if(isActiveSellerGroupMember(member))result.add(member.id);
 return [...result].sort((a,b)=>BigInt(a)<BigInt(b)?-1:BigInt(a)>BigInt(b)?1:0);
}

export async function loadSellerGroups({trx,accountIds}:{trx:Executor;accountIds:string[]}):Promise<SellerGroup[]>{
 if(!accountIds.length)return [];
 const rows=(await sql<{groupId:string;id:string;nombre:string;ciudad:string|null;status:string|null;assignedUserEmail:string|null;referredToLeandro:boolean;referredOriginalOwnerEmail:string|null;deletedAt:Date|null;archivedAt:Date|null;mergedIntoId:string|null}>`SELECT member.group_id::text AS "groupId",account.id::text AS id,account.nombre,account.ciudad,account.status,account.assigned_user_email AS "assignedUserEmail",account.referred_to_leandro AS "referredToLeandro",account.referred_original_owner_email AS "referredOriginalOwnerEmail",account.deleted_at AS "deletedAt",account.archived_at AS "archivedAt",account.merged_into_id::text AS "mergedIntoId" FROM crm_account_seller_group_members member JOIN crm_account_seller_group_members related ON related.group_id=member.group_id JOIN crm_accounts account ON account.id=related.account_id WHERE member.account_id IN (${sql.join(accountIds.map(id=>sql`${id}::bigint`))}) ORDER BY member.group_id,account.id`.execute(trx)).rows;
 const groups=new Map<string,SellerGroup>();
 for(const row of rows){const groupId=String(row.groupId),group=groups.get(groupId)??{groupId,members:[]};group.members.push({...row,id:String(row.id),mergedIntoId:row.mergedIntoId===null?null:String(row.mergedIntoId)});groups.set(groupId,group);}
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
