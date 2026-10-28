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

/** Where «Abrir Instagram» goes and how the CRM names it. */
export type InstagramTarget={readonly url:string;readonly kind:'chat'|'profile';readonly label:string};

/**
 * The single device decision of spec 92: `ig.me` opens the chat only in the mobile app (Meta does not support it on
 * Instagram Web, where it lands on «Esta página no está disponible»), so a phone opens the chat and a computer opens the
 * profile, where the seller clicks «Enviar mensaje» (or the user script does it and pastes, spec 94). `mobile` is the coarse-pointer
 * check the composer already uses.
 */
export function instagramTarget({username,mobile,nonce}:{username:string|null|undefined;mobile:boolean;nonce?:string|null}):InstagramTarget|null{
 const value=(username??'').replace(/^@/,'');
 // Spec 94: with a one-time handoff nonce (the user script is on this page), the desktop profile carries `#hospeda=<nonce>` so the script
 // clicks «Enviar mensaje» and pastes. A fragment never reaches Instagram. Without a nonce the URL is the plain profile, as before.
 const profile=instagramProfileUrl({username:value}),marked=profile&&nonce&&/^[0-9a-f]{32}$/.test(nonce)?`${profile}#${handoffFragment({nonce})}`:profile;
 const url=mobile?instagramChatUrl({username:value}):marked;
 if(!url)return null;
 return mobile?{url,kind:'chat',label:`Ir al chat de @${value} en Instagram`}:{url,kind:'profile',label:`Abrir el perfil de @${value} en Instagram`};
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
 * (`pendingContactOutcomes`) applies the same 15 minutes with the database clock.
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
