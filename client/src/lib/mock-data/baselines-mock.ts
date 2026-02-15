/**
 * Mock Data for Baselines & ROI Dashboard (OMN-2156)
 *
 * Provides demo data when the API is unavailable.
 * Follows the same pattern as effectiveness-mock.ts.
 */

import type {
  BaselinesSummary,
  PatternComparison,
  ROITrendPoint,
  RecommendationBreakdown,
  BaselinesResponse,
  DeltaMetric,
  PromotionAction,
  ConfidenceLevel,
} from '@shared/baselines-types';

function makeDelta(
  label: string,
  baseline: number,
  candidate: number,
  direction: 'lower_is_better' | 'higher_is_better',
  unit: string
): DeltaMetric {
  return {
    label,
    baseline,
    candidate,
    delta: candidate - baseline,
    direction,
    unit,
  };
}

const PATTERN_NAMES = [
  'Error Retry with Backoff',
  'Auth Token Refresh',
  'Cache Invalidation Strategy',
  'Pagination Cursor Handler',
  'Rate Limit Decorator',
  'Circuit Breaker Pattern',
  'Idempotent Request Guard',
  'Structured Logging Wrapper',
  'Config Validation on Boot',
  'Graceful Shutdown Handler',
  'Webhook Signature Verifier',
  'Batch Insert Optimizer',
];

function mockComparison(
  index: number,
  action: PromotionAction,
  confidence: ConfidenceLevel
): PatternComparison {
  const name = PATTERN_NAMES[index % PATTERN_NAMES.length];
  const windowEnd = new Date();
  const windowStart = new Date(windowEnd.getTime() - 7 * 24 * 3600_000);

  // Vary the numbers per action to make them realistic
  const costMultiplier = action === 'promote' ? 0.7 : action === 'suppress' ? 1.3 : 0.95;
  const outcomeMultiplier = action === 'promote' ? 1.15 : action === 'suppress' ? 0.85 : 1.02;

  const baseTokens = 12_000 + index * 800;
  const baseTime = 3200 + index * 150;
  const baseRetries = 2.4 + index * 0.2;
  const basePassRate = 0.82 - index * 0.01;
  const baseReviewIter = 2.8 + index * 0.1;

  const rationales: Record<PromotionAction, string> = {
    promote:
      'Candidate shows consistent cost reduction with improved outcomes across all key metrics.',
    shadow:
      'Candidate is promising but needs more data; keep running in shadow mode for another cycle.',
    suppress:
      'Candidate increases cost without measurable outcome improvement; revert to baseline.',
    fork: 'Candidate excels in some metrics but regresses in others; fork for targeted optimization.',
  };

  return {
    pattern_id: `pat-${String(index + 1).padStart(4, '0')}`,
    pattern_name: name,
    sample_size: 120 + index * 25,
    window_start: windowStart.toISOString(),
    window_end: windowEnd.toISOString(),
    token_delta: makeDelta(
      'Token Usage',
      baseTokens,
      Math.round(baseTokens * costMultiplier),
      'lower_is_better',
      'tokens'
    ),
    time_delta: makeDelta(
      'Execution Time',
      baseTime,
      Math.round(baseTime * costMultiplier),
      'lower_is_better',
      'ms'
    ),
    retry_delta: makeDelta(
      'Retry Count',
      baseRetries,
      +(baseRetries * costMultiplier).toFixed(1),
      'lower_is_better',
      'retries'
    ),
    test_pass_rate_delta: makeDelta(
      'Test Pass Rate',
      basePassRate,
      +(basePassRate * outcomeMultiplier).toFixed(3),
      'higher_is_better',
      '%'
    ),
    review_iteration_delta: makeDelta(
      'Review Iterations',
      baseReviewIter,
      +(baseReviewIter * costMultiplier).toFixed(1),
      'lower_is_better',
      'iterations'
    ),
    recommendation: action,
    confidence,
    rationale: rationales[action],
  };
}

export function getMockBaselinesSummary(): BaselinesSummary {
  return {
    total_comparisons: 12,
    promote_count: 5,
    shadow_count: 3,
    suppress_count: 2,
    fork_count: 2,
    avg_cost_savings: 0.24,
    avg_outcome_improvement: 0.12,
    total_token_savings: 34_800,
    total_time_savings_ms: 8_600,
  };
}

export function getMockComparisons(): PatternComparison[] {
  const actions: Array<{ action: PromotionAction; confidence: ConfidenceLevel }> = [
    { action: 'promote', confidence: 'high' },
    { action: 'promote', confidence: 'high' },
    { action: 'promote', confidence: 'medium' },
    { action: 'promote', confidence: 'high' },
    { action: 'promote', confidence: 'medium' },
    { action: 'shadow', confidence: 'medium' },
    { action: 'shadow', confidence: 'low' },
    { action: 'shadow', confidence: 'medium' },
    { action: 'suppress', confidence: 'high' },
    { action: 'suppress', confidence: 'medium' },
    { action: 'fork', confidence: 'medium' },
    { action: 'fork', confidence: 'low' },
  ];

  return actions.map((a, i) => mockComparison(i, a.action, a.confidence));
}

export function getMockROITrend(): ROITrendPoint[] {
  return Array.from({ length: 14 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (13 - i));
    const drift = i * 0.005;
    return {
      date: d.toISOString().slice(0, 10),
      avg_cost_savings: 0.18 + drift + (Math.random() - 0.5) * 0.04,
      avg_outcome_improvement: 0.08 + drift + (Math.random() - 0.5) * 0.03,
      comparisons_evaluated: 8 + Math.floor(Math.random() * 5),
    };
  });
}

export function getMockRecommendationBreakdown(): RecommendationBreakdown[] {
  return [
    { action: 'promote', count: 5, avg_confidence: 0.88 },
    { action: 'shadow', count: 3, avg_confidence: 0.62 },
    { action: 'suppress', count: 2, avg_confidence: 0.79 },
    { action: 'fork', count: 2, avg_confidence: 0.55 },
  ];
}

export function getMockBaselinesResponse(): BaselinesResponse {
  return {
    summary: getMockBaselinesSummary(),
    comparisons: getMockComparisons(),
    trend: getMockROITrend(),
    breakdown: getMockRecommendationBreakdown(),
  };
}
