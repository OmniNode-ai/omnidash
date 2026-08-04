// Projection row/shape types for onex.snapshot.projection.delegation.savings.v1
// (backed by the savings_estimates table, OMN-10623).
//
// Extracted from the former DelegationSavingsWidget.tsx (retired under
// OMN-14896 — the widget itself now reads a real cost breakdown from
// llm_cost_aggregates instead). These types remain the wire contract for the
// delegation-control-plane's cross-source run correlation
// (useDelegationEvidenceSnapshot.ts / DelegationRunContext) and for
// DelegationCostComparisonWidget, both of which still legitimately read
// TOPICS.delegationSavings for per-session run identification — that usage
// is out of OMN-14896's scope (see PR body).

export interface DelegationSavingsSession {
  session_id: string;
  task_type?: string;
  local_cost_usd: number;
  cloud_cost_usd: number;
  savings_usd: number;
  baseline_model: string;
  pricing_manifest_version: string;
  savings_method: 'measured' | 'estimated';
  usage_source: 'measured' | 'estimated' | 'unknown';
  /** Model used for this session (from delegation_events.model_name). */
  model_name?: string;
  /** Total prompt tokens (from llm_call_metrics.prompt_tokens). */
  prompt_tokens?: number;
  /** Total completion tokens (from llm_call_metrics.completion_tokens). */
  completion_tokens?: number;
  /** Total tokens spent until quality-gate compliance. */
  tokens_to_compliance?: number;
  /** Delegation latency in ms (from delegation_events.latency_ms). */
  latency_ms?: number;
  created_at: string;
  prompt_text?: string | null;
  response_text?: string | null;
}

export interface DelegationSavingsProjection {
  cumulative_savings_usd: number;
  cumulative_local_cost_usd: number;
  cumulative_cloud_cost_usd: number;
  baseline_model: string;
  pricing_manifest_version: string;
  session_count: number;
  sessions: DelegationSavingsSession[];
  captured_at: string;
  provisioned: boolean;
}
