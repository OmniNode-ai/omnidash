import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { DataSourceTestProvider } from '@/test-utils/dataSourceTestProvider';
import { mockFetchWithItems } from '@/test-utils/mockFetch';
import RoutingDecisionTable from './RoutingDecisionTable';

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });


describe('RoutingDecisionTable', () => {
  beforeEach(() => { qc.clear(); vi.stubGlobal('fetch', vi.fn()); });
  afterEach(() => vi.restoreAllMocks());

  it('shows loading state initially', () => {
    (fetch as any).mockReturnValue(new Promise(() => {}));
    render(<DataSourceTestProvider client={qc}><RoutingDecisionTable config={{}} /></DataSourceTestProvider>);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('renders decision rows when data is available', async () => {
    mockFetchWithItems([
      { id: '1', created_at: '2026-04-10T12:00:00Z', llm_agent: 'claude-opus', fuzzy_agent: 'gpt-4o', agreement: true, llm_confidence: 0.92, fuzzy_confidence: 0.88, cost_usd: 0.0042 },
    ]);
    render(<DataSourceTestProvider client={qc}><RoutingDecisionTable config={{}} /></DataSourceTestProvider>);
    expect(await screen.findByText('claude-opus')).toBeInTheDocument();
    expect(screen.getByText('gpt-4o')).toBeInTheDocument();
    expect(screen.getByText('Agree')).toBeInTheDocument();
  });

  it('shows empty state when no decisions', async () => {
    (fetch as any).mockResolvedValueOnce({ ok: false });
    render(<DataSourceTestProvider client={qc}><RoutingDecisionTable config={{}} /></DataSourceTestProvider>);
    expect(await screen.findByText(/no routing decisions/i)).toBeInTheDocument();
  });

  // §8.B (review acceptance) — config.pageSize must actually slice
  // the rendered row count.
  it('config.pageSize=10 renders only the first 10 of 12 rows', async () => {
    const rows = Array.from({ length: 12 }, (_, i) => ({
      id: `r${i}`,
      created_at: `2026-04-10T12:${String(i).padStart(2, '0')}:00Z`,
      llm_agent: 'claude-opus',
      fuzzy_agent: `gpt-${i}`,
      agreement: true,
      llm_confidence: 0.9,
      fuzzy_confidence: 0.85,
      cost_usd: 0.001 * i,
    }));
    mockFetchWithItems(rows);
    render(
      <DataSourceTestProvider client={qc}>
        <RoutingDecisionTable config={{ pageSize: 10 }} />
      </DataSourceTestProvider>
    );
    // Wait for rows to land — use the first agent-cell text that's
    // unique to the populated dataset.
    expect(await screen.findByText('gpt-0')).toBeInTheDocument();
    // Page 1 of 2: rows 0..9 visible, rows 10 + 11 not.
    expect(screen.getByText('gpt-9')).toBeInTheDocument();
    expect(screen.queryByText('gpt-10')).not.toBeInTheDocument();
    expect(screen.queryByText('gpt-11')).not.toBeInTheDocument();
  });
});
