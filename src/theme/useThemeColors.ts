import { useState, useEffect } from 'react';

interface ThemeColors {
  primary: string;
  accent: string;
  background: string;
  foreground: string;
  card: string;
  border: string;
  muted: string;
  destructive: string;
  status: {
    healthy: string;
    warning: string;
    error: string;
  };
  chart: string[];
}

function hslToHex(hsl: string): string {
  const parts = hsl.trim().split(/\s+/);
  if (parts.length < 3) return '#888888';
  const h = parseFloat(parts[0]);
  const s = parseFloat(parts[1]) / 100;
  const l = parseFloat(parts[2]) / 100;

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
  const value = getComputedStyle(document.body).getPropertyValue(`--${name}`).trim();
  return value ? hslToHex(value) : '#888888';
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
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  return colors;
}
