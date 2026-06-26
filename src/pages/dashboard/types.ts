// Projection shapes the savings dashboard reads. Each is the aggregated object a
// single-object projection returns at `GET /projection/{topic}` (the read path is
// `useProjectionQuery` → snapshot source → fixtures in dev, Jonah's Postgres API
// in prod). Fields are documented in
// docs/projects/dashboard_refactor_2/planning/dashboard-data-sourcing.md.

/** One delegated task in the savings projection's session list. */
export interface DelegationSavingsSession {
  session_id: string;
  task_type: string;
  local_cost_usd: number;
  cloud_cost_usd: number;
  savings_usd: number;
  baseline_model: string;
  /** Per the data-sourcing correction, this is dashboard-derived, not a real provenance column. */
  savings_method: 'measured' | 'estimated';
  usage_source: string;
  model_name: string;
  prompt_tokens: number;
  completion_tokens: number;
  tokens_to_compliance: number | null;
  /** Re-prompts within the serving tier to reach a contract-valid result (>=1). */
  compliance_attempts?: number;
  latency_ms: number;
  created_at: string;
  prompt_text?: string;
  response_text?: string;
}

/** One time bucket of the savings-over-time series. */
export interface SavingsSeriesPoint {
  bucket: string;
  /** Actual (cheaper-tier) cost in this bucket. */
  actual_cost_usd: number;
  /** Counterfactual premium-baseline cost in this bucket. */
  baseline_cost_usd: number;
  savings_usd: number;
  /** Tier mix (share of tasks), summing to 1. */
  local_pct: number;
  cheap_pct: number;
  prem_pct: number;
}

/** `onex.snapshot.projection.delegation.savings.v1` — the hero savings number. */
export interface DelegationSavingsProjection {
  entity_id?: string;
  /** Headline: estimated savings vs the premium baseline. Zero is honest (frontier was needed). */
  cumulative_savings_usd: number;
  /** What the work actually cost on the cheaper/local tiers. */
  cumulative_local_cost_usd: number;
  /** Counterfactual: what the same work would have cost at the premium baseline. */
  cumulative_cloud_cost_usd: number;
  baseline_model: string;
  pricing_manifest_version: string;
  session_count: number;
  sessions: DelegationSavingsSession[];
  /** Over-time breakdown for the savings depth view. */
  series?: SavingsSeriesPoint[];
  /** false ⇒ contract-valid fixtures, not live data. Drives the "sample data" marker. */
  provisioned: boolean;
}

/** Per-model row in the model-routing projection. */
export interface ModelRoutingByModel {
  model_name: string;
  count: number;
  pct?: number;
}

/** `onex.snapshot.projection.delegation.model-routing.v1` — which model served what. */
export interface ModelRoutingProjection {
  entity_id?: string;
  total_delegations: number;
  by_model: ModelRoutingByModel[];
  rows?: Array<{ model_name: string; task_type: string; count: number; pct?: number }>;
  provisioned: boolean;
}

/**
 * One row of `onex.snapshot.projection.delegation.decisions.v1` (the contract
 * shape declared in src/services/event-dash-api.ts as DelegationDecisionRow).
 * The recent-runs table joins this in by `session_id` for the quality gate.
 */
export interface DelegationDecisionRow {
  id: string;
  correlation_id: string;
  session_id: string | null;
  task_type: string;
  delegated_to: string | null;
  model_name: string;
  quality_gate_passed: boolean;
  quality_gate_detail: string | null;
  latency_ms: number | null;
  tokens_input: number | null;
  tokens_output: number | null;
  tokens_to_compliance: number | null;
  created_at: string;
}

/** One time bucket of the tokens trend (used vs saved over the period). */
export interface TokenSeriesPoint {
  bucket: string;
  tokens_used: number;
  tokens_saved: number;
}

/** `onex.snapshot.projection.delegation.token-usage.v1` — metered token consumption. */
export interface TokenUsageProjection {
  entity_id?: string;
  total_prompt_tokens: number;
  total_completion_tokens: number;
  total_tokens: number;
  /**
   * Counterfactual "tokens saved" vs the premium baseline. DESIGN/FIXTURE ONLY —
   * there is no real projection field behind this today (cheaper models use about
   * the same tokens; the real token-reduction lever, node reuse, is not
   * instrumented). Present only so the dual-line design can be reviewed.
   */
  total_tokens_saved?: number;
  total_estimated_cost_usd: number;
  provenance_summary: { measured: number; estimated: number; unknown: number };
  by_model: Array<{ model_name: string; total_tokens: number }>;
  /** Used/saved trend. Same caveat as `total_tokens_saved` for the saved line. */
  series?: TokenSeriesPoint[];
  provisioned: boolean;
}
