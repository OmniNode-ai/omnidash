import { REFRESH_INTERVAL_SECONDS_DEFAULT } from '@/config/generated/data-source-defaults';

/**
 * OMN-23330 AC21: the one refresh setting. Every page and widget refreshes from here, and nothing polls faster than
 * REFRESH_INTERVAL_MS unless FASTER_REFRESH below names it with the reason. Before this, about 40 reads each chose their
 * own interval, from 2 s to 60 s (the operator's 2026-11-09 code review). The pages' own declaration
 * (refresh_interval_seconds in each *.page.yaml, part of the shared dashboard schema) states the same 30 s.
 *
 * OMN-26056: the value is declared config, not a literal. contract.yaml's refresh.interval_seconds (30 today) is the
 * default and a deployment overlay (contract.local.yaml) may name a larger one; `npm run generate:config` carries it into
 * the generated defaults this file reads. The pages' own declarations still cannot go under it (pageRefreshMs).
 */
export const REFRESH_INTERVAL_MS = REFRESH_INTERVAL_SECONDS_DEFAULT * 1000;

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
function viewerChoiceLabel(ms: number): string {
  return ms >= 60_000 && ms % 60_000 === 0 ? `${ms / 60_000}m` : `${ms / 1000}s`;
}
// OMN-26056: the setting is one of the choices, once and under its own label (30s today; 2m at a 120 s setting).
export const VIEWER_REFRESH_CHOICES: ReadonlyArray<{ label: string; ms: number }> = [
  ...new Set([5_000, 10_000, REFRESH_INTERVAL_MS, 60_000, 5 * 60_000]),
]
  .sort((a, b) => a - b)
  .map((ms) => ({ label: viewerChoiceLabel(ms), ms }));
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
