import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
    expect(await screen.findByText(/qwen3-coder-30b/)).toBeInTheDocument();
    expect(screen.getByText('2 models')).toBeInTheDocument();
  });

  it('renders $0 in the cost range for local models', async () => {
    mockFetchWithItems([LOCAL_ROW, CLOUD_ROW]);
    render(<DataSourceTestProvider client={qc}><AbCompareWidget config={{}} /></DataSourceTestProvider>);
    await screen.findByText(/qwen3-coder-30b/);
    expect(screen.getByText(/\$0.*\$0\.002/)).toBeInTheDocument();
  });

  it('shows savings summary when multiple models have different costs', async () => {
    mockFetchWithItems([LOCAL_ROW, CLOUD_ROW]);
    render(<DataSourceTestProvider client={qc}><AbCompareWidget config={{}} /></DataSourceTestProvider>);
    await screen.findByText(/qwen3-coder-30b/);
    // Savings banner contains "Save" text
    expect(screen.getByText(/saved/i)).toBeInTheDocument();
  });

  it('shows a single-model run without adding comparison rows', async () => {
    mockFetchWithItems([LOCAL_ROW]);
    render(<DataSourceTestProvider client={qc}><AbCompareWidget config={{}} /></DataSourceTestProvider>);
    expect(await screen.findByText(/qwen3-coder-30b/)).toBeInTheDocument();
    expect(screen.getByText('1 models')).toBeInTheDocument();
  });

  it('counts nullable projection rows in the comparison group', async () => {
    mockFetchWithItems([LOCAL_ROW, CLOUD_ROW, UNKNOWN_COST_ROW]);
    render(<DataSourceTestProvider client={qc}><AbCompareWidget config={{}} /></DataSourceTestProvider>);
    await screen.findByText(/qwen3-coder-30b/);
    expect(screen.getByText('3 models')).toBeInTheDocument();
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
    await screen.findByText(/qwen3-coder-30b/);
    expect(screen.getByText('2 models')).toBeInTheDocument();
  });

  it('opens projection row details', async () => {
    mockFetchWithItems([LOCAL_ROW, CLOUD_ROW]);
    render(<DataSourceTestProvider client={qc}><AbCompareWidget config={{}} /></DataSourceTestProvider>);
    await userEvent.click(await screen.findByRole('button', { name: /run run-1/i }));
    expect(screen.getByText('Prompt')).toBeInTheDocument();
    expect(screen.getByText('MODEL')).toBeInTheDocument();
  });

  it('renders sortable column headers', async () => {
    mockFetchWithItems([LOCAL_ROW, CLOUD_ROW]);
    render(<DataSourceTestProvider client={qc}><AbCompareWidget config={{}} /></DataSourceTestProvider>);
    await screen.findByText(/qwen3-coder-30b/);
    for (const header of ['TASK', 'MODELS', 'LATENCY', 'COST RANGE']) {
      expect(screen.getByText(header)).toBeInTheDocument();
    }
  });
});
