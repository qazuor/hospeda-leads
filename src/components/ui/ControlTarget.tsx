import React from 'react';
import { mergeRefs } from '@mantine/hooks';

/** Composition only: preserves the child's handlers, classes and forwarded ref. */
export const ControlTarget = React.forwardRef<HTMLElement, React.HTMLAttributes<HTMLElement>>(
  ({ children, ...props }, ref) => {
    const child = React.Children.only(children) as React.ReactElement<Record<string, unknown>>;
    const merged: Record<string, unknown> = { ...props, ...child.props };
    for (const name of Object.keys(props)) {
      if (/^on[A-Z]/.test(name) && typeof child.props[name] === 'function' && typeof props[name as keyof typeof props] === 'function') {
        const childHandler = child.props[name] as (event: React.SyntheticEvent) => void;
        const handler = props[name as keyof typeof props] as (event: React.SyntheticEvent) => void;
        merged[name] = (event: React.SyntheticEvent) => { childHandler(event); if (!event.defaultPrevented) handler(event); };
      }
    }
    merged.className = [props.className, child.props.className].filter(Boolean).join(' ') || undefined;
    merged.ref = mergeRefs(ref, child.props.ref as React.Ref<HTMLElement>);
    return React.cloneElement(child, merged);
  },
);
ControlTarget.displayName = 'ControlTarget';
