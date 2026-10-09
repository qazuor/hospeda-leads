import type {ReactNode} from 'react';
import {NativeSelect} from '../NativeSelect';
import styles from './CrmResponsiveNavigation.module.css';

/** The same destinations use tabs on desktop and a fully labelled selector on mobile. */
export function CrmResponsiveNavigation({label,value,options,onChange,disabled,children}:{label:string;value:string;options:{value:string;label:string}[];onChange:(value:string)=>void;disabled?:boolean;children:ReactNode}) {
  return <div className={styles.root}><div className={styles.desktop}>{children}</div><label className={styles.mobile}>{label}<NativeSelect aria-label={label} value={value} disabled={disabled} onChange={event=>onChange(event.target.value)}>{options.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}</NativeSelect></label></div>;
}
