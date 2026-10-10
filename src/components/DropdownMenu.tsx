import React from 'react';
import { Menu, UnstyledButton } from '@mantine/core';
import { ControlTarget } from './ui/ControlTarget';
import styles from './ui/CrmControls.module.css';

export function DropdownMenu({ children, open, onOpenChange }: { children: React.ReactNode; open?: boolean; onOpenChange?: (open: boolean) => void }) {
  const content = React.Children.toArray(children).find(child => React.isValidElement(child) && child.type === DropdownMenuContent) as React.ReactElement<{ align?: string; sideOffset?: number }> | undefined;
  return <Menu opened={open} onChange={onOpenChange} withinPortal zIndex={440} shadow="md" position={content?.props.align === 'end' ? 'bottom-end' : 'bottom-start'} offset={content?.props.sideOffset ?? 4} classNames={{ dropdown: styles.dropdown, item: styles.option, itemLabel: styles.menuLabel }}>{children}</Menu>;
}
export const DropdownMenuTrigger = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean }>(({ asChild, ...props }, ref) =>
  <Menu.Target>{asChild ? <ControlTarget {...props} ref={ref} /> : <UnstyledButton {...props} ref={ref} type={props.type ?? 'button'} />}</Menu.Target>,
);
export const DropdownMenuContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement> & { align?: 'start' | 'center' | 'end'; sideOffset?: number }>(({ align, sideOffset, ...props }, ref) => <Menu.Dropdown {...props} ref={ref} miw={200} />);
interface ItemProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onSelect'> { asChild?: boolean; inset?: boolean; onSelect?: (event: React.MouseEvent<HTMLButtonElement>) => void }
export const DropdownMenuItem = React.forwardRef<HTMLButtonElement, ItemProps>(({ asChild, inset, children, onSelect, onClick, ...props }, ref) => {
  const child = asChild && React.isValidElement<Record<string, unknown>>(children) ? children : null;
  return <Menu.Item {...props} ref={ref} onClick={event => { onClick?.(event); if (!event.defaultPrevented) onSelect?.(event); }}
    renderRoot={child ? rootProps => <ControlTarget {...rootProps}>{React.cloneElement(child, { children: rootProps.children })}</ControlTarget> : undefined}>{child ? child.props.children as React.ReactNode : children}</Menu.Item>;
});
export function DropdownMenuCheckboxItem({ checked, onCheckedChange, children, onSelect, inset, ...props }: Omit<ItemProps, 'asChild' | 'onChange' | 'value' | 'defaultValue'> & { checked?: boolean; onCheckedChange?: (checked: boolean) => void }) {
  return <Menu.CheckboxItem {...props} checked={checked} onChange={onCheckedChange} closeMenuOnClick onClick={event => { props.onClick?.(event); if (!event.defaultPrevented) onSelect?.(event); }}>{children}</Menu.CheckboxItem>;
}
export const DropdownMenuLabel = Menu.Label;
export const DropdownMenuSeparator = Menu.Divider;
