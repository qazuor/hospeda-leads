import type {ReactNode} from 'react';
import {useMediaQuery} from '@mantine/hooks';
import {Disclosure,DisclosureSummary} from '../Disclosure';
import styles from './CrmResponsiveDisclosure.module.css';

/** Supporting tools stay accessible without pushing the primary mobile content down. */
export function CrmResponsiveDisclosure({label,children}:{label:string;children:ReactNode}) {
 const mobile=useMediaQuery('(max-width:760px)',false,{getInitialValueInEffect:false});
 return mobile?<Disclosure className={styles.root}><DisclosureSummary>{label}</DisclosureSummary>{children}</Disclosure>:<div className={styles.desktop}>{children}</div>;
}
