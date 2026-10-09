import type { HTMLAttributes, ReactNode } from 'react';
import styles from './CrmLayout.module.css';

/** Presentation only: callers keep ownership of queries and actions. */
export function CrmEmptyState({children,className,...props}:HTMLAttributes<HTMLDivElement> & {children:ReactNode}) {
  return <div {...props} className={[styles.empty,className].filter(Boolean).join(' ')}>{children}</div>;
}
