import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import EvidencePipelineFlow from './EvidencePipelineFlow';
import {
  fetchEvidencePipelineSnapshot,
  openEvidenceLiveEventStream,
} from '@/services/evidence-pipeline-service';

vi.mock('@/services/evidence-pipeline-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/evidence-pipeline-service')>();
  return {
    ...actual,
    fetchEvidencePipelineSnapshot: vi.fn(),
    openEvidenceLiveEventStream: vi.fn(() => null),
  };
});

const envelopeMeta = {
  projection_cursor: 'cursor-1',
  last_event_id: 'evt-9',
  last_ingest_sequence: 9,
  freshness_state: 'CURRENT' as const,
  degraded_reason: null,
  observed_at: '2026-05-21T23:00:00Z',
  version: 'v1',
};

const snapshot = {
  stages: {
    ...envelopeMeta,
    rows: [
      {
        stage_id: 'collected',
        stage_label: 'Collected',
        swimlane: 'evidence_pipeline' as const,
        count: 12,
        freshness_state: 'CURRENT' as const,
        authority: 'authoritative' as const,
        stale_after: '2026-05-22T00:00:00Z',
        latest_ingest_sequence: 4,
      },
      {
        stage_id: 'ready',
        stage_label: 'Ready',
        swimlane: 'deployment_readiness' as const,
        count: 3,
        freshness_state: 'STALE' as const,
        authority: 'supporting' as const,
        stale_after: '2026-05-22T00:00:00Z',
        latest_ingest_sequence: 8,
      },
    ],
  },
  correlations: {
    ...envelopeMeta,
    rows: [
      {
        event_id: 'trace-3',
        correlation_id: 'corr-1',
        ingest_sequence: 3,
        stage_id: 'ready',
        stage_label: 'Ready',
        lifecycle_state: 'FINALIZED' as const,
        missing_classification: null,
        latency_ms: 20,
        payload_summary: 'ready token=secret-value',
        authority: 'authoritative' as const,
      },
      {
        event_id: 'trace-1',
        correlation_id: 'corr-1',
        ingest_sequence: 1,
        stage_id: 'collected',
        stage_label: 'Collected',
        lifecycle_state: 'PROVISIONAL' as const,
        missing_classification: 'projection_gap' as const,
        latency_ms: 10,
        payload_summary: 'collected',
        authority: 'authoritative' as const,
      },
    ],
  },
  readiness: {
    ...envelopeMeta,
    rows: [
      {
        deployment_id: 'deploy-42',
        readiness_state: 'BLOCKED' as const,
        evidence_pipeline_state: 'PASSED' as const,
        blocking_reasons: ['missing deploy gate'],
        gap_breakdown: { projection_gap: 1 },
        throughput_trend: [{ bucket: '2026-05-21T23:00:00Z', count: 2 }],
        freshness_state: 'CURRENT' as const,
        updated_at: '2026-05-21T23:00:00Z',
      },
    ],
  },
  liveEvents: {
    ...envelopeMeta,
    rows: [
      {
        event_id: 'event-1',
        topic: 'onex.evt.evidence.v1',
        correlation_id: 'corr-1',
        ticket_id: 'OMN-11481',
        lifecycle_state: 'VALIDATED' as const,
        severity: 'WARNING' as const,
        ingest_sequence: 5,
        payload_summary: '{"secret":"hidden","status":"projected"}',
        observed_at: '2026-05-21T23:00:00Z',
      },
    ],
  },
};

function renderWidget() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <EvidencePipelineFlow config={{}} />
    </QueryClientProvider>,
  );
}

describe('EvidencePipelineFlow', () => {
  beforeEach(() => {
    vi.mocked(fetchEvidencePipelineSnapshot).mockResolvedValue(snapshot);
    vi.mocked(openEvidenceLiveEventStream).mockReturnValue(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders all four projection-backed views', async () => {
    renderWidget();

    expect(await screen.findByText('Stage flow')).toBeInTheDocument();
    expect(screen.getByText('Correlation trace')).toBeInTheDocument();
    expect(screen.getByText('Readiness aggregate')).toBeInTheDocument();
    expect(screen.getByText('Observational event stream')).toBeInTheDocument();
    expect(screen.getByText('Observational/debugging surface only - authoritative state remains reducer-backed projections.')).toBeInTheDocument();
  });

  it('orders correlation trace by ingest_sequence and redacts payload summaries', async () => {
    renderWidget();

    const rows = await screen.findAllByTestId('evidence-trace-row');
    expect(rows[0]).toHaveTextContent('#1');
    expect(rows[1]).toHaveTextContent('#3');
    expect(rows[1]).toHaveTextContent('token=[redacted]');
  });

  it('renders reducer-owned readiness state without deriving it from live events', async () => {
    renderWidget();

    const cards = await screen.findAllByTestId('evidence-readiness-card');
    expect(cards[0]).toHaveTextContent('deploy-42');
    expect(cards[0]).toHaveTextContent('BLOCKED');
    expect(cards[0]).toHaveTextContent('missing deploy gate');
  });

  it('filters the observational projection event stream', async () => {
    renderWidget();

    expect(await screen.findByText('onex.evt.evidence.v1')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Filter evidence event stream'), {
      target: { value: 'OMN-11481' },
    });

    expect(screen.getByText('onex.evt.evidence.v1')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Filter evidence event stream'), {
      target: { value: 'does-not-match' },
    });
    expect(screen.getByText('No matching event projection rows')).toBeInTheDocument();
  });

  it('does not merge advisory SSE messages into authoritative projection rows', async () => {
    class FakeEventSource {
      addEventListener = vi.fn();
      close = vi.fn();
    }
    vi.stubGlobal('EventSource', FakeEventSource);
    vi.mocked(openEvidenceLiveEventStream).mockImplementation((onMessage) => {
      onMessage(new MessageEvent('message', {
        data: JSON.stringify({ event_id: 'sse-only', topic: 'advisory.topic' }),
      }));
      return new FakeEventSource() as unknown as EventSource;
    });

    renderWidget();

    await waitFor(() => expect(openEvidenceLiveEventStream).toHaveBeenCalled());
    expect(screen.queryByText('advisory.topic')).not.toBeInTheDocument();
    expect(await screen.findAllByTestId('evidence-live-event-row')).toHaveLength(1);
    vi.unstubAllGlobals();
  });
});
