import { forwardRef, type TextareaHTMLAttributes } from 'react';
import { Textarea as MantineTextarea } from '@mantine/core';
import styles from './ui/CrmControls.module.css';

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  disableResize?: boolean;
  variant?: 'default' | 'clear';
}
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, disableResize = false, variant = 'default', style, ...props }, ref) =>
    <MantineTextarea {...props} ref={ref} variant={variant === 'clear' ? 'unstyled' : 'default'}
      classNames={{ root: styles.field, input: [styles.input, className].filter(Boolean).join(' ') }}
      styles={{ input: { resize: disableResize ? 'none' : 'vertical', ...style } }} />,
);
Textarea.displayName = 'Textarea';
