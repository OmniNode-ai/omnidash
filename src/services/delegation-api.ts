/**
 * OMN-10945: Contract-backed delegation data adapter.
 *
 * Typed fetch functions for the 5 delegation projection endpoints.
 * Base URL is configurable (no hardcoded localhost). In Vite dev mode the
 * `/api/delegation/*` path is proxied to the omnidash API backend; in
 * production the proxy is replaced by the real backend route.
 *
 * All functions use relative paths by default so Vite proxy handles routing
 * without any env var configuration required.
 */

import { TOPICS } from '@shared/types/topics';
import { DATA_SOURCE_DEFAULT_MODE } from '@/config/generated/data-source-defaults';
import { projectionUrl } from '@/data-source/projection-base-url';

// ── Endpoint config ──────────────────────────────────────────────────────────

export const DELEGATION_ENDPOINTS = {
  summary: TOPICS.delegationSummary,
  recentDelegations: TOPICS.delegationDecisions,
  modelRouting: TOPICS.delegationModelRouting,
  qualityGate: TOPICS.delegationQualityGate,
  savings: TOPICS.delegationSavings,
} as const;

// ── Response types ───────────────────────────────────────────────────────────

export interface DelegationSummaryRow {
  totalDelegations: number;
  qualityGatePassRate: number;
  qualityGatePassed: number;
  qualityGateTotal: number;
  totalSavingsUsd: number;
  byTaskType: Array<{ taskType: string; count: number }>;
  byModel: Array<{ model: string; count: number }>;
}

export interface DelegationDecisionRow {
  id: string;
  session_id: string;
  task_type: string;
  model_name: string;
  quality_gate_passed: boolean;
  quality_gate_detail: string | null;
  latency_ms: number | null;
  created_at: string;
}

export interface DelegationModelRoutingRow {
  model_alias: string;
  model_name: string;
  task_type: string;
  event_count: number;
  quality_passed: number;
  avg_latency_ms: number;
  latest_event_at: string;
}

export interface DelegationQualityGateRow {
  check_detail: string;
  total_checks: number;
  passed_count: number;
  failed_count: number;
  avg_gates_checked: number;
  avg_gates_failed: number;
}

export interface DelegationSavingsRow {
  session_id: string;
  local_cost_usd: number;
  cloud_cost_usd: number;
  savings_usd: number;
  baseline_model: string;
  pricing_manifest_version: string;
  savings_method: string;
  created_at: string;
}

// ── Adapter options ──────────────────────────────────────────────────────────

export interface DelegationApiOptions {
  baseUrl?: string;
}

const DEFAULT_BASE = '/api/delegation';

function resolveBase(opts: DelegationApiOptions | undefined): string {
  return (opts?.baseUrl ?? DEFAULT_BASE).replace(/\/$/, '');
}

// ── Fetch helpers ────────────────────────────────────────────────────────────

// Why direct fetch rather than src/data-source/ abstractions (OMN-10945):
// The /api/delegation/* routes are typed REST endpoints served by Express
// (server/routes.ts → SqliteProjectionReader). They are NOT the generic
// /projection/<topic> fan-out that HttpSnapshotSource.readAll() targets.
// VITE_DATA_SOURCE controls FileSnapshotSource vs HttpSnapshotSource for
// the topic fan-out; it does not apply to these typed REST endpoints.
// The data-source layer is enforced on the server side for these routes.
async function fetchProjection<T>(path: string): Promise<T[]> {
  const res = await fetch(path);
  if (!res.ok) return [];
  const body = (await res.json()) as unknown;
  if (Array.isArray(body)) return body as T[];
  const envelope = body as { rows?: unknown[] };
  if (envelope.rows && Array.isArray(envelope.rows)) return envelope.rows as T[];
  return [];
}

// ── Public API ───────────────────────────────────────────────────────────────

export function fetchDelegationSummary(opts?: DelegationApiOptions): Promise<DelegationSummaryRow[]> {
  return fetchProjection<DelegationSummaryRow>(`${resolveBase(opts)}/summary`);
}

export function fetchRecentDelegations(opts?: DelegationApiOptions): Promise<DelegationDecisionRow[]> {
  return fetchProjection<DelegationDecisionRow>(`${resolveBase(opts)}/recent-delegations`);
}

export function fetchModelRouting(opts?: DelegationApiOptions): Promise<DelegationModelRoutingRow[]> {
  return fetchProjection<DelegationModelRoutingRow>(`${resolveBase(opts)}/model-routing`);
}

export function fetchQualityGate(opts?: DelegationApiOptions): Promise<DelegationQualityGateRow[]> {
  return fetchProjection<DelegationQualityGateRow>(`${resolveBase(opts)}/quality-gate`);
}

export function fetchDelegationSavings(opts?: DelegationApiOptions): Promise<DelegationSavingsRow[]> {
  return fetchProjection<DelegationSavingsRow>(`${resolveBase(opts)}/savings`);
}

