// Display formatters for the savings dashboard. Pure functions, no locale surprises
// (fixed en-US so fixtures and screenshots stay stable).

/** Whole-dollar USD, e.g. 12480.42 → "$12,480". */
export function formatUsd(value: number): string {
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });
}

/** Cents-precise USD for small per-task amounts, e.g. 0.18 → "$0.18". */
export function formatUsdCents(value: number): string {
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Compact token/count, e.g. 47_200_000 → "47.2M", 38_000 → "38K". */
export function formatCompact(value: number): string {
  return value.toLocaleString('en-US', { notation: 'compact', maximumFractionDigits: 1 });
}

/** Exact integer with thousands separators, e.g. 1840 → "1,840". */
export function formatInt(value: number): string {
  return value.toLocaleString('en-US');
}

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-06-15" → "Jun 15", parsed directly to dodge timezone shifts. */
export function formatShortDate(bucket: string): string {
  const parts = bucket.split('-');
  return `${SHORT_MONTHS[Number(parts[1]) - 1]} ${Number(parts[2])}`;
}

/** Compact dollar axis label, e.g. 6000 → "$6k", 0 → "$0". */
export function formatUsdAxis(value: number): string {
  if (value === 0) return '$0';
  return `$${(value / 1000).toLocaleString('en-US', { maximumFractionDigits: 1 })}k`;
}

/** Full timestamp, e.g. "Jun 24, 2026, 6:02 PM". */
export function formatDateTime(iso: string): string {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return '—';
  return t.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** Percent from a 0–1 fraction, e.g. 0.64 → "64%". */
export function formatPct(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}

/** Latency in ms → seconds with one decimal, e.g. 820 → "0.8s". */
export function formatLatency(ms: number | null): string {
  if (ms == null) return '—';
  return `${(ms / 1000).toFixed(1)}s`;
}

/**
 * Compact relative age of an ISO timestamp, e.g. "2m ago" / "3h ago" / "2d ago".
 * `nowMs` is injectable so it stays deterministic in tests.
 */
export function formatRelativeTime(iso: string, nowMs: number = Date.now()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '—';
  const secs = Math.max(0, Math.round((nowMs - then) / 1000));
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}
