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

  it('renders full SEA generation artifact proof from projection rows', async () => {
    mockFetchWithItems([
      {
        id: 'gen-sea',
        correlation_id: 'corr-sea',
        task_description: 'email validator',
        provider: 'openai',
        model_id: 'gpt-5-mini',
        endpoint_ref: 'contracts/endpoints/sea-generation.yaml#openai',
        resolved_endpoint: 'https://api.openai.example/v1/responses',
        routing_source: 'runtime-routing-authority',
        projection_owner: 'node_projection_generation_events',
        projection_reducer_version: '078',
        output_payload_sha256: 'sha256-output',
        contract_yaml: 'kind: node\nname: email-validator\nspec:\n  entrypoint: handler.run\n',
        handler_source: 'export async function run(input) {\n  return input.email.includes("@");\n}\n',
        contract_passed: true,
        timestamp: '2026-05-17T10:30:05Z',
        created_at: '2026-05-17T10:30:05Z',
      },
    ]);
    render(
      <DataSourceTestProvider client={qc}>
        <ControlPlanePage config={{}} />
      </DataSourceTestProvider>,
    );

    expect(await screen.findByText(/projection-backed artifact proof/i)).toBeInTheDocument();
    expect(screen.getByText(/kind: node/)).toBeInTheDocument();
    expect(screen.getByText(/return input.email.includes/)).toBeInTheDocument();
    expect(screen.getByText('openai')).toBeInTheDocument();
    expect(screen.getByText('gpt-5-mini')).toBeInTheDocument();
    expect(screen.getByText('contracts/endpoints/sea-generation.yaml#openai')).toBeInTheDocument();
    expect(screen.getByText('https://api.openai.example/v1/responses')).toBeInTheDocument();
    expect(screen.getByText('runtime-routing-authority')).toBeInTheDocument();
    expect(screen.getByText('node_projection_generation_events')).toBeInTheDocument();
    expect(screen.getByText('078')).toBeInTheDocument();
    expect(screen.getByText('sha256-output')).toBeInTheDocument();
  });

  it('renders the newest pipeline event first without bottom autoscroll behavior', async () => {
    mockFetchWithItems(PIPELINE_EVENTS);
    render(
      <DataSourceTestProvider client={qc}>
        <ControlPlanePage config={{}} />
      </DataSourceTestProvider>,
    );

    await waitFor(() => {
      expect(screen.getAllByTestId('pipeline-log-entry')).toHaveLength(3);
    });
    expect(screen.getAllByTestId('pipeline-log-entry')[0]).toHaveTextContent(
      /contract materialized/i,
    );
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

  it('submits to bus in fixture mode (no client-side fabrication since OMN-12775)', async () => {
    // OMN-12775: file-mode simulated events are disabled. The submit path
    // always tries the /api/sea/generate route. Without VITE_HTTP_DATA_SOURCE_URL
    // set, it fails-fast with an error rather than fabricating fake events.
    mockFetchWithItems([]);
    render(
      <DataSourceTestProvider client={qc}>
        <ControlPlanePage config={{}} />
      </DataSourceTestProvider>,
    );
    const input = await screen.findByPlaceholderText(/describe the node/i);
    fireEvent.change(input, { target: { value: 'Classify sentiment' } });
    fireEvent.click(screen.getByRole('button', { name: /generate/i }));
    // No simulated events — the component shows an error from the missing base URL
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(/submit failed/i);
    });
    // No simulated:true events injected
    expect(screen.queryByText(/contract materialized, mcp tool registered/i)).not.toBeInTheDocument();
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
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');

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
    expect(screen.getByRole('status')).toHaveTextContent(/command accepted/i);
    expect(screen.getByRole('status')).toHaveTextContent(/awaiting projection proof/i);
    expect(screen.getByText(/command accepted by backend: corr-live-123/i)).toBeInTheDocument();
    expect(screen.getByText(/waiting for projection-backed generation_events proof/i)).toBeInTheDocument();
    expect(screen.queryByText(/node generation completed: corr-live-123/i)).not.toBeInTheDocument();
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['node-generation-completed'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['trace-explorer'] });
  });

  it('renders backend failed status as an error and refreshes SEA projections', async () => {
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
      json: async () => ({
        correlation_id: 'corr-failed-123',
        status: 'failed',
        error: 'model returned validation errors',
      }),
    }));
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');

    render(
      <DataSourceTestProvider client={qc} source={source}>
        <ControlPlanePage config={{}} />
      </DataSourceTestProvider>,
    );

    const input = await screen.findByPlaceholderText(/describe the node/i);
    fireEvent.change(input, { target: { value: 'Classify sentiment' } });
    fireEvent.click(screen.getByRole('button', { name: /generate/i }));

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(/generation failed/i);
    });
    expect(screen.getByRole('status')).toHaveTextContent(/corr-failed-123/i);
    expect(screen.getByText(/generation failed in backend: corr-failed-123/i)).toBeInTheDocument();
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['node-generation-completed'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['trace-explorer'] });
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
    // OMN-12775: thin publisher uses /api/sea/generate, not the phantom /api/hackathon/generate
    expect(fetch).toHaveBeenCalledWith(
      'http://backend.test/api/sea/generate',
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
