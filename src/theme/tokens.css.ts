import { createGlobalThemeContract } from '@vanilla-extract/css';

// OMN-22168: the TypeScript face of src/theme/design-system/tokens.css. The legacy Header, AgentChatPanel and dashboard
// .css.ts files read tokens through this contract; it names --ds-* properties only and holds no values.
export const vars = createGlobalThemeContract({
  color: {
    background: '--ds-page',
    foreground: '--ds-ink',
    card: '--ds-surface',
    border: '--ds-line',
    primary: '--ds-brand',
    muted: '--ds-surface-2',
    accent: '--ds-brand',
    destructive: '--ds-bad',
    statusHealthy: '--ds-ok',
    statusWarning: '--ds-warn',
    statusError: '--ds-bad',
    chart1: '--ds-chart-1',
    chart2: '--ds-chart-2',
    chart3: '--ds-chart-3',
    chart4: '--ds-chart-4',
    chart5: '--ds-chart-5',
    chart6: '--ds-chart-6',
    chart7: '--ds-chart-7',
  },
  radius: {
    sm: '--ds-radius-tag',
    md: '--ds-radius-control',
    lg: '--ds-radius',
  },
});
