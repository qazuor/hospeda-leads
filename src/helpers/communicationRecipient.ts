/** Preselect an explicitly supplied destination or the sole available person. */
export function initialCommunicationRecipient(ids:string[],requestedId?:string|null,allowSingleAutomatic=true):string{
 if(requestedId&&ids.includes(String(requestedId)))return String(requestedId);
 return allowSingleAutomatic&&ids.length===1?String(ids[0]):'';
}
