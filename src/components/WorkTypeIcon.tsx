import {ClipboardList,FileText,MapPin,MessageCircle,Phone,RefreshCw,Users} from 'lucide-react';
import type {WorkData} from '../endpoints/work.schema';
import styles from './WorkTypeIcon.module.css';
const icons={call:Phone,message:MessageCircle,visit:MapPin,meeting:Users,followup:RefreshCw,proposal:FileText};
const tones={call:'blue',message:'violet',visit:'green',meeting:'orange',followup:'sky',proposal:'slate'};
/** Displays a task type icon and its accessible catalog name. */
export function WorkTypeIcon({typeId,data,className}:{typeId:string;data:WorkData;className?:string}){const Icon=icons[typeId as keyof typeof icons]||ClipboardList;const tone=tones[typeId as keyof typeof tones]||'slate';const name=data.types.find(type=>type.id===typeId)?.name||'Tarea';return <span className={styles.icon+(className?' '+className:'')} data-tone={tone}><Icon size={18} aria-hidden="true"/><span className={styles.sr}>{name}</span></span>}
