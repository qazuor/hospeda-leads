import {managementStageByKey} from './businessManagement';
import {contactOutcomes,purposeOutcomeLabels} from './workOutcomes';

/**
 * Display labels for stored CRM values (report item 1.8): never show an internal key or an email to a seller.
 * Unknown values that are not internal keys (legacy free text) pass through unchanged.
 */

const has=<T extends object>(map:T,key:string):key is Extract<keyof T,string>=>Object.hasOwn(map,key);

/** Stage label from a catalog key (`provider:interested`, `main:lost`) whatever the management type; legacy stage names pass through. */
export const stageLabel=(nameOrKey:string|null|undefined):string=>!nameOrKey?'Sin etapa':managementStageByKey(nameOrKey)?.label??nameOrKey;

/** Union of work activity channels and communication channels. */
export const channelLabels={phone:'Teléfono',call:'Llamada',whatsapp:'WhatsApp',email:'Email',social:'Red social',presencial:'Presencial',videollamada:'Videollamada',other:'Otro'} as const;
/** Channel label (`whatsapp` → "WhatsApp"); empty → "Sin canal"; unknown free text passes through. */
export const channelLabel=(channel:string|null|undefined):string=>!channel?'Sin canal':has(channelLabels,channel)?channelLabels[channel]:channel;

/** Communication response categories, worded like the canonical outcome list where they overlap (decision 3A). */
export const responseCategoryLabels={interested:contactOutcomes.interested,information:'Pidió información',later:contactOutcomes.later,rejected:contactOutcomes.not_interested,not_now:'No puede ahora',operational:'Consulta operativa',do_not_contact:contactOutcomes.do_not_contact,other:contactOutcomes.other} as const;
/** Response category label (`information` → "Pidió información"); empty → "Sin clasificar"; unknown passes through. */
export const responseCategoryLabel=(category:string|null|undefined):string=>!category?'Sin clasificar':has(responseCategoryLabels,category)?responseCategoryLabels[category]:category;

/** Outcome label: canonical outcomes first, then purpose-specific outcomes (and the old `replied`); history is not rewritten. Empty → "Sin resultado". */
export const outcomeLabel=(outcome:string|null|undefined):string=>!outcome?'Sin resultado':has(contactOutcomes,outcome)?contactOutcomes[outcome]:has(purposeOutcomeLabels,outcome)?purposeOutcomeLabels[outcome]:outcome;

/** Minimal user shape for name lookups. */
export type LabelUser={email:string;displayName?:string|null};
/** Fallback when a user cannot be resolved to a name. */
export const UNKNOWN_USER_LABEL='Otra persona del equipo';
/** A user's display name. Never returns an email: unknown or nameless users (or a display name that is itself an email) become "Otra persona del equipo"; no email → "Sin responsable". */
export const userLabel=(users:readonly LabelUser[]|null|undefined,email:string|null|undefined):string=>{
 if(!email)return 'Sin responsable';
 const wanted=email.trim().toLowerCase();
 const name=users?.find(user=>user.email.trim().toLowerCase()===wanted)?.displayName?.trim();
 return name&&!name.includes('@')?name:UNKNOWN_USER_LABEL;
};
/**
 * Who did something. Pass the stored actor email (e.g. `actorEmail`), not a server-composed name, so it can be resolved with `userLabel`.
 * No actor, or the legacy "Sistema" placeholder (any case) → "Automático"; an email → `userLabel`; any other name passes through.
 */
export const actorLabel=(actor:string|null|undefined,users?:readonly LabelUser[]|null):string=>{
 const value=actor?.trim();
 if(!value||value.toLowerCase()==='sistema')return 'Automático';
 return value.includes('@')?userLabel(users,value):value;
};

type InboundLabelItem={channel:string;fromAddress:string;subject?:string|null};
/** What a received item is called in copy: WhatsApp messages are "mensaje", everything else "email". */
export const inboundNoun=(channel:string):'mensaje'|'email'=>channel==='whatsapp'?'mensaje':'email';
/** Sender, subject and time of a received item; WhatsApp has no subject and may have no phone, so those parts are omitted. */
export const inboundMeta=({item,when}:{item:InboundLabelItem;when:string}):string=>[item.fromAddress,item.channel==='whatsapp'?'':item.subject||'(sin asunto)',when].filter(Boolean).join(' · ');
