import {DatesProvider} from '@mantine/dates';
import 'dayjs/locale/es';
import '@mantine/dates/styles.layer.css';
import React from 'react';
import { createTheme, MantineProvider } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { useThemeMode } from '../../helpers/themeMode';
import './CrmTheme.css';

const theme = createTheme({
  primaryColor: 'hospeda',
  primaryShade: { light: 6, dark: 6 },
  autoContrast: true,
  colors: {
    hospeda: ['#eff6ff', '#dbeafe', '#bfdbfe', '#93c5fd', '#60a5fa', '#3b82f6', '#2563eb', '#1d4ed8', '#1e40af', '#1e3a8a'],
  },
  fontFamily: 'var(--font-family-base)',
  headings: { fontFamily: 'var(--font-family-heading)' },
  defaultRadius: 'sm',
  radius: { xs: '4px', sm: '8px', md: '12px', lg: '16px', xl: '20px' },
  spacing: { xs: '8px', sm: '12px', md: '16px', lg: '24px', xl: '32px' },
  fontSizes: { xs: '12px', sm: '14px', md: '16px', lg: '18px', xl: '20px' },
});

/** Existing preference remains the single owner of light/dark/auto. */
export function CrmThemeProvider({ children }: { children: React.ReactNode }) {
  const { mode } = useThemeMode();
  const systemDark = useMediaQuery('(prefers-color-scheme: dark)', false, { getInitialValueInEffect: false });
  const colorScheme = mode === 'auto' ? (systemDark ? 'dark' : 'light') : mode;
  return <MantineProvider theme={theme} forceColorScheme={colorScheme}>
    <DatesProvider settings={{locale:"es",firstDayOfWeek:1}}>{children}</DatesProvider>
  </MantineProvider>;
}
