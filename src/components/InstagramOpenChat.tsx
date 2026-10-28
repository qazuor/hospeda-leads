import React,{useEffect,useRef,useState} from 'react';
import {Button} from './Button';
import styles from './Communication.module.css';
import {instagramTarget,normalizeInstagramUsername} from '../helpers/instagramChat';
import {compareSemver} from '../helpers/userscriptPure';
import {INSTALLED_ATTRIBUTE} from '../../userscript/src/announce';
import {HANDOFF_MESSAGE_TYPE,HANDOFF_TTL_MS,newNonce,textHash} from '../../userscript/src/instagram/handoff';

/**
 * Spec 92 §2.2–2.3: the client side of «Abrir Instagram». Instagram does not accept prefilled text, so the saved final text is
 * copied inside the user's click and Instagram opens for the seller to paste it (the chat on a phone, the profile on a
 * computer: see `instagramTarget`). Nothing here records anything: the composer sends `dispatch` and these helpers only copy,
 * open and explain.
 */

/** Result of {@link copyInGesture}: `copied` is the synchronous copy; `settled` also counts the async clipboard, best effort. */
export type GestureCopy={readonly copied:boolean;readonly settled:Promise<boolean>};

/**
 * Copies `text` synchronously, inside the user's gesture, with a hidden textarea and `execCommand('copy')`. It has to happen
 * before `window.open`: once the new tab takes focus, Chrome rejects `navigator.clipboard.writeText` («Document is not
 * focused»). The async clipboard is still started as an extra, and `settled` is true when either one worked. Never throws.
 */
export function copyInGesture(text:string):GestureCopy{
 let copied=false;
 try{
  const input=document.createElement('textarea');input.value=text;input.setAttribute('readonly','');input.style.position='fixed';input.style.opacity='0';
  document.body.append(input);input.select();copied=document.execCommand('copy');input.remove();
 }catch{copied=false;}
 let extra:Promise<boolean>;
 try{extra=navigator.clipboard?.writeText?navigator.clipboard.writeText(text).then(()=>true,()=>false):Promise.resolve(false);}catch{extra=Promise.resolve(false);}
 return {copied,settled:copied?Promise.resolve(true):extra};
}

/** Copies `text` outside an open (the «Copiar» buttons). True when the synchronous or the async copy worked. */
export async function copyMessageText(text:string):Promise<boolean>{return copyInGesture(text).settled;}

/** Phones and tablets (coarse pointer): they open the chat in the app with a real link; computers open the profile. */
export const isCoarsePointer=():boolean=>typeof window!=='undefined'&&typeof window.matchMedia==='function'&&window.matchMedia('(pointer: coarse)').matches;
const isMac=():boolean=>typeof navigator!=='undefined'&&/Mac|iPhone|iPad/i.test(navigator.platform||navigator.userAgent||'');

/** First version of the shared user script that pastes on Instagram (spec 94). */
export const INSTAGRAM_PASTE_SCRIPT_VERSION='1.4.0';
/** True when the user script announced on this CRM page (PR #244 attribute) a version that pastes on Instagram. */
export function userscriptPastesOnInstagram(doc:Document|undefined=typeof document==='undefined'?undefined:document):boolean{
 const version=doc?.documentElement.getAttribute(INSTALLED_ATTRIBUTE);
 return !!version&&/^\d+\.\d+\.\d+$/.test(version)&&compareSemver(version,INSTAGRAM_PASTE_SCRIPT_VERSION)>=0;
}

/**
 * Spec 94 (D6): the one-time handoff that authorizes the user script to paste. Called inside the click, before the tab opens: it returns a
 * fresh 128-bit nonce for the URL (`#hospeda=<nonce>`) and posts `{nonce, username, expiresAt, textHash}` to the script on this page
 * (same window and origin; it stores it under its own key). Null on a phone, without a script that pastes, or without Web Crypto: then
 * the plain profile opens and the seller pastes, as before. A bare marker authorizes nothing, so a link from another site cannot paste.
 */
export function handOffToUserscript({username,text,win=window}:{username:string|null|undefined;text:string;win?:Window}):string|null{
 const user=normalizeInstagramUsername(username);
 if(!user||!userscriptPastesOnInstagram(win.document)||!win.crypto?.subtle)return null;
 const nonce=newNonce({random:win.crypto}),expiresAt=Date.now()+HANDOFF_TTL_MS;
 void textHash({text,subtle:win.crypto.subtle}).then(hash=>win.postMessage({type:HANDOFF_MESSAGE_TYPE,nonce,username:user,expiresAt,textHash:hash},win.location.origin),()=>{});
 return nonce;
}

/**
 * Toast after a successful open: how to paste (chat on a phone, «Enviar mensaje» on the profile), or why to copy from the CRM. When the
 * user script got a handoff (spec 94) it opens the chat and pastes; otherwise, on a computer, the toast says it could.
 */
