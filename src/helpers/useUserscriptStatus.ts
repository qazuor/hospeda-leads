import {useCallback,useEffect,useState} from 'react';
import {CONNECTION_ATTRIBUTE,INSTALLED_ATTRIBUTE,INSTALLED_EVENT,RECHECK_EVENT,USER_ATTRIBUTE} from '../../userscript/src/announce';
import {USERSCRIPT_VERSION} from '../../userscript/src/version';
import {isCoarsePointer} from '../components/InstagramOpenChat';
import {useAuth} from './useAuth';
import {USERSCRIPT_UNVERIFIED_REASON,USERSCRIPT_WAITING_REASON,userscriptContactBlock,type UserscriptStatus} from './userscriptGate';

/** How long the page waits for the script to announce itself before reporting it as not detected. */
export const DETECT_TIMEOUT_MS=2000;

const read=():{version:string|null;connection:string|null;user:string|null}=>{const html=document.documentElement;return {version:html.getAttribute(INSTALLED_ATTRIBUTE),connection:html.getAttribute(CONNECTION_ATTRIBUTE),user:html.getAttribute(USER_ATTRIBUTE)};};

/**
 * Spec 96 §3.3: what the user script announced in this browser (it sets attributes on <html> on every CRM page). `version` and
 * `connection` are undefined while waiting and null once the script had `DETECT_TIMEOUT_MS` to announce them and did not.
 */
export function useUserscriptStatus():UserscriptStatus{
 const [now,setNow]=useState(read),[expired,setExpired]=useState(false);
 useEffect(()=>{const onAnnounce=()=>setNow(read());document.addEventListener(INSTALLED_EVENT,onAnnounce);setNow(read());const timer=window.setTimeout(()=>setExpired(true),DETECT_TIMEOUT_MS);return()=>{document.removeEventListener(INSTALLED_EVENT,onAnnounce);window.clearTimeout(timer);};},[]);
 return {version:now.version??(expired?null:undefined),connection:now.connection??(expired?null:undefined),user:now.user};
}

/**
 * The logged-in user's email, or null outside an AuthProvider (isolated component tests): the hook always calls `useContext`, so the
 * hook order never changes.
 */
export function useCurrentUserEmail():string|null{try{const {authState}=useAuth();return authState.type==='authenticated'?authState.user.email:null;}catch{return null;}}

/** Asks the script to check its token again («Verificar de nuevo»); the answer arrives as a new announcement. */
export const recheckUserscript=():void=>{document.dispatchEvent(new Event(RECHECK_EVENT));};

/**
 * The WhatsApp/Instagram gate of this computer for the logged-in user: the reason (or ''), whether it is only waiting, and whether
 * «Verificar de nuevo» applies. Phones and tablets are never gated.
 */
export function useUserscriptContactBlock():{reason:string;waiting:boolean;unverified:boolean;recheck:()=>void}{
 const status=useUserscriptStatus(),currentUserEmail=useCurrentUserEmail();
 const reason=userscriptContactBlock({mobile:isCoarsePointer(),status,latest:USERSCRIPT_VERSION,currentUserEmail});
 const recheck=useCallback(recheckUserscript,[]);
 return {reason,waiting:reason===USERSCRIPT_WAITING_REASON,unverified:reason===USERSCRIPT_UNVERIFIED_REASON,recheck};
}
