import React, { useEffect, useId, useRef } from 'react';
import { Drawer, Modal } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import styles from './CrmControls.module.css';

type Props = {
  opened: boolean; onClose: () => void; title: string;
  description?: React.ReactNode; children: React.ReactNode; busy?: boolean;
  returnFocusTo?: HTMLElement | null;
};

export function CrmDialog({ opened, onClose, title, description, children, busy = false, returnFocusTo }: Props) {
  const mobile = useMediaQuery('(max-width: 600px)', false, { getInitialValueInEffect: false });
  const descriptionId = useId();
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
  const shared = {
    opened, onClose: () => { if (!busy) onClose(); }, title,
    closeOnClickOutside: !busy, closeOnEscape: !busy, withCloseButton: !busy,
    closeButtonProps: { 'aria-label': 'Cerrar' },
    zIndex: 410, trapFocus: true, returnFocus: true,
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
