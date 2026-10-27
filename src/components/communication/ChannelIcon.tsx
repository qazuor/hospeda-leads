import {Instagram,Mail,MessageCircle,MessagesSquare,Phone} from 'lucide-react';
import type {TimelineChannel} from '../../helpers/communicationTimeline';

/** Decorative icon of a conversation channel group (the label next to it carries the meaning). */
export function ChannelIcon({channel,size=16}:{channel:TimelineChannel;size?:number}){
 const Icon=channel==='whatsapp'?MessageCircle:channel==='email'?Mail:channel==='instagram'?Instagram:channel==='call'?Phone:MessagesSquare;
 return <Icon size={size} aria-hidden="true"/>;
}
