import {apiJson} from '../helpers/apiClient';
import type {HistoryFilter} from '../helpers/historyLabels';
export type CommercialHistoryEvent={id:string;occurredAt:Date;kind:'activity'|'message'|'response'|'communication'|'stage'|'change';title:string;result:string|null;notes:string|null;channel:string|null;outcome:string|null;continuation:string|null;actorEmail:string|null;leadId:string|null;opportunityName:string|null;recipientName:string|null;messageStatus:string|null;messageSubject:string|null;messageText:string|null;/** True when a `social` row comes from Instagram (spec 90: «Instagram» instead of «Red social»); absent on older servers. */isInstagram?:boolean|null};
export type CommercialHistoryData={events:CommercialHistoryEvent[];total:number;page:number;pending:{id:string;title:string;dueDate:string;dueAt:Date|null;assignedUserEmail:string|null;leadId:string|null;opportunityName:string|null;continuation:string|null}[];totalPending:number;/** Latest event of the "contact" filter; only on page 1 of the unfiltered stream. */lastContact?:CommercialHistoryEvent|null};
export async function getBusinessHistory(accountId:string,page:number,filter:HistoryFilter='all'):Promise<CommercialHistoryData>{
 return apiJson<CommercialHistoryData>('/_api/commercial?'+new URLSearchParams({accountId,historyPage:String(page),...(filter==='all'?{}:{historyKind:filter})}));
}
