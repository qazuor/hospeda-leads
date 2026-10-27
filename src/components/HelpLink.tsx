import {CircleHelp} from 'lucide-react';
import {Popover,PopoverContent,PopoverTrigger} from './Popover';
import {HELP_HINTS} from '../content/helpHints';
import styles from './HelpLink.module.css';

const topics={today:'routine',inbox:'inbox-overview',businesses:'business',managements:'management-list',record:'business-states',analytics:'management-list',history:'basics',archived:'archive',trash:'archive',templates:'message',library:'documents',reactivation:'reactivation',settings:'settings',guide:'screens',inbound:'inbound-unmatched',userscript:'install-userscript',filters:'management-list',columns:'management-list',board:'management-list',communication:'inbox-overview',businessTasks:'plan',businessHistory:'basics',nextStep:'management-list',stage:'management-list'} as const;
export type HelpTopic=keyof typeof topics;
export function HelpLink({topic}:{topic:HelpTopic}){return <Popover><PopoverTrigger asChild><a className={styles.link} href={'/guide#'+topics[topic]} aria-label="Cómo funciona" onClick={event=>event.preventDefault()}><CircleHelp size={15}/></a></PopoverTrigger><PopoverContent style={{maxWidth:320}}><p style={{margin:'0 0 8px'}}>{HELP_HINTS[topic]}</p><a href={'/guide#'+topics[topic]}>Ver en la guía</a></PopoverContent></Popover>}
