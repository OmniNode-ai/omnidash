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
 * Pipeline health overview grouped by stage.
 */
export interface PipelineStageHealth {
  stage: string;
  total_events: number;
  success_count: number;
  failure_count: number;
  success_rate: number;
  avg_latency_ms: number | null;
}

export interface PipelineHealthResponse {
  stages: PipelineStageHealth[];
}

/**
 * Latency heatmap data: percentiles by stage and time bucket.
 */
export interface LatencyBucket {
  /** ISO date string for the time bucket (e.g. hour or day) */
  bucket: string;
  stage: string;
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
 * Error rates summary: failure counts and rates by stage.
 */
export interface ErrorRateEntry {
  stage: string;
  total_events: number;
  failure_count: number;
  error_rate: number;
  /** Recent error samples for debugging context */
  recent_errors: Array<{
    session_id: string;
    created_at: string;
    metadata: Record<string, unknown>;
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
  cohort?: string;
  utilization_score?: number;
  agent_match_score?: number;
  user_visible_latency_ms?: number;
  routing_time_ms?: number;
  retrieval_time_ms?: number;
  injection_time_ms?: number;
  outcome?: string;
  stage?: string;
  timestamp?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Agent match event from omniclaude.
 * Also maps to injection_effectiveness with agent match specifics.
 */
export interface AgentMatchEvent {
  session_id: string;
  agent_match_score?: number;
  cohort?: string;
  outcome?: string;
  stage?: string;
  timestamp?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Latency breakdown event from omniclaude.
 * Maps to latency_breakdowns table.
 */
export interface LatencyBreakdownEvent {
  session_id: string;
  prompt_id?: string;
  routing_time_ms?: number;
  retrieval_time_ms?: number;
  injection_time_ms?: number;
  user_visible_latency_ms?: number;
  cohort?: string;
  timestamp?: string;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Type Guards
// ============================================================================

export function isContextUtilizationEvent(e: unknown): e is ContextUtilizationEvent {
  return (
    typeof e === 'object' &&
    e !== null &&
    typeof (e as ContextUtilizationEvent).session_id === 'string'
  );
}

export function isAgentMatchEvent(e: unknown): e is AgentMatchEvent {
  return (
    typeof e === 'object' && e !== null && typeof (e as AgentMatchEvent).session_id === 'string'
  );
}

export function isLatencyBreakdownEvent(e: unknown): e is LatencyBreakdownEvent {
  return (
    typeof e === 'object' &&
    e !== null &&
    typeof (e as LatencyBreakdownEvent).session_id === 'string'
  );
}
