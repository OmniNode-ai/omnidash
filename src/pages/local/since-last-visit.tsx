import { useEffect, useState } from 'react';
import { BellRing } from 'lucide-react';
import { toInsightRuns } from './insights';
import { useSharedRunFilter } from './run-filter';

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
  const day = date.toLocaleString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  return `${day}, ${date.toISOString().slice(11, 16)} UTC`;
}

export function SinceLastVisit({ decisions, now, onOpenFailures }: { decisions: readonly unknown[]; now: number; onOpenFailures?: () => void }) {
  // Read once, on the first render of this visit: later refreshes keep counting from the same previous visit.
  const [previous] = useState<number | null>(readLastVisit);
  const shared = useSharedRunFilter();
  useEffect(() => { writeLastVisit(now); }, [now]);
  if (previous === null) return null;
  const fresh = toInsightRuns(decisions).filter(run => run.at > previous);
  const failed = fresh.filter(run => run.status === 'failed').length;
  return (
    <p className="local-since-visit" role="status" aria-label="Since your last visit">
      <span className="local-since-visit-icon" aria-hidden="true"><BellRing size={15} /></span>
      <span className="local-since-visit-title">Since your last visit · {visitLabel(previous)}</span>
      <span className="local-since-visit-chip" data-tone="runs">{fresh.length.toLocaleString('en-US')} new runs</span>
      <span className="local-since-visit-chip" data-tone="failed">{failed.toLocaleString('en-US')} failed</span>
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
