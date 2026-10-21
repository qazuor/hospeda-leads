import type {AdvancedFilterGroup} from '../endpoints/leads_GET.schema';

const KEY_PREFIX="hospeda-opportunities-seller-default-v1-user-";
/** Storage key of the "already applied Mis gestiones once" marker for one seller. */
export const sellerDefaultKey=(userId:string|number)=>KEY_PREFIX+userId;
/** Filters meaning "assigned to me". */
export const mineFilterGroup=(email:string):AdvancedFilterGroup=>({rules:[{field:"assignedUserEmail",operator:"eq",value:email}]});
/** True when the filters are exactly "assigned to me", so the "Mis gestiones" chip can reflect them. */
export const isMineFilter=(groups:AdvancedFilterGroup[],email:string)=>groups.length===1&&groups[0].rules.length===1&&groups[0].rules[0].field==="assignedUserEmail"&&groups[0].rules[0].operator==="eq"&&groups[0].rules[0].value===email;
/**
 * Initial filters of the Gestiones page. A seller gets "Mis gestiones" only the first time (marker absent), with no stored filters and no deep link;
 * afterwards the stored filters win, so choosing "Todos" is remembered.
 */
export const initialSellerGroups=({stored,email,userId,deepLinked,storage}:{stored:AdvancedFilterGroup[];email:string;userId:string|number;deepLinked:boolean;storage:Pick<Storage,"getItem">|null}):AdvancedFilterGroup[]=>{
  if(deepLinked||!storage)return stored;
  try{if(storage.getItem(sellerDefaultKey(userId)))return stored}catch{return stored}
  return stored.length?stored:[mineFilterGroup(email)];
};
