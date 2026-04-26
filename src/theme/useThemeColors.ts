import { useState, useEffect } from 'react';

interface ThemeColors {
  primary: string;
  accent: string;
  background: string;
  foreground: string;
  card: string;
  border: string;
  /**
   * A **background** tint (maps to `--muted` → `--panel-2`). Do NOT use as text color.
   * For low-emphasis text, use `mutedForeground` instead.
   */
  muted: string;
  /**
   * Low-emphasis text color (maps to `--muted-foreground` → `--ink-2`).
   * Use for secondary labels, timestamps, axis labels, etc.
   */
  mutedForeground: string;
  destructive: string;
  status: {
    healthy: string;
    warning: string;
    error: string;
  };
  chart: string[];
}

/**
 * Parse a CSS color value to a hex string where possible.
 * oklch(...) and other modern color functions are passed through as-is
 * since browsers can resolve them directly and hslToHex cannot handle them.
 */
function parseColor(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '#888888';
  // Pass through any non-HSL color function (oklch, rgb, hsl with parens, etc.)
  if (/^oklch|^rgb|^hsl\s*\(|^color\(|^lab\(|^lch\(/.test(trimmed)) {
    return trimmed;
  }
  // Attempt to parse bare "H S% L%" HSL shorthand (shadcn token style)
  const parts = trimmed.split(/\s+/);
  if (parts.length < 3) return trimmed;
  const h = parseFloat(parts[0]);
  const s = parseFloat(parts[1]) / 100;
  const l = parseFloat(parts[2]) / 100;
  if (isNaN(h) || isNaN(s) || isNaN(l)) return trimmed;

  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function readToken(name: string): string {
  if (typeof document === 'undefined') return '#888888';
  const value = getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim();
  return value ? parseColor(value) : '#888888';
}

function readAllColors(): ThemeColors {
  return {
    primary: readToken('primary'),
    accent: readToken('accent'),
    background: readToken('background'),
    foreground: readToken('foreground'),
    card: readToken('card'),
    border: readToken('border'),
    muted: readToken('muted'),
    mutedForeground: readToken('muted-foreground'),
    destructive: readToken('destructive'),
    status: {
      healthy: readToken('status-healthy'),
      warning: readToken('status-warning'),
      error: readToken('status-error'),
    },
    chart: [
      readToken('chart-1'),
      readToken('chart-2'),
      readToken('chart-3'),
      readToken('chart-4'),
      readToken('chart-5'),
      readToken('chart-6'),
      readToken('chart-7'),
    ],
  };
}

export function useThemeColors(): ThemeColors {
  const [colors, setColors] = useState<ThemeColors>(readAllColors);

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setColors(readAllColors());
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-density', 'class'] });
    return () => observer.disconnect();
  }, []);

  return colors;
}
