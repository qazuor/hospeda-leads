import {useDialogLayer} from '../helpers/useDialogLayer';
import {useCallbackRef} from '../helpers/useCallbackRef';
import React, { createContext, useContext, useId, useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Box, CloseButton, Modal, Text, Title } from '@mantine/core';
import { ControlTarget } from './ui/ControlTarget';
import { useReducedMotion } from '@mantine/hooks';
import { Button } from './Button';
import styles from './Dialog.module.css';

export interface DialogProps { children?: React.ReactNode; open?: boolean; defaultOpen?: boolean; onOpenChange?: (open: boolean) => void; modal?: boolean }
const Context = createContext<{ open: boolean; change: (open: boolean) => void; titleId: string; opener: React.RefObject<HTMLElement | null>; hasOpenChild: boolean; registerChild: (token: symbol, open: boolean) => void } | null>(null);
const FLOATING = '.mantine-Popover-dropdown,.mantine-Menu-dropdown,.mantine-Combobox-dropdown,.mantine-Select-dropdown';
const InlineContext = createContext(false);
function ModalSurface({ children }: { children: React.ReactNode }) { return <>{children}</>; }
/** A dropdown counts as open when it is rendered, not faded out, and its trigger (when it has one) is not collapsed; Mantine leaves closed menus mounted. */
function isOpenFloating(item: HTMLElement) {
  if (item.checkVisibility ? !item.checkVisibility() : getComputedStyle(item).display === 'none') return false;
  if (getComputedStyle(item).opacity === '0') return false;
  const trigger = item.getAttribute('aria-labelledby'); return !(trigger && document.getElementById(trigger)?.getAttribute('aria-expanded') === 'false');
}
/** True when an Escape belongs to an open picker, menu or dropdown (which closes first) and not to the dialog beneath it. Shared by both dialog components. */
export function pickerOpen(event: KeyboardEvent) {
  if (event.defaultPrevented || (event.target as Element | null)?.closest?.(FLOATING + ',[data-picker-open="true"]')) return true;
  return Array.from(document.querySelectorAll<HTMLElement>(FLOATING)).some(isOpenFloating);
}
function useDialog() { const value = useContext(Context); if (!value) throw new Error('Dialog control requires Dialog'); return value; }
export function useDialogState() { return useDialog(); }
export function Dialog({ children, open, defaultOpen = false, onOpenChange }: DialogProps) {
  const parent = useContext(Context);
  const [local, setLocal] = useState(defaultOpen); const titleId = useId(); const opener = useRef<HTMLElement | null>(null);
  const [childrenOpen, setChildrenOpen] = useState<Set<symbol>>(() => new Set());
  const token = useRef(Symbol('dialog')); const actualOpen = open ?? local;
  const registerChild = useCallback((child: symbol, childOpen: boolean) => {
    setChildrenOpen(current => {
      if (current.has(child) === childOpen) return current;
      const next = new Set(current); if (childOpen) next.add(child); else next.delete(child); return next;
    });
  }, []);
  const parentRegister = parent?.registerChild;
  useEffect(() => {
    if (!actualOpen || !parentRegister) return;
    parentRegister(token.current, true);
    return () => parentRegister(token.current, false);
  }, [actualOpen, parentRegister]);
  const hasOpenChild = childrenOpen.size > 0;
  const change = useCallbackRef((next: boolean) => {
    if (!next && hasOpenChild) return;
    if (next) opener.current = document.activeElement as HTMLElement;
    setLocal(next); onOpenChange?.(next);
  });
  // A stable value keeps re-renders of the owner from rescanning large dialog bodies (e.g. the business list) for context consumers.
  const value = useMemo(() => ({ open: actualOpen, change, titleId, opener, hasOpenChild, registerChild }), [actualOpen, change, titleId, hasOpenChild, registerChild]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
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
  /** Opens as a right-side panel (full screen on phones) with sticky title and footer: for long create/edit forms; short confirmations stay centered. */
  side?: boolean;
  onEscapeKeyDown?: (event: Event) => void; onInteractOutside?: (event: Event) => void;
  /** Hides the page behind the dialog completely (e.g. re-login, where the previous page may hold another user's data). */
  opaqueOverlay?: boolean;
  onOpenAutoFocus?: (event: Event) => void; onCloseAutoFocus?: (event: Event) => void;
}
export const DialogContent = React.forwardRef<HTMLDivElement, ContentProps>(({
  className, children, container, inline = false, fullScreen = false, showCloseButton = true, side = false,
  onEscapeKeyDown, onInteractOutside, onOpenAutoFocus, onCloseAutoFocus, opaqueOverlay = false, ...props
}, ref) => {
  const ctx = useDialog();
  const reduceMotion = useReducedMotion();
  const layer=useDialogLayer(ctx.open&&!inline);
  const opener = useRef(typeof document === 'undefined' ? null : document.activeElement as HTMLElement);
  const wasInline = useRef(inline);
  useEffect(() => () => {
    if (wasInline.current) return;
    window.setTimeout(() => {
      if (typeof document === 'undefined') return;
      // The parent trap reactivates when a child unmounts. Restore an explicit
      // target after its autofocus timer, including targets inside that parent.
      const event = new Event('focus', { cancelable: true }); closingFocus.current?.(event);
      if (event.defaultPrevented) return;
      if (document.activeElement !== document.body || document.querySelector('[role="dialog"]')) return;
      if (opener.current?.isConnected) opener.current.focus({ preventScroll: true });
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
  // Escape closes an open picker or dropdown first (Mantine handles it); the dialog only reacts once nothing is floating above it.
  const guard = (handler: ((event: Event) => void) | undefined) => { const event = new Event('dismiss', { cancelable: true }); handler?.(event); return !event.defaultPrevented; };
  useEffect(() => {
    if (!ctx.open || inline || !layer.active || ctx.hasOpenChild) return;
    const listener = (event: KeyboardEvent) => { if (event.key === 'Escape') { if (pickerOpen(event)) return; event.stopImmediatePropagation(); if (guard(onEscapeKeyDown)) close(); } };
    document.addEventListener('keydown', listener, true);
    return () => document.removeEventListener('keydown', listener, true);
  }, [ctx.open, inline, onEscapeKeyDown, ctx.change, ctx.hasOpenChild, layer.active]);

  const focus = () => { const event = new Event('focus', { cancelable: true }); onOpenAutoFocus?.(event); };
  if (inline) return <InlineContext.Provider value><Box {...props} ref={ref} className={className}>{children}</Box></InlineContext.Provider>;
  return <InlineContext.Provider value={false}><Modal.Root opened={ctx.open} onClose={close} size="auto" centered={!side} fullScreen={fullScreen} classNames={side ? { inner: styles.sideInner } : undefined} scrollAreaComponent={ModalSurface}
    transitionProps={side ? { transition: 'slide-left', duration: reduceMotion ? 0 : 220 } : { duration: 0 }} zIndex={layer.zIndex} trapFocus={layer.active} portalProps={container ? { target: container } : undefined}
    closeOnEscape={false} closeOnClickOutside={layer.active && !onInteractOutside && !ctx.hasOpenChild}
    onEnterTransitionEnd={focus} returnFocus={!onCloseAutoFocus}
    onExitTransitionEnd={() => { const event = new Event('focus', { cancelable: true }); onCloseAutoFocus?.(event); }}>
    <Modal.Overlay className="crm-dialog-overlay" data-opaque={opaqueOverlay || undefined} backgroundOpacity={opaqueOverlay ? 1 : 0.62} blur={opaqueOverlay ? 0 : 2} color={opaqueOverlay ? "var(--background)" : undefined} onClick={onInteractOutside ? () => { if (layer.active && guard(onInteractOutside)) close(); } : undefined} />
    <Modal.Content {...props} ref={ref} data-side={side || undefined} classNames={{ content: [styles.content, side ? styles.side : '', className].filter(Boolean).join(' ') }}>
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
  return inline ? <Title {...props} ref={ref} order={2} id={props.id??ctx.titleId} className={[styles.title, className].filter(Boolean).join(' ')} /> : <Modal.Title {...props} ref={ref} className={[styles.title, className].filter(Boolean).join(' ')} />;
});
export const DialogDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(({ className, ...props }, ref) => <Text {...props} component="p" ref={ref} className={[styles.description, className].filter(Boolean).join(' ')} />);
