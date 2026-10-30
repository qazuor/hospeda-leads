import {normalizeInstagramUsername} from './instagramChat';

/** The three channels the CRM writes through (spec 96 §2.2): the action bar buttons and the compact choice of the contact step. */
export type MessageChannel='whatsapp'|'instagram'|'email';
export const CONTACT_LOADING_REASON='Estamos cargando los datos del negocio.';
export const CONTACT_DNC_REASON='El negocio está marcado No contactar; un administrador debe levantar ese bloqueo.';
export const CONTACT_ARCHIVED_REASON='El negocio está archivado; un administrador debe desarchivarlo antes de continuar.';
export const CONTACT_PERMISSION_REASON='Solo la persona responsable del negocio o un administrador puede modificarlo.';
/** Why «Instagram» is off: the business has no username the composer and the webhook can use (spec 92 §2.1). */
export const INSTAGRAM_MISSING_REASON='El negocio no tiene un usuario de Instagram válido. Cargalo en "Datos del negocio": es el mismo que usamos para asociar los mensajes recibidos.';
export const WHATSAPP_MISSING_REASON='El negocio y sus personas no tienen teléfono ni WhatsApp cargado. Agregalo en "Datos del negocio" o en una persona.';
export const EMAIL_MISSING_REASON='El negocio y sus personas no tienen email cargado. Agregalo en "Datos del negocio" o en una persona.';

type ChannelAccount={doNotContact?:boolean|null;archivedAt?:unknown;status?:string|null;telefono?:string|null;whatsapp?:string|null;email?:string|null;perfilInstagram?:string|null};
type ChannelContact={phone?:string|null;email?:string|null;deletedAt?:unknown};
const filled=(value:string|null|undefined)=>!!value?.trim();

/** The data a channel needs: a phone (business or active person) for WhatsApp, an email for Email, a valid username for Instagram. */
export function channelDataBlock({channel,account,contacts}:{channel:MessageChannel;account:ChannelAccount;contacts:readonly ChannelContact[]}):string{
 const active=contacts.filter(c=>!c.deletedAt);
 if(channel==='instagram')return normalizeInstagramUsername(account.perfilInstagram)?'':INSTAGRAM_MISSING_REASON;
 if(channel==='whatsapp')return filled(account.whatsapp)||filled(account.telefono)||active.some(c=>filled(c.phone))?'':WHATSAPP_MISSING_REASON;
 return filled(account.email)||active.some(c=>filled(c.email))?'':EMAIL_MISSING_REASON;
}

/**
 * Why a channel button is off (spec 96 §2.2), first match wins: business not loaded, «No contactar», archived, no permission over the
 * business nor any open management, missing data, then the user script gate (WhatsApp and Instagram only; the caller passes '' for a
 * phone). '' when the channel can be used.
 */
export function contactChannelBlock({channel,account,contacts,canContact,gateReason}:{channel:MessageChannel;account:ChannelAccount|null|undefined;contacts:readonly ChannelContact[];canContact:boolean;gateReason:string}):string{
 if(!account)return CONTACT_LOADING_REASON;
 if(account.doNotContact)return CONTACT_DNC_REASON;
 if(account.archivedAt||account.status==='archived')return CONTACT_ARCHIVED_REASON;
 if(!canContact)return CONTACT_PERMISSION_REASON;
 return channelDataBlock({channel,account,contacts})||(channel==='email'?'':gateReason);
}
