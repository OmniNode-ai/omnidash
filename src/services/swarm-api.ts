/**
 * OMN-12072: Swarm progression data adapter.
 *
 * Typed fetch functions for the swarm_runs projection endpoint.
 * Mirrors the delegation-api.ts pattern — relative paths, Vite proxy handles routing.
 */

// ── Response types ───────────────────────────────────────────────────────────

export interface SwarmRunRow {
  run_id: string;
  correlation_id: string;
  status: string;
  task_hash: string;
  subtask_count: number;
  succeeded_count: number;
  failed_count: number;
  skipped_count: number;
  models_used: string[];
  machines_used: string[];
  total_cost_usd: number;
  cloud_equivalent_cost_usd: number;
  savings_usd: number;
  parallelism_speedup_ratio: number;
  decomposition_latency_ms: number;
  dispatch_wall_latency_ms: number;
  aggregation_latency_ms: number;
  total_latency_ms: number;
  endpoint_registry_hash: string;
  registry_schema_version: string;
  created_at: string;
}

export interface SwarmRunsResponse {
  rows: SwarmRunRow[];
}

// ── Adapter options ──────────────────────────────────────────────────────────

export interface SwarmApiOptions {
  baseUrl?: string;
}

const DEFAULT_BASE = '/api';

function resolveBase(opts: SwarmApiOptions | undefined): string {
  return (opts?.baseUrl ?? DEFAULT_BASE).replace(/\/$/, '');
}

// ── Fetch helpers ────────────────────────────────────────────────────────────

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) return { rows: [] } as T;
  const body = (await res.json()) as unknown;
  return body as T;
}

// ── Public API ───────────────────────────────────────────────────────────────

export function fetchSwarmRuns(opts?: SwarmApiOptions): Promise<SwarmRunsResponse> {
  return fetchJson<SwarmRunsResponse>(`${resolveBase(opts)}/swarm-runs`);
}
