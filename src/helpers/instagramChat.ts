import {normalizeInstagramProfile} from './dataNormalization';
import {INSTAGRAM_ECHO_OWNER} from './instagramChannel';
import {handoffFragment} from '../../userscript/src/instagram/handoff';

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

/** `https://www.instagram.com/<username>/` for a valid username; null otherwise. Same strict validation as the chat link. */
export function instagramProfileUrl({username}:{username:string|null|undefined}):string|null{
 const value=(username??'').replace(/^@/,'');
 return USERNAME.test(value)?'https://www.instagram.com/'+encodeURIComponent(value)+'/':null;
}

/**
 * M2: a case-insensitive POSIX pattern that matches every `perfil_instagram` whose normalization (`normalizeInstagramProfile`) is `username`:
 * the whole value as an optional `@` handle with an optional trailing slash, or the first path segment of a URL. It is a strict superset of the
 * rule, never a substring search, so a short username does not pull unrelated rows; the normalization stays the final arbiter.
 */
export function instagramProfilePattern(username:string):string{
 const name=username.replace(/[.]/g,'\\.');
 return `^\\s*(?:@?${name}/?|(?:https?://)?(?:[^/?#@\\s]*\\.)?instagram\\.com(?::[0-9]+)?/${name}(?:[/?#][^\\s]*)?)\\s*$`;
}
/** Spec 98 §17: the stored form of a business Instagram (`https://www.instagram.com/<user>/`) for a URL, `@user` or bare username; null when it is not a valid profile. */
export function canonicalInstagramProfile(value:string|null|undefined):string|null{return instagramProfileUrl({username:normalizeInstagramUsername(value)});}
/** Copy of an Instagram the CRM cannot read as a profile (creation dialog and server). */
export const INSTAGRAM_PROFILE_INVALID='Escribí el usuario de Instagram (por ejemplo @cabanasdelrio) o el enlace a su perfil.';

/** Spec 97 §5.1: an Instagram web thread id (`/direct/t/<id>/`), digits only as observed live. Same rule as the migration's CHECK. */
export const INSTAGRAM_THREAD_ID=/^[0-9]{1,40}$/;
/** True for a valid thread id. */
export const isInstagramThreadId=(value:unknown):value is string=>typeof value==='string'&&INSTAGRAM_THREAD_ID.test(value);
/** `https://www.instagram.com/direct/t/<id>/` for a valid thread id; null otherwise (never builds a URL from free text). */
export function instagramThreadUrl({threadId}:{threadId:string|null|undefined}):string|null{return isInstagramThreadId(threadId)?`https://www.instagram.com/direct/t/${threadId}/`:null;}

/** Where «Abrir Instagram» goes and how the CRM names it. */
export type InstagramTarget={readonly url:string;readonly kind:'chat'|'profile';readonly label:string};

/**
 * The single device decision of spec 92: `ig.me` opens the chat only in the mobile app (Meta does not support it on
 * Instagram Web, where it lands on «Esta página no está disponible»), so a phone opens the chat. A computer opens the chat page
 * `/direct/t/<threadId>/` when the CRM knows a valid thread for that username (spec 97 §4.1), else the profile, where the seller clicks
 * «Enviar mensaje» (or the user script does it and pastes, spec 94). `mobile` is the coarse-pointer check the composer already uses.
 */
export function instagramTarget({username,mobile,nonce,threadId}:{username:string|null|undefined;mobile:boolean;nonce?:string|null;threadId?:string|null}):InstagramTarget|null{
 const value=(username??'').replace(/^@/,'');
 // Spec 94: with a one-time handoff nonce (the user script is on this page), the desktop URL carries `#hospeda=<nonce>` so the script
 // pastes. A fragment never reaches Instagram. Without a nonce the URL is the plain chat or profile, as before.
 const profile=instagramProfileUrl({username:value});if(!profile)return null;
 if(mobile){const url=instagramChatUrl({username:value});return url?{url,kind:'chat',label:`Ir al chat de @${value} en Instagram`}:null;}
 const chat=instagramThreadUrl({threadId}),base=chat??profile,url=nonce&&/^[0-9a-f]{32}$/.test(nonce)?`${base}#${handoffFragment({nonce})}`:base;
 return chat?{url,kind:'chat',label:`Abrir el chat de @${value} en Instagram`}:{url,kind:'profile',label:`Abrir el perfil de @${value} en Instagram`};
}

/** The username of an attempt's `recipient` (`@usuario`), or null when it is not a valid one. */
export const attemptUsername=(recipient:string|null|undefined):string|null=>normalizeInstagramUsername(recipient);

type AttemptLike={channel:string;ownerEmail?:string|null;destinationDetail?:string|null};
/** True for a message a seller prepared for Instagram from the composer (never Hospeda's own echo, never a «Red social» log). */
export const isInstagramAttempt=(msg:AttemptLike):boolean=>msg.channel==='social'&&msg.destinationDetail===INSTAGRAM_DESTINATION&&msg.ownerEmail!==INSTAGRAM_ECHO_OWNER;

/**
 * An opened attempt still inside the echo waiting period: it shows «Esperando que Instagram confirme el envío…», not «¿Lo enviaste?».
 * In the browser `now` is the client clock compared with the server's `last_interaction_at`, so a skewed computer clock
 * shortens or stretches the wait (L4). It is only a display delay: Sí/No are always available and Hoy's list
 * (`pendingContactFollowUps`) applies the same 15 minutes with the database clock.
 */
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
