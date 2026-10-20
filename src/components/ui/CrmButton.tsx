import React from 'react';
import { Button, type ButtonProps } from '@mantine/core';
import styles from './CrmControls.module.css';
import {DisabledTooltip} from '../Tooltip';

type Props = ButtonProps & React.ComponentPropsWithoutRef<'button'> & {disabledReason?:string};
export const CrmButton = React.forwardRef<HTMLButtonElement, Props>(function CrmButton(
  { type = 'button', disabled, loading, disabledReason, ...props }, ref,
) {
  const button=<Button {...props} ref={ref} type={type} loading={loading}
    disabled={disabled || loading} classNames={{ root: styles.button, inner: styles.buttonInner, label: styles.buttonLabel }} />;
  if(!disabled&&!loading)return button;
  const reason=disabledReason??(loading?'La operación está en curso. Esperá a que termine para continuar.':undefined);
  if(!reason&&import.meta.env.DEV)console.warn('CrmButton disabled without disabledReason');
  return <DisabledTooltip reason={reason}>{button}</DisabledTooltip>;
});
