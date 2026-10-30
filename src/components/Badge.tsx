import { Badge as MantineBadge } from '@mantine/core';
import styles from './ValueBadge.module.css';
interface Props extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'primary' | 'destructive' | 'outline' | 'secondary' | 'success' | 'warning';
}
const toneClass = { primary: styles.tonePrimary, destructive: styles.toneDestructive, success: styles.toneSuccess, warning: styles.toneWarning, secondary: styles.toneNeutral, outline: styles.toneNeutral };
export function Badge({ variant = 'primary', children, className, ...props }: Props) {
  return <MantineBadge {...props} variant={variant === 'outline' ? 'outline' : 'light'} className={styles.tone + ' ' + toneClass[variant] + (className ? ' ' + className : '')}
    color={variant === 'destructive' ? 'red' : variant === 'success' ? 'green' : variant === 'warning' ? 'yellow' : variant === 'secondary' ? 'gray' : undefined}
    tt="none" style={{ height: 'auto', minHeight: 24, ...props.style }}>{children}</MantineBadge>;
}
