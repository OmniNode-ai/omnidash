/**
 * OMN-11477: projection API client for the evidence pipeline dashboard lane.
 *
 * The dashboard consumes reducer-owned projection API snapshots only. Live SSE
 * messages are advisory refresh/debug signals and are never merged into the
 * authoritative projection rows in this client.
 */

import { TOPICS } from '@shared/types/topics';
import { projectionUrl, resolveProjectionBaseUrl } from '@/data-source/projection-base-url';

export type EvidenceSwimlane = 'evidence_pipeline' | 'deployment_readiness';
export type EvidenceFreshnessState = 'CURRENT' | 'STALE' | 'DEGRADED';
export type EvidenceAuthority = 'authoritative' | 'supporting' | 'advisory';
export type EvidenceLifecycleState =
  | 'PROVISIONAL'
  | 'VALIDATED'
  | 'FINALIZED'
  | 'SUPERSEDED'
  | 'REJECTED';
export type EvidencePipelineState =
  | 'PENDING'
  | 'IN_FLIGHT'
  | 'PASSED'
  | 'FAILED'
  | 'BLOCKED'
  | 'STALE'
  | 'DEGRADED';
export type EvidenceGapClassification =
  | 'delayed'
  | 'stale'
  | 'missing'
  | 'superseded'
  | 'invalid_order'
  | 'projection_gap';
export type EvidenceSeverity = 'INFO' | 'WARNING' | 'ERROR' | 'BLOCKING';
export type ReadinessState = 'READY' | 'BLOCKED' | 'DEGRADED' | 'ADVISORY_ONLY';

export interface ProjectionEnvelope<T> {
  rows: T[];
  projection_cursor: string | null;
  last_event_id: string | null;
  last_ingest_sequence: number | null;
  freshness_state: EvidenceFreshnessState;
  degraded_reason: string | null;
  observed_at: string | null;
  version: string | null;
}

export interface EvidenceStageRow {
  stage_id: string;
  stage_label: string;
  swimlane: EvidenceSwimlane;
  count: number;
  freshness_state: EvidenceFreshnessState;
  authority: EvidenceAuthority;
  stale_after: string | null;
  latest_ingest_sequence: number | null;
}

export interface EvidenceCorrelationTraceRow {
  event_id: string;
  correlation_id: string;
  ingest_sequence: number;
  stage_id: string;
  stage_label: string;
  lifecycle_state: EvidenceLifecycleState;
  missing_classification: EvidenceGapClassification | null;
  latency_ms: number | null;
  payload_summary: string;
  authority: EvidenceAuthority;
}

export interface EvidenceReadinessRow {
  deployment_id: string;
  readiness_state: ReadinessState;
  evidence_pipeline_state: EvidencePipelineState;
  blocking_reasons: string[];
  gap_breakdown: Partial<Record<EvidenceGapClassification, number>>;
  throughput_trend: Array<{ bucket: string; count: number }>;
  freshness_state: EvidenceFreshnessState;
  updated_at: string;
}

export interface EvidenceLiveEventRow {
  event_id: string;
  topic: string;
  correlation_id: string | null;
  ticket_id: string | null;
  lifecycle_state: EvidenceLifecycleState;
  severity: EvidenceSeverity;
  ingest_sequence: number;
  payload_summary: string;
  observed_at: string;
}

export interface EvidencePipelineSnapshot {
  stages: ProjectionEnvelope<EvidenceStageRow>;
  correlations: ProjectionEnvelope<EvidenceCorrelationTraceRow>;
  readiness: ProjectionEnvelope<EvidenceReadinessRow>;
  liveEvents: ProjectionEnvelope<EvidenceLiveEventRow>;
}

export interface EvidencePipelineServiceOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  eventSourceFactory?: (url: string) => EventSource;
}

const UNCONFIGURED_REASON = 'Projection API is not configured for evidence pipeline reads';

function resolveEvidencePath(
  topic: string,
  legacyPath: string,
  opts?: EvidencePipelineServiceOptions,
): string | null {
  if (opts?.baseUrl) return `${opts.baseUrl.replace(/\/$/, '')}${legacyPath}`;
  try {
    return projectionUrl(topic);
  } catch (_err) {
    return null;
  }
}

