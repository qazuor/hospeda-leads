import React, { createContext, useContext, useState } from 'react';
import { Popover as MantinePopover, type PopoverProps, UnstyledButton } from '@mantine/core';
import { ControlTarget } from './ui/ControlTarget';
import styles from './ui/CrmControls.module.css';

interface ContentProps extends React.HTMLAttributes<HTMLDivElement> {
  transitionDuration?: number; removeBackgroundAndPadding?: boolean; matchTargetWidth?: boolean; align?: 'start' | 'center' | 'end'; side?: 'top' | 'bottom' | 'left' | 'right'; sideOffset?: number;
  onEscapeKeyDown?: (event: Event) => void; onInteractOutside?: (event: Event) => void; onOpenAutoFocus?: (event: Event) => void;
}
const Context = createContext({ change: (_open: boolean) => {}, opened: false });
export function Popover({ children, open, defaultOpen, onOpenChange }: { children: React.ReactNode; open?: boolean; defaultOpen?: boolean; onOpenChange?: (open: boolean) => void }) {
  const [local, setLocal] = useState(defaultOpen ?? false);
  const change = (next: boolean) => { setLocal(next); onOpenChange?.(next); };
  const content = React.Children.toArray(children).find(child => React.isValidElement(child) && child.type === PopoverContent) as React.ReactElement<ContentProps> | undefined;
  const config = content?.props; const position = `${config?.side ?? 'bottom'}${config?.align && config.align !== 'center' ? '-'+config.align : ''}` as PopoverProps['position'];
  return <Context.Provider value={{ change, opened: open ?? local }}><MantinePopover opened={open ?? local} onChange={next => {
    if (!next && config?.onInteractOutside) { const event = new Event('dismiss', { cancelable: true }); config.onInteractOutside(event); if (event.defaultPrevented) return; }
    change(next);
  }} width={config?.matchTargetWidth ? 'target' : undefined} position={position} offset={config?.sideOffset ?? 4} withinPortal floatingStrategy="fixed" middlewares={{ flip: { padding: 12 }, shift: { padding: 12, crossAxis: true, limiter: undefined }, size: { padding: 12 } }} zIndex={430} shadow="md" returnFocus
    transitionProps={config?.transitionDuration===undefined?undefined:{duration:config.transitionDuration}} trapFocus={!config?.onOpenAutoFocus} closeOnEscape={!config?.onEscapeKeyDown}>
    {children}
  </MantinePopover></Context.Provider>;
}
export const PopoverTrigger = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean }>(({ asChild, onClick, ...props }, ref) => {
  const ctx = useContext(Context);
  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => { onClick?.(event); if (!event.defaultPrevented) ctx.change(!ctx.opened); };
  return <MantinePopover.Target>{asChild ? <ControlTarget {...props} ref={ref} onClick={handleClick} /> : <UnstyledButton {...props} ref={ref} type={props.type ?? 'button'} onClick={handleClick} />}</MantinePopover.Target>;
});
PopoverTrigger.displayName = 'PopoverTrigger';
export const PopoverContent = React.forwardRef<HTMLDivElement, ContentProps>(({ className, transitionDuration, removeBackgroundAndPadding, matchTargetWidth, align, side, sideOffset, onEscapeKeyDown, onInteractOutside, onOpenAutoFocus, onKeyDown, ...props }, ref) => {
  const { change } = useContext(Context);
  return <MantinePopover.Dropdown {...props} {...(props['aria-label'] ? { 'aria-labelledby': '' } : {})} ref={ref} className={[styles.dropdown, className].filter(Boolean).join(' ')} p={removeBackgroundAndPadding ? 0 : 16}
    onKeyDown={event => { onKeyDown?.(event); if (event.key === 'Escape' && onEscapeKeyDown) { event.stopPropagation(); const dismiss = new Event('dismiss', { cancelable: true }); onEscapeKeyDown(dismiss); if (!dismiss.defaultPrevented) change(false); } }} />;
});
PopoverContent.displayName = 'PopoverContent';
