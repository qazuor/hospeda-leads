import {useEffect} from 'react';
import {sendPresenceHeartbeat} from '../endpoints/presence.schema';

export const PRESENCE_HEARTBEAT_INTERVAL_MS=60_000;
export const PRESENCE_HEARTBEAT_THROTTLE_MS=20_000;

export function usePresenceHeartbeat(enabled:boolean):void{
  useEffect(()=>{
    if(!enabled)return;
    let lastSentAt=Number.NEGATIVE_INFINITY;
    const send=()=>{
      if(document.visibilityState!=='visible')return;
      const now=Date.now();
      if(now-lastSentAt<PRESENCE_HEARTBEAT_THROTTLE_MS)return;
      lastSentAt=now;
      void sendPresenceHeartbeat().catch(()=>undefined);
    };
    const onVisibilityChange=()=>{if(document.visibilityState==='visible')send();};
    send();
    const interval=window.setInterval(send,PRESENCE_HEARTBEAT_INTERVAL_MS);
    document.addEventListener('visibilitychange',onVisibilityChange);
    return()=>{window.clearInterval(interval);document.removeEventListener('visibilitychange',onVisibilityChange);};
  },[enabled]);
}
