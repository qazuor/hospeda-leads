import { forwardRef, type InputHTMLAttributes } from 'react';
import { Checkbox as MantineCheckbox } from '@mantine/core';
export type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> & { size?: number; indeterminate?: boolean };
export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, size: _size, ...props }, ref) => <MantineCheckbox {...props} data-autofocus={props.autoFocus || undefined} ref={ref} classNames={{ input: className }} />,
);
Checkbox.displayName = 'Checkbox';
