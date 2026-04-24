import { createGlobalThemeContract } from '@vanilla-extract/css';

// NOTE: This vanilla-extract contract is used only by the legacy Header
// and AgentChatPanel .css.ts files. The canonical token system lives in
// src/styles/globals.css (OKLCH prototype tokens + `--font-sans`/`--font-mono`).
// Font variables are deliberately omitted here — components that need a
// font reference the raw CSS var directly (e.g. `fontFamily: 'var(--font-mono)'`)
// so there is a single source of truth for typography.
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
  radius: {
    sm: '--radius-sm',
    md: '--radius-md',
    lg: '--radius-lg',
  },
});
