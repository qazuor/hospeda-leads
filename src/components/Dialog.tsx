import React, { createContext, useContext, useId, useState, useRef, useEffect } from 'react';
import { Box, CloseButton, Modal, Text, Title } from '@mantine/core';
import { ControlTarget } from './ui/ControlTarget';
import { Button } from './Button';
import styles from './Dialog.module.css';

export interface DialogProps { children?: React.ReactNode; open?: boolean; defaultOpen?: boolean; onOpenChange?: (open: boolean) => void; modal?: boolean }
const Context = createContext<{ open: boolean; change: (open: boolean) => void; titleId: string; opener: React.RefObject<HTMLElement | null> } | null>(null);
const InlineContext = createContext(false);
function ModalSurface({ children }: { children: React.ReactNode }) { return <>{children}</>; }
function useDialog() { const value = useContext(Context); if (!value) throw new Error('Dialog control requires Dialog'); return value; }
export function Dialog({ children, open, defaultOpen = false, onOpenChange }: DialogProps) {
  const [local, setLocal] = useState(defaultOpen); const titleId = useId(); const opener = useRef<HTMLElement | null>(null);
  const change = (next: boolean) => { if (next) opener.current = document.activeElement as HTMLElement; setLocal(next); onOpenChange?.(next); };
  return <Context.Provider value={{ open: open ?? local, change, titleId, opener }}>{children}</Context.Provider>;
}
interface TriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> { asChild?: boolean }
export const DialogTrigger = React.forwardRef<HTMLButtonElement, TriggerProps>(({ asChild, onClick, ...props }, ref) => {
  const ctx = useDialog(); const Comp = asChild ? ControlTarget : Button;
  return <Comp {...props} ref={ref} onClick={event => { onClick?.(event as React.MouseEvent<HTMLButtonElement>); if (!event.defaultPrevented) ctx.change(true); }} />;
});
export const DialogClose = React.forwardRef<HTMLButtonElement, TriggerProps>(({ asChild, onClick, ...props }, ref) => {
  const ctx = useDialog(); const Comp = asChild ? ControlTarget : Button;
  return <Comp {...props} ref={ref} onClick={event => { onClick?.(event as React.MouseEvent<HTMLButtonElement>); if (!event.defaultPrevented) ctx.change(false); }} />;
});
interface ContentProps extends React.HTMLAttributes<HTMLDivElement> {
  inline?: boolean; fullScreen?: boolean; showCloseButton?: boolean; container?: HTMLElement | null;
  onEscapeKeyDown?: (event: Event) => void; onInteractOutside?: (event: Event) => void;
  onOpenAutoFocus?: (event: Event) => void; onCloseAutoFocus?: (event: Event) => void;
}
export const DialogContent = React.forwardRef<HTMLDivElement, ContentProps>(({
  className, children, container, inline = false, fullScreen = false, showCloseButton = true,
  onEscapeKeyDown, onInteractOutside, onOpenAutoFocus, onCloseAutoFocus, ...props
}, ref) => {
  const ctx = useDialog();
  const opener = useRef(typeof document === 'undefined' ? null : document.activeElement as HTMLElement);
  const wasInline = useRef(inline);
  useEffect(() => () => {
    if (wasInline.current) return;
    window.setTimeout(() => {
      if (document.activeElement !== document.body || document.querySelector('[role="dialog"]')) return;
      const event = new Event('focus', { cancelable: true }); closingFocus.current?.(event);
      if (!event.defaultPrevented && opener.current?.isConnected) opener.current.focus({ preventScroll: true });
    }, 10);
  }, []);
  const initialFocus = useRef(onOpenAutoFocus); initialFocus.current = onOpenAutoFocus;
  useEffect(() => {
    if (!ctx.open || inline || !initialFocus.current) return;
    const frame = requestAnimationFrame(() => initialFocus.current?.(new Event('focus', { cancelable: true })));
    return () => cancelAnimationFrame(frame);
  }, [ctx.open, inline]);
  const closingFocus = useRef(onCloseAutoFocus); closingFocus.current = onCloseAutoFocus;
  useEffect(() => {
    if (!ctx.open || inline || !fullScreen) return;
    return () => { requestAnimationFrame(() => { if (!document.querySelector('[role="dialog"]')) closingFocus.current?.(new Event('focus', { cancelable: true })); }); };
  }, [ctx.open, inline, fullScreen]);
  // Mantine owns focus trapping, scroll locking, portals and modal stacking.
  const close = () => ctx.change(false);
  const guard = (handler: ((event: Event) => void) | undefined) => { const event = new Event('dismiss', { cancelable: true }); handler?.(event); return !event.defaultPrevented; };
  useEffect(() => {
    if (!ctx.open || inline || !onEscapeKeyDown) return;
    const listener = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.stopImmediatePropagation(); if (guard(onEscapeKeyDown)) close(); } };
    document.addEventListener('keydown', listener, true);
    return () => document.removeEventListener('keydown', listener, true);
  }, [ctx.open, inline, onEscapeKeyDown, ctx.change]);

  const focus = () => { const event = new Event('focus', { cancelable: true }); onOpenAutoFocus?.(event); };
  if (inline) return <InlineContext.Provider value><Box {...props} ref={ref} className={className}>{children}</Box></InlineContext.Provider>;
  return <InlineContext.Provider value={false}><Modal.Root opened={ctx.open} onClose={close} size="auto" centered fullScreen={fullScreen} scrollAreaComponent={ModalSurface}
    transitionProps={{ duration: 0 }} zIndex={410} portalProps={container ? { target: container } : undefined}
    closeOnEscape={!onEscapeKeyDown} closeOnClickOutside={!onInteractOutside}
    onEnterTransitionEnd={focus} returnFocus={!onCloseAutoFocus}
    onExitTransitionEnd={() => { const event = new Event('focus', { cancelable: true }); onCloseAutoFocus?.(event); }}>
    <Modal.Overlay onClick={onInteractOutside ? () => { if (guard(onInteractOutside)) close(); } : undefined} />
    <Modal.Content {...props} ref={ref} classNames={{ content: [styles.content, className].filter(Boolean).join(' ') }}>
      {children}
      {showCloseButton && <CloseButton aria-label="Cerrar" className={styles.close} size="lg" onClick={close} />}
    </Modal.Content>
  </Modal.Root></InlineContext.Provider>;
});
DialogContent.displayName = 'DialogContent';
export function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) { return <Box {...props} className={[styles.header, className].filter(Boolean).join(' ')} />; }
export function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) { return <Box {...props} className={[styles.footer, className].filter(Boolean).join(' ')} />; }
export const DialogTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(({ className, ...props }, ref) => {
  const ctx = useDialog(); const inline = useContext(InlineContext);
  return inline ? <Title {...props} ref={ref} order={2} id={ctx.titleId} className={[styles.title, className].filter(Boolean).join(' ')} /> : <Modal.Title {...props} ref={ref} className={[styles.title, className].filter(Boolean).join(' ')} />;
});
export const DialogDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(({ className, ...props }, ref) => <Text {...props} component="p" ref={ref} className={[styles.description, className].filter(Boolean).join(' ')} />);
