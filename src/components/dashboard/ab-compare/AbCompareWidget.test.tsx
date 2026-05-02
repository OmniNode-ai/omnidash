import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { DataSourceTestProvider } from '@/test-utils/dataSourceTestProvider';
import { mockFetchWithItems } from '@/test-utils/mockFetch';
import AbCompareWidget from './AbCompareWidget';
import type { AbCompareRow } from './AbCompareWidget';

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

const LOCAL_ROW: AbCompareRow = {
  correlation_id: 'run-1',
  model_id: 'qwen3-coder-30b',
  prompt_tokens: 512,
  completion_tokens: 256,
  total_tokens: 768,
  estimated_cost_usd: 0,
  latency_ms: 1200,
  usage_source: 'router',
  created_at: '2026-05-01T08:00:00Z',
};

const CLOUD_ROW: AbCompareRow = {
  correlation_id: 'run-1',
  model_id: 'claude-sonnet-4-6',
  prompt_tokens: 512,
  completion_tokens: 256,
  total_tokens: 768,
  estimated_cost_usd: 0.002304,
  latency_ms: 850,
  usage_source: 'gateway',
  created_at: '2026-05-01T07:59:55Z',
};

const UNKNOWN_COST_ROW: AbCompareRow = {
  correlation_id: 'run-1',
  model_id: 'gpt-4o',
  prompt_tokens: 512,
  completion_tokens: 128,
  total_tokens: 512,
  estimated_cost_usd: null,
  latency_ms: null,
  usage_source: null,
  created_at: '2026-05-01T07:59:50Z',
};

describe('AbCompareWidget', () => {
  beforeEach(() => {
    qc.clear();
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => vi.restoreAllMocks());

  it('shows loading state initially', () => {
    (fetch as unknown as { mockReturnValue: (v: unknown) => void }).mockReturnValue(new Promise(() => {}));
    render(<DataSourceTestProvider client={qc}><AbCompareWidget config={{}} /></DataSourceTestProvider>);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('shows empty state when no data', async () => {
    (fetch as unknown as { mockResolvedValueOnce: (v: unknown) => void }).mockResolvedValueOnce({ ok: false });
    render(<DataSourceTestProvider client={qc}><AbCompareWidget config={{}} /></DataSourceTestProvider>);
    expect(await screen.findByText(/no comparison data yet/i)).toBeInTheDocument();
  });

  it('renders model ids from latest run', async () => {
    mockFetchWithItems([LOCAL_ROW, CLOUD_ROW]);
    render(<DataSourceTestProvider client={qc}><AbCompareWidget config={{}} /></DataSourceTestProvider>);
    expect(await screen.findAllByText('qwen3-coder-30b')).not.toHaveLength(0);
    expect(screen.getByText('claude-sonnet-4-6')).toBeInTheDocument();
  });

  it('renders $0.00 for local (free) models', async () => {
    mockFetchWithItems([LOCAL_ROW, CLOUD_ROW]);
    render(<DataSourceTestProvider client={qc}><AbCompareWidget config={{}} /></DataSourceTestProvider>);
    await screen.findAllByText('qwen3-coder-30b');
    expect(screen.getByText('$0.00')).toBeInTheDocument();
  });

  it('shows savings summary when multiple models have different costs', async () => {
    mockFetchWithItems([LOCAL_ROW, CLOUD_ROW]);
    render(<DataSourceTestProvider client={qc}><AbCompareWidget config={{}} /></DataSourceTestProvider>);
    await screen.findAllByText('qwen3-coder-30b');
    // Savings banner contains "Save" text
    expect(screen.getByText(/save/i)).toBeInTheDocument();
  });

  it('does not show savings banner for single-model run', async () => {
    mockFetchWithItems([LOCAL_ROW]);
    render(<DataSourceTestProvider client={qc}><AbCompareWidget config={{}} /></DataSourceTestProvider>);
    expect(await screen.findAllByText('qwen3-coder-30b')).not.toHaveLength(0);
    expect(screen.queryByText(/save/i)).not.toBeInTheDocument();
  });

  it('renders a dash for nullable projection fields', async () => {
    mockFetchWithItems([LOCAL_ROW, CLOUD_ROW, UNKNOWN_COST_ROW]);
    render(<DataSourceTestProvider client={qc}><AbCompareWidget config={{}} /></DataSourceTestProvider>);
    await screen.findAllByText('qwen3-coder-30b');
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(1);
  });

  it('shows only the most-recent run when multiple runs exist', async () => {
    const olderRun: AbCompareRow = {
      ...LOCAL_ROW,
      correlation_id: 'run-0',
      model_id: 'old-model',
      created_at: '2026-04-30T08:00:00Z',
    };
    mockFetchWithItems([LOCAL_ROW, CLOUD_ROW, olderRun]);
    render(<DataSourceTestProvider client={qc}><AbCompareWidget config={{}} /></DataSourceTestProvider>);
    await screen.findAllByText('qwen3-coder-30b');
    // OldModel is from an older run and should not appear
    expect(screen.queryByText('old-model')).not.toBeInTheDocument();
  });

  it('renders usage source values from projection rows', async () => {
    mockFetchWithItems([LOCAL_ROW, CLOUD_ROW]);
    render(<DataSourceTestProvider client={qc}><AbCompareWidget config={{}} /></DataSourceTestProvider>);
    await screen.findAllByText('qwen3-coder-30b');
    expect(screen.getByText('router')).toBeInTheDocument();
    expect(screen.getByText('gateway')).toBeInTheDocument();
  });

  it('renders column headers: Model, Tokens, Cost, Latency, Source', async () => {
    mockFetchWithItems([LOCAL_ROW, CLOUD_ROW]);
    render(<DataSourceTestProvider client={qc}><AbCompareWidget config={{}} /></DataSourceTestProvider>);
    await screen.findAllByText('qwen3-coder-30b');
    for (const header of ['Model', 'Tokens', 'Cost', 'Latency', 'Source']) {
      expect(screen.getByText(header)).toBeInTheDocument();
    }
  });
});
