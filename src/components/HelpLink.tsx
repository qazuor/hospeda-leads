import {CircleHelp} from 'lucide-react';
import {Link} from 'react-router-dom';
import {Tooltip,TooltipContent,TooltipTrigger} from './Tooltip';
import styles from './HelpLink.module.css';

const topics={today:'routine',inbox:'inbox-overview',businesses:'business',managements:'management-list',record:'business-states',analytics:'management-list',history:'basics',archived:'archive',trash:'archive',templates:'message',library:'documents',reactivation:'reactivation',settings:'settings',guide:'screens',inbound:'inbound-unmatched',userscript:'install-userscript',filters:'management-list',columns:'management-list',board:'management-list',communication:'inbox-overview',businessTasks:'plan',businessHistory:'basics',nextStep:'management-list',stage:'management-list'} as const;
export type HelpTopic=keyof typeof topics;
export function HelpLink({topic}:{topic:HelpTopic}){return <Tooltip><TooltipTrigger asChild><Link className={styles.link} to={'/guide#'+topics[topic]} aria-label="Cómo funciona"><CircleHelp size={15}/></Link></TooltipTrigger><TooltipContent>Cómo funciona</TooltipContent></Tooltip>}
