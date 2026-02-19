/**
 * LLM Routing Effectiveness Types (OMN-2279)
 *
 * Shared type definitions for the LLM routing effectiveness dashboard.
 * Events consumed from: onex.evt.omniclaude.llm-routing-decision.v1
 *
 * The dashboard compares LLM-based agent routing vs. fuzzy-string routing
 * to measure how well the two methods agree and highlight divergence that
 * may indicate a flawed prompt or a mis-ranked fuzzy matcher.
 */

// ============================================================================
// Kafka Event Schema
// ============================================================================

/**
 * Raw event payload from `onex.evt.omniclaude.llm-routing-decision.v1`.
 *
 * Emitted by the omniclaude routing hook whenever an LLM routing decision
 * is made alongside (or instead of) the fuzzy fallback routing decision.
 */
export interface LlmRoutingDecisionEvent {
  /** ISO-8601 timestamp */
  timestamp: string;
  /** Unique correlation ID for this routing decision */
  correlation_id: string;
  /** Session ID (if available) */
  session_id?: string;
  /** Agent selected by LLM routing */
  llm_agent: string;
  /** Agent selected by fuzzy-string routing (may differ from llm_agent) */
  fuzzy_agent: string;
  /** Whether LLM and fuzzy agreed on the same agent */
  agreement: boolean;
  /** Confidence score from LLM routing decision (0–1) */
  llm_confidence: number;
  /** Confidence score from fuzzy-string routing (0–1) */
  fuzzy_confidence: number;
  /** Latency for LLM routing decision in milliseconds */
  llm_latency_ms: number;
  /** Latency for fuzzy routing decision in milliseconds */
  fuzzy_latency_ms: number;
  /**
   * Whether the fuzzy matcher was used as a fallback (true when LLM was
   * unavailable or timed out).
   */
  used_fallback: boolean;
  /** Prompt version used for the LLM routing call */
  routing_prompt_version: string;
  /** The original intent string that triggered routing */
  intent?: string;
  /** LLM model used for routing */
  model?: string;
  /** Estimated cost of the LLM routing call in USD */
  cost_usd?: number;
}

// ============================================================================
// API Response Types
// ============================================================================

/** Aggregate summary metrics for the LLM routing dashboard hero cards. */
export interface LlmRoutingSummary {
  /** Total routing decisions in the window */
  total_decisions: number;
  /**
   * Agreement rate between LLM and fuzzy routing (0–1).
   * GOLDEN METRIC: target >60%. Below 40% triggers an alert.
   */
  agreement_rate: number;
  /**
   * Fallback frequency — how often the system fell back to fuzzy-only
   * routing because LLM was unavailable (0–1).
   */
  fallback_rate: number;
  /**
   * Average cost per routing decision in USD.
   * Used to track the cost trade-off of LLM-assisted routing.
   */
  avg_cost_usd: number;
  /** p50 LLM routing latency (ms) */
  llm_p50_latency_ms: number;
  /** p95 LLM routing latency (ms) */
  llm_p95_latency_ms: number;
  /** p50 fuzzy routing latency (ms) */
  fuzzy_p50_latency_ms: number;
  /** p95 fuzzy routing latency (ms) */
  fuzzy_p95_latency_ms: number;
  /** Absolute decision counts */
  counts: {
    total: number;
    agreed: number;
    disagreed: number;
    fallback: number;
  };
  /** Rolling trend for agreement rate over the selected window */
  agreement_rate_trend: Array<{ date: string; value: number }>;
}

/** Latency distribution data point per routing method. */
export interface LlmRoutingLatencyPoint {
  /** Routing method label (e.g. "LLM" or "Fuzzy") */
  method: string;
  /** p50 latency (ms) */
  p50_ms: number;
  /** p90 latency (ms) */
  p90_ms: number;
  /** p95 latency (ms) */
  p95_ms: number;
  /** p99 latency (ms) */
  p99_ms: number;
  /** Total samples */
  sample_count: number;
}

/** Agreement rate comparison broken down by routing_prompt_version. */
export interface LlmRoutingByVersion {
  /** Prompt version string (e.g. "v1.0.0", "v1.1.0") */
  routing_prompt_version: string;
  /** Total decisions for this version */
  total: number;
  /** Number of decisions where LLM and fuzzy agreed */
  agreed: number;
  /** Number of decisions where they disagreed */
  disagreed: number;
  /** Agreement rate for this version (0–1) */
  agreement_rate: number;
  /** Average LLM latency for this version (ms) */
  avg_llm_latency_ms: number;
  /** Average fuzzy latency for this version (ms) */
  avg_fuzzy_latency_ms: number;
  /** Average cost per decision for this version (USD) */
  avg_cost_usd: number;
}

/** Disagreement entry in the top-disagreements table. */
export interface LlmRoutingDisagreement {
  /** Timestamp of the most recent disagreement for this pair */
  occurred_at: string;
  /** Agent selected by LLM */
  llm_agent: string;
  /** Agent selected by fuzzy matcher */
  fuzzy_agent: string;
  /** Number of times this pair has disagreed in the window */
  count: number;
  /** Average LLM confidence for this pair (0–1) */
  avg_llm_confidence: number;
  /** Average fuzzy confidence for this pair (0–1) */
  avg_fuzzy_confidence: number;
  /** Routing prompt version that produced most of these disagreements */
  routing_prompt_version: string;
}

/** Time-series trend data point for the multi-metric chart. */
export interface LlmRoutingTrendPoint {
  /** Date label (ISO-8601 date string, e.g. "2026-02-17") */
  date: string;
  /** Agreement rate in this period (0–1) */
  agreement_rate: number;
  /** Fallback rate in this period (0–1) */
  fallback_rate: number;
  /** Average cost per decision in this period (USD) */
  avg_cost_usd: number;
  /** Total decisions in this period */
  total_decisions: number;
}

/** Valid time windows for LLM routing dashboard queries. */
export type LlmRoutingTimeWindow = '24h' | '7d' | '30d';
