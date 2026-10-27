import type {ReactNode} from 'react';
import {HelpLink,type HelpTopic} from './HelpLink';
import styles from './ui/CrmLayout.module.css';

export function PageHeader({eyebrow,title,description,topic,actions}:{eyebrow:string;title:string;description:string;topic:HelpTopic;actions?:ReactNode}){return <header className={styles.pageHeading}><div><span className={styles.eyebrow}>{eyebrow}</span><h1 aria-label={title} className={styles.titleWithHelp}>{title}<HelpLink topic={topic}/></h1><p>{description}</p></div>{actions&&<div className={styles.pageHeaderActions}>{actions}</div>}</header>}
