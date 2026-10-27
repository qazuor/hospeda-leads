import {useEffect,useState} from 'react';
import type {Message} from '../../endpoints/communication.schema';
import {instagramWaitRemainingMs} from '../../helpers/instagramChat';

/**
 * Spec 92 §2.4: the current time, refreshed once when the first Instagram attempt of `messages` leaves its 15-minute echo
 * waiting period, so «¿Lo enviaste?» shows up without a reload. Nothing runs while no attempt is waiting.
 */
export function useInstagramWaitNow(messages:readonly Pick<Message,'channel'|'status'|'ownerEmail'|'destinationDetail'|'lastInteractionAt'>[]):number{
 const [now,setNow]=useState(()=>Date.now());
 const remaining=messages.reduce<number|null>((min,message)=>{const ms=instagramWaitRemainingMs({message,now});return ms==null?min:min==null?ms:Math.min(min,ms);},null);
 useEffect(()=>{if(remaining==null)return;const timer=setTimeout(()=>setNow(Date.now()),remaining+50);return()=>clearTimeout(timer);},[remaining]);
 return now;
}
