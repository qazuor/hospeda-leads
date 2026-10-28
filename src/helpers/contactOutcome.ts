import type {WorkPurpose} from './nextStep';

/**
 * Message statuses that record a real contact or attempt, so the seller can say "¿Cómo salió?" (decision 2B).
 * Drafts, cancelled messages, failed or uncertain email sends (`submitting`, `unknown`, `failed`) and attempts marked
 * as not done never qualify: nothing is inferred from opening a channel or saving a draft.
 */
export const OUTCOME_READY_STATUSES=['whatsapp_opened','instagram_opened','manual_pending','manual_sent','manual_no_contact','accepted','delivery_confirmed','replied','rejected'] as const;

/** True when a message with this status can end in the outcome step. */
export function canLogContactOutcome(status:string|null|undefined):boolean{return (OUTCOME_READY_STATUSES as readonly string[]).includes(status??'');}

/** Statuses of a channel opened from the composer whose send nobody confirmed yet (WhatsApp, and Instagram since spec 92). */
export const OPENED_UNCONFIRMED_STATUSES=['whatsapp_opened','instagram_opened'] as const;
/** True for a chat opened from the composer and not confirmed: opening a channel is never a send. */
export function isOpenedUnconfirmed(status:string|null|undefined):boolean{return (OPENED_UNCONFIRMED_STATUSES as readonly string[]).includes(status??'');}

/** Opening WhatsApp or Instagram, or starting a manual attempt, does not prove a send: the seller must answer "¿Lo enviaste?" first. */
export function needsSentAnswer(status:string|null|undefined):boolean{return isOpenedUnconfirmed(status)||status==='manual_pending';}

const workChannels:Record<string,string>={call:'phone',whatsapp:'whatsapp',email:'email',social:'other',other:'other'};
const channelWords:Record<string,string>={call:'llamada',whatsapp:'WhatsApp',email:'email',social:'red social',other:'otro canal'};

/** Maps a communication channel to the activity channel the work editor offers. */
export function contactWorkChannel(channel:string):string{return workChannels[channel]??'other';}

/** Default title of the activity that records a contact: "Contacto por {canal}". */
export function contactTitle(channel:string):string{return 'Contacto por '+(channelWords[channel]??'otro canal');}

/** A care contact keeps its purpose; any other general or management contact is commercial work. */
export function contactWorkPurpose(purpose:string|null|undefined):WorkPurpose{return purpose==='care'?'care':'commercial';}
