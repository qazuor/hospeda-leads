import {AtSign,Globe,Instagram,MessageCircle,Phone,type LucideIcon} from 'lucide-react';
import styles from './BusinessChannel.module.css';

/** Channel kinds shown with an icon in the business list and its preview. */
export type BusinessChannelKind='phone'|'email'|'whatsapp'|'instagram'|'web';
const channelMeta:Record<BusinessChannelKind,{label:string;Icon:LucideIcon}>={phone:{label:'Teléfono',Icon:Phone},email:{label:'Email',Icon:AtSign},whatsapp:{label:'WhatsApp',Icon:MessageCircle},instagram:{label:'Instagram',Icon:Instagram},web:{label:'Web',Icon:Globe}};

/** One contact channel: icon plus its visible value; red with «No contactar» when the business is restricted. */
export function BusinessChannel({kind,value,blocked}:{kind:BusinessChannelKind;value:unknown;blocked:boolean}){
 if(value==null||value==='')return <>—</>;
 const {label,Icon}=channelMeta[kind],text=String(value);
 return <span className={styles.channel} data-blocked={blocked||undefined} title={`${label}: ${text}${blocked?' · No contactar':''}`}><Icon size={15} role="img" aria-label={label}/><span className={styles.value}>{text}</span>{blocked&&<span className={styles.blocked}>No contactar</span>}</span>;
}
