/** Spec 103 D1–D5: contract of «Mensajes sin asociar» shared by the server and the screen (no server imports here). */

/** One message of a conversation card. */
export type UnmatchedMessage={id:string;isOutgoing:boolean;subject:string;excerpt:string;receivedAt:Date};
/** Why the CRM suggests a business: the Instagram user or the email is stored in it, or the sender's domain matches. */
export type SuggestionReason='instagram'|'email_account'|'email_contact'|'domain';
/**
 * A suggested business for a card. `exact` is false for the weak domain rule and when the same exact data points at several businesses.
 * `instagramEmpty`/`emailEmpty` say whether D4 may offer to store the address; `openLeadId` is the business's only open management, if any.
 */
export type UnmatchedSuggestion={accountId:string;nombre:string;ciudad:string|null;archived:boolean;reason:SuggestionReason;contactId:string|null;contactName:string|null;exact:boolean;instagramEmpty:boolean;emailEmpty:boolean;openLeadId:string|null};
/** A dismissal as recorded in the journal (D3). */
export type UnmatchedDismissal={reason:string;by:string|null;at:Date};
/** A live business that already holds the card's @usuario or email (in the business or one of its people). */
export type AddressOwner={accountId:string;nombre:string;ciudad:string|null};
/**
 * One card: an Instagram chat (by IGSID) or every message of one sender (D2). `verified` is true only for an email whose stored
 * Authentication-Results prove the sender (see `storedSenderVerified`); D4 offers to store an email only then. `addressOwners` lists the live
 * businesses that already hold the address (filled only in the «Sin asociar» view).
 */
export type UnmatchedGroup={key:string;channel:'email'|'instagram'|'other';address:string;name:string;igsid:string|null;instagramUsername:string|null;verified:boolean;messages:UnmatchedMessage[];lastAt:Date;suggestions:UnmatchedSuggestion[];addressOwners:AddressOwner[];dismissal:UnmatchedDismissal|null};
/** `GET /_api/inbound/unmatched?view=&channel=`: the `groups.length` most recent of `total` conversations (`totalAtLeast`: the read hit its row limit, so `total` is a lower bound). */
export type UnmatchedList={groups:UnmatchedGroup[];total:number;truncated:boolean;totalAtLeast:boolean};
export type UnmatchedView='unmatched'|'dismissed';
export type UnmatchedChannel='all'|'email'|'instagram';
/** D3 fixed reasons plus «Otro» with a required text. */
export const DISMISS_REASONS={spam:'Spam o publicidad',automatic:'Aviso automático',not_business:'No es de un negocio',other:'Otro'} as const;
export type DismissReason=keyof typeof DISMISS_REASONS;
/** The text stored and shown for a dismissal: the fixed label, or «Otro: <text>». */
export const dismissalText=({reason,detail}:{reason:DismissReason;detail?:string|null}):string=>reason==='other'?`Otro: ${(detail??'').trim()}`:DISMISS_REASONS[reason];
/** D5: the screen waits this long for «Volver a buscar negocios»; the server stops its work at 15 s, so the answer always arrives first. */
export const RESCAN_CLIENT_TIMEOUT_MS=30000;
/** D5 answer: conversations associated, conversations still unmatched, Meta lookups made, chats left without a lookup (budget) and conversations not reviewed because the click ran out of time. */
export type RescanResult={associated:number;remaining:number;lookups:number;lookupsPending:number;unchecked:number};
/** «Se asociaron N; quedan M sin asociar.» plus a hint when some Instagram chats still need a lookup. */
export const rescanNotice=({associated,remaining,lookupsPending,unchecked=0}:RescanResult):string=>`Se ${associated===1?'asoció':'asociaron'} ${associated}; ${remaining===1?'queda':'quedan'} ${remaining} sin asociar.${unchecked?` ${unchecked===1?'Queda 1':`Quedan ${unchecked}`} por revisar: tocá de nuevo «Volver a buscar negocios».`:''}${lookupsPending?` Faltan consultar ${lookupsPending} ${lookupsPending===1?'chat':'chats'} de Instagram: volvé a buscar para seguir.`:''}`;
/** D4: what the card offers to store when associating with a business, or null when nothing may be stored. */
export type SaveAddressOffer={kind:'instagram'|'email';target:'account'|'contact';label:string};
/**
 * D4 rule (spec 103 §7.4), the same one the server applies: an Instagram chat with a known user offers the business's empty Instagram;
 * a verified email offers the chosen person's empty email, or without a person the business's empty email. Never a filled field,
 * never an address the business already has, never an unverified email.
 */
export function saveAddressOffer({group,account,contact,alreadyStored=false}:{group:Pick<UnmatchedGroup,'channel'|'address'|'instagramUsername'|'verified'>;account:{instagramEmpty:boolean;emailEmpty:boolean};contact?:{name:string;emailEmpty:boolean}|null;alreadyStored?:boolean}):SaveAddressOffer|null{
 if(alreadyStored)return null;
 if(group.channel==='instagram')return group.instagramUsername&&account.instagramEmpty?{kind:'instagram',target:'account',label:`Guardar @${group.instagramUsername} en el negocio`}:null;
 if(group.channel!=='email'||!group.verified)return null;
 if(contact)return contact.emailEmpty?{kind:'email',target:'contact',label:`Guardar ${group.address} en ${contact.name}`}:null;
 return account.emailEmpty?{kind:'email',target:'account',label:`Guardar ${group.address} en el negocio`}:null;
}
/**
 * D4: the webhook and the email matching associate only when the address is in exactly one business, so storing an address another live business
 * already has would leave every future message unmatched. Returns the notice to show instead of the box, or null.
 */
export function addressOwnedElsewhere({group,accountId}:{group:Pick<UnmatchedGroup,'channel'|'address'|'instagramUsername'|'addressOwners'>;accountId:string}):string|null{
 const other=(group.addressOwners??[]).find(o=>o.accountId!==accountId);if(!other)return null;
 const where=[`H${other.accountId}`,other.nombre,other.ciudad?.trim()||null].filter(Boolean).join(' · ');
 return group.channel==='instagram'?(group.instagramUsername?`Ese @${group.instagramUsername} ya está en ${where}.`:null):group.channel==='email'?`Ese email ya está en ${where}.`:null;
}
/** D3 actions written to `crm_resource_journal` and how the global history names them. */
export const INBOUND_DISMISSED_ACTION='inbound_dismissed',INBOUND_RESTORED_ACTION='inbound_restored';
export const INBOUND_HISTORY_LABELS:Readonly<Record<string,string>>={[`resource_${INBOUND_DISMISSED_ACTION}`]:'Mensaje sin asociar descartado',[`resource_${INBOUND_RESTORED_ACTION}`]:'Mensaje devuelto a «Sin asociar»'};
/** Area shown in the global history for journal rows about inbound messages without a business (instead of «Configuración / material de venta»). */
export const INBOUND_HISTORY_AREA='Mensajes sin asociar';
