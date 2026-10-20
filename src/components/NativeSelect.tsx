import { forwardRef, type SelectHTMLAttributes } from 'react';
import { NativeSelect as MantineNativeSelect } from '@mantine/core';
import styles from './ui/CrmControls.module.css';
import { useInlineInvalid } from './ui/useInlineInvalid';

/** Mantine field retaining native option values and change events. */
export const NativeSelect = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, size, ...props }, ref) => { const invalid = useInlineInvalid<HTMLSelectElement>(props); return <MantineNativeSelect {...props} error={invalid.error} onInvalid={invalid.onInvalid} onChange={invalid.onChange} data-autofocus={props.autoFocus || undefined} ref={ref}
    classNames={{ root: styles.field, input: [styles.input, className].filter(Boolean).join(' ') }} />; },
);
NativeSelect.displayName = 'NativeSelect';
