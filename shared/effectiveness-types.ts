/**
 * Injection Effectiveness Types
 *
 * Shared types for the effectiveness dashboard API and client.
 * Tables were created by OMN-1890 in omnibase_infra.
 *
 * @see OMN-1891 - Build Effectiveness Dashboard
 */

// ============================================================================
// Database Row Types (mirrors OMN-1890 schema)
// ============================================================================

export interface InjectionEffectivenessRow {
  id: string;
  session_id: string;
  correlation_id: string;
  cohort: 'treatment' | 'control';
  injection_occurred: boolean;
  agent_name: string | null;
  detection_method: string | null;
  utilization_score: number | null;
  utilization_method: string | null;
  agent_match_score: number | null;
  user_visible_latency_ms: number | null;
  session_outcome: string | null;
  routing_time_ms: number | null;
  retrieval_time_ms: number | null;
  injection_time_ms: number | null;
  patterns_count: number | null;
  cache_hit: boolean;
  created_at: string;
}

export interface LatencyBreakdownRow {
  id: string;
  session_id: string;
  prompt_id: string;
  routing_time_ms: number | null;
  retrieval_time_ms: number | null;
  injection_time_ms: number | null;
  user_visible_latency_ms: number | null;
  cohort: string;
  cache_hit: boolean;
  created_at: string;
}

export interface PatternHitRateRow {
  id: string;
  session_id: string;
  pattern_id: string;
  utilization_score: number | null;
  utilization_method: string | null;
  created_at: string;
}

// ============================================================================
// API Response Types
// ============================================================================

/** Executive Summary (R1) */
export interface EffectivenessSummary {
  injection_rate: number;
  injection_rate_target: number;
  median_utilization: number;
  utilization_target: number;
  mean_agent_accuracy: number;
  accuracy_target: number;
  latency_delta_p95_ms: number;
  latency_delta_target_ms: number;
  total_sessions: number;
  treatment_sessions: number;
  control_sessions: number;
  throttle_active: boolean;
  throttle_reason: string | null;
}

/** Auto-Throttle Status (R2) */
export interface ThrottleStatus {
  active: boolean;
  reason: string | null;
  latency_delta_p95_1h: number | null;
  median_utilization_1h: number | null;
  injected_sessions_1h: number;
  window_start: string | null;
}

/** Latency Breakdown (R3) */
export interface LatencyBreakdown {
  cohort: string;
  p50_ms: number;
  p95_ms: number;
  p99_ms: number;
  routing_avg_ms: number;
  retrieval_avg_ms: number;
  injection_avg_ms: number;
  sample_count: number;
}

export interface LatencyTrendPoint {
  date: string;
  treatment_p50: number;
  treatment_p95: number;
  control_p50: number;
  control_p95: number;
  delta_p95: number;
}

export interface CacheStats {
  hit_rate: number;
  total_hits: number;
  total_misses: number;
}

export interface LatencyDetails {
  breakdowns: LatencyBreakdown[];
  trend: LatencyTrendPoint[];
  cache: CacheStats;
}

/** Utilization Analytics (R4) */
export interface UtilizationBucket {
  range_start: number;
  range_end: number;
  count: number;
}

export interface UtilizationByMethod {
  method: string;
  median_score: number;
  session_count: number;
}

export interface PatternUtilization {
  pattern_id: string;
  avg_utilization: number;
  session_count: number;
}

export interface LowUtilizationSession {
  session_id: string;
  utilization_score: number;
  agent_name: string | null;
  detection_method: string | null;
  created_at: string;
}

export interface UtilizationDetails {
  histogram: UtilizationBucket[];
  by_method: UtilizationByMethod[];
  pattern_rates: PatternUtilization[];
  low_utilization_sessions: LowUtilizationSession[];
}

/** A/B Comparison (R5) */
export interface CohortComparison {
  cohort: string;
  session_count: number;
  median_utilization_pct: number;
  avg_accuracy_pct: number;
  success_rate_pct: number;
  avg_latency_ms: number;
}

export interface ABComparison {
  cohorts: CohortComparison[];
  total_sessions: number;
}
