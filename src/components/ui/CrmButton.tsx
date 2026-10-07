import React from 'react';
import { Button, type ButtonProps } from '@mantine/core';
import styles from './CrmControls.module.css';

type Props = ButtonProps & React.ComponentPropsWithoutRef<'button'>;
export const CrmButton = React.forwardRef<HTMLButtonElement, Props>(function CrmButton(
  { type = 'button', disabled, loading, ...props }, ref,
) {
  return <Button {...props} ref={ref} type={type} loading={loading}
    disabled={disabled || loading} classNames={{ root: styles.button, label: styles.buttonLabel }} />;
});
