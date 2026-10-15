import React from 'react';
import { Button as MantineButton } from '@mantine/core';
import styles from './ui/CrmControls.module.css';
import {DisabledTooltip} from './Tooltip';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'outline' | 'ghost' | 'link' | 'secondary' | 'destructive';
  size?: 'sm' | 'md' | 'lg' | 'icon' | 'icon-sm' | 'icon-md' | 'icon-lg';
  asChild?: boolean;
  disabledReason?: string;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ children, variant = 'primary', size = 'md', asChild = false, type = 'button', disabledReason, disabled, ...props }, ref) => {
    const icon = size.startsWith('icon');
    const child = asChild && React.isValidElement<Record<string, unknown>>(children) ? children : null;
    const label=React.Children.toArray(children).filter((item):item is string|number=>typeof item==='string'||typeof item==='number').join(' ').trim();
    const reason=disabledReason??(label==='Anterior'?'Ya estás en la primera página.':label==='Siguiente'?'Ya estás en la última página.':/^(Guardando|Enviando|Cargando|Actualizando|Eliminando|Restaurando|Importando|Procesando|Convirtiendo|Duplicando|Levantando|Redistribuyendo)/i.test(label)?'La operación está en curso. Esperá a que termine para continuar.':'Completá los campos obligatorios o resolvé las condiciones indicadas en pantalla para habilitar esta acción.');
    const button=<MantineButton {...props} disabled={disabled} ref={ref} type={type}
      variant={variant === 'outline' ? 'outline' : variant === 'ghost' || variant === 'link' ? 'subtle' : variant === 'secondary' ? 'light' : 'filled'}
      color={variant === 'destructive' ? 'red' : undefined}
      size={size === 'lg' || size === 'icon-lg' ? 'lg' : size === 'sm' || size === 'icon-sm' ? 'sm' : 'md'}
      classNames={{ root: styles.button, inner: styles.buttonInner, label: styles.buttonLabel }}
      w={icon ? 44 : undefined} px={icon ? 0 : size === 'sm' ? 8 : undefined}
      renderRoot={child ? rootProps => React.cloneElement(child, { ...rootProps, ...child.props, className: [rootProps.className, child.props.className].filter(Boolean).join(' '), children: rootProps.children }) : undefined}
    >{child ? child.props.children as React.ReactNode : children}</MantineButton>;
    if(!disabled)return button;
    return <DisabledTooltip reason={reason}>{button}</DisabledTooltip>;
  },
);
Button.displayName = 'Button';
