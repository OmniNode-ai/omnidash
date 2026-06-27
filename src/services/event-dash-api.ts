/**
 * OMN-12943: Contract-backed data adapter for the four ported event-dash views
 * (delegation-evidence, event-bus, experiments, sea-control).
 *
 * Every function reads a REAL projection via `projectionUrl(topic)` → the single
 * `/projection/{topic}` backend (same-origin proxy in serve mode). There is no
 * fixture path here: these views ship live-only. A topic that returns no rows,
 * an `unknown_topic` body, or a `{status:'degraded'}` body resolves to a typed
 * `ProjectionResult` with `rows: []` plus the freshness/degraded/reason fields,
 * so each panel renders an explicit honest empty/degraded state — never mock data.
 *
 * This is the canonical boundary where raw JSON is normalized into typed rows;
 * the page components consume the typed result and never cast `res.json()`
 * themselves (keeps the no-cast-on-parsed-json + no-projection-fallback lint
 * rules satisfied at the call sites).
 *
 * Topic strings live in `shared/types/topics.ts` (TOPICS); never inline a literal.
 */

import { TOPICS } from "@shared/types/topics";
import { projectionUrl } from "@/data-source/projection-base-url";

/**
 * SEA node-generation-completed projection topic. Unlike the entries in
 * `TOPICS` (which are all `onex.snapshot.projection.*` snapshot projections),
 * this is a bus EVENT topic that the projection API also serves at
 * `/projection/<topic>` (verified live on :13002). It deliberately does NOT
 * live in `shared/types/topics.ts` because that const is contractually
 * restricted to the `snapshot.projection.*` namespace (enforced by
 * topics.test.ts + the golden-chain coverage gate). Defined here so the SEA +
 * event-bus views can read it without violating that convention.
 */
const NODE_GENERATION_COMPLETED_TOPIC =
  "onex.evt.omnimarket.node-generation-completed.v1";

/**
 * OMN-12999: latest-N window the SEA / Event-Bus tiles actually render.
 *
 * The bus/correlation surfaces show a count plus the newest correlations
 * (subject/model/latency/state); the full `contract_yaml` / `handler_source`
 * payload bodies are never displayed (the contract YAML is only regex-scanned
 * for a node name). The projection contract declares `order_by: created_at DESC`
 * with a `limit: 500` ceiling, so requesting the newest 50 rows is a
 * contract-respecting bounded read. Without this bound the panel pulls the full
 * unbounded payload (~419 KB), whose server-side serialization stalled the tiles
 * at '—' for ~10-28 s (measured 2026-06-11 against the live :13002 backend).
 */
const NODE_GENERATION_WINDOW = 50;

// ── Envelope + result types ──────────────────────────────────────────────────

/** Freshness reported by the projection API envelope. */
export type ProjectionFreshness = "fresh" | "stale" | "degraded" | "unknown";

/** Normalized result of a single projection read. */
export interface ProjectionResult<T> {
  rows: T[];
  rowCount: number;
  freshness: ProjectionFreshness;
  latestEventAt: string | null;
  /** True when the backend reports degraded (missing table / unknown topic / degraded freshness). */
  isDegraded: boolean;
  /** Backend-supplied reason when degraded/unknown (verbatim), else null. */
  degradedReason: string | null;
}

interface RawEnvelope {
  rows?: unknown;
  row_count?: unknown;
  data_freshness?: unknown;
  latest_event_at?: unknown;
  status?: unknown;
  reason?: unknown;
  error?: unknown;
}

