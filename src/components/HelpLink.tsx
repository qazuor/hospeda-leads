import {CircleHelp} from 'lucide-react';
import {Popover,PopoverContent,PopoverTrigger} from './Popover';
import {HELP_HINTS,type HelpHintKey} from '../content/helpHints';
import styles from './HelpLink.module.css';

const topics={today:'routine',inbox:'inbox-overview',businesses:'business',managements:'management-list',record:'business-states',analytics:'management-list',history:'basics',archived:'archive',trash:'archive',templates:'message',library:'documents',reactivation:'reactivation',settings:'settings',guide:'screens',inbound:'inbound-unmatched',userscript:'install-userscript',filters:'management-list',columns:'management-list',board:'management-list',communication:'inbox-overview',businessTasks:'plan',businessHistory:'basics',nextStep:'management-list',stage:'management-list',newSale:'new-sale',logResult:'record'} as const;
export type HelpTopic=keyof typeof topics;
/** Small «?» that opens a placement-specific explanation; `topic` picks the guide article and `hint` (defaults to `topic`) picks the text. */
export function HelpLink({topic,hint}:{topic:HelpTopic;hint?:HelpHintKey}){return <Popover><PopoverTrigger asChild><a className={styles.link} href={'/guide#'+topics[topic]} aria-label="Cómo funciona" onClick={event=>event.preventDefault()}><CircleHelp size={15}/></a></PopoverTrigger><PopoverContent style={{maxWidth:320}}><p style={{margin:'0 0 8px'}}>{HELP_HINTS[hint??topic]}</p><a href={'/guide#'+topics[topic]}>Ver en la guía</a></PopoverContent></Popover>}
