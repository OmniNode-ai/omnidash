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
