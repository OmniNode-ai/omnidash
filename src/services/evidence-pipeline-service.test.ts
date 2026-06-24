import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchEvidenceStages,
  fetchEvidencePipelineSnapshot,
  openEvidenceLiveEventStream,
} from './evidence-pipeline-service';
import { TOPICS } from '@shared/types/topics';
import { DATA_SOURCE_DEFAULT_URL } from '@/config/generated/data-source-defaults';

function response(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as Response;
}

describe('evidence-pipeline-service', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('returns a degraded unconfigured envelope when projection reads are in file mode', async () => {
    vi.stubEnv('VITE_DATA_SOURCE', 'file');
    const fetchImpl = vi.fn();

    const result = await fetchEvidenceStages({ fetchImpl });

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      rows: [],
      freshness_state: 'DEGRADED',
      degraded_reason: 'Projection API is not configured for evidence pipeline reads',
      projection_cursor: null,
      last_event_id: null,
      last_ingest_sequence: null,
      observed_at: null,
      version: null,
    });
  });

  it('uses the canonical projection topic route by default', async () => {
    vi.stubEnv('VITE_DATA_SOURCE', 'postgres');
    const fetchImpl = vi.fn().mockResolvedValueOnce(response({
      rows: [{ stage_id: 'ingest' }],
      projection_cursor: 'cursor-1',
      last_event_id: 'evt-1',
      last_ingest_sequence: 42,
      freshness_state: 'CURRENT',
      degraded_reason: null,
      observed_at: '2026-05-21T23:00:00Z',
      version: 'v1',
    }));

    const result = await fetchEvidenceStages({ fetchImpl });

    expect(fetchImpl).toHaveBeenCalledWith(
      `${DATA_SOURCE_DEFAULT_URL}/projection/${TOPICS.evidencePipelineStages}`,
    );
    expect(result.projection_cursor).toBe('cursor-1');
    expect(result.last_event_id).toBe('evt-1');
    expect(result.last_ingest_sequence).toBe(42);
    expect(result.freshness_state).toBe('CURRENT');
    expect(result.version).toBe('v1');
  });

  it('accepts an explicit baseUrl option for tests and non-Vite callers', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(response({
      rows: [],
      projection_cursor: 'cursor-2',
      last_event_id: 'evt-2',
      last_ingest_sequence: 7,
      freshness_state: 'STALE',
      degraded_reason: 'projection lag',
      observed_at: '2026-05-21T23:01:00Z',
      version: 'v1',
    }));

    const result = await fetchEvidenceStages({
      baseUrl: 'https://projection.example/evidence/',
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledWith('https://projection.example/evidence/stages');
    expect(result.freshness_state).toBe('STALE');
    expect(result.degraded_reason).toBe('projection lag');
  });

  it('fetches all four reducer-owned projections for the composite snapshot', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response({
      rows: [],
      projection_cursor: 'cursor',
      last_event_id: 'evt',
      last_ingest_sequence: 1,
      freshness_state: 'CURRENT',
      degraded_reason: null,
      observed_at: '2026-05-21T23:02:00Z',
      version: 'v1',
    }));

    await fetchEvidencePipelineSnapshot({ baseUrl: 'https://projection.example/evidence', fetchImpl });

    expect(fetchImpl).toHaveBeenCalledWith('https://projection.example/evidence/stages');
    expect(fetchImpl).toHaveBeenCalledWith('https://projection.example/evidence/correlations');
    expect(fetchImpl).toHaveBeenCalledWith('https://projection.example/evidence/readiness');
    expect(fetchImpl).toHaveBeenCalledWith('https://projection.example/evidence/events');
  });

  it('does not open SSE in file mode (no projection backend configured)', () => {
    vi.stubEnv('VITE_DATA_SOURCE', 'file');
    const factory = vi.fn();

    const source = openEvidenceLiveEventStream(vi.fn(), { eventSourceFactory: factory });

    expect(source).toBeNull();
    expect(factory).not.toHaveBeenCalled();
  });

  it('opens SSE against the canonical projection seam when no explicit baseUrl is given (live mode)', () => {
    // OMN-1279: in a live data source the SSE subscription must resolve its base
    // URL from the SAME single-backend seam as the snapshot reads
    // (resolveProjectionBaseUrl), not require a caller-supplied baseUrl. This is
    // the deployed default path the EvidencePipelineFlow widget uses.
    vi.stubEnv('VITE_DATA_SOURCE', 'postgres');
    const source = {
      addEventListener: vi.fn(),
      close: vi.fn(),
    } as unknown as EventSource;
    const factory = vi.fn().mockReturnValue(source);
    const onMessage = vi.fn();

    const result = openEvidenceLiveEventStream(onMessage, { eventSourceFactory: factory });

    expect(result).toBe(source);
    expect(factory).toHaveBeenCalledWith(
      `${DATA_SOURCE_DEFAULT_URL}/projection/${TOPICS.evidencePipelineLiveEvents}/stream`,
    );
    expect(source.addEventListener).toHaveBeenCalledWith('message', onMessage);
  });

  it('opens advisory SSE only when an explicit legacy evidence base URL is provided', () => {
    const source = {
      addEventListener: vi.fn(),
      close: vi.fn(),
    } as unknown as EventSource;
    const factory = vi.fn().mockReturnValue(source);
    const onMessage = vi.fn();

    const result = openEvidenceLiveEventStream(onMessage, {
      baseUrl: 'https://projection.example/evidence',
      eventSourceFactory: factory,
    });

    expect(result).toBe(source);
    expect(factory).toHaveBeenCalledWith('https://projection.example/evidence/events/stream');
    expect(source.addEventListener).toHaveBeenCalledWith('message', onMessage);
  });
});