// ── Correlation trace ────────────────────────────────────────────────────────

export interface CorrelationTraceEvent {
  id: string | number;
  correlation_id: string | null;
  session_id: string | null;
  timestamp: string | null;
  task_type: string | null;
  delegated_to: string | null;
  delegated_by: string | null;
  quality_gate_passed: boolean | null;
  quality_gate_detail: string | null;
  quality_gates_checked: number | null;
  quality_gates_failed: number | null;
  cost_usd: number | null;
  cost_savings_usd: number | null;
  delegation_latency_ms: number | null;
  model_name: string | null;
  tokens_input: number | null;
  tokens_output: number | null;
  routing_rule: string | null;
  routing_confidence: number | null;
  prompt_text: string | null;
  response_text: string | null;
  created_at: string | null;
}

export interface CorrelationTraceResponse {
  correlation_id: string;
  rows: CorrelationTraceEvent[];
}

function asTraceResponse(correlationId: string, body: unknown): CorrelationTraceResponse {
  if (
    typeof body === 'object' &&
    body !== null &&
    'rows' in body &&
    Array.isArray((body as { rows: unknown }).rows)
  ) {
    return body as CorrelationTraceResponse;
  }
  return { correlation_id: correlationId, rows: [] };
}

// OMN-12367 / OMN-12756: in file mode the /api/delegation/* proxy is not
// registered, so a fetch to the typed REST endpoint hits the Vite dev server's
// SPA fallback and returns index.html. The previous implementation called
// res.json() on that HTML and surfaced a raw "JSON.parse: unexpected character
// at line 1 column 1" error. Detect file mode up front and read a
// per-correlation fixture so the surface renders without postgres; in live mode
// parse defensively so a non-JSON body degrades to an empty trace rather than a
// raw parse error.
function dataSourceMode(): string {
  return import.meta.env.VITE_DATA_SOURCE ?? DATA_SOURCE_DEFAULT_MODE;
}

function fixturesBase(): string {
  // eslint-disable-next-line local/no-env-fallback -- '/_fixtures' is the documented Vite public path default (VITE_FIXTURES_DIR optional)
  return (import.meta.env.VITE_FIXTURES_DIR ?? '/_fixtures').replace(/\/$/, '');
}

async function fetchCorrelationTraceFixture(correlationId: string): Promise<CorrelationTraceResponse> {
  const topic = encodeURIComponent(TOPICS.delegationCorrelationTrace);
  const file = encodeURIComponent(`${correlationId}.json`);
  const res = await fetch(`${fixturesBase()}/${topic}/${file}`);
  if (!res.ok) return { correlation_id: correlationId, rows: [] };
  const body = (await res.json().catch(() => null)) as unknown;
  return asTraceResponse(correlationId, body);
}

// OMN-12748: a per-correlation trace is read from the contract-declared
// `delegation` detail projection — the canonical render surface. The projection
// API (omnimarket/src/omnimarket/projection/api_server.py) already supports
// `/projection/{topic}?correlation_id=<id>`, returning the delegation_events
// rows (including prompt_text/response_text) for that correlation. There is no
// bespoke `/api/delegation/correlation-trace` backend route — the dashboard
// renders the projection, it does not call a hand-written endpoint.
//
// OMN-12833 (A2.5): the projection read targets the SINGLE standard backend via
// projectionUrl(), not the page origin. This keeps the correlation trace on the
// same one-backend origin as every other projection read.
function correlationTraceProjectionPath(correlationId: string): string {
  return projectionUrl(
    TOPICS.delegationCorrelationTrace,
    `correlation_id=${encodeURIComponent(correlationId)}`,
  );
}

export async function fetchCorrelationTrace(
  correlationId: string,
  _opts?: DelegationApiOptions,
): Promise<CorrelationTraceResponse> {
  if (dataSourceMode() === 'file') {
    return fetchCorrelationTraceFixture(correlationId);
  }
  const res = await fetch(correlationTraceProjectionPath(correlationId));
  if (!res.ok) return { correlation_id: correlationId, rows: [] };
  const body = (await res.json().catch(() => null)) as unknown;
  return asTraceResponse(correlationId, body);
}

// ── Delegation trigger ───────────────────────────────────────────────────────

export interface DelegationTriggerRequest {
  prompt: string;
  task_type: string;
}

export interface DelegationTriggerResponse {
  correlation_id: string;
  accepted: boolean;
  message?: string;
  topic?: string;
}

export async function triggerDelegation(
  req: DelegationTriggerRequest,
  opts?: DelegationApiOptions,
): Promise<DelegationTriggerResponse> {
  const base = resolveBase(opts);
  const res = await fetch(`${base}/trigger`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Trigger failed (${res.status}): ${text || res.statusText}`);
  }
  return (await res.json() as unknown) as DelegationTriggerResponse;
}
