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
  model_key: 'qwen3-coder-30b',
  display_name: 'Qwen3-Coder-30B',
  prompt_tokens: 512,
  completion_tokens: 256,
  total_tokens: 768,
  cost_usd: 0,
  latency_ms: 1200,
  quality: 'pass',
  error: '',
  created_at: '2026-05-01T08:00:00Z',
};

const CLOUD_ROW: AbCompareRow = {
  correlation_id: 'run-1',
  model_key: 'claude-sonnet-4-6',
  display_name: 'Claude Sonnet 4.6',
  prompt_tokens: 512,
  completion_tokens: 256,
  total_tokens: 768,
  cost_usd: 0.002304,
  latency_ms: 850,
  quality: 'pass',
  error: '',
  created_at: '2026-05-01T07:59:55Z',
};

const ERROR_ROW: AbCompareRow = {
  correlation_id: 'run-1',
  model_key: 'gpt-4o',
  display_name: 'GPT-4o',
  prompt_tokens: 512,
  completion_tokens: 0,
  total_tokens: 512,
  cost_usd: 0,
  latency_ms: 0,
  quality: '',
  error: 'timeout after 30s',
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

  it('renders model display names from latest run', async () => {
    mockFetchWithItems([LOCAL_ROW, CLOUD_ROW]);
    render(<DataSourceTestProvider client={qc}><AbCompareWidget config={{}} /></DataSourceTestProvider>);
    // Qwen3-Coder-30B appears in both the table row AND the savings banner — use getAllByText
    expect(await screen.findAllByText('Qwen3-Coder-30B')).not.toHaveLength(0);
    expect(screen.getByText('Claude Sonnet 4.6')).toBeInTheDocument();
  });

  it('renders $0.00 for local (free) models', async () => {
    mockFetchWithItems([LOCAL_ROW, CLOUD_ROW]);
    render(<DataSourceTestProvider client={qc}><AbCompareWidget config={{}} /></DataSourceTestProvider>);
    // Wait for data to appear (cheapest model name shows in table + savings banner)
    await screen.findAllByText('Qwen3-Coder-30B');
    expect(screen.getByText('$0.00')).toBeInTheDocument();
  });

  it('shows savings summary when multiple models have different costs', async () => {
    mockFetchWithItems([LOCAL_ROW, CLOUD_ROW]);
    render(<DataSourceTestProvider client={qc}><AbCompareWidget config={{}} /></DataSourceTestProvider>);
    await screen.findAllByText('Qwen3-Coder-30B');
    // Savings banner contains "Save" text
    expect(screen.getByText(/save/i)).toBeInTheDocument();
  });

  it('does not show savings banner for single-model run', async () => {
    mockFetchWithItems([LOCAL_ROW]);
    render(<DataSourceTestProvider client={qc}><AbCompareWidget config={{}} /></DataSourceTestProvider>);
    // Single model: name only appears in the table row, not savings banner
    expect(await screen.findAllByText('Qwen3-Coder-30B')).not.toHaveLength(0);
    expect(screen.queryByText(/save/i)).not.toBeInTheDocument();
  });

  it('renders error message in error column when a model call failed', async () => {
    mockFetchWithItems([LOCAL_ROW, CLOUD_ROW, ERROR_ROW]);
    render(<DataSourceTestProvider client={qc}><AbCompareWidget config={{}} /></DataSourceTestProvider>);
    await screen.findAllByText('Qwen3-Coder-30B');
    expect(screen.getByText(/timeout/i)).toBeInTheDocument();
  });

  it('shows only the most-recent run when multiple runs exist', async () => {
    const olderRun: AbCompareRow = {
      ...LOCAL_ROW,
      correlation_id: 'run-0',
      model_key: 'old-model',
      display_name: 'OldModel',
      created_at: '2026-04-30T08:00:00Z',
    };
    mockFetchWithItems([LOCAL_ROW, CLOUD_ROW, olderRun]);
    render(<DataSourceTestProvider client={qc}><AbCompareWidget config={{}} /></DataSourceTestProvider>);
    await screen.findAllByText('Qwen3-Coder-30B');
    // OldModel is from an older run and should not appear
    expect(screen.queryByText('OldModel')).not.toBeInTheDocument();
  });

  it('renders quality column for rows with quality values', async () => {
    mockFetchWithItems([LOCAL_ROW, CLOUD_ROW]);
    render(<DataSourceTestProvider client={qc}><AbCompareWidget config={{}} /></DataSourceTestProvider>);
    await screen.findAllByText('Qwen3-Coder-30B');
    expect(screen.getAllByText('pass').length).toBeGreaterThanOrEqual(1);
  });

  it('renders column headers: Model, Tokens, Cost, Latency, Quality', async () => {
    mockFetchWithItems([LOCAL_ROW, CLOUD_ROW]);
    render(<DataSourceTestProvider client={qc}><AbCompareWidget config={{}} /></DataSourceTestProvider>);
    await screen.findAllByText('Qwen3-Coder-30B');
    for (const header of ['Model', 'Tokens', 'Cost', 'Latency', 'Quality']) {
      expect(screen.getByText(header)).toBeInTheDocument();
    }
  });
});
