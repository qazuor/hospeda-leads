import {createHash} from 'node:crypto';

export type ReassignmentUser={email:string;displayName:string};
export type ReassignmentAccount={id:string;status:string;assignedUserEmail:string|null;deletedAt:unknown|null;archivedAt:unknown|null;mergedIntoId:string|null};
export type ReassignmentMove={accountId:string;fromEmail:string|null;toEmail:string};
export type ReassignmentUserSummary=ReassignmentUser&{before:number;locked:number;newBefore:number;newAfter:number;after:number;lockedDeleted:number;lockedByStatus:Record<string,number>};
export type ReassignmentPlan={fingerprint:string;eligibleCount:number;moves:ReassignmentMove[];users:ReassignmentUserSummary[];unassignedLocked:number};

export function createBusinessReassignmentPlan(users:ReassignmentUser[],accounts:ReassignmentAccount[]):ReassignmentPlan{
 const recipients=[...users].sort((a,b)=>a.displayName.localeCompare(b.displayName,'es')||a.email.localeCompare(b.email));
 const eligible=accounts.filter(account=>account.status==='new'&&!account.deletedAt&&!account.archivedAt&&!account.mergedIntoId).sort((a,b)=>BigInt(a.id)<BigInt(b.id)?-1:BigInt(a.id)>BigInt(b.id)?1:0);
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
 for(const account of eligible){
  if(!recipients.length)break;
  const recipient=[...recipients].sort((a,b)=>(totals.get(a.email)??0)-(totals.get(b.email)??0)||a.displayName.localeCompare(b.displayName,'es')||a.email.localeCompare(b.email))[0];
  totals.set(recipient.email,(totals.get(recipient.email)??0)+1);
  newAfter.set(recipient.email,(newAfter.get(recipient.email)??0)+1);
  if(account.assignedUserEmail!==recipient.email)moves.push({accountId:account.id,fromEmail:account.assignedUserEmail,toEmail:recipient.email});
 }
 const usersSummary=recipients.map(user=>{
  const state=counts.get(user.email)!;const assigned=newAfter.get(user.email)??0;
  return {...user,before:state.locked+state.newBefore,locked:state.locked,newBefore:state.newBefore,newAfter:assigned,after:state.locked+assigned,lockedDeleted:state.lockedDeleted,lockedByStatus:state.lockedByStatus};
 });
 const fingerprint=createHash('sha256').update(JSON.stringify({users:recipients,accounts:accounts.map(({id,status,assignedUserEmail,deletedAt,archivedAt,mergedIntoId})=>[id,status,assignedUserEmail,deletedAt,archivedAt,mergedIntoId])})).digest('hex');
 return {fingerprint,eligibleCount:eligible.length,moves,users:usersSummary,unassignedLocked};
}
