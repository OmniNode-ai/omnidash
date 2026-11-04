/**
 * OMN-22168: the design tokens resolved to "#rrggbb" for the current theme, for charts that hand colours to SVG
 * attributes, canvas or three.js. The values come from src/theme/design-system/tokens.css and update on a theme change.
 * (This replaces src/theme/useThemeColors.ts, which read the old --primary/--chart-* names.)
 */
import { useMemo } from 'react';
import { CHART_SERIES, tokenHex, useTokenRevision } from './color';

export interface TokenColors {
  /** The brand blue: links, focus and highlight marks. */
  primary: string;
  /** The ink-filled control colour of the 01 + 20 look (a chosen segment, a primary button). */
  accent: string;
  /** The page behind everything. */
  background: string;
  /** Body text. */
  foreground: string;
  /** A card or panel surface. */
  card: string;
  /** A hairline rule. */
  border: string;
  /** A background tint (a hover or chosen fill). Not for text. */
  muted: string;
  /** Low-emphasis text: secondary labels, timestamps, axis labels. */
  mutedForeground: string;
  destructive: string;
  status: { healthy: string; warning: string; error: string };
  /** The eight chart series, in order. */
  chart: string[];
}

export function readTokenColors(): TokenColors {
  return {
    primary: tokenHex('--ds-brand'),
    accent: tokenHex('--ds-accent'),
    background: tokenHex('--ds-page'),
    foreground: tokenHex('--ds-ink'),
    card: tokenHex('--ds-surface'),
    border: tokenHex('--ds-line'),
    muted: tokenHex('--ds-surface-2'),
    mutedForeground: tokenHex('--ds-ink-3'),
    destructive: tokenHex('--ds-bad'),
    status: { healthy: tokenHex('--ds-ok'), warning: tokenHex('--ds-warn'), error: tokenHex('--ds-bad') },
    chart: CHART_SERIES.map(tokenHex),
  };
}

export function useTokenColors(): TokenColors {
  const revision = useTokenRevision();
  return useMemo(readTokenColors, [revision]);
}