export function instagramOpenedToast({copied,mobile,scriptPastes=false}:{copied:boolean;mobile:boolean;scriptPastes?:boolean}):string{
 if(!copied)return mobile?'Instagram abierto. Copiá el mensaje desde el CRM y pegalo en el chat.':'Perfil de Instagram abierto. Copiá el mensaje desde el CRM, tocá «Enviar mensaje» y pegalo.';
 if(mobile)return 'Mensaje copiado: en el chat mantené apretado y elegí Pegar';
 return scriptPastes?'Mensaje copiado. El script de Hospeda abre el chat y lo pega: revisalo y envialo vos.':`Mensaje copiado. En el perfil tocá «Enviar mensaje» y pegalo (${isMac()?'⌘V':'Ctrl+V'}). Con el user script de Hospeda se pega solo.`;
}

/** Toast when `dispatch` failed after the tab was pre-opened (L9): the tab is closed and nothing was recorded. */
export const INSTAGRAM_DISPATCH_FAILED='No se pudo registrar el intento, así que cerramos la pestaña de Instagram. Reintentá «Abrir Instagram»; si el intento ya quedó guardado, en el mensaje vas a ver «Copiar y abrir de nuevo».';

/** Opens Instagram in a new tab without a reference back to the CRM. Returns false when the browser blocked it. */
export function openInstagramChat(url:string):boolean{const w=window.open(url,'_blank');if(w)w.opener=null;return w!==null;}

/** Review-step notices, each shown only when it applies (spec 92 §2.2). */
export function InstagramReviewNotices({username,autoConfirm,shared}:{username:string;autoConfirm?:boolean;shared?:boolean}){
 return <div className={styles.instagramNotices} role="group" aria-label="Antes de abrir Instagram">
  <p>Se copia el mensaje y se abre Instagram: en el celular, el chat de @{username}; en la computadora, el perfil de @{username}, donde tocás «Enviar mensaje». Pegalo y envialo desde la cuenta de Instagram de Hospeda: cuando Instagram nos avise del envío, se confirma solo.</p>
  <p>Tenés que estar con la sesión de Hospeda en Instagram, en este navegador o en la app. Con otra cuenta el envío no se registra y vas a tener que confirmarlo a mano.</p>
  {autoConfirm===false&&<p role="alert">La conexión con Instagram no está activa: este envío no se va a confirmar solo. Después vas a tener que contestar "¿Lo enviaste?".</p>}
  {shared&&<p role="alert">Otro negocio tiene el mismo usuario de Instagram: los mensajes de este chat no se asocian solos y el envío no se va a confirmar solo.</p>}
 </div>;
}

/** What happened in the browser after the attempt was recorded. `copied` is null while the clipboard promise is still pending. */
export type InstagramOpenState={url:string;mobile:boolean;popupBlocked:boolean;copied:boolean|null};

/**
 * After «Abrir Instagram» succeeded: the copy fallback (clipboard denied), the link when the popup was blocked, the mobile
 * link-button, and «Copiar y abrir de nuevo». Every action is client-side only: no new attempt, no request.
 */
export function InstagramOpenedActions({text,recipient,state,onToast}:{text:string;recipient:string;state:InstagramOpenState|null;onToast:(message:string)=>void}){
 const mobile=state?.mobile??isCoarsePointer(),target=instagramTarget({username:recipient,mobile}),url=state?.url??target?.url;
 const [manualCopy,setManualCopy]=useState(false),[copyAgainFailed,setCopyAgainFailed]=useState(false);const area=useRef<HTMLTextAreaElement>(null);
 const showManual=manualCopy||state?.copied===false||copyAgainFailed;
 useEffect(()=>{if(showManual)area.current?.select()},[showManual]);
 if(!url||!target)return null;
 const copyAndOpen=async()=>{
  // Synchronous copy first, then the open, both inside the click (M3).
  const copy=copyInGesture(text),nonce=mobile?null:handOffToUserscript({username:recipient,text}),opened=openInstagramChat(instagramTarget({username:recipient,mobile,nonce})?.url??url),copied=await copy.settled;
  setCopyAgainFailed(!copied);
  onToast(!opened?'No se pudo abrir Instagram automáticamente. Usá el enlace de abajo.':instagramOpenedToast({copied,mobile,scriptPastes:!!nonce}));
 };
 const copyOnly=async()=>{const copied=await copyMessageText(text);if(copied){setManualCopy(false);setCopyAgainFailed(false);onToast('Mensaje copiado');}else{area.current?.select();onToast('No se pudo copiar: seleccioná el texto y copialo a mano.');}};
 return <div className={styles.instagramActions}>
  {showManual&&<div role="group" aria-label="Copiar el mensaje"><p><strong>No pudimos copiar el mensaje. Copialo desde acá:</strong></p><textarea ref={area} readOnly value={text} rows={Math.min(8,Math.max(3,text.split('\n').length))} aria-label="Mensaje para copiar" className={styles.instagramCopyArea}/><Button variant="outline" onClick={()=>void copyOnly()}>Copiar</Button></div>}
  {state?.popupBlocked&&<p role="alert">No se pudo abrir Instagram automáticamente. El intento quedó guardado como no confirmado. <a href={url} target="_blank" rel="noreferrer" onClick={()=>void copyInGesture(text)}>{target.label}</a></p>}
  {mobile&&state&&<a className={styles.instagramChatLink} href={url} target="_blank" rel="noreferrer">{target.label}</a>}
  <div className={styles.actions}><Button variant="outline" onClick={()=>void copyAndOpen()}>Copiar y abrir de nuevo</Button></div>
 </div>;
}
