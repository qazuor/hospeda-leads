import React from 'react';
import { Button, type ButtonProps } from '@mantine/core';
import styles from './CrmControls.module.css';
import {DisabledTooltip,warnMissingReason} from '../Tooltip';

type Props = ButtonProps & React.ComponentPropsWithoutRef<'button'> & {disabledReason?:string};
export const CrmButton = React.forwardRef<HTMLButtonElement, Props>(function CrmButton(
  { type = 'button', disabled, loading, disabledReason, ...props }, ref,
) {
  const button=<Button {...props} ref={ref} type={type} loading={loading}
    disabled={disabled || loading} classNames={{ root: styles.button, inner: styles.buttonInner, label: styles.buttonLabel }} />;
  const off=!!(disabled||loading);
  const reason=disabledReason??(loading?'La operación está en curso. Esperá a que termine para continuar.':undefined);
  if(off&&!reason)warnMissingReason(typeof props.children==='string'?props.children:'CrmButton');
  return <DisabledTooltip disabled={off} reason={reason}>{button}</DisabledTooltip>;
});
