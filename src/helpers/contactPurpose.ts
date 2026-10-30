/** Why a contact without a management happens (the server requires one for that case). */
export type ContactPurpose='verification'|'first_contact'|'resume'|'relationship'|'care'|'operations'|'other';
const options:readonly (readonly [ContactPurpose,string])[]=[['verification','Verificar el negocio'],['first_contact','Presentación / primer contacto'],['resume','Retomar conversación'],['relationship','Relación y novedades'],['care','Acompañamiento / atención al cliente'],['operations','Coordinación operativa'],['other','Otro']];

/** Purposes a business can use: a new one is only verified, any other never is. */
export function contactPurposeOptions(businessStatus:string|null|undefined):{value:ContactPurpose;label:string}[]{return options.filter(([value])=>businessStatus==='new'?value==='verification':value!=='verification').map(([value,label])=>({value,label}));}
/** First purpose offered for a business without a management. */
export function defaultContactPurpose(businessStatus:string|null|undefined):ContactPurpose{return businessStatus==='new'?'verification':'first_contact';}
/** Why the chosen purpose cannot be used yet; empty when it can. */
export function contactPurposeBlockReason({purpose,otherPurpose,isClient,confirmedClient}:{purpose:ContactPurpose;otherPurpose:string;isClient:boolean;confirmedClient:boolean}):string{
 if(purpose==='other'&&!otherPurpose.trim())return 'Escribí la aclaración del propósito.';
 if(purpose==='care'&&!isClient&&!confirmedClient)return 'Confirmá que el negocio se marcará como Cliente cuando registres el contacto como realizado.';
 return '';
}
