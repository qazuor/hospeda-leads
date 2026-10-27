import React,{useEffect,useRef,useState} from 'react';
import {Button} from './Button';
import styles from './Communication.module.css';
import {instagramChatUrl} from '../helpers/instagramChat';

/**
 * Spec 92 §2.2–2.3: the client side of «Abrir Instagram». `ig.me` does not accept prefilled text, so the saved final text is
 * copied inside the user's click and the chat opens for the seller to paste it. Nothing here records anything: the composer
 * sends `dispatch` and these helpers only copy, open and explain.
 */

/** Copies `text`: the async clipboard first, then the hidden-textarea `execCommand('copy')` fallback used by the manual form. Never throws. */
export async function copyMessageText(text:string):Promise<boolean>{
 try{if(!navigator.clipboard?.writeText)throw new Error('no clipboard');await navigator.clipboard.writeText(text);return true;}
 catch{
  try{
   const input=document.createElement('textarea');input.value=text;input.setAttribute('readonly','');input.style.position='fixed';input.style.opacity='0';
   document.body.append(input);input.select();const copied=document.execCommand('copy');input.remove();return copied;
  }catch{return false;}
 }
}

/** Phones and tablets: a pre-opened blank tab does not reliably hand `ig.me` to the Instagram app, so the seller taps a real link. */
export const isCoarsePointer=():boolean=>typeof window!=='undefined'&&typeof window.matchMedia==='function'&&window.matchMedia('(pointer: coarse)').matches;
const isMac=():boolean=>typeof navigator!=='undefined'&&/Mac|iPhone|iPad/i.test(navigator.platform||navigator.userAgent||'');

/** Toast after a successful open: how to paste, or why the seller has to copy from the CRM. */
export function instagramOpenedToast({copied,mobile}:{copied:boolean;mobile:boolean}):string{
 if(!copied)return 'Instagram abierto. Copiá el mensaje desde el CRM y pegalo en el chat.';
 return mobile?'Mensaje copiado: en el chat mantené apretado y elegí Pegar':`Mensaje copiado: pegalo en el chat (${isMac()?'⌘V':'Ctrl+V'})`;
}

/** Opens the chat in a new tab without a reference back to the CRM. Returns false when the browser blocked it. */
export function openInstagramChat(url:string):boolean{const w=window.open(url,'_blank');if(w)w.opener=null;return w!==null;}

/** Review-step notices, each shown only when it applies (spec 92 §2.2). */
export function InstagramReviewNotices({username,autoConfirm,shared}:{username:string;autoConfirm?:boolean;shared?:boolean}){
 return <div className={styles.instagramNotices} role="group" aria-label="Antes de abrir Instagram">
  <p>Se copia el mensaje y se abre el chat de @{username}. Pegalo y envialo desde la cuenta de Instagram de Hospeda: cuando Instagram nos avise del envío, se confirma solo.</p>
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
 const url=state?.url??instagramChatUrl({username:recipient});const username=recipient.replace(/^@/,'');
 const [manualCopy,setManualCopy]=useState(false),[copyAgainFailed,setCopyAgainFailed]=useState(false);const area=useRef<HTMLTextAreaElement>(null);
 const showManual=manualCopy||state?.copied===false||copyAgainFailed;
 useEffect(()=>{if(showManual)area.current?.select()},[showManual]);
 if(!url)return null;
 const copyAndOpen=async()=>{
  // The open runs first, inside the click; the copy promise is started in the same gesture.
  const copy=copyMessageText(text),opened=openInstagramChat(url),copied=await copy;
  setCopyAgainFailed(!copied);
  onToast(!opened?'No se pudo abrir Instagram automáticamente. Usá el enlace de abajo.':instagramOpenedToast({copied,mobile:isCoarsePointer()}));
 };
 const copyOnly=async()=>{const copied=await copyMessageText(text);if(copied){setManualCopy(false);setCopyAgainFailed(false);onToast('Mensaje copiado');}else{area.current?.select();onToast('No se pudo copiar: seleccioná el texto y copialo a mano.');}};
 return <div className={styles.instagramActions}>
  {showManual&&<div role="group" aria-label="Copiar el mensaje"><p><strong>No pudimos copiar el mensaje. Copialo desde acá:</strong></p><textarea ref={area} readOnly value={text} rows={Math.min(8,Math.max(3,text.split('\n').length))} aria-label="Mensaje para copiar" className={styles.instagramCopyArea}/><Button variant="outline" onClick={()=>void copyOnly()}>Copiar</Button></div>}
  {state?.popupBlocked&&<p role="alert">No se pudo abrir Instagram automáticamente. El intento quedó guardado como no confirmado. <a href={url} target="_blank" rel="noreferrer" onClick={()=>void copyMessageText(text)}>Abrir el chat de @{username} en Instagram</a></p>}
  {state?.mobile&&<a className={styles.instagramChatLink} href={url} target="_blank" rel="noreferrer">Ir al chat de @{username} en Instagram</a>}
  <div className={styles.actions}><Button variant="outline" onClick={()=>void copyAndOpen()}>Copiar y abrir de nuevo</Button></div>
 </div>;
}
