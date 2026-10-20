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
const warned=new Set<string>();
/** Dev-only hint, once per control label, for a disabled control that explains nothing. */
export function warnMissingReason(label:string){if(!import.meta.env.DEV||warned.has(label))return;warned.add(label);console.warn(`Disabled control without disabledReason: ${label}`);}
export function DisabledTooltip({children,reason,style,disabled=true}:{children:React.ReactNode;reason?:string;style?:React.CSSProperties;disabled?:boolean}){
  // The tree never changes shape when the reason toggles, so the wrapped control keeps its DOM node and focus.
  const active=disabled&&!!reason;
  return <MantineTooltip label={reason} disabled={!active} position="top" offset={4} openDelay={300} zIndex={450} multiline maw={320} events={{hover:true,focus:true,touch:false}}>
    <span style={{display:active?'inline-flex':'contents',alignItems:'center',maxWidth:'100%',verticalAlign:'middle',...style}} tabIndex={active?0:undefined}>{children}</span>
  </MantineTooltip>;
}
export const TooltipTrigger = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean }>(({ asChild, ...props }, ref) =>
  asChild ? <ControlTarget {...props} ref={ref} /> : <UnstyledButton {...props} ref={ref} type={props.type ?? 'button'} />,
);
TooltipTrigger.displayName = 'TooltipTrigger';
export const TooltipContent = React.forwardRef<HTMLDivElement, ContentProps>(({ side, sideOffset, ...props }, ref) => <Box {...props} ref={ref} />);