function emptyEnvelope<T>(degradedReason: string | null): ProjectionEnvelope<T> {
  return {
    rows: [],
    projection_cursor: null,
    last_event_id: null,
    last_ingest_sequence: null,
    freshness_state: degradedReason ? 'DEGRADED' : 'CURRENT',
    degraded_reason: degradedReason,
    observed_at: null,
    version: null,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeFreshness(value: unknown, degradedReason: string | null): EvidenceFreshnessState {
  if (value === 'CURRENT' || value === 'STALE' || value === 'DEGRADED') {
    return value;
  }
  return degradedReason ? 'DEGRADED' : 'CURRENT';
}

function normalizeSequence(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return null;
}

function normalizeEnvelope<T>(body: unknown): ProjectionEnvelope<T> {
  if (Array.isArray(body)) {
    return {
      ...emptyEnvelope<T>('Projection response omitted projection envelope metadata'),
      rows: body as T[],
    };
  }
  if (!isRecord(body)) return emptyEnvelope<T>('Projection response was not an object');

  const rows = Array.isArray(body.rows) ? (body.rows as T[]) : [];
  const degradedReason =
    typeof body.degraded_reason === 'string' && body.degraded_reason.trim() !== ''
      ? body.degraded_reason
      : null;
  return {
    rows,
    projection_cursor: typeof body.projection_cursor === 'string' ? body.projection_cursor : null,
    last_event_id: typeof body.last_event_id === 'string' ? body.last_event_id : null,
    last_ingest_sequence: normalizeSequence(body.last_ingest_sequence),
    freshness_state: normalizeFreshness(body.freshness_state, degradedReason),
    degraded_reason: degradedReason,
    observed_at: typeof body.observed_at === 'string' ? body.observed_at : null,
    version: typeof body.version === 'string' ? body.version : null,
  };
}

async function fetchProjection<T>(
  topic: string,
  legacyPath: string,
  opts?: EvidencePipelineServiceOptions,
): Promise<ProjectionEnvelope<T>> {
  const path = resolveEvidencePath(topic, legacyPath, opts);
  if (!path) return emptyEnvelope<T>(UNCONFIGURED_REASON);
  const fetchImpl = opts?.fetchImpl ?? fetch;
  const res = await fetchImpl(path);
  if (!res.ok) return emptyEnvelope<T>(`Projection API request failed with ${res.status}`);
  const body: unknown = await res.json();
  return normalizeEnvelope<T>(body);
}

export function fetchEvidenceStages(
  opts?: EvidencePipelineServiceOptions,
): Promise<ProjectionEnvelope<EvidenceStageRow>> {
  return fetchProjection<EvidenceStageRow>(TOPICS.evidencePipelineStages, '/stages', opts);
}

export function fetchEvidenceCorrelationTrace(
  opts?: EvidencePipelineServiceOptions,
): Promise<ProjectionEnvelope<EvidenceCorrelationTraceRow>> {
  return fetchProjection<EvidenceCorrelationTraceRow>(
    TOPICS.evidencePipelineCorrelations,
    '/correlations',
    opts,
  );
}

export function fetchEvidenceReadiness(
  opts?: EvidencePipelineServiceOptions,
): Promise<ProjectionEnvelope<EvidenceReadinessRow>> {
  return fetchProjection<EvidenceReadinessRow>(TOPICS.evidencePipelineReadiness, '/readiness', opts);
}

export function fetchEvidenceLiveEvents(
  opts?: EvidencePipelineServiceOptions,
): Promise<ProjectionEnvelope<EvidenceLiveEventRow>> {
  return fetchProjection<EvidenceLiveEventRow>(TOPICS.evidencePipelineLiveEvents, '/events', opts);
}

export async function fetchEvidencePipelineSnapshot(
  opts?: EvidencePipelineServiceOptions,
): Promise<EvidencePipelineSnapshot> {
  const [stages, correlations, readiness, liveEvents] = await Promise.all([
    fetchEvidenceStages(opts),
    fetchEvidenceCorrelationTrace(opts),
    fetchEvidenceReadiness(opts),
    fetchEvidenceLiveEvents(opts),
  ]);
  return { stages, correlations, readiness, liveEvents };
}

/**
 * OMN-1279: resolve the live SSE subscription URL for the evidence pipeline.
 *
 * Order (most specific wins):
 *   1. Explicit `opts.baseUrl` — legacy/non-Vite callers and tests. Targets the
 *      legacy `<base>/events/stream` shape.
 *   2. Canonical projection seam (`resolveProjectionBaseUrl()`) — the deployed
 *      default. Subscribes to the SAME single backend the snapshot reads use,
 *      at `<base>/projection/{liveEvents}/stream`. In proxy-relative mode the
 *      base is '' so the URL is same-origin and the serving layer forwards it
 *      to the one backend (no second authority, no banned port).
 *   3. File mode (`resolveProjectionBaseUrl()` returns null) — no live backend,
 *      so return null. The caller surfaces an honest "SSE unavailable" state and
 *      keeps polling snapshots.
 */
function resolveEvidenceStreamUrl(opts?: EvidencePipelineServiceOptions): string | null {
  if (opts?.baseUrl) {
    return `${opts.baseUrl.replace(/\/$/, '')}/events/stream`;
  }
  const base = resolveProjectionBaseUrl();
  if (base === null) return null;
  return `${base}/projection/${encodeURIComponent(TOPICS.evidencePipelineLiveEvents)}/stream`;
}

export function openEvidenceLiveEventStream(
  onMessage: (event: MessageEvent) => void,
  opts?: EvidencePipelineServiceOptions,
): EventSource | null {
  const url = resolveEvidenceStreamUrl(opts);
  if (url === null) return null;
  const makeEventSource = opts?.eventSourceFactory ?? ((streamUrl: string) => new EventSource(streamUrl));
  const source = makeEventSource(url);
  source.addEventListener('message', onMessage);
  return source;
}
