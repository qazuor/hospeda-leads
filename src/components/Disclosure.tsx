import React, { useEffect, useRef, useState } from 'react';
import { Accordion } from '@mantine/core';
import styles from './Disclosure.module.css';

export function DisclosureSummary({ children }: React.HTMLAttributes<HTMLButtonElement>) { return <>{children}</>; }
type FormField = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
/**
 * Mantine Accordion with optional programmatic opening and independent user toggling.
 * A required field inside a closed Disclosure opens it when the form fails validation (like a native <details>) and, when it is the form's first invalid control, receives focus once the panel is visible.
 * `onOpenChange` reports every change (user, programmatic or invalid field) so a parent that drives `open` stays in sync.
 */
export function Disclosure({ children, open = false, onOpenChange, ...props }: Omit<React.HTMLAttributes<HTMLDivElement>, 'defaultValue' | 'onChange'> & { open?: boolean; onOpenChange?: (open: boolean) => void }) {
  const [value, setValueState] = useState<string | null>(open ? 'content' : null);
  const notify = useRef(onOpenChange); notify.current = onOpenChange;
  const setValue = (next: string | null) => { setValueState(next); notify.current?.(next !== null); };
  useEffect(() => { setValueState(open ? 'content' : null); }, [open]);
  const reveal = (event: React.FormEvent<HTMLDivElement>) => {
    if (value) return;
    const field = event.target as FormField;
    setValue('content');
    const first = Array.from(field.form?.elements ?? []).find(item => (item as FormField).willValidate && !(item as FormField).validity.valid);
    // The panel is display:none until it opens, so the field cannot take focus yet.
    if (first === field) setTimeout(() => { field.focus({ preventScroll: true }); field.scrollIntoView?.({ block: 'center' }); }, 60);
  };
  const elements = React.Children.toArray(children);
  const summary = elements.find(child => React.isValidElement(child) && child.type === DisclosureSummary) as React.ReactElement<React.HTMLAttributes<HTMLButtonElement>> | undefined;
  const body = elements.filter(child => child !== summary);
  return <Accordion {...props} onInvalidCapture={reveal} className={[styles.root,props.className].filter(Boolean).join(' ')} classNames={{item:styles.item,control:styles.control,label:styles.label,chevron:styles.chevron,content:styles.content}} value={value} onChange={setValue} data-disclosure data-open={value ? '' : undefined} variant="contained">
    <Accordion.Item value="content"><Accordion.Control {...summary?.props} data-disclosure-control style={{ minHeight: 44, ...summary?.props.style }}>{summary?.props.children}</Accordion.Control><Accordion.Panel data-disclosure-panel>{body}</Accordion.Panel></Accordion.Item>
  </Accordion>;
}
