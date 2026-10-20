/** Cross-tab logout signal and the hard navigation used when the signed-in user changes or logs out elsewhere. */
export const AUTH_CHANNEL_NAME='crm-auth';
export const LOGOUT_STORAGE_KEY='crm-auth-logout';
const LOGOUT_MESSAGE='logout';

let releasingUnload=false;
// Registered at module load, before any editor mounts, so stopImmediatePropagation runs ahead of dirty-form beforeunload prompts.
if(typeof window!=='undefined')window.addEventListener('beforeunload',event=>{if(releasingUnload)event.stopImmediatePropagation();});

/** Lets the next unload pass without the "unsaved changes" prompt: a deliberate account switch must not be blocked by a draft. */
export function releaseUnloadGuards(){releasingUnload=true;}

/** Full page load (fresh JS memory, no component state from the previous user). Wrapped in an object so tests can spy on it. */
export const authNavigation={assign:(path:string)=>{releaseUnloadGuards();window.location.assign(path);}};

// One channel per tab: a BroadcastChannel never receives its own messages, so this tab ignores its own logout.
let channel:BroadcastChannel|null|undefined;
const getChannel=()=>{
 if(channel===undefined){try{channel=typeof BroadcastChannel!=='undefined'?new BroadcastChannel(AUTH_CHANNEL_NAME):null;}catch{channel=null;}}
 return channel;
};

/** Tells every other tab that this browser logged out. BroadcastChannel first; the storage event covers browsers without it. */
export function broadcastLogout(){
 if(typeof window==='undefined')return;
 try{getChannel()?.postMessage(LOGOUT_MESSAGE);}catch{}
 try{window.localStorage.setItem(LOGOUT_STORAGE_KEY,String(Date.now()));}catch{}
}

/** Calls `onLogout` once per logout signal from another tab. Returns the unsubscribe function. */
export function onLogoutElsewhere(onLogout:()=>void):()=>void{
 if(typeof window==='undefined')return()=>undefined;
 let handled=false;const once=()=>{if(handled)return;handled=true;onLogout();};
 const storage=(event:StorageEvent)=>{if(event.key===LOGOUT_STORAGE_KEY&&event.newValue)once();};
 const message=(event:MessageEvent)=>{if(event.data===LOGOUT_MESSAGE)once();};
 window.addEventListener('storage',storage);getChannel()?.addEventListener('message',message);
 return()=>{window.removeEventListener('storage',storage);getChannel()?.removeEventListener('message',message);};
}
