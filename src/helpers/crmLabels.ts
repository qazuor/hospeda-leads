import {managementStageByKey} from './businessManagement';
import {contactOutcomes,legacyOutcomeDisplay} from './workOutcomes';

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
export const responseCategoryLabels={interested:contactOutcomes.interested,information:'Pidió información',later:contactOutcomes.later,rejected:contactOutcomes.not_interested,not_now:'No puede ahora',operational:'Consulta operativa',do_not_contact:contactOutcomes.do_not_contact,other:'Otro'} as const;
/** Response category label (`information` → "Pidió información"); empty → "Sin clasificar"; unknown passes through. */
export const responseCategoryLabel=(category:string|null|undefined):string=>!category?'Sin clasificar':has(responseCategoryLabels,category)?responseCategoryLabels[category]:category;

/** Outcome label: canonical outcomes first, then legacy stored values mapped for display (history is not rewritten). Empty → "Sin resultado". */
export const outcomeLabel=(outcome:string|null|undefined):string=>!outcome?'Sin resultado':has(contactOutcomes,outcome)?contactOutcomes[outcome]:has(legacyOutcomeDisplay,outcome)?legacyOutcomeDisplay[outcome]:outcome;

/** Minimal user shape for name lookups. */
export type LabelUser={email:string;displayName?:string|null};
/** Fallback when a user cannot be resolved to a name. */
export const UNKNOWN_USER_LABEL='Otra persona del equipo';
/** A user's display name. Never returns an email: unknown or nameless users become "Otra persona del equipo"; no email → "Sin responsable". */
export const userLabel=(users:readonly LabelUser[]|null|undefined,email:string|null|undefined):string=>{
 if(!email)return 'Sin responsable';
 const wanted=email.trim().toLowerCase();
 return users?.find(user=>user.email.trim().toLowerCase()===wanted)?.displayName?.trim()||UNKNOWN_USER_LABEL;
};
/** Who did something: no actor → "Automático" (instead of "Sistema"); an email is resolved with `userLabel`; a name passes through. */
export const actorLabel=(actor:string|null|undefined,users?:readonly LabelUser[]|null):string=>{
 const value=actor?.trim();
 if(!value)return 'Automático';
 return value.includes('@')?userLabel(users,value):value;
};
