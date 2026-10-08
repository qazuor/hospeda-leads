import { forwardRef, type InputHTMLAttributes } from 'react';
import { Input as MantineInput } from '@mantine/core';
import styles from './ui/CrmControls.module.css';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, size, ...props }, ref) => <MantineInput {...props} data-autofocus={props.autoFocus || undefined} ref={ref}
    classNames={{ wrapper: styles.field, input: [styles.input, className].filter(Boolean).join(' ') }} />,
);
Input.displayName = 'Input';
