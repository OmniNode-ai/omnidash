/**
 * OMN-10945: Contract-backed delegation data adapter.
 *
 * Typed fetch functions for the 5 delegation projection endpoints.
 * Base URL is configurable (no hardcoded localhost). In Vite dev mode the
 * `/api/delegation/*` path is proxied to the projection API backend; in
 * production the proxy is replaced by the real backend route.
 *
 * All functions use relative paths by default so Vite proxy handles routing
 * without any env var configuration required.
 */

import { TOPICS } from '@shared/types/topics';

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

export async function fetchCorrelationTrace(
  correlationId: string,
  opts?: DelegationApiOptions,
): Promise<CorrelationTraceResponse> {
  const base = resolveBase(opts);
  const encoded = encodeURIComponent(correlationId);
  const res = await fetch(`${base}/correlation-trace/${encoded}`);
  if (!res.ok) return { correlation_id: correlationId, rows: [] };
  const body = (await res.json()) as unknown;
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

// ── Delegation trigger ───────────────────────────────────────────────────────

export interface DelegationTriggerRequest {
  prompt: string;
  task_type: string;
}

export interface DelegationTriggerResponse {
  correlation_id: string;
  accepted: boolean;
  message?: string;
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
