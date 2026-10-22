type SenderProfile={email:string;displayName:string;fullName?:string|null};
type CurrentUser={email:string;displayName:string;fullName?:string|null}|null|undefined;

/**
 * Sender values for message previews, mirroring the server rule (communicationService templateOwnerName):
 * the responsible signs; without a responsible, the current user does.
 */
export function messageSender({responsibleEmail,profiles,currentUser}:{responsibleEmail?:string|null;profiles?:readonly SenderProfile[]|null;currentUser:CurrentUser}){
 const owner=responsibleEmail?profiles?.find(profile=>profile.email===responsibleEmail):undefined;
 if(responsibleEmail)return {sender:owner?.fullName?.trim()||owner?.displayName||currentUser?.displayName||'',senderShort:owner?.displayName??currentUser?.displayName??'',senderEmail:responsibleEmail};
 return {sender:currentUser?.fullName?.trim()||currentUser?.displayName||'',senderShort:currentUser?.displayName??'',senderEmail:currentUser?.email??''};
}
