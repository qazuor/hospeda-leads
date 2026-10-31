import type {WorkPurpose} from './nextStep';

/**
 * Message statuses that record a real contact or attempt, so the seller can say "¿Cómo salió?" (decision 2B).
 * Drafts, cancelled messages, failed or uncertain email sends (`submitting`, `unknown`, `failed`) and attempts marked
 * as not done never qualify: nothing is inferred from opening a channel or saving a draft.
 */
export const OUTCOME_READY_STATUSES=['whatsapp_opened','instagram_opened','manual_pending','manual_sent','manual_no_contact','accepted','delivery_confirmed','replied','rejected'] as const;
/** Spec 99 §3.6 «Envíos sin confirmar»: a chat opened or a manual attempt started, resolved first with «¿Lo enviaste?». */
export const UNCONFIRMED_FOLLOW_UP_STATUSES=['whatsapp_opened','instagram_opened','manual_pending'] as const satisfies readonly (typeof OUTCOME_READY_STATUSES)[number][];
/** Spec 100 §7 (D1): a «¿Lo enviaste?» question older than this many hours (database clock) is expired: not counted, still answerable. */
export const UNCONFIRMED_STALE_HOURS=72;
/** Spec 100 §7 (D1): a management's «Anotá cómo salió» group expires as a whole this many days after its newest send. */
export const OUTCOME_STALE_DAYS=7;
/** Spec 100 §9 (D7): a WhatsApp open younger than this waits for the user script to confirm it before «¿Lo enviaste?» counts it. */
export const WHATSAPP_SCRIPT_WAIT_MS=5*60_000;
/** Spec 100: newest sends listed per follow-up group; the counts still cover every send. */
export const FOLLOW_UP_GROUP_ITEM_LIMIT=10;
/** Spec 99 §3.6 «Anotá cómo salió»: a contact with evidence (or a recorded attempt) still without an outcome. */
export const OUTCOME_FOLLOW_UP_STATUSES=['manual_sent','manual_no_contact','accepted','delivery_confirmed','replied','rejected'] as const satisfies readonly (typeof OUTCOME_READY_STATUSES)[number][];
/** Which follow-up list a pending contact belongs to (spec 99 §3.6), or null when it is not outcome-ready. */
export function followUpKind(status:string|null|undefined):'unconfirmed'|'outcomes'|null{return (UNCONFIRMED_FOLLOW_UP_STATUSES as readonly string[]).includes(status??'')?'unconfirmed':(OUTCOME_FOLLOW_UP_STATUSES as readonly string[]).includes(status??'')?'outcomes':null;}

/** True when a message with this status can end in the outcome step. */
export function canLogContactOutcome(status:string|null|undefined):boolean{return (OUTCOME_READY_STATUSES as readonly string[]).includes(status??'');}

/** Spec 100 §8: the `outcome` conflict when the script, Meta's echo or another answer confirmed the send first. */
export const ALREADY_CONFIRMED_MESSAGE='Este envío ya estaba confirmado.';
/** True for that 409 on the client (`CrmApiError`): it is information, not a failure, and the lists must reload. */
export const isAlreadyConfirmed=(error:unknown):boolean=>error instanceof Error&&(error as {status?:unknown}).status===409&&error.message===ALREADY_CONFIRMED_MESSAGE;
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
