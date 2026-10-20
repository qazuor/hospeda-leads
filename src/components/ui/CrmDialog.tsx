import {useDialogLayer} from '../../helpers/useDialogLayer';
import React, { useEffect, useId, useRef } from 'react';
import { Drawer, Modal } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { pickerOpen } from '../Dialog';
import styles from './CrmControls.module.css';

type Props = {
  opened: boolean; onClose: () => void; title: string;
  description?: React.ReactNode; children: React.ReactNode; busy?: boolean;
  returnFocusTo?: HTMLElement | null;
};

export function CrmDialog({ opened, onClose, title, description, children, busy = false, returnFocusTo }: Props) {
  const mobile = useMediaQuery('(max-width: 600px)', false, { getInitialValueInEffect: false });
  const descriptionId = useId();
  const layer=useDialogLayer(opened);
  // These callers unmount dialogs instead of toggling `opened` to false.
  // Capture the opener before autofocus and defer restoration until removal.
  const opener = useRef(returnFocusTo ?? (typeof document === 'undefined' ? null : document.activeElement as HTMLElement));
  useEffect(() => () => {
    window.setTimeout(() => {
      if (opener.current?.isConnected && document.activeElement === document.body
        && !document.querySelector('[role="dialog"][aria-modal="true"]')) {
        opener.current.focus({ preventScroll: true });
      }
    }, 10);
  }, []);
  // Escape closes an open picker or dropdown first (Mantine handles it), so what was typed is not lost; the dialog only reacts once nothing floats above it.
  const dismissible = layer.active && !busy;
  const closeRef = useRef(onClose); closeRef.current = onClose;
  useEffect(() => {
    if (!opened || !dismissible) return;
    const listener = (event: KeyboardEvent) => { if (event.key !== 'Escape' || event.isComposing || pickerOpen(event)) return; event.stopImmediatePropagation(); closeRef.current(); };
    document.addEventListener('keydown', listener, true);
    return () => document.removeEventListener('keydown', listener, true);
  }, [opened, dismissible]);
  const shared = {
    opened, onClose: () => { if (!busy) onClose(); }, title,
    withOverlay: true, overlayProps: { backgroundOpacity: 0.62, blur: 2, className: 'crm-dialog-overlay' },
    closeOnClickOutside: layer.active&&!busy, closeOnEscape: false, withCloseButton: !busy,
    closeButtonProps: { 'aria-label': 'Cerrar' },
    zIndex: layer.zIndex, trapFocus: layer.active, returnFocus: true,
    'aria-describedby': description ? descriptionId : undefined,
  };
  const content = <>
    {description && <p id={descriptionId} className={styles.description}>{description}</p>}
    {children}
  </>;
  const classNames = { content: styles.content, header: styles.header,
    title: styles.title, body: styles.body, close: styles.close };
  return mobile
    ? <Drawer {...shared} position="bottom" size="90dvh"
        classNames={{ ...classNames, content: `${styles.content} ${styles.drawerContent}`,
          body: `${styles.body} ${styles.drawerBody}` }}>{content}</Drawer>
    : <Modal {...shared} centered size={640}
        classNames={{ ...classNames, content: `${styles.content} ${styles.modalContent}` }}>{content}</Modal>;
}
