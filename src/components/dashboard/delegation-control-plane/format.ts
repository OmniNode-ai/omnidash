import { formatUsd } from '@/lib/currency';

export function fmtDate(value: string | undefined): string {
  if (!value) return 'pending';
  const ts = Date.parse(value);
  if (Number.isNaN(ts)) return value;
  return new Date(ts).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function fmtUsd(value: number | string | undefined): string {
  const numeric = asNumber(value);
  if (numeric == null) return '-';
  return formatUsd(numeric);
}

export function fmtPct(value: number | string | undefined): string {
  const numeric = asNumber(value);
  if (numeric == null) return '-';
  return `${Math.round(numeric * 100)}%`;
}

export function fmtTokens(value: number | string | undefined): string {
  const numeric = asNumber(value);
  if (numeric == null) return '-';
  if (numeric >= 1_000_000) return `${(numeric / 1_000_000).toFixed(1)}M`;
  if (numeric >= 1_000) return `${(numeric / 1_000).toFixed(1)}K`;
  return String(numeric);
}

export function fmtMs(value: number | string | undefined): string {
  const numeric = asNumber(value);
  if (numeric == null) return '-';
  if (numeric >= 1_000) return `${(numeric / 1_000).toFixed(2)}s`;
  return `${Math.round(numeric)}ms`;
}

export function shortId(value: string | undefined): string {
  if (!value) return '-';
  if (value.length <= 14) return value;
  return `${value.slice(0, 8)}...${value.slice(-4)}`;
}

function asNumber(value: number | string | undefined): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}
