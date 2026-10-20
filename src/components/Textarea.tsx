import { forwardRef, type TextareaHTMLAttributes } from 'react';
import { Textarea as MantineTextarea } from '@mantine/core';
import styles from './ui/CrmControls.module.css';
import { useInlineInvalid } from './ui/useInlineInvalid';

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  disableResize?: boolean;
  variant?: 'default' | 'clear';
}
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, disableResize = false, variant = 'default', style, ...props }, ref) => {
    const invalid = useInlineInvalid<HTMLTextAreaElement>(props);
    return <MantineTextarea {...props} error={invalid.error} onInvalid={invalid.onInvalid} onChange={invalid.onChange} onInput={invalid.onInput} onBlur={invalid.onBlur} data-autofocus={props.autoFocus || undefined} ref={ref} variant={variant === 'clear' ? 'unstyled' : 'default'}
      classNames={{ root: styles.field, input: [styles.input, className].filter(Boolean).join(' ') }}
      styles={{ input: { resize: disableResize ? 'none' : 'vertical', ...style } }} />;
  },
);
Textarea.displayName = 'Textarea';
