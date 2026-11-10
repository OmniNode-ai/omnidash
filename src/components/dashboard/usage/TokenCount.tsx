import { formatDashboardCount, formatFullCount } from '@/lib/format';

/**
 * OMN-22168 (product owner 2026-11-07; Lakshman 2026-11-08 "uniform in whole platform"): a token count reads short by
 * the dashboard count rule (K, M, B, T, two decimals cut: 535,306,002 reads 535.3M) and keeps its exact count on hover.
 */
export function exactTokens(value: unknown, direction?: 'in' | 'out'): string {
  return `${formatFullCount(value)} tokens${direction ? ` ${direction}` : ''}`;
}

/** A served token count, short, with the exact count as its title; a count not served reads `missing`. */
export function TokenCount({ value, direction, missing = 'Not recorded' }: { value: unknown; direction?: 'in' | 'out'; missing?: string }) {
  const short = formatDashboardCount(value);
  if (value === null || value === undefined || short === 'Not measured') return <>{missing}</>;
  return <span className="ds-token-count" title={exactTokens(value, direction)}>{short}</span>;
}
