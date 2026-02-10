/**
 * Extraction Pipeline Types
 *
 * Shared request/response interfaces for the pattern extraction
 * metrics dashboard (OMN-1804).
 *
 * PostgreSQL is the single source of truth for all data.
 * These types define the API contract between server and client.
 */

// ============================================================================
// API Response Types
// ============================================================================

/**
 * Summary stats for the extraction pipeline (stats cards row).
 */
export interface ExtractionSummary {
  total_injections: number;
  total_patterns_matched: number;
  avg_utilization_score: number | null;
  avg_latency_ms: number | null;
  success_rate: number | null;
  /** ISO timestamp of last recorded event */
  last_event_at: string | null;
}

/**
 * Pipeline health overview grouped by cohort.
 * Cohort represents the pipeline variant/bucket for a given run.
 */
export interface PipelineCohortHealth {
  cohort: string;
  total_events: number;
  success_count: number;
  failure_count: number;
  success_rate: number;
  avg_latency_ms: number | null;
}

export interface PipelineHealthResponse {
  cohorts: PipelineCohortHealth[];
}

/**
 * Latency heatmap data: percentiles by time bucket.
 */
export interface LatencyBucket {
  /** ISO date string for the time bucket (e.g. hour or day) */
  bucket: string;
  p50: number | null;
  p95: number | null;
  p99: number | null;
  sample_count: number;
}

export interface LatencyHeatmapResponse {
  buckets: LatencyBucket[];
  window: string;
}

/**
 * Pattern volume chart data: pattern matches over time.
 */
export interface PatternVolumePoint {
  /** ISO date string for the time bucket */
  bucket: string;
  patterns_matched: number;
  injections: number;
}

export interface PatternVolumeResponse {
  points: PatternVolumePoint[];
  window: string;
}

/**
 * Error rates summary: failure counts and rates by cohort.
 */
export interface ErrorRateEntry {
  cohort: string;
  total_events: number;
  failure_count: number;
  error_rate: number;
  /** Recent error samples for debugging context */
  recent_errors: Array<{
    session_id: string;
    created_at: string;
    session_outcome: string | null;
  }>;
}

export interface ErrorRatesSummaryResponse {
  entries: ErrorRateEntry[];
  total_errors: number;
  overall_error_rate: number | null;
}

// ============================================================================
// Kafka Event Type Guards
// ============================================================================

/**
 * Context utilization event from omniclaude.
 * Maps to injection_effectiveness table.
 */
export interface ContextUtilizationEvent {
  session_id: string;
  correlation_id: string;
  cohort: string;
  injection_occurred?: boolean;
  agent_name?: string;
  detection_method?: string;
  utilization_score?: number;
  utilization_method?: string;
  agent_match_score?: number;
  user_visible_latency_ms?: number;
  session_outcome?: string;
  routing_time_ms?: number;
  retrieval_time_ms?: number;
  injection_time_ms?: number;
  patterns_count?: number;
  cache_hit?: boolean;
  timestamp?: string;
}

/**
 * Agent match event from omniclaude.
 * Also maps to injection_effectiveness with agent match specifics.
 */
export interface AgentMatchEvent {
  session_id: string;
  correlation_id: string;
  cohort: string;
  agent_match_score?: number;
  agent_name?: string;
  session_outcome?: string;
  injection_occurred?: boolean;
  timestamp?: string;
}

/**
 * Latency breakdown event from omniclaude.
 * Maps to latency_breakdowns table.
 */
export interface LatencyBreakdownEvent {
  session_id: string;
  prompt_id: string;
  cohort: string;
  routing_time_ms?: number;
  retrieval_time_ms?: number;
  injection_time_ms?: number;
  user_visible_latency_ms?: number;
  cache_hit?: boolean;
  timestamp?: string;
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Narrow an unknown Kafka payload to a ContextUtilizationEvent.
 *
 * Validates the required base fields (session_id, correlation_id, cohort).
 * Optional fields like `utilization_score` are NOT required here — the caller
 * discriminates event types via topic-specific switch cases, so the type guard
 * only needs to validate structural correctness. Requiring optional fields
 * would silently drop valid events that omit them.
 */
export function isContextUtilizationEvent(e: unknown): e is ContextUtilizationEvent {
  return (
    typeof e === 'object' &&
    e !== null &&
    typeof (e as ContextUtilizationEvent).session_id === 'string' &&
    typeof (e as ContextUtilizationEvent).correlation_id === 'string' &&
    typeof (e as ContextUtilizationEvent).cohort === 'string'
  );
}

/**
 * Narrow an unknown Kafka payload to an AgentMatchEvent.
 *
 * Validates the required base fields (session_id, correlation_id, cohort).
 * Optional fields like `agent_match_score` are NOT required — the caller
 * discriminates via topic-specific switch cases, so the guard only validates
 * structural correctness. Requiring optional fields would silently drop events.
 */
export function isAgentMatchEvent(e: unknown): e is AgentMatchEvent {
  return (
    typeof e === 'object' &&
    e !== null &&
    typeof (e as AgentMatchEvent).session_id === 'string' &&
    typeof (e as AgentMatchEvent).correlation_id === 'string' &&
    typeof (e as AgentMatchEvent).cohort === 'string'
  );
}

/** Narrow an unknown Kafka payload to a LatencyBreakdownEvent. */
export function isLatencyBreakdownEvent(e: unknown): e is LatencyBreakdownEvent {
  return (
    typeof e === 'object' &&
    e !== null &&
    typeof (e as LatencyBreakdownEvent).session_id === 'string' &&
    typeof (e as LatencyBreakdownEvent).prompt_id === 'string' &&
    typeof (e as LatencyBreakdownEvent).cohort === 'string'
  );
}
