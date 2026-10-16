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
  return <DisabledTooltip reason={disabledReason??(loading?'La operación está en curso. Esperá a que termine para continuar.':'Completá los campos obligatorios o resolvé las condiciones indicadas en pantalla para habilitar esta acción.')}>{button}</DisabledTooltip>;
});
