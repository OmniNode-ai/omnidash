import type {
  QualityDistributionBucket,
  QualitySummary,
} from '@/components/dashboard/quality/QualityScorePanel';

export interface BuildQualitySummaryOptions {
  /**
   * Profile of the distribution. Default 'balanced'.
   *
   * - 'balanced': spread across all 5 buckets, slight upward skew.
   * - 'high-pass': 75%+ of measurements in 0.6+ buckets.
   * - 'low-pass': 65%+ of measurements in <0.6 buckets.
   */
  profile?: 'balanced' | 'high-pass' | 'low-pass';
  /** Total measurement count. Default 1000. */
  totalMeasurements?: number;
}

// Integer-string bucket labels matching the actual server output
// (`WIDTH_BUCKET(quality_score, 0, 1, 5)::text` returns "1".."5"). The
// widget consumes the distribution by index, not by parsing the label,
// so the labels are cosmetic for rendering — but keeping them honest
// avoids future test/server divergence (M9 fix).
const BUCKET_LABELS = ['1', '2', '3', '4', '5'];
const BUCKET_MIDPOINTS = [0.1, 0.3, 0.5, 0.7, 0.9];

const PROFILE_WEIGHTS: Record<NonNullable<BuildQualitySummaryOptions['profile']>, number[]> = {
  // Roughly bell-shaped, peaking around 0.6-0.8.
  balanced: [0.05, 0.15, 0.30, 0.30, 0.20],
  // Heavy upward skew — most patterns score well.
  'high-pass': [0.02, 0.05, 0.18, 0.40, 0.35],
  // Heavy downward skew — many failing patterns.
  'low-pass': [0.30, 0.30, 0.20, 0.15, 0.05],
};

/**
 * Build a `QualitySummary` from a profile preset. The widget consumes
 * a single `QualitySummary` (the projection table is one row), but
 * `useProjectionQuery` returns an array — story callers should wrap
 * this in `[buildQualitySummary(...)]` when seeding the cache.
 */
export function buildQualitySummary(opts: BuildQualitySummaryOptions = {}): QualitySummary {
  const profile = opts.profile ?? 'balanced';
  const total = opts.totalMeasurements ?? 1000;
  const weights = PROFILE_WEIGHTS[profile];

  const distribution: QualityDistributionBucket[] = BUCKET_LABELS.map((label, i) => ({
    bucket: label,
    count: Math.round(weights[i] * total),
  }));

  // Reconcile rounding so `sum(distribution.count) === totalMeasurements`.
  const sum = distribution.reduce((acc, b) => acc + b.count, 0);
  const drift = total - sum;
  if (drift !== 0) {
    // Apply drift to the largest bucket — it absorbs the rounding
    // error without visibly changing the shape.
    const maxIdx = distribution.reduce((iMax, b, i, arr) =>
      b.count > arr[iMax].count ? i : iMax, 0);
    distribution[maxIdx] = {
      ...distribution[maxIdx],
      count: distribution[maxIdx].count + drift,
    };
  }

  const meanScore = distribution.reduce(
    (acc, b, i) => acc + (b.count / total) * BUCKET_MIDPOINTS[i],
    0,
  );

  return {
    meanScore,
    distribution,
    totalMeasurements: total,
  };
}
