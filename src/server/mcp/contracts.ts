import {managementLabel,managementTypeLabels} from '../../helpers/businessManagement';

export type Page<T>={items:T[];nextCursor:string|null;truncated?:boolean};
export const page=<T>(rows:T[],limit:number,cursor:(item:T)=>string):Page<T>=>{const items=rows.slice(0,limit);return {items,nextCursor:rows.length>limit&&items.length?cursor(items[items.length-1]!):null,...(rows.length>limit?{truncated:true}:{})};};
export const businessState=(row:Record<string,unknown>)=>({doNotContact:Boolean(row.do_not_contact)});
export const managementContract=(row:Record<string,unknown>)=>({id:String(row.id),title:row.opportunity_name??null,type:String(row.management_type??row.tipo??''),typeLabel:managementTypeLabels[(row.management_type??row.tipo) as keyof typeof managementTypeLabels]??String(row.management_type??row.tipo??''),stage:String(row.estado??''),stageLabel:managementLabel(String(row.management_type??row.tipo??''),String(row.estado??'')),stageClass:row.classification??null,ownerName:row.owner_name??null,ownerId:row.owner_id===undefined||row.owner_id===null?null:String(row.owner_id),createdAt:row.created_at??null,nextActionAt:row.next_action_at??null});
