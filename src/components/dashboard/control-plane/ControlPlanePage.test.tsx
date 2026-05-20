import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { DataSourceTestProvider } from '@/test-utils/dataSourceTestProvider';
import { mockFetchWithItems } from '@/test-utils/mockFetch';
import ControlPlanePage from './ControlPlanePage';
import type { PipelineEvent } from './PipelineLogStream';

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
  afterEach(() => vi.restoreAllMocks());

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
      expect(screen.getByText(/classify sentiment/i)).toBeInTheDocument();
    });
  });
});
