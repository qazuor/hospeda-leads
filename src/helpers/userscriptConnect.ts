import {TOKEN_ACK_ATTRIBUTE,TOKEN_ACK_EVENT,TOKEN_BRIDGE_VERSION,TOKEN_EVENT} from '../../userscript/src/announce';
import {compareSemver,parseUserscriptVersion} from './userscriptPure';

/** How long the page waits for the script to ack a token before falling back to copy and paste. */
export const TOKEN_ACK_TIMEOUT_MS=3000;

/** Whether the script announced in this page can take a token from it («Conectar este navegador», 1.5.1 or later). */
export function supportsTokenBridge({version}:{version:string|null|undefined}):boolean{const parsed=parseUserscriptVersion(version??null);return !!parsed&&compareSemver(parsed,TOKEN_BRIDGE_VERSION)>=0;}

const randomNonce=():string=>[...crypto.getRandomValues(new Uint8Array(16))].map(b=>b.toString(16).padStart(2,'0')).join('');

/**
 * Owner review of spec 96: hands a freshly created token to the user script running in this page, which saves it and checks the
 * connection again. Resolves true once the script acks this request's nonce, false after `timeoutMs` without an answer (no script, or
 * one older than 1.5.1), so the caller can offer copy and paste instead. The token travels only in the event detail, never in the DOM.
 */
export function handTokenToUserscript({token,doc=document,timeoutMs=TOKEN_ACK_TIMEOUT_MS,nonce=randomNonce()}:{token:string;doc?:Document;timeoutMs?:number;nonce?:string}):Promise<boolean>{
 return new Promise(resolve=>{
  const finish=(ok:boolean)=>{window.clearTimeout(timer);doc.removeEventListener(TOKEN_ACK_EVENT,onAck);resolve(ok);};
  const onAck=()=>{if(doc.documentElement.getAttribute(TOKEN_ACK_ATTRIBUTE)===nonce)finish(true);};
  doc.addEventListener(TOKEN_ACK_EVENT,onAck);
  const timer=window.setTimeout(()=>finish(false),timeoutMs);
  doc.dispatchEvent(new CustomEvent(TOKEN_EVENT,{detail:JSON.stringify({token,nonce})}));
 });
}
