import { forwardRef, type SelectHTMLAttributes } from 'react';
import { NativeSelect as MantineNativeSelect } from '@mantine/core';
import styles from './ui/CrmControls.module.css';

/** Mantine field retaining native option values and change events. */
export const NativeSelect = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, size, ...props }, ref) => <MantineNativeSelect {...props} ref={ref}
    classNames={{ root: styles.field, input: [styles.input, className].filter(Boolean).join(' ') }} />,
);
NativeSelect.displayName = 'NativeSelect';
