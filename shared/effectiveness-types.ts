/**
 * Injection Effectiveness Types
 *
 * Shared types for the effectiveness dashboard API and client.
 * Tables were created by OMN-1890 in omnibase_infra.
 *
 * @see OMN-1891 - Build Effectiveness Dashboard
 */

// Database row types are inferred from Drizzle in shared/intelligence-schema.ts:
//   InjectionEffectivenessRow, LatencyBreakdownRow, PatternHitRateRow

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

/** Multi-metric trend point for the summary chart */
export interface EffectivenessTrendPoint {
  date: string;
  injection_rate: number;
  avg_utilization: number;
  avg_accuracy: number;
  avg_latency_delta_ms: number;
}

/** Session Detail (OMN-2049 F3) */
export interface SessionDetail {
  session_id: string;
  agent_name: string | null;
  detection_method: string | null;
  utilization_score: number;
  latency_routing_ms: number;
  latency_retrieval_ms: number;
  latency_injection_ms: number;
  latency_total_ms: number;
  cohort: string;
  injection_content_summary: string | null;
  pattern_count: number;
  created_at: string;
}
