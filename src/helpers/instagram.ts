import {createCipheriv,createDecipheriv,createHash,createHmac,timingSafeEqual,randomBytes} from 'node:crypto';
import {z} from 'zod';

export {normalizeInstagramUsername} from './instagramChat';
export const INSTAGRAM_MAX_TEXT=50000;
/** Loose envelope: each entry and each messaging item is validated on its own so one unsupported event never drops the real messages of the same batch. */
export const instagramWebhookSchema=z.object({object:z.string(),entry:z.array(z.unknown())}).passthrough();
const entrySchema=z.object({id:z.string(),messaging:z.array(z.unknown()).optional()}).passthrough();
const messagingSchema=z.object({sender:z.object({id:z.string()}).passthrough(),recipient:z.object({id:z.string()}).passthrough(),timestamp:z.unknown().optional(),message:z.object({mid:z.string().min(1).max(1000),text:z.string().optional(),is_echo:z.boolean().optional(),attachments:z.array(z.unknown()).optional()}).passthrough()}).passthrough();
export type InstagramMessage=z.infer<typeof messagingSchema>;
const IGSID=/^\d{1,64}$/;
/** Meta sends milliseconds. Anything missing, non-numeric, before 2020 or more than a day ahead falls back to the receive time. */
export function instagramEventTime(value:unknown,now=Date.now()){const t=typeof value==='number'&&Number.isFinite(value)?new Date(value):null;return t&&!Number.isNaN(t.getTime())&&t.getTime()>=Date.UTC(2020,0,1)&&t.getTime()<=now+86400000?t:new Date(now);}
export function verifyInstagramSignature(raw:Buffer,signature:string|null,secret:string|undefined){if(!secret||!signature||!/^sha256=[a-f0-9]{64}$/i.test(signature))return false;const actual=createHmac('sha256',secret).update(raw).digest();const supplied=Buffer.from(signature.slice(7),'hex');return supplied.length===actual.length&&timingSafeEqual(actual,supplied);}
export function parseInstagramWebhook(value:unknown,accountId:string){const parsed=instagramWebhookSchema.safeParse(value);if(!parsed.success||parsed.data.object!=='instagram')return [];const events:Array<{event:InstagramMessage;mid:string;echo:boolean;igsid:string;text:string;receivedAt:Date}>=[];for(const rawEntry of parsed.data.entry){const entry=entrySchema.safeParse(rawEntry);if(!entry.success||entry.data.id!==accountId)continue;for(const rawItem of entry.data.messaging??[]){const m=messagingSchema.safeParse(rawItem);if(!m.success)continue;const {message}=m.data,echo=message.is_echo===true,igsid=echo?m.data.recipient.id:m.data.sender.id,text=message.text?message.text.slice(0,INSTAGRAM_MAX_TEXT):message.attachments?.length?'Adjunto: imagen':'';if(!text||!IGSID.test(igsid))continue;events.push({event:m.data,mid:message.mid,echo,igsid,text,receivedAt:instagramEventTime(m.data.timestamp)});}}return events;}
/** Spec 103 B2: why `INTEGRATION_SECRETS_KEY` can or cannot be used. Never carries the value, its length or anything derived from it, except the key itself when ok. */
export type EncryptionKeyStatus={status:'missing'}|{status:'invalid';hint:'hex'|null}|{status:'ok';key:Buffer};
/**
 * Pure. Accepts exactly what {@link encryptionKey} always accepted: whatever Node's base64 decoder turns into 32 bytes (so quoted base64 and
 * base64url are valid, a 64-character hex key is not). `hint:'hex'` only for a trimmed value that is 64 hex characters.
 */
export function encryptionKeyStatus(value:string|undefined):EncryptionKeyStatus{if(!value||!value.trim())return {status:'missing'};let key:Buffer|null=null;try{key=Buffer.from(value,'base64');}catch{key=null;}if(key?.length===32)return {status:'ok',key};return {status:'invalid',hint:/^[0-9a-fA-F]{64}$/.test(value.trim())?'hex':null};}
export function encryptionKey(value:string|undefined){const result=encryptionKeyStatus(value);return result.status==='ok'?result.key:null;}
export function encryptInstagramToken(token:string,key:Buffer){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv),ciphertext=Buffer.concat([cipher.update(token,'utf8'),cipher.final()]);return {ciphertext:ciphertext.toString('base64'),iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64')};}
export function decryptInstagramToken(value:{ciphertext:string;iv:string;tag:string},key:Buffer){const decipher=createDecipheriv('aes-256-gcm',key,Buffer.from(value.iv,'base64'));decipher.setAuthTag(Buffer.from(value.tag,'base64'));return Buffer.concat([decipher.update(Buffer.from(value.ciphertext,'base64')),decipher.final()]).toString('utf8');}
export const shouldRefreshInstagramToken=(refreshedAt:Date|number,now=Date.now())=>now-new Date(refreshedAt).getTime()>=24*60*60*1000;
/** The verify token must be at least 32 characters and is compared in constant time. */
export function verifyInstagramChallenge(params:URLSearchParams,configuredToken:string|undefined){const challenge=params.get('hub.challenge'),supplied=params.get('hub.verify_token');if(!configuredToken||configuredToken.length<32||!supplied||!challenge||params.get('hub.mode')!=='subscribe')return null;const a=createHash('sha256').update(supplied).digest(),b=createHash('sha256').update(configuredToken).digest();return timingSafeEqual(a,b)?challenge:null;}
