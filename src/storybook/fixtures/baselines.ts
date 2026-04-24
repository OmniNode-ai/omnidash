import type { BaselinesSummary } from '@/components/dashboard/baselines/BaselinesROICard';

export interface BuildBaselinesRoiOptions {
  /**
   * Sign of the improvement. Default 'positive' — token / time / retry
   * deltas are all negative (improvements). 'negative' flips them
   * positive so the widget renders the regression-color treatment.
   */
  variant?: 'positive' | 'negative';
  /** Override the snapshot id. Default `baseline-2026-04-24`. */
  snapshotId?: string;
}

/**
 * Build a single `BaselinesSummary` record. Story callers should
 * wrap in `[buildBaselinesRoi(...)]` when seeding the cache.
 */
export function buildBaselinesRoi(opts: BuildBaselinesRoiOptions = {}): BaselinesSummary {
  const variant = opts.variant ?? 'positive';
  const sign = variant === 'positive' ? -1 : 1;

  return {
    snapshotId: opts.snapshotId ?? 'baseline-2026-04-24',
    capturedAt: new Date().toISOString(),
    tokenDelta: sign * 1842,
    timeDeltaMs: sign * 320,
    retryDelta: sign * 4,
    recommendations: { promote: 6, shadow: 3, suppress: 2, fork: 1 },
    confidence: 0.87,
  };
}
