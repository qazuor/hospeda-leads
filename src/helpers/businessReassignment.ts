import {createHash} from 'node:crypto';

export type ReassignmentUser={email:string;displayName:string};
export type ReassignmentAccount={id:string;status:string;assignedUserEmail:string|null;deletedAt:unknown|null;archivedAt:unknown|null;mergedIntoId:string|null;groupId?:string|null;effectiveSellerEmail?:string|null;referredToLeandro?:boolean;referredOriginalOwnerEmail?:string|null};
export type ReassignmentMove={accountId:string;fromEmail:string|null;toEmail:string;groupId:string|null};
export type ReassignmentGroup={groupId:string;accountIds:string[];toEmail:string|null;kind:'anchored'|'together'|'conflict'};
export type ReassignmentUserSummary=ReassignmentUser&{before:number;locked:number;newBefore:number;newAfter:number;after:number;lockedDeleted:number;lockedByStatus:Record<string,number>};
export type ReassignmentPlan={fingerprint:string;eligibleCount:number;moves:ReassignmentMove[];users:ReassignmentUserSummary[];unassignedLocked:number;groups:ReassignmentGroup[]};

export function createBusinessReassignmentPlan(users:ReassignmentUser[],accounts:ReassignmentAccount[],activeAssignableEmails:ReadonlySet<string>=new Set(users.map(user=>user.email))):ReassignmentPlan{
 const recipients=[...users].sort((a,b)=>a.displayName.localeCompare(b.displayName,'es')||a.email.localeCompare(b.email));
 const eligible=accounts.filter(account=>account.status==='new'&&!account.deletedAt&&!account.archivedAt&&!account.mergedIntoId&&!account.referredToLeandro).sort((a,b)=>BigInt(a.id)<BigInt(b.id)?-1:BigInt(a.id)>BigInt(b.id)?1:0);
 const eligibleIds=new Set(eligible.map(account=>account.id));
 const counts=new Map(recipients.map(user=>[user.email,{locked:0,newBefore:0,lockedDeleted:0,lockedByStatus:{} as Record<string,number>} ]));
 let unassignedLocked=0;
 for(const account of accounts){
  if(eligibleIds.has(account.id))continue;
  if(!account.assignedUserEmail){unassignedLocked++;continue;}
  const state=counts.get(account.assignedUserEmail);
  if(state){state.locked++;if(account.deletedAt)state.lockedDeleted++;state.lockedByStatus[account.status]=(state.lockedByStatus[account.status]??0)+1;}
 }
 for(const account of eligible){const state=counts.get(account.assignedUserEmail??'');if(state)state.newBefore++;}
 const totals=new Map(recipients.map(user=>[user.email,counts.get(user.email)?.locked??0]));
 const newAfter=new Map(recipients.map(user=>[user.email,0]));
 const moves:ReassignmentMove[]=[];
 const groups:ReassignmentGroup[]=[];const eligibleByGroup=new Map<string,ReassignmentAccount[]>();
 for(const account of eligible){if(account.groupId){const list=eligibleByGroup.get(account.groupId)??[];list.push(account);eligibleByGroup.set(account.groupId,list);}}
 const units:{accounts:ReassignmentAccount[];groupId:string|null;kind:'anchored'|'together'|'conflict'|null;fixedTo:string|null}[]=[];
 const handled=new Set<string>();
 for(const account of eligible){if(handled.has(account.id))continue;const groupId=account.groupId??null;if(!groupId){units.push({accounts:[account],groupId:null,kind:null,fixedTo:null});handled.add(account.id);continue;}
  const members=accounts.filter(row=>row.groupId===groupId&&!row.deletedAt&&!row.archivedAt&&!row.mergedIntoId).sort((a,b)=>BigInt(a.id)<BigInt(b.id)?-1:BigInt(a.id)>BigInt(b.id)?1:0);
  const selected=eligibleByGroup.get(groupId)??[];for(const row of selected)handled.add(row.id);
  const anchors=members.filter(row=>!eligibleIds.has(row.id));const anchorSellers=[...new Set(anchors.map(row=>row.effectiveSellerEmail??(row.referredToLeandro?row.referredOriginalOwnerEmail:row.assignedUserEmail)))];
  if(anchors.length){const conflict=anchorSellers.length>1, candidate=conflict?null:anchorSellers[0]??null, invalidTarget=!!candidate&&!activeAssignableEmails.has(candidate),toEmail=conflict||invalidTarget?null:candidate;groups.push({groupId,accountIds:members.map(row=>row.id),toEmail,kind:conflict||invalidTarget?'conflict':'anchored'});units.push({accounts:selected,groupId,kind:conflict||invalidTarget?'conflict':'anchored',fixedTo:toEmail});}
  else{groups.push({groupId,accountIds:members.map(row=>row.id),toEmail:null,kind:'together'});units.push({accounts:selected,groupId,kind:'together',fixedTo:null});}
 }
 units.sort((a,b)=>BigInt(a.accounts[0]?.id??'0')<BigInt(b.accounts[0]?.id??'0')?-1:BigInt(a.accounts[0]?.id??'0')>BigInt(b.accounts[0]?.id??'0')?1:0);
 for(const unit of units){if(unit.kind==='conflict'){for(const account of unit.accounts){const current=account.assignedUserEmail;if(current&&newAfter.has(current)){newAfter.set(current,(newAfter.get(current)??0)+1);totals.set(current,(totals.get(current)??0)+1);}}continue;}if(unit.kind==='anchored'){
   if(!recipients.length)continue;
   const target=unit.fixedTo;for(const account of unit.accounts){const effective=account.effectiveSellerEmail??(account.referredToLeandro?account.referredOriginalOwnerEmail:account.assignedUserEmail);if(target&&target!==effective)moves.push({accountId:account.id,fromEmail:account.assignedUserEmail,toEmail:target,groupId:unit.groupId});if(target){newAfter.set(target,(newAfter.get(target)??0)+1);totals.set(target,(totals.get(target)??0)+1);}}
   const group=groups.find(row=>row.groupId===unit.groupId);if(group)group.toEmail=target;continue;
  }
  const account=unit.accounts[0];if(!account)continue;
  if(!recipients.length)continue;
  const recipient=[...recipients].sort((a,b)=>(totals.get(a.email)??0)-(totals.get(b.email)??0)||a.displayName.localeCompare(b.displayName,'es')||a.email.localeCompare(b.email))[0];
  const weight=unit.accounts.length;totals.set(recipient.email,(totals.get(recipient.email)??0)+weight);
  newAfter.set(recipient.email,(newAfter.get(recipient.email)??0)+weight);
  for(const row of unit.accounts)if(row.assignedUserEmail!==recipient.email)moves.push({accountId:row.id,fromEmail:row.assignedUserEmail,toEmail:recipient.email,groupId:unit.groupId});
  if(unit.groupId){const group=groups.find(row=>row.groupId===unit.groupId);if(group)group.toEmail=recipient.email;}
 }
 const usersSummary=recipients.map(user=>{
  const state=counts.get(user.email)!;const assigned=newAfter.get(user.email)??0;
  return {...user,before:state.locked+state.newBefore,locked:state.locked,newBefore:state.newBefore,newAfter:assigned,after:state.locked+assigned,lockedDeleted:state.lockedDeleted,lockedByStatus:state.lockedByStatus};
 });
 const fingerprint=createHash('sha256').update(JSON.stringify({users:recipients,accounts:accounts.map(account=>[account.id,account.status,account.assignedUserEmail,account.deletedAt,account.archivedAt,account.mergedIntoId,account.groupId??null,account.effectiveSellerEmail??(account.referredToLeandro?account.referredOriginalOwnerEmail:account.assignedUserEmail)])})).digest('hex');
 return {fingerprint,eligibleCount:eligible.length,moves,users:usersSummary,unassignedLocked,groups};
}
