import { Box, Loader } from '@mantine/core';
interface SpinnerProps extends React.HTMLAttributes<HTMLDivElement> { size?: 'sm' | 'md' | 'lg' }
export function Spinner({ size = 'md', ...props }: SpinnerProps) {
  return <Box {...props} role="status" aria-label={props['aria-label'] ?? 'Cargando'}><Loader color="currentColor" size={size === 'sm' ? 16 : size === 'lg' ? 32 : 24} /></Box>;
}
