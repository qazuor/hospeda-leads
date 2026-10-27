import {normalizeInstagramProfile} from './dataNormalization';
import {INSTAGRAM_ECHO_OWNER} from './instagramChannel';

/**
 * Spec 92: Instagram chats opened from the composer. Client-safe helpers (no Node imports) shared by the composer, the
 * conversation and the server. An attempt is a `social` row with `destination_detail='instagram'` that a seller prepared;
 * Hospeda's echoes (owner `instagram@hospeda`) are never attempts.
 */

/** Normalizes a stored or Meta-provided Instagram profile: also accepts scheme-less `instagram.com/x`, `www.`/`m.` hosts, query strings and fragments. Returns the lowercase username or null. */
export function normalizeInstagramUsername(value:string|null|undefined):string|null{const v=value?.trim()??'';return normalizeInstagramProfile(/^(www\.|m\.)?instagram\.com\//i.test(v)?'https://'+v:v);}

/** How long an opened attempt waits for Meta's echo before asking «¿Lo enviaste?» (an instant, not business days). */
export const INSTAGRAM_ECHO_WAIT_MS=15*60_000;
/** `destination_detail` of a message prepared for Instagram from the composer. */
export const INSTAGRAM_DESTINATION='instagram';
const USERNAME=/^[a-z0-9._]{1,30}$/;

/** `https://ig.me/m/<username>` for a valid, already normalized username; null for anything else (never builds a URL from free text). */
export function instagramChatUrl({username}:{username:string|null|undefined}):string|null{
 const value=(username??'').replace(/^@/,'');
 return USERNAME.test(value)?'https://ig.me/m/'+encodeURIComponent(value):null;
}

/** The username of an attempt's `recipient` (`@usuario`), or null when it is not a valid one. */
export const attemptUsername=(recipient:string|null|undefined):string|null=>normalizeInstagramUsername(recipient);

type AttemptLike={channel:string;ownerEmail?:string|null;destinationDetail?:string|null};
/** True for a message a seller prepared for Instagram from the composer (never Hospeda's own echo, never a «Red social» log). */
export const isInstagramAttempt=(msg:AttemptLike):boolean=>msg.channel==='social'&&msg.destinationDetail===INSTAGRAM_DESTINATION&&msg.ownerEmail!==INSTAGRAM_ECHO_OWNER;

/** An opened attempt still inside the echo waiting period: it shows «Esperando que Instagram confirme el envío…», not «¿Lo enviaste?». */
export function isWaitingForInstagramEcho({message,now=Date.now()}:{message:AttemptLike&{status:string;lastInteractionAt?:Date|string|null};now?:number}):boolean{
 if(message.status!=='instagram_opened'||!isInstagramAttempt(message))return false;
 const at=message.lastInteractionAt?new Date(message.lastInteractionAt).getTime():NaN;
 return !Number.isNaN(at)&&now-at<INSTAGRAM_ECHO_WAIT_MS;
}

/** Milliseconds until a waiting attempt starts asking «¿Lo enviaste?», or null when it is not waiting. */
export function instagramWaitRemainingMs({message,now=Date.now()}:{message:AttemptLike&{status:string;lastInteractionAt?:Date|string|null};now?:number}):number|null{
 if(!isWaitingForInstagramEcho({message,now}))return null;
 return INSTAGRAM_ECHO_WAIT_MS-(now-new Date(message.lastInteractionAt!).getTime());
}

/** An attempt that Meta's echo confirmed (or linked after a manual confirmation): sent and carrying the echo `mid`. */
export const isInstagramConfirmed=(msg:AttemptLike&{status:string;externalId?:string|null}):boolean=>isInstagramAttempt(msg)&&msg.status==='manual_sent'&&!!msg.externalId;

const comparable=(text:string|null|undefined)=>(text??'').replace(/\s+/g,' ').trim();
/** True when the text that went out (echo) differs from the prepared one, so the bubble says «Editado antes de enviar». */
export const instagramTextEdited=(msg:{body?:string|null;textBody?:string|null}):boolean=>!!msg.textBody&&!!msg.body&&comparable(msg.textBody)!==comparable(msg.body);

/** The composer channel of a prepared message: Instagram drafts are `social` rows with `destination_detail='instagram'`. */
export const composerChannelOf=(m:{channel:string;destinationDetail?:string|null}):'email'|'whatsapp'|'instagram'=>m.channel==='social'&&m.destinationDetail===INSTAGRAM_DESTINATION?'instagram':m.channel==='email'?'email':'whatsapp';
