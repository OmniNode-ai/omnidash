import { createGlobalThemeContract } from '@vanilla-extract/css';

export const vars = createGlobalThemeContract({
  color: {
    background: '--background',
    foreground: '--foreground',
    card: '--card',
    border: '--border',
    primary: '--primary',
    muted: '--muted',
    accent: '--accent',
    destructive: '--destructive',
    statusHealthy: '--status-healthy',
    statusWarning: '--status-warning',
    statusError: '--status-error',
    chart1: '--chart-1',
    chart2: '--chart-2',
    chart3: '--chart-3',
    chart4: '--chart-4',
    chart5: '--chart-5',
    chart6: '--chart-6',
    chart7: '--chart-7',
  },
  font: {
    sans: '--font-sans',
    mono: '--font-mono',
  },
  radius: {
    sm: '--radius-sm',
    md: '--radius-md',
    lg: '--radius-lg',
  },
});
