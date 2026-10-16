import { forwardRef, type InputHTMLAttributes } from 'react';
import { Checkbox as MantineCheckbox } from '@mantine/core';
import {DisabledTooltip} from './Tooltip';
export type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> & { size?: number; indeterminate?: boolean; disabledReason?:string };
export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, size: _size, disabledReason, ...props }, ref) => {
    const checkbox=<MantineCheckbox {...props} data-autofocus={props.autoFocus || undefined} ref={ref} classNames={{ input: className }} />;
    return props.disabled?<DisabledTooltip reason={disabledReason??'Esta opción está deshabilitada por el estado actual o los permisos del registro.'}>{checkbox}</DisabledTooltip>:checkbox;
  },
);
Checkbox.displayName = 'Checkbox';