function asString(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

function asFreshness(v: unknown): ProjectionFreshness {
  return v === "fresh" || v === "stale" || v === "degraded" ? v : "unknown";
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

/**
 * Normalize a raw projection-API body into a typed ProjectionResult. Handles
 * the three real backend shapes observed on :13002:
 *   1. `{ rows: [...], row_count, data_freshness, latest_event_at }` (served)
 *   2. `{ status: 'degraded', reason: "table '...' not found at startup" }`
 *   3. `{ error: 'unknown_topic', available_topics: [...] }`
 */
function normalize<T>(body: unknown): ProjectionResult<T> {
  if (!isRecord(body)) {
    return {
      rows: [],
      rowCount: 0,
      freshness: "unknown",
      latestEventAt: null,
      isDegraded: true,
      degradedReason: "malformed projection response",
    };
  }
  const env = body as RawEnvelope;

  // Shape 3: unknown topic.
  const errStr = asString(env.error);
  if (errStr) {
    return {
      rows: [],
      rowCount: 0,
      freshness: "unknown",
      latestEventAt: null,
      isDegraded: true,
      degradedReason: `topic not served (${errStr})`,
    };
  }

  // Shape 2: degraded status with a reason (no rows array).
  const statusStr = asString(env.status);
  if (statusStr === "degraded" && !Array.isArray(env.rows)) {
    return {
      rows: [],
      rowCount: 0,
      freshness: "degraded",
      latestEventAt: null,
      isDegraded: true,
      degradedReason: asString(env.reason),
    };
  }

  // Shape 1: served envelope.
  const rows = Array.isArray(env.rows) ? (env.rows as T[]) : [];
  const freshness = asFreshness(env.data_freshness);
  const rowCount =
    typeof env.row_count === "number" ? env.row_count : rows.length;
  return {
    rows,
    rowCount,
    freshness,
    latestEventAt: asString(env.latest_event_at),
    isDegraded: freshness !== "fresh",
    degradedReason: null,
  };
}

async function readProjection<T>(
  topic: string,
  query?: string,
): Promise<ProjectionResult<T>> {
  const url = projectionUrl(topic, query);
  const res = await fetch(url);
  if (!res.ok) {
    return {
      rows: [],
      rowCount: 0,
      freshness: "unknown",
      latestEventAt: null,
      isDegraded: true,
      degradedReason: `HTTP ${res.status}`,
    };
  }
  const body = (await res.json().catch(() => null)) as unknown;
  return normalize<T>(body);
}

// ── Delegation row types (decisions / summary / routing / quality / savings / tokens) ──

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

export interface DelegationSummaryRow {
  totalDelegations: number;
  qualityGatePassRate: number;
  qualityGatePassed: number;
  qualityGateTotal: number;
  totalSavingsUsd: number;
  avgLatencyMs: number;
}

export interface ModelRoutingInnerRow {
  count: number;
  task_type: string;
  model_name: string;
  pct_of_model: number;
  pct_of_total: number;
}

export interface ModelRoutingRow {
  total_delegations: number;
  rows: ModelRoutingInnerRow[];
}

export interface QualityGateFailureCategory {
  count: number;
  category: string;
  pct_of_failures: number;
}

export interface QualityGateRow {
  overall_pass_rate: number;
  total_passed: number;
  total_failed: number;
  total_checks: number;
  escalation_count: number;
  escalation_rate: number;
  failure_categories: QualityGateFailureCategory[];
}

export interface SavingsRow {
  cumulative_savings_usd: number;
  cumulative_local_cost_usd: number;
  cumulative_cloud_cost_usd: number;
  baseline_model: string;
  pricing_manifest_version: string;
  session_count: number;
}

export interface TokenUsageByModel {
  model_id: string;
  model_name: string;
  total_tokens: number;
  prompt_tokens: number;
  completion_tokens: number;
  estimated_cost_usd: number;
  token_provenance: string;
}

export interface TokenUsageRow {
  total_prompt_tokens: number;
  total_completion_tokens: number;
  total_tokens: number;
  total_estimated_cost_usd: number;
  by_model: TokenUsageByModel[];
}

/** Correlation-trace row — carries prompt_text / response_text per correlation_id. */
export interface CorrelationTraceRow {
  id: string;
  correlation_id: string;
  task_type: string;
  model_name: string;
  quality_gate_passed: boolean;
  quality_gate_detail: string | null;
  latency_ms: number | null;
  tokens_input: number | null;
  tokens_output: number | null;
  cost_usd: number | null;
  cost_savings_usd: number | null;
  routing_rule: string | null;
  prompt_text: string | null;
  response_text: string | null;
  created_at: string;
}

// ── SEA / node-generation row type ───────────────────────────────────────────

/**
 * One row from the node-generation-completed.v1 projection, backed by the
 * `generation_events` table (node_projection_delegation reducer).
 *
 * Fields mirror the projection_api.exposures columns in the
 * node_projection_delegation contract.yaml verbatim — never add a field here
 * that the projection contract does not expose. Column additions require a
 * backend migration + contract update first.
 *
 * OMN-13166: `semantic_checked` / `semantic_passed` — behavioral verdict (shape
 * valid ≠ behaviorally correct; gate-zero false-greens are now visible).
 * OMN-13289: `corpus_checked` / `corpus_passed` / `corpus_errors` — validator
 * acceptance verdict (a shape-valid generated scanner that fails corpus = false).
 */
export interface NodeGenerationRow {
  id: string;
  correlation_id: string;
  task_description: string;
  provider: string;
  model_id: string;
  endpoint_class: string;
  attempt_count: number;
  total_latency_e2e_ms: number;
  contract_passed: boolean;
  /** OMN-13166: true when the behavioral semantic check ran. */
  semantic_checked: boolean;
  /** OMN-13166: true when the generated node passed behavioral validation. */
  semantic_passed: boolean;
  /** OMN-13289: true when a validator acceptance corpus gate ran. */
  corpus_checked: boolean;
  /** OMN-13289: true when the generated scanner passed every corpus fixture. */
  corpus_passed: boolean;
  /** OMN-13289: list of corpus fixture errors when corpus_passed is false. */
  corpus_errors: unknown[];
  cost_inference_usd: string;
  contract_yaml: string;
  handler_source: string;
  output_payload_sha256: string;
  contract_sha256: string;
  handler_sha256: string;
  routing_source: string;
  resolved_endpoint: string;
  projection_owner: string;
  timestamp: string;
  created_at: string;
}

// ── Registration row (event-bus liveness) ────────────────────────────────────

export interface RegistrationRow {
  service_name: string;
  service_type: string | null;
  updated_at?: string;
}

// ── AB-compare row (experiments — PER-CALL projection shape) ─────────────────

/**
 * One PER-CALL row from `onex.snapshot.projection.ab-compare.v1`, backed by the
 * `llm_call_metrics` table (created in OMN-12970). Columns are the snake_case
 * projection-API columns verbatim. Each row is a single LLM call; the panel
 * aggregates these into per-model rollups (see ab-compare-aggregate.ts).
 *
 * Token usage is honest-nullable: the exp0 emitter currently writes
 * `prompt_tokens=0` / `usage_source='MISSING'` when the provider returned no
 * usage (tracked upstream by OMN-12994). The aggregation layer treats those as
 * ABSENT usage — never 0 masquerading as a measured value.
 */
export interface AbCompareRow {
  correlation_id: string;
  model_id: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  estimated_cost_usd: number | null;
  latency_ms: number | null;
  usage_source: string | null;
  created_at: string;
  task_description?: string;
}

// ── Context-ROI experiment score row (OMN-12955) ─────────────────────────────

/**
 * One projection row from
 * `onex.snapshot.projection.context.experiment-scores.v1`, backed by the
 * `context_roi_scores` table (omnimarket node_projection_context_roi). One row
 * per (run × task × arm × trial) cell captured by the context-ROI runner.
 * Columns are the snake_case projection-API columns verbatim — normalization
 * to the heatmap/hero view shapes happens in the panel layer.
 */
export interface ContextExperimentScoreRow {
  id: string;
  run_id: string;
  correlation_id: string;
  task_id: string;
  run_order: number;
  context_factor_subset: string;
  context_pack_hash: string;
  attempt_count: number;
  first_pass_success: boolean;
  final_success: boolean;
  failure_stage: string;
  prompt_tokens: number;
  completion_tokens: number;
  tokens_used: number;
  estimated_cost: number;
  model_id: string;
  provider: string;
  endpoint_ref: string;
  proof_class: string;
  created_at: string;
  updated_at: string;
}

// ── Public fetchers ──────────────────────────────────────────────────────────

export const fetchDelegationDecisions = (): Promise<
  ProjectionResult<DelegationDecisionRow>
> => readProjection<DelegationDecisionRow>(TOPICS.delegationDecisions);

export const fetchDelegationSummary = (): Promise<
  ProjectionResult<DelegationSummaryRow>
> => readProjection<DelegationSummaryRow>(TOPICS.delegationSummary);

export const fetchDelegationModelRouting = (): Promise<
  ProjectionResult<ModelRoutingRow>
> => readProjection<ModelRoutingRow>(TOPICS.delegationModelRouting);

export const fetchDelegationQualityGate = (): Promise<
  ProjectionResult<QualityGateRow>
> => readProjection<QualityGateRow>(TOPICS.delegationQualityGate);

export const fetchDelegationSavings = (): Promise<
  ProjectionResult<SavingsRow>
> => readProjection<SavingsRow>(TOPICS.delegationSavings);

export const fetchDelegationTokenUsage = (): Promise<
  ProjectionResult<TokenUsageRow>
> => readProjection<TokenUsageRow>(TOPICS.delegationTokenUsage);

export const fetchCorrelationTrace = (
  correlationId: string,
): Promise<ProjectionResult<CorrelationTraceRow>> =>
  readProjection<CorrelationTraceRow>(
    TOPICS.delegationCorrelationTrace,
    `correlation_id=${encodeURIComponent(correlationId)}`,
  );

export const fetchNodeGenerations = (): Promise<
  ProjectionResult<NodeGenerationRow>
> =>
  readProjection<NodeGenerationRow>(
    NODE_GENERATION_COMPLETED_TOPIC,
    `limit=${NODE_GENERATION_WINDOW}&order=desc`,
  );

// ── Generate (thin publisher) — OMN-13004 ────────────────────────────────────
//
// The SEA Control Plane generate form POSTs a task description to `/api/generate`
// (same-origin; the vite proxy forwards it to the single projection backend).
// That backend is a THIN PUBLISHER: it wraps the request in the canonical
// ModelEventEnvelope and publishes ONE command to
// `onex.cmd.omnimarket.node-generation-requested.v1`. The existing
// node_generation_consumer does the work and emits the terminal
// node-generation-completed.v1 event the projection panels already render.
//
// This function does NOT generate anything client-side; it only kicks the bus
// and returns the correlation id the UI polls the projection for. There is no
// fallback path — a non-OK response surfaces a typed Error the form renders
// honestly.

/** Response of `POST /api/generate` — the minted correlation id and topic. */
export interface GenerateResponse {
  correlation_id: string;
  topic: string;
  /** Backend-reported status — present when the backend signals a failure inline
   *  (e.g. `status: 'failed'`) rather than via HTTP error code. */
  status?: string;
  /** Error detail reported by the backend in an inline failure response. */
  error?: string;
  /** Human-readable message reported by the backend. */
  message?: string;
}

/** The /api/generate thin-publisher endpoint path. */
export const GENERATE_ENDPOINT = "/api/generate";

/**
 * Publish a node-generation request via the thin publisher. Resolves to the
 * correlation id on success; rejects with a typed Error on any non-OK response
 * so the caller renders an explicit failure state (never a silent success).
 *
 * @param taskDescription The natural-language task to generate a node for.
 * @param baseUrl Optional backend base URL. When omitted the endpoint path is
 *   used as-is (relative, same-origin). Pass the result of
 *   `resolveCommandBaseUrl()` when the caller needs to honour the data-source
 *   chrome override — the caller must check for `null` (file mode) before
 *   calling this function.
 */
export async function submitGeneration(
  taskDescription: string,
  baseUrl?: string,
): Promise<GenerateResponse> {
  const endpoint = baseUrl !== undefined
    ? `${baseUrl}${GENERATE_ENDPOINT}`
    : GENERATE_ENDPOINT;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ task_description: taskDescription }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `Generate request failed (HTTP ${res.status})${detail ? `: ${detail}` : ""}`,
    );
  }
  const body = (await res.json().catch(() => null)) as unknown;
  if (
    !isRecord(body) ||
    typeof body.correlation_id !== "string"
  ) {
    throw new Error(
      "Generate request returned a malformed response (missing correlation_id).",
    );
  }
  return {
    correlation_id: body.correlation_id,
    topic: typeof body.topic === "string" ? body.topic : "",
    status: typeof body.status === "string" ? body.status : undefined,
    error: typeof body.error === "string" ? body.error : undefined,
    message: typeof body.message === "string" ? body.message : undefined,
  };
}

