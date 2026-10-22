import { localDay } from './workDates';
import type { ContactPurpose } from './contactPurpose';

type ContextInput={accountId:string|number;contactId?:string|number|null;name?:string|null;contact?:string|null;city?:string|null;type?:string|null;subtype?:string|null;phone?:string|null;email?:string|null;website?:string|null;sender?:string|null;senderShort?:string|null;senderEmail?:string|null;hospedaUrl?:string|null;managementType?:string|null;commercialProfile?:string|null;isClient?:boolean;channel?:string|null;purpose?:ContactPurpose|null;variation?:number;previousPicks?:Record<string,string>;now?:Date};
export function buildMessageTemplateContext(input:ContextInput){
 const now=input.now??new Date();
 const contact=input.contact?.trim()??'';
 return {name:input.name??'',contact,contact_name:contact,contact_first:contact.split(/\s+/)[0]??'',city:input.city??'',type:input.type??'',subtype:input.subtype??'',phone:input.phone??'',email:input.email??'',website:input.website??'',hospeda_url:input.hospedaUrl??'',sender:input.sender??'',sender_short:input.senderShort??input.sender??'',sender_email:input.senderEmail??'',managementType:input.managementType??'',commercialProfile:input.commercialProfile??'',isClient:!!input.isClient,channel:input.channel??'',purpose:input.purpose??'',__seed:`${input.accountId}:${input.contactId??'business'}:${localDay(now)}${input.variation?`:${input.variation}`:''}`,__previousPicks:input.previousPicks??{},__chosenPicks:{} as Record<string,string>};
}
