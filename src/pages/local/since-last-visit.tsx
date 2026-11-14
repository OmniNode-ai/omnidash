import { formatDashboardCount } from '@/theme/format';
import { useEffect, useState } from 'react';
import { BellRing } from '@/theme/design-system/icons';
import { toInsightRuns } from './insights';
import { useSharedRunFilter } from './run-filter';
import { Badge } from '@/theme/design-system/components';
import { localeString as fmtLocaleString } from '@/theme/format';

/**
 * OMN-21166 AC26 (mockup build, 2026-10-18): "Since your last visit" on the Overview header. The last visit is a
 * per-browser convenience kept in localStorage (never shared, never authoritative); the counts are the served
 * decision rows written after it. A first visit, or storage the browser refuses, shows nothing.
 */
export const LAST_VISIT_KEY = 'omnidash.overview.last-visit';

function readLastVisit(): number | null {
  try {
    const stored = window.localStorage.getItem(LAST_VISIT_KEY);
    const time = stored === null ? NaN : Number(stored);
    return Number.isFinite(time) ? time : null;
  } catch {
    return null;
  }
}

function writeLastVisit(now: number): void {
  try { window.localStorage.setItem(LAST_VISIT_KEY, String(now)); } catch { /* a blocked store only loses this line */ }
}

function visitLabel(time: number): string {
  const date = new Date(time);
  const day = fmtLocaleString(date, 'en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  return `${day}, ${date.toISOString().slice(11, 16)} UTC`;
}

export function SinceLastVisit({ decisions, now, onOpenFailures, capped = false }: {
  decisions: readonly unknown[]; now: number; onOpenFailures?: () => void; capped?: boolean;
}) {
  // Read once, on the first render of this visit: later refreshes keep counting from the same previous visit.
  const [previous] = useState<number | null>(readLastVisit);
  const served = toInsightRuns(decisions);
  const shared = useSharedRunFilter();
  useEffect(() => { writeLastVisit(now); }, [now]);
  if (previous === null) return null;
  const fresh = served.filter(run => run.at > previous);
  if (fresh.length === 0) return null;
  const failed = fresh.filter(run => run.status === 'failed').length;
  // OMN-24473: when the read stopped at the newest page and every served run is newer than the visit, older new runs
  // may sit unread, so the counts are a floor (a served run at or before the visit proves the read spans the visit).
  const atLeast = capped && !served.some(run => run.at <= previous);
  return (
    <p className="local-since-visit" role="status" aria-label="Since your last visit"
      title={atLeast ? 'At least; only the newest runs were read' : undefined}>
      <span className="local-since-visit-icon" aria-hidden="true"><BellRing size={15} /></span>
      <span className="local-since-visit-title">Since your last visit · {visitLabel(previous)}</span>
      <Badge look="since-visit" data-tone="runs">{formatDashboardCount(fresh.length)}{atLeast ? '+' : ''} new runs</Badge>
      <Badge look="since-visit" data-tone="failed">{formatDashboardCount(failed)}{atLeast ? '+' : ''} failed</Badge>
      {(shared || onOpenFailures) && (
        <button type="button" className="local-since-visit-action" onClick={() => {
          if (onOpenFailures) { onOpenFailures(); return; }
          shared?.setFilter({ result: 'failed', cause: null });
          const reduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
          document.querySelector('[data-component="overview-recent-runs"]')?.scrollIntoView?.({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
        }}>Show the failures</button>
      )}
    </p>
  );
}
