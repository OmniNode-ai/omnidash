/**
 * OMN-11477: projection API client for the evidence pipeline dashboard lane.
 *
 * The dashboard consumes reducer-owned projection API snapshots only. Live SSE
 * messages are advisory refresh/debug signals and are never merged into the
 * authoritative projection rows in this client.
 */

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

const UNCONFIGURED_REASON = 'EVIDENCE_PROJECTION_API_URL is not configured';

function resolveConfiguredBase(opts?: EvidencePipelineServiceOptions): string | null {
  const envBase = import.meta.env.EVIDENCE_PROJECTION_API_URL as string | undefined;
  const base = opts?.baseUrl ?? envBase;
  if (!base || base.trim() === '') return null;
  if (!opts?.baseUrl && import.meta.env.DEV) return '/api/evidence-pipeline';
  return base.replace(/\/$/, '');
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
  path: string,
  opts?: EvidencePipelineServiceOptions,
): Promise<ProjectionEnvelope<T>> {
  const baseUrl = resolveConfiguredBase(opts);
  if (!baseUrl) return emptyEnvelope<T>(UNCONFIGURED_REASON);
  const fetchImpl = opts?.fetchImpl ?? fetch;
  const res = await fetchImpl(`${baseUrl}${path}`);
  if (!res.ok) return emptyEnvelope<T>(`Projection API request failed with ${res.status}`);
  const body: unknown = await res.json();
  return normalizeEnvelope<T>(body);
}

export function fetchEvidenceStages(
  opts?: EvidencePipelineServiceOptions,
): Promise<ProjectionEnvelope<EvidenceStageRow>> {
  return fetchProjection<EvidenceStageRow>('/stages', opts);
}

export function fetchEvidenceCorrelationTrace(
  opts?: EvidencePipelineServiceOptions,
): Promise<ProjectionEnvelope<EvidenceCorrelationTraceRow>> {
  return fetchProjection<EvidenceCorrelationTraceRow>('/correlations', opts);
}

export function fetchEvidenceReadiness(
  opts?: EvidencePipelineServiceOptions,
): Promise<ProjectionEnvelope<EvidenceReadinessRow>> {
  return fetchProjection<EvidenceReadinessRow>('/readiness', opts);
}

export function fetchEvidenceLiveEvents(
  opts?: EvidencePipelineServiceOptions,
): Promise<ProjectionEnvelope<EvidenceLiveEventRow>> {
  return fetchProjection<EvidenceLiveEventRow>('/events', opts);
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

export function openEvidenceLiveEventStream(
  onMessage: (event: MessageEvent) => void,
  opts?: EvidencePipelineServiceOptions,
): EventSource | null {
  const baseUrl = resolveConfiguredBase(opts);
  if (!baseUrl) return null;
  const makeEventSource = opts?.eventSourceFactory ?? ((url: string) => new EventSource(url));
  const source = makeEventSource(`${baseUrl}/events/stream`);
  source.addEventListener('message', onMessage);
  return source;
}
