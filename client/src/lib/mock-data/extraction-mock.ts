/**
 * Mock Data for Extraction Pipeline Dashboard (OMN-2304)
 *
 * Provides demo data when API is unavailable or tables are empty.
 * Follows the same pattern as effectiveness-mock.ts and cost-mock.ts.
 */

import type {
  ExtractionSummary,
  PipelineHealthResponse,
  LatencyHeatmapResponse,
  PatternVolumeResponse,
  ErrorRatesSummaryResponse,
} from '@shared/extraction-types';

const COHORTS = ['default', 'experimental', 'fast-path', 'legacy'] as const;

/**
 * Shared bucket layout for time-windowed mock generators.
 *
 * Window → { bucketCount, stepMs }:
 *   1h  → 12 buckets × 5 min
 *   6h  →  6 buckets × 1 hr
 *   24h → 24 buckets × 1 hr
 *   7d  → 14 buckets × 1 day  (two weeks of daily granularity)
 *   30d → 30 buckets × 1 day  (one bucket per calendar day)
 *   default: 14 days of daily buckets
 */
function getWindowBuckets(window: string): { bucketCount: number; stepMs: number } {
  if (window === '1h') return { bucketCount: 12, stepMs: 300_000 };
  if (window === '6h') return { bucketCount: 6, stepMs: 3_600_000 };
  if (window === '24h') return { bucketCount: 24, stepMs: 3_600_000 };
  if (window === '30d') return { bucketCount: 30, stepMs: 86_400_000 };
  // default: 14 days of daily buckets
  return { bucketCount: 14, stepMs: 86_400_000 };
}

export function getMockExtractionSummary(): ExtractionSummary {
  return {
    total_injections: 1423,
    total_patterns_matched: 418,
    avg_utilization_score: 0.81,
    avg_latency_ms: 94,
    success_rate: 0.962,
    last_event_at: new Date(Date.now() - 4 * 60_000).toISOString(),
  };
}

export function getMockPipelineHealth(): PipelineHealthResponse {
  return {
    cohorts: [
      {
        cohort: 'default',
        total_events: 842,
        success_count: 813,
        failure_count: 29,
        success_rate: 0.966,
        avg_latency_ms: 88,
      },
      {
        cohort: 'experimental',
        total_events: 312,
        success_count: 296,
        failure_count: 16,
        success_rate: 0.949,
        avg_latency_ms: 112,
      },
      {
        cohort: 'fast-path',
        total_events: 198,
        success_count: 195,
        failure_count: 3,
        success_rate: 0.985,
        avg_latency_ms: 41,
      },
      {
        cohort: 'legacy',
        total_events: 71,
        success_count: 66,
        failure_count: 5,
        success_rate: 0.93,
        avg_latency_ms: 157,
      },
    ],
  };
}

export function getMockLatencyHeatmap(window: string = '24h'): LatencyHeatmapResponse {
  const { bucketCount, stepMs } = getWindowBuckets(window);

  const buckets = Array.from({ length: bucketCount }, (_, i) => {
    const t = new Date(Date.now() - (bucketCount - 1 - i) * stepMs);
    const jitter = Math.sin(i * 0.7) * 15; // mild wave shape
    return {
      bucket: t.toISOString(),
      p50: Math.round(82 + jitter),
      p95: Math.round(210 + jitter * 2.5),
      p99: Math.round(480 + jitter * 4),
      sample_count: Math.round(55 + Math.abs(jitter) * 2),
    };
  });

  return { buckets, window };
}

export function getMockPatternVolume(window: string = '24h'): PatternVolumeResponse {
  const { bucketCount, stepMs } = getWindowBuckets(window);

  const points = Array.from({ length: bucketCount }, (_, i) => {
    const t = new Date(Date.now() - (bucketCount - 1 - i) * stepMs);
    const base = 15 + Math.round(Math.abs(Math.sin(i * 0.5)) * 12);
    return {
      bucket: t.toISOString(),
      patterns_matched: base,
      injections: Math.round(base * 3.4),
    };
  });

  return { points, window };
}

/** Per-cohort event counts keyed by cohort name — order-independent. */
const COHORT_TOTAL_EVENTS: Record<(typeof COHORTS)[number], number> = {
  default: 842,
  experimental: 312,
  'fast-path': 198,
  legacy: 71,
};

/** Per-cohort failure counts keyed by cohort name — order-independent. */
const COHORT_FAILURE_COUNTS: Record<(typeof COHORTS)[number], number> = {
  default: 29,
  experimental: 16,
  'fast-path': 3,
  legacy: 5,
};

export function getMockErrorRatesSummary(): ErrorRatesSummaryResponse {
  const now = Date.now();

  return {
    entries: COHORTS.map((cohort) => {
      const total = COHORT_TOTAL_EVENTS[cohort];
      const failures = COHORT_FAILURE_COUNTS[cohort];
      return {
        cohort,
        total_events: total,
        failure_count: failures,
        error_rate: failures / total,
        recent_errors: Array.from({ length: Math.min(failures, 3) }, (_, j) => ({
          session_id: `demo-${cohort}-${j + 1}`,
          created_at: new Date(now - (j + 1) * 28 * 60_000).toISOString(),
          session_outcome: 'error',
        })),
      };
    }),
    total_errors: Object.values(COHORT_FAILURE_COUNTS).reduce((sum, n) => sum + n, 0),
    overall_error_rate:
      Object.values(COHORT_FAILURE_COUNTS).reduce((s, n) => s + n, 0) /
      Object.values(COHORT_TOTAL_EVENTS).reduce((s, n) => s + n, 0),
  };
}
