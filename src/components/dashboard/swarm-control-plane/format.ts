import { fixed as fmtFixed, localeString as fmtLocaleString } from '@/lib/format';
export function fmtMs(ms: number): string {
  if (ms >= 60_000) return `${fmtFixed((ms / 60_000), 1)}m`;
  if (ms >= 1_000) return `${fmtFixed((ms / 1_000), 1)}s`;
  return `${Math.round(ms)}ms`;
}

export function fmtUsd(usd: number): string {
  if (usd === 0) return '$0.00';
  if (usd < 0.001) return `$${fmtFixed(usd, 5)}`;
  if (usd < 0.01) return `$${fmtFixed(usd, 4)}`;
  return `$${fmtFixed(usd, 2)}`;
}

export function fmtDate(value: string | undefined): string {
  if (!value) return '-';
  const ts = Date.parse(value);
  if (Number.isNaN(ts)) return value;
  return fmtLocaleString(new Date(ts), undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export function fmtRatio(ratio: number): string {
  return `${fmtFixed(ratio, 2)}×`;
}

export function fmtPct(numerator: number, denominator: number): string {
  if (denominator === 0) return '-';
  return `${Math.round((numerator / denominator) * 100)}%`;
}
