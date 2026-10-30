import {useState} from 'react';
import {Link} from 'react-router-dom';
import {CircleHelp} from 'lucide-react';
import {Popover,PopoverContent,PopoverTrigger} from './Popover';
import {HELP_HINTS,type HelpHintKey} from '../content/helpHints';
import styles from './HelpLink.module.css';

const topics={today:'routine',inbox:'inbox-overview',businesses:'business',managements:'management-list',record:'business-states',analytics:'management-list',history:'basics',archived:'archive',trash:'archive',templates:'message',documents:'documents',salesMaterial:'sales-material',reactivation:'reactivation',settings:'settings',guide:'screens',inbound:'inbound-unmatched',userscript:'install-userscript',filters:'management-list',columns:'management-list',board:'management-list',communication:'inbox-overview',businessTasks:'plan',businessHistory:'basics',nextStep:'management-list',stage:'management-list',newSale:'new-sale',logResult:'record'} as const;
export type HelpTopic=keyof typeof topics;
/** Small «?» that opens a placement-specific explanation; `topic` picks the guide article and `hint` (defaults to `topic`) picks the text. */
export function HelpLink({topic,hint}:{topic:HelpTopic;hint?:HelpHintKey}){const [open,setOpen]=useState(false),to='/guide#'+topics[topic];return <Popover open={open} onOpenChange={setOpen}><PopoverTrigger asChild><a className={styles.link} href={to} aria-label="Cómo funciona" onClick={event=>{event.preventDefault();setOpen(value=>!value);}}><CircleHelp size={15}/></a></PopoverTrigger><PopoverContent style={{maxWidth:320}}><p style={{margin:'0 0 8px'}}>{HELP_HINTS[hint??topic]}</p><Link to={to} onClick={()=>setOpen(false)}>Ver en la guía</Link></PopoverContent></Popover>}
