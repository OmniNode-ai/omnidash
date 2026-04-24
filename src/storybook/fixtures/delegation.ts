import type { DelegationSummary } from '@/components/dashboard/delegation/DelegationMetrics';

export interface BuildDelegationMetricsOptions {
  /** Total delegations recorded. Default 247. */
  totalDelegations?: number;
  /** Quality-gate pass rate, 0..1. Default 0.84. */
  qualityGatePassRate?: number;
  /** Total cost savings in USD. Default 158.42. */
  totalSavingsUsd?: number;
  /**
   * Distribution profile across task types. Default 'balanced'.
   *
   * - 'balanced': three task types share roughly equal load.
   * - 'single-dominant': one task type accounts for ~80% of delegations.
   */
  profile?: 'balanced' | 'single-dominant';
}

const TASK_TYPES = ['code-review', 'pattern-match', 'document-summarize', 'classification'];

/**
 * Build a single `DelegationSummary` record. Story callers should
 * wrap in `[buildDelegationMetrics(...)]` when seeding the cache —
 * `useProjectionQuery` returns an array even for single-row topics.
 */
export function buildDelegationMetrics(
  opts: BuildDelegationMetricsOptions = {},
): DelegationSummary {
  const totalDelegations = opts.totalDelegations ?? 247;
  const qualityGatePassRate = opts.qualityGatePassRate ?? 0.84;
  const totalSavingsUsd = opts.totalSavingsUsd ?? 158.42;
  const profile = opts.profile ?? 'balanced';

  let weights: number[];
  if (profile === 'single-dominant') {
    weights = [0.78, 0.10, 0.08, 0.04];
  } else {
    weights = [0.32, 0.28, 0.24, 0.16];
  }

  const byTaskType = TASK_TYPES.map((taskType, i) => ({
    taskType,
    count: Math.round(weights[i] * totalDelegations),
  }));

  return {
    totalDelegations,
    qualityGatePassRate,
    totalSavingsUsd,
    byTaskType,
  };
}
