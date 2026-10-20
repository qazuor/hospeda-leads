/** Preselect an explicitly supplied destination or the sole available person. */
export function initialCommunicationRecipient(ids:string[],requestedId?:string|null,allowSingleAutomatic=true):string{
 if(requestedId&&ids.includes(String(requestedId)))return String(requestedId);
 return allowSingleAutomatic&&ids.length===1?String(ids[0]):'';
}

/** Minimal person shape used to decide who can receive a WhatsApp or an email. */
export type RecipientCandidate={id:string|number;phone?:string|null;email?:string|null};

/** People with usable data for the channel (a phone for WhatsApp, an email for email), in the given order. */
export function reachableRecipientIds(contacts:readonly RecipientCandidate[],channel:'email'|'whatsapp'):string[]{
 return contacts.filter(c=>String((channel==='email'?c.email:c.phone)??'').trim()).map(c=>String(c.id));
}

/**
 * Initial destination for a WhatsApp or email (report item 1.4). Only people with data for the channel count:
 * an explicit request for one of them wins; the only such person is preselected; with several, the seller must choose.
 * The business general channel (empty id) applies only when no person has the data, or for a legacy contact copied
 * from the business itself while the business still has that data.
 */
export function channelRecipientChoice({contacts,channel,requestedId,legacy=false,generalValue}:{contacts:readonly RecipientCandidate[];channel:'email'|'whatsapp';requestedId?:string|null;legacy?:boolean;generalValue?:string|null}):{recipientId:string;mustChoose:boolean}{
 const reachable=reachableRecipientIds(contacts,channel);
 if(requestedId&&reachable.includes(String(requestedId)))return {recipientId:String(requestedId),mustChoose:false};
 if(reachable.length>1)return {recipientId:'',mustChoose:true};
 const keepGeneral=legacy&&!!generalValue?.trim();
 return {recipientId:reachable.length===1&&!keepGeneral?reachable[0]:'',mustChoose:false};
}
