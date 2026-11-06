type NoticeMember={id:string;name:string;archived:boolean;deleted:boolean;merged:boolean};
export function hasSellerChangeDraft(value:string|undefined,current:string|null):boolean{return value!==undefined&&(value||null)!==current;}
/** Returns the active linked businesses named in a pre-save responsible-change notice. */
export function sellerGroupNotice(members:readonly NoticeMember[],accountId:string):string{
 return members.filter(member=>member.id!==accountId&&!member.archived&&!member.deleted&&!member.merged).map(member=>`H${member.id} · ${member.name}`).join(', ');
}
