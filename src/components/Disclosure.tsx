import React, { useEffect, useState } from 'react';
import { Accordion } from '@mantine/core';

export function DisclosureSummary({ children }: React.HTMLAttributes<HTMLButtonElement>) { return <>{children}</>; }
/** Mantine Accordion with optional programmatic opening and independent user toggling. */
export function Disclosure({ children, open = false, ...props }: Omit<React.HTMLAttributes<HTMLDivElement>, 'defaultValue' | 'onChange'> & { open?: boolean }) {
  const [value, setValue] = useState<string | null>(open ? 'content' : null);
  useEffect(() => { setValue(open ? 'content' : null); }, [open]);
  const elements = React.Children.toArray(children);
  const summary = elements.find(child => React.isValidElement(child) && child.type === DisclosureSummary) as React.ReactElement<React.HTMLAttributes<HTMLButtonElement>> | undefined;
  const body = elements.filter(child => child !== summary);
  return <Accordion {...props} value={value} onChange={setValue} data-disclosure data-open={value ? '' : undefined} variant="contained">
    <Accordion.Item value="content"><Accordion.Control {...summary?.props} data-disclosure-control style={{ minHeight: 44, ...summary?.props.style }}>{summary?.props.children}</Accordion.Control><Accordion.Panel data-disclosure-panel>{body}</Accordion.Panel></Accordion.Item>
  </Accordion>;
}
