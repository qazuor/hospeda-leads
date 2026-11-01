import { forwardRef, useEffect, useRef, type SelectHTMLAttributes } from 'react';
import { NativeSelect as MantineNativeSelect } from '@mantine/core';
import styles from './ui/CrmControls.module.css';
import { useInlineInvalid } from './ui/useInlineInvalid';

/** Mantine field retaining native option values and change events. */
export const NativeSelect = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, size, ...props }, ref) => { const invalid = useInlineInvalid<HTMLSelectElement>(props);
    // Mantine owns aria-describedby (its error id), so the caller's own description is merged on the node itself.
    const node = useRef<HTMLSelectElement | null>(null), linked = useRef<string | undefined>(undefined), extra = props['aria-describedby'];
    const setRef = (element: HTMLSelectElement | null) => { node.current = element; if (typeof ref === 'function') ref(element); else if (ref) ref.current = element; };
    useEffect(() => { const n = node.current; if (!n) return; const ids = new Set((n.getAttribute('aria-describedby') ?? '').split(' ').filter(Boolean)); if (linked.current && linked.current !== extra) ids.delete(linked.current); if (extra) ids.add(extra); linked.current = extra; if (ids.size) n.setAttribute('aria-describedby', [...ids].join(' ')); else n.removeAttribute('aria-describedby'); });
    return <MantineNativeSelect {...props} error={invalid.error} onInvalid={invalid.onInvalid} onChange={invalid.onChange} onInput={invalid.onInput} onBlur={invalid.onBlur} data-autofocus={props.autoFocus || undefined} ref={setRef}
    classNames={{ root: styles.field, input: [styles.input, className].filter(Boolean).join(' ') }} />; },
);
NativeSelect.displayName = 'NativeSelect';
