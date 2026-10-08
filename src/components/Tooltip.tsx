import React from 'react';
import { Tooltip as MantineTooltip, UnstyledButton, Box } from '@mantine/core';
import { ControlTarget } from './ui/ControlTarget';

interface ContentProps extends React.HTMLAttributes<HTMLDivElement> { side?: 'top' | 'bottom' | 'left' | 'right'; sideOffset?: number }
export function Tooltip({ children, open, onOpenChange, delayDuration = 300 }: { children: React.ReactNode; open?: boolean; onOpenChange?: (open: boolean) => void; delayDuration?: number }) {
  const elements = React.Children.toArray(children);
  const content = elements.find(child => React.isValidElement(child) && child.type === TooltipContent) as React.ReactElement<ContentProps> | undefined;
  const trigger = elements.find(child => React.isValidElement(child) && child.type === TooltipTrigger) as React.ReactElement | undefined;
  if (!trigger) return <>{children}</>;
  return <MantineTooltip label={content?.props.children} position={content?.props.side ?? 'top'} offset={content?.props.sideOffset ?? 4}
    opened={open} openDelay={delayDuration} zIndex={450} multiline maw={320} events={{ hover: true, focus: true, touch: false }}>
    <ControlTarget onMouseEnter={() => onOpenChange?.(true)} onMouseLeave={() => onOpenChange?.(false)} onFocus={() => onOpenChange?.(true)} onBlur={() => onOpenChange?.(false)}>{trigger}</ControlTarget>
  </MantineTooltip>;
}
export const TooltipTrigger = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean }>(({ asChild, ...props }, ref) =>
  asChild ? <ControlTarget {...props} ref={ref} /> : <UnstyledButton {...props} ref={ref} type={props.type ?? 'button'} />,
);
TooltipTrigger.displayName = 'TooltipTrigger';
export const TooltipContent = React.forwardRef<HTMLDivElement, ContentProps>(({ side, sideOffset, ...props }, ref) => <Box {...props} ref={ref} />);
