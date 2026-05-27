import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { DataSourceTestProvider } from '@/test-utils/dataSourceTestProvider';
import { mockFetchWithItems } from '@/test-utils/mockFetch';
import ControlPlanePage from './ControlPlanePage';
import { PromptInput } from './PromptInput';
import type { PipelineEvent } from './PipelineLogStream';
import type { ProtocolSnapshotSource } from '@/data-source';

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

const PIPELINE_EVENTS: PipelineEvent[] = [
  {
    id: 'evt-001',
    type: 'request',
    timestamp: '2026-05-17T10:30:00Z',
    source: 'control-plane',
    message: 'Node generation requested: sentiment classifier',
    correlationId: 'corr-abc-123',
  },
  {
    id: 'evt-002',
    type: 'validation',
    timestamp: '2026-05-17T10:30:02Z',
    source: 'validator',
    message: 'Contract schema validated: 0 errors',
    correlationId: 'corr-abc-123',
  },
  {
    id: 'evt-003',
    type: 'success',
    timestamp: '2026-05-17T10:30:05Z',
    source: 'runtime',
    message: 'Contract materialized on .201, MCP tool registered',
    correlationId: 'corr-abc-123',
  },
];

describe('ControlPlanePage', () => {
  beforeEach(() => { qc.clear(); vi.stubGlobal('fetch', vi.fn()); });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('renders prompt input with submit button', async () => {
    mockFetchWithItems([]);
    render(
      <DataSourceTestProvider client={qc}>
        <ControlPlanePage config={{}} />
      </DataSourceTestProvider>,
    );
    expect(await screen.findByPlaceholderText(/describe the node/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /generate/i })).toBeInTheDocument();
  });

  it('renders pipeline status indicators', async () => {
    mockFetchWithItems([]);
    render(
      <DataSourceTestProvider client={qc}>
        <ControlPlanePage config={{}} />
      </DataSourceTestProvider>,
    );
    await screen.findByPlaceholderText(/describe the node/i);
    expect(screen.getByText(/kafka/i)).toBeInTheDocument();
    expect(screen.getByText(/runtime/i)).toBeInTheDocument();
    expect(screen.getByText(/mcp/i)).toBeInTheDocument();
  });

  it('renders log stream events from fixture data', async () => {
    mockFetchWithItems(PIPELINE_EVENTS);
    render(
      <DataSourceTestProvider client={qc}>
        <ControlPlanePage config={{}} />
      </DataSourceTestProvider>,
    );
    await waitFor(() => {
      expect(screen.getByText(/node generation requested/i)).toBeInTheDocument();
    });
  });

  it('shows delegation trigger in live data-source mode', async () => {
    vi.stubEnv('VITE_DATA_SOURCE', 'http');
    const source: ProtocolSnapshotSource = {
      async *readAll() {
        yield* [];
      },
    };
    render(
      <DataSourceTestProvider client={qc} source={source}>
        <ControlPlanePage config={{}} />
      </DataSourceTestProvider>,
    );
    expect(await screen.findByText(/\+ Trigger delegation/i)).toBeInTheDocument();
  });

  it('appends mock event to log on prompt submit in fixture mode', async () => {
    mockFetchWithItems([]);
    render(
      <DataSourceTestProvider client={qc}>
        <ControlPlanePage config={{}} />
      </DataSourceTestProvider>,
    );
    const input = await screen.findByPlaceholderText(/describe the node/i);
    fireEvent.change(input, { target: { value: 'Classify sentiment' } });
    fireEvent.click(screen.getByRole('button', { name: /generate/i }));
    await waitFor(() => {
      expect(screen.getAllByText(/classify sentiment/i).length).toBeGreaterThan(0);
    });
    expect(screen.getByRole('status')).toHaveTextContent(/demo request queued/i);
  });

  it('shows immediate feedback while a live prompt request is pending', async () => {
    vi.stubEnv('VITE_DATA_SOURCE', 'http');
    vi.stubEnv('VITE_HTTP_DATA_SOURCE_URL', 'http://backend.test');
    const source: ProtocolSnapshotSource = {
      async *readAll() {
        yield* [];
      },
    };
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => undefined)));

    render(
      <DataSourceTestProvider client={qc} source={source}>
        <ControlPlanePage config={{}} />
      </DataSourceTestProvider>,
    );

    const input = await screen.findByPlaceholderText(/describe the node/i);
    fireEvent.change(input, { target: { value: 'Classify sentiment' } });
    fireEvent.click(screen.getByRole('button', { name: /generate/i }));

    expect(screen.getByRole('button', { name: /generate/i })).toHaveTextContent(/submitting/i);
    expect(screen.getByRole('status')).toHaveTextContent(/submitting generation request/i);
    expect(screen.getByText(/submitted generation request: classify sentiment/i)).toBeInTheDocument();
  });

  it('shows accepted feedback when a live prompt request returns a correlation', async () => {
    vi.stubEnv('VITE_DATA_SOURCE', 'http');
    vi.stubEnv('VITE_HTTP_DATA_SOURCE_URL', 'http://backend.test');
    const source: ProtocolSnapshotSource = {
      async *readAll() {
        yield* [];
      },
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ correlation_id: 'corr-live-123' }),
    }));

    render(
      <DataSourceTestProvider client={qc} source={source}>
        <ControlPlanePage config={{}} />
      </DataSourceTestProvider>,
    );

    const input = await screen.findByPlaceholderText(/describe the node/i);
    fireEvent.change(input, { target: { value: 'Classify sentiment' } });
    fireEvent.click(screen.getByRole('button', { name: /generate/i }));

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(/corr-live-123/i);
    });
    expect(screen.getByText(/generation request accepted by backend: corr-live-123/i)).toBeInTheDocument();
  });

  it('renders an error event when submit returns a non-2xx response', async () => {
    vi.stubEnv('VITE_DATA_SOURCE', 'http');
    vi.stubEnv('VITE_HTTP_DATA_SOURCE_URL', 'http://backend.test');
    const source: ProtocolSnapshotSource = {
      async *readAll() {
        yield* [];
      },
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Server Error',
      text: async () => 'boom',
    }));

    render(
      <DataSourceTestProvider client={qc} source={source}>
        <ControlPlanePage config={{}} />
      </DataSourceTestProvider>,
    );

    const input = await screen.findByPlaceholderText(/describe the node/i);
    fireEvent.change(input, { target: { value: 'Classify sentiment' } });
    fireEvent.click(screen.getByRole('button', { name: /generate/i }));

    await waitFor(() => {
      expect(screen.getByText(/failed to submit: error: http 500 server error: boom/i)).toBeInTheDocument();
    });
    expect(fetch).toHaveBeenCalledWith(
      'http://backend.test/api/hackathon/generate',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});

describe('PromptInput', () => {
  afterEach(() => vi.restoreAllMocks());

  it('keeps submit disabled for empty input when disabled is explicitly false', () => {
    render(<PromptInput onSubmit={vi.fn()} disabled={false} />);

    expect(screen.getByRole('button', { name: /generate/i })).toBeDisabled();
  });
});
