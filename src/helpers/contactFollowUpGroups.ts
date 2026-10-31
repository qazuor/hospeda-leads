import type {ContactFollowUps,PendingOutcome} from '../endpoints/communication.schema';

/**
 * Spec 100 §6 (D2): «Anotá cómo salió» asks once per management. A group is (business, management, delegated task): one
 * «Sin gestión» group per business, and delegated messages (spec 96) apart per task. The server limits and counts the same groups
 * (`pendingContactFollowUps`, `groupCount`), so a group never reaches the client cut.
 */
export type OutcomeGroup={key:string;accountId:string;accountName:string;leadId:string|null;opportunityName:string|null;delegatedTaskId:string|null;/** Newest first (ties by id, newest id first). */items:PendingOutcome[];/** The send whose outcome dialog resolves the whole group. */newest:PendingOutcome};

const newestFirst=(a:PendingOutcome,b:PendingOutcome)=>new Date(b.lastInteractionAt).getTime()-new Date(a.lastInteractionAt).getTime()||(a.id<b.id?1:a.id>b.id?-1:0);

/** The group of a pending outcome: business, management (or none) and delegated task (or none). */
export const outcomeGroupKey=(item:Pick<PendingOutcome,'accountId'|'leadId'|'delegatedTaskId'>):string=>[item.accountId,item.leadId??'',item.delegatedTaskId??''].join('|');

/** Groups the server's `outcomes.items` by management, newest group first (by its newest send, ties by that send's id). */
export function groupOutcomeFollowUps({items}:{items:readonly PendingOutcome[]}):OutcomeGroup[]{
 const groups=new Map<string,PendingOutcome[]>();
 for(const item of [...items].sort(newestFirst)){const key=outcomeGroupKey(item);groups.set(key,[...(groups.get(key)??[]),item]);}
 return [...groups.entries()].map(([key,list])=>{const newest=list[0];return {key,accountId:newest.accountId,accountName:newest.accountName,leadId:newest.leadId,opportunityName:newest.opportunityName,delegatedTaskId:newest.delegatedTaskId??null,items:list,newest};}).sort((a,b)=>newestFirst(a.newest,b.newest));
}

/** Spec 100 §5.1: the shared «N pendientes»: messages to review, unconfirmed sends and management outcome groups. Expired items never count. */
export function pendingCount({review,followUps}:{review:number;followUps:ContactFollowUps|undefined}):number{
 return review+(followUps?.unconfirmed.count??0)+(followUps?.outcomes.groupCount??0);
}
