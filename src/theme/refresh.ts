/**
 * OMN-23330 AC21: the one refresh setting. Every page and widget refreshes from here, and nothing polls faster than
 * REFRESH_INTERVAL_MS unless FASTER_REFRESH below names it with the reason. Before this, about 40 reads each chose their
 * own interval, from 2 s to 60 s (the operator's 2026-11-09 code review). The pages' own declaration
 * (refresh_interval_seconds in each *.page.yaml, part of the shared dashboard schema) states the same 30 s.
 */
export const REFRESH_INTERVAL_MS = 30_000;

/** The reads that refresh faster than the setting, each with why. Nothing else may. */
export const FASTER_REFRESH = {
  'live-event-stream': {
    ms: 2_000,
    why: 'A live tail of system events: the newest events are read as they arrive, as a stream is.',
  },
  'trace-explorer': {
    ms: 2_000,
    why: 'Follows a trace while it is still being written; it stops when the viewer pauses it.',
  },
} as const satisfies Record<string, { ms: number; why: string }>;

export type FasterRefresh = keyof typeof FASTER_REFRESH;

/**
 * The intervals a viewer may pick in the auto-refresh control, which then applies to every projection read. The two under
 * the setting are the viewer's own opt-in, and declared: OMN-7093 holds the delegation dashboard to updating within 5 s of
 * new data when the viewer asks for it (proved by tests/e2e/delegation-live-refresh.spec.ts, OMN-10947).
 */
export const VIEWER_REFRESH_CHOICES = [
  { label: '5s', ms: 5_000 },
  { label: '10s', ms: 10_000 },
  { label: '30s', ms: REFRESH_INTERVAL_MS },
  { label: '1m', ms: 60_000 },
  { label: '5m', ms: 5 * 60_000 },
] as const;
export const VIEWER_REFRESH_WHY = 'OMN-7093: the delegation dashboard updates within 5 s of new data when the viewer asks for it.';

/** The interval a read refreshes at: the setting, or a declared faster one by name. */
export function refreshInterval(declared?: FasterRefresh): number {
  return declared === undefined ? REFRESH_INTERVAL_MS : FASTER_REFRESH[declared].ms;
}

/** A page's declared refresh (seconds, from its page.yaml) in milliseconds, never under the setting. */
export function pageRefreshMs(declaredSeconds: number | null | undefined): number {
  const seconds = typeof declaredSeconds === 'number' && Number.isFinite(declaredSeconds) ? declaredSeconds : 0;
  return Math.max(REFRESH_INTERVAL_MS, seconds * 1000);
}
