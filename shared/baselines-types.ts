/**
 * Baselines & ROI Dashboard Types (OMN-2156)
 *
 * Shared types for the cost + outcome comparison dashboard.
 * Supports baseline vs candidate pattern comparison, delta metrics,
 * and promotion recommendations.
 */

// ============================================================================
// Promotion Recommendations
// ============================================================================

/** Actionable recommendation for a pattern based on measured ROI. */
export type PromotionAction = 'promote' | 'shadow' | 'suppress' | 'fork';

/** Confidence level for a recommendation. */
export type ConfidenceLevel = 'high' | 'medium' | 'low';

// ============================================================================
// Delta Metrics
// ============================================================================

/** A single delta metric comparing baseline vs candidate. */
export interface DeltaMetric {
  label: string;
  baseline: number;
  candidate: number;
  delta: number;
  /** Positive delta direction: 'lower_is_better' for cost/time, 'higher_is_better' for pass rate. */
  direction: 'lower_is_better' | 'higher_is_better';
  unit: string;
}

// ============================================================================
// Pattern Comparison
// ============================================================================

/** Full comparison record for a single pattern (baseline vs candidate). */
export interface PatternComparison {
  pattern_id: string;
  pattern_name: string;
  /** Number of sessions evaluated for this comparison. */
  sample_size: number;
  /** When the comparison window started. */
  window_start: string;
  /** When the comparison window ended. */
  window_end: string;

  /** Token usage delta. */
  token_delta: DeltaMetric;
  /** Execution time delta. */
  time_delta: DeltaMetric;
  /** Retry count delta. */
  retry_delta: DeltaMetric;
  /** Test pass rate delta. */
  test_pass_rate_delta: DeltaMetric;
  /** Review iteration delta. */
  review_iteration_delta: DeltaMetric;

  /** Recommended action based on measured data. */
  recommendation: PromotionAction;
  /** Confidence in the recommendation. */
  confidence: ConfidenceLevel;
  /** Human-readable rationale for the recommendation. */
  rationale: string;
}

// ============================================================================
// API Responses
// ============================================================================

/** Summary statistics for the ROI dashboard hero metrics. */
export interface BaselinesSummary {
  /** Total patterns currently under comparison. */
  total_comparisons: number;
  /** Patterns recommended for promotion. */
  promote_count: number;
  /** Patterns recommended for shadow testing. */
  shadow_count: number;
  /** Patterns recommended for suppression. */
  suppress_count: number;
  /** Patterns recommended for forking. */
  fork_count: number;
  /**
   * Average cost savings across all promoted patterns (0-1 ratio).
   *
   * Computed as an unweighted mean-of-means: the arithmetic mean of the per-day
   * `avg_cost_savings` values across all trend points in the latest snapshot.
   * Days with few comparisons contribute equally to days with many comparisons.
   * This is NOT a time-period-weighted average.
   */
  avg_cost_savings: number;
  /**
   * Average outcome improvement across all promoted patterns (0-1 ratio).
   *
   * Computed as an unweighted mean-of-means: the arithmetic mean of the per-day
   * `avg_outcome_improvement` values across all trend points in the latest snapshot.
   * Days with few comparisons contribute equally to days with many comparisons.
   * This is NOT a time-period-weighted average.
   */
  avg_outcome_improvement: number;
  /** Total token savings (baseline tokens - candidate tokens). */
  total_token_savings: number;
  /** Total time savings in ms (baseline - candidate). */
  total_time_savings_ms: number;
}

/** Trend data point for ROI over time. */
export interface ROITrendPoint {
  date: string;
  /** Average cost savings ratio on this day. */
  avg_cost_savings: number;
  /** Average outcome improvement ratio on this day. */
  avg_outcome_improvement: number;
  /** Number of comparisons evaluated. */
  comparisons_evaluated: number;
}

/** Aggregate counts by recommendation action. */
export interface RecommendationBreakdown {
  action: PromotionAction;
  count: number;
  avg_confidence: number;
}

/** Full response for the baselines dashboard. */
export interface BaselinesResponse {
  summary: BaselinesSummary;
  comparisons: PatternComparison[];
  trend: ROITrendPoint[];
  breakdown: RecommendationBreakdown[];
}
