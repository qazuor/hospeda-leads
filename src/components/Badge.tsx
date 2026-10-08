import { Badge as MantineBadge } from '@mantine/core';
interface Props extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'primary' | 'destructive' | 'outline' | 'secondary' | 'success' | 'warning';
}
export function Badge({ variant = 'primary', children, ...props }: Props) {
  return <MantineBadge {...props} variant={variant === 'outline' ? 'outline' : 'light'}
    color={variant === 'destructive' ? 'red' : variant === 'success' ? 'green' : variant === 'warning' ? 'yellow' : variant === 'secondary' ? 'gray' : undefined}
    tt="none" style={{ height: 'auto', minHeight: 24, ...props.style }}>{children}</MantineBadge>;
}
