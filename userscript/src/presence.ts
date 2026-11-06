import {ApiError,sendUserscriptPresence} from './api';

export const PRESENCE_INTERVAL_MS=60_000,PRESENCE_THROTTLE_MS=20_000;
export function startUserscriptPresence(input:{source:'whatsapp'|'instagram';base:string;readToken:()=>string;origin?:string;doc?:Document;win?:Window;send?:(base:string,token:string,source:'whatsapp'|'instagram')=>Promise<unknown>;/** Extra gate checked on every beat (Instagram: only on Direct pages, spec 97 §5.4). */active?:()=>boolean}){
 const doc=input.doc??document,win=input.win??window,send=input.send??sendUserscriptPresence;
 if((input.origin??win.location.origin)===new URL(input.base).origin)return()=>undefined;
 let stopped=false,blockedToken='',lastSent=Number.NEGATIVE_INFINITY;
 const beat=()=>{if(stopped||doc.visibilityState!=='visible'||input.active?.()===false)return;const token=input.readToken();if(!token||token===blockedToken)return;const now=Date.now();if(now-lastSent<PRESENCE_THROTTLE_MS)return;lastSent=now;void send(input.base,token,input.source).catch(error=>{if(error instanceof ApiError&&(error.status===401||error.status===426))blockedToken=token;});};
 const visible=()=>{if(doc.visibilityState==='visible'){if(input.readToken()!==blockedToken)blockedToken='';beat();}};
 const interval=win.setInterval(beat,PRESENCE_INTERVAL_MS);
 const stop=()=>{stopped=true;win.clearInterval(interval);doc.removeEventListener('visibilitychange',visible);win.removeEventListener('pagehide',stop);};
 // The rest of the script tears down on pagehide too.
 doc.addEventListener('visibilitychange',visible);win.addEventListener('pagehide',stop);beat();
 return stop;
}
