/**
 * OMN-22168: resolve design tokens to concrete colours for the places a var() string cannot go: three.js materials,
 * canvas 2D, and code that mixes or measures colours. Everything here reads src/design-system/tokens.css at call time,
 * so a theme switch is picked up on the next read; nothing here holds a colour of its own.
 */
import { useEffect, useState } from 'react';

/** A --ds-* token name, with or without the leading dashes. */
export type TokenName = `--ds-${string}` | `ds-${string}`;

function propertyName(token: TokenName): string {
  return token.startsWith('--') ? token : `--${token}`;
}

/** The token's computed value on <html> (for example "#0a0a0a" or "oklch(75% 0.17 250)"), or '' outside a browser. */
export function tokenValue(token: TokenName): string {
  if (typeof document === 'undefined') return '';
  return getComputedStyle(document.documentElement).getPropertyValue(propertyName(token)).trim();
}

/**
 * Any CSS colour (hex, rgb, oklch, color-mix, var(--ds-*)) as a 24-bit sRGB number for THREE.Color. A var() is resolved
 * first. The browser normalises the value through a 1x1 canvas, which accepts the full colour syntax. A value the
 * canvas rejects, or a call outside a browser, returns the fallback (by default the chart's "unknown" token).
 */
export function colorToNumber(value: string | undefined, fallback?: number): number {
  const missing = () => (fallback !== undefined ? fallback : value === 'var(--ds-chart-unknown)' ? 0 : colorToNumber('var(--ds-chart-unknown)', 0));
  if (!value || typeof document === 'undefined') return missing();
  const varMatch = /^var\(\s*(--ds-[\w-]+)\s*\)$/.exec(value.trim());
  const css = varMatch ? tokenValue(varMatch[1] as TokenName) : value;
  if (!css) return missing();
  const parsed = parseColor(css);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext('2d');
    // No canvas (a test DOM, a worker): the common forms are parsed directly rather than dropped.
    if (!ctx) return parsed ?? missing();
    // The fillStyle setter keeps its previous value when it rejects an input, so a value equal to the transparent
    // read-back (and not itself transparent) was refused.
    ctx.fillStyle = 'transparent';
    const blank = String(ctx.fillStyle);
    ctx.fillStyle = css;
    if (String(ctx.fillStyle) === blank && !/^transparent$/i.test(css)) return missing();
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return (d[0]! << 16) | (d[1]! << 8) | d[2]!;
  } catch {
    return parsed ?? missing();
  }
}

const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
const pack = (r: number, g: number, b: number) => (clamp(r) << 16) | (clamp(g) << 8) | clamp(b);

/** Hex, rgb()/rgba() and oklch() to a 24-bit number without a canvas; anything else is null. */
export function parseColor(css: string): number | null {
  const v = css.trim().toLowerCase();
  let m = /^#([0-9a-f]{3,8})$/.exec(v);
  if (m) {
    let h = m[1]!;
    if (h.length === 3 || h.length === 4) h = h.slice(0, 3).split('').map(c => c + c).join('');
    return h.length >= 6 ? parseInt(h.slice(0, 6), 16) : null;
  }
  m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/.exec(v);
  if (m) return pack(Number(m[1]), Number(m[2]), Number(m[3]));
  // oklch(L C H): L as a fraction or a percentage; some engines drop the space after the percent sign.
  m = /^oklch\(\s*([\d.]+)(%?)\s*([\d.]+)\s+([\d.]+)/.exec(v);
  if (m) {
    const L = Number(m[1]) / (m[2] ? 100 : 1), C = Number(m[3]), H = (Number(m[4]) * Math.PI) / 180;
    const a = C * Math.cos(H), b = C * Math.sin(H);
    const l_ = L + 0.3963377774 * a + 0.2158037573 * b, m_ = L - 0.1055613458 * a - 0.0638541728 * b, s_ = L - 0.0894841775 * a - 1.291485548 * b;
    const l3 = l_ ** 3, m3 = m_ ** 3, s3 = s_ ** 3;
    const lin = [4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3, -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3,
      -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3];
    const [r, g, bl] = lin.map(x => 255 * (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(Math.max(x, 0), 1 / 2.4) - 0.055));
    return pack(r!, g!, bl!);
  }
  return null;
}

/** The token as a 24-bit number, for THREE.Color and other numeric colour APIs. */
export function tokenNumber(token: TokenName, fallback?: number): number {
  return colorToNumber(`var(${propertyName(token)})`, fallback);
}

/** The token as "#rrggbb", for APIs that need a hex string (canvas, three.js text, SVG attributes). */
export function tokenHex(token: TokenName): string {
  return `#${tokenNumber(token).toString(16).padStart(6, '0')}`;
}

/** Re-render when the theme or density changes, so values read during render stay current. */
export function useTokenRevision(): number {
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (typeof MutationObserver === 'undefined') return;
    const observer = new MutationObserver(() => setRevision(r => r + 1));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-density', 'class'] });
    return () => observer.disconnect();
  }, []);
  return revision;
}

/** The eight chart series, resolved to "#rrggbb" for the current theme. */
export const CHART_SERIES: readonly TokenName[] = ['--ds-chart-1', '--ds-chart-2', '--ds-chart-3', '--ds-chart-4',
  '--ds-chart-5', '--ds-chart-6', '--ds-chart-7', '--ds-chart-8'];