// ── Log-entries (trace-explorer) ─────────────────────────────────────────────

/** One row from `GET /api/projections/log-entries?correlation_id=<id>`. */
export interface LogEntryRow {
  entry_id: string;
  timestamp: string;
  node_name: string;
  function_name: string;
  level: string;
  message: string;
  duration_ms: number | null;
  metadata: Record<string, string>;
}

/** The /api/projections/log-entries endpoint path. */
export const LOG_ENTRIES_ENDPOINT = "/api/projections/log-entries";

/**
 * Fetch log entries for a single correlation_id from the log-entries projection
 * endpoint. Returns an empty array on any HTTP error or in file-source mode
 * (where no proxy is registered — the caller may catch the error and surface a
 * graceful empty state).
 */
export async function fetchLogEntries(
  correlationId: string,
): Promise<LogEntryRow[]> {
  const url = `${LOG_ENTRIES_ENDPOINT}?correlation_id=${encodeURIComponent(correlationId)}`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const body = (await res.json()) as unknown;
  const rows = Array.isArray(body)
    ? (body as LogEntryRow[])
    : Array.isArray((body as { rows?: LogEntryRow[] }).rows)
      ? ((body as { rows: LogEntryRow[] }).rows)
      : [];
  return rows;
}

export const fetchRegistration = (): Promise<
  ProjectionResult<RegistrationRow>
> => readProjection<RegistrationRow>(TOPICS.registration);

export const fetchAbCompare = (): Promise<ProjectionResult<AbCompareRow>> =>
  readProjection<AbCompareRow>(TOPICS.abCompare);

export const fetchContextExperimentScores = (): Promise<
  ProjectionResult<ContextExperimentScoreRow>
> => readProjection<ContextExperimentScoreRow>(TOPICS.contextExperimentScores);
