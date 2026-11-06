export type SellerChoiceMember={id:string;effectiveSellerEmail:string|null;active:boolean};
/** Unassigned active members adopt the group's chosen seller; they are not a distinct seller. */
export function sellerChoiceState(members:readonly SellerChoiceMember[]){
 const active=members.filter(member=>member.active),sellers=[...new Set(active.flatMap(member=>member.effectiveSellerEmail?[member.effectiveSellerEmail]:[]))];
 return {sellers,requiresChoice:sellers.length>1||sellers.length===0&&active.length>0};
}
