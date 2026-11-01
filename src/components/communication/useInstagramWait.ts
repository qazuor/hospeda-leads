import {useEffect,useState} from 'react';
import type {Message} from '../../endpoints/communication.schema';
import {instagramWaitRemainingMs} from '../../helpers/instagramChat';
import {scriptWaitRemainingMs} from '../../helpers/communicationTimeline';

/**
 * Spec 92 §2.4 and spec 100 §9: the current time, refreshed once when the first open of `messages` leaves its waiting period (15
 * minutes for Instagram's echo, 5 for the WhatsApp user script), so «¿Lo enviaste?» and the server count show up without a reload.
 * Nothing runs while no open is waiting.
 */
export function useConfirmWaitNow(messages:readonly Pick<Message,'channel'|'status'|'ownerEmail'|'destinationDetail'|'lastInteractionAt'>[]):number{
 const [now,setNow]=useState(()=>Date.now());
 const remaining=messages.reduce<number|null>((min,message)=>{const ms=instagramWaitRemainingMs({message,now})??scriptWaitRemainingMs({message,now});return ms==null?min:min==null?ms:Math.min(min,ms);},null);
 useEffect(()=>{if(remaining==null)return;const timer=setTimeout(()=>setNow(Date.now()),remaining+50);return()=>clearTimeout(timer);},[remaining]);
 return now;
}
