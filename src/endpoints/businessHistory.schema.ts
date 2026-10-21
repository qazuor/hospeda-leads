import {apiJson} from '../helpers/apiClient';
export type CommercialHistoryEvent={id:string;occurredAt:Date;kind:'activity'|'message';title:string;result:string|null;notes:string|null;channel:string|null;outcome:string|null;continuation:string|null;actorEmail:string|null;leadId:string|null;opportunityName:string|null;recipientName:string|null;messageStatus:string|null;messageSubject:string|null;messageText:string|null};
export type CommercialHistoryData={events:CommercialHistoryEvent[];total:number;page:number;pending:{id:string;title:string;dueDate:string;dueAt:Date|null;assignedUserEmail:string|null;leadId:string|null;opportunityName:string|null;continuation:string|null}[];totalPending:number};
export async function getBusinessHistory(accountId:string,page:number):Promise<CommercialHistoryData>{
 return apiJson<CommercialHistoryData>('/_api/commercial?'+new URLSearchParams({accountId,historyPage:String(page)}));
}
