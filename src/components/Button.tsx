import React from 'react';
import { Button as MantineButton } from '@mantine/core';
import styles from './ui/CrmControls.module.css';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'outline' | 'ghost' | 'link' | 'secondary' | 'destructive';
  size?: 'sm' | 'md' | 'lg' | 'icon' | 'icon-sm' | 'icon-md' | 'icon-lg';
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ children, variant = 'primary', size = 'md', asChild = false, type = 'button', ...props }, ref) => {
    const icon = size.startsWith('icon');
    const child = asChild && React.isValidElement<Record<string, unknown>>(children) ? children : null;
    return <MantineButton {...props} ref={ref} type={type}
      variant={variant === 'outline' ? 'outline' : variant === 'ghost' || variant === 'link' ? 'subtle' : variant === 'secondary' ? 'light' : 'filled'}
      color={variant === 'destructive' ? 'red' : undefined}
      size={size === 'lg' || size === 'icon-lg' ? 'lg' : size === 'sm' || size === 'icon-sm' ? 'sm' : 'md'}
      classNames={{ root: styles.button, label: styles.buttonLabel }}
      w={icon ? 44 : undefined} px={icon ? 0 : size === 'sm' ? 8 : undefined}
      renderRoot={child ? rootProps => React.cloneElement(child, { ...rootProps, ...child.props, className: [rootProps.className, child.props.className].filter(Boolean).join(' '), children: rootProps.children }) : undefined}
    >{child ? child.props.children as React.ReactNode : children}</MantineButton>;
  },
);
Button.displayName = 'Button';
