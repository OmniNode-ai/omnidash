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
    expect(await screen.findByText('gpt-0')).toBeInTheDocument();
    expect(screen.getByText('gpt-9')).toBeInTheDocument();
    expect(screen.queryByText('gpt-10')).not.toBeInTheDocument();
    expect(screen.queryByText('gpt-11')).not.toBeInTheDocument();
  });

  it('renders SOW G2 column headers for upstream-blocked columns', async () => {
    mockFetchWithItems([
      { id: '1', created_at: '2026-04-10T12:00:00Z', llm_agent: 'claude-opus', fuzzy_agent: 'gpt-4o', agreement: true, llm_confidence: 0.92, fuzzy_confidence: 0.88, cost_usd: 0.0042 },
    ]);
    render(<DataSourceTestProvider client={qc}><RoutingDecisionTable config={{}} /></DataSourceTestProvider>);
    await screen.findByText('claude-opus');
    expect(screen.getByText('Provider')).toBeInTheDocument();
    expect(screen.getByText('Model')).toBeInTheDocument();
    expect(screen.getByText('Reason')).toBeInTheDocument();
    expect(screen.getByText('Selection Mode')).toBeInTheDocument();
    expect(screen.getByText('Fallback')).toBeInTheDocument();
  });

  it('upstream-blocked columns render empty cells (no fallback literal)', async () => {
    mockFetchWithItems([
      { id: '1', created_at: '2026-04-10T12:00:00Z', llm_agent: 'claude-opus', fuzzy_agent: 'gpt-4o', agreement: false, llm_confidence: 0.5, fuzzy_confidence: 0.5, cost_usd: 0.001 },
    ]);
    render(<DataSourceTestProvider client={qc}><RoutingDecisionTable config={{}} /></DataSourceTestProvider>);
    await screen.findByText('claude-opus');
    const blockedCells = document.querySelectorAll('[data-upstream-blocked="true"]');
    // 5 upstream-blocked columns × 1 data row = 5 cells
    expect(blockedCells).toHaveLength(5);
    blockedCells.forEach((cell) => {
      expect(cell.textContent?.trim()).toBe('');
    });
  });

  it('renders enriched SOW G2 fields when upstream emits them', async () => {
    mockFetchWithItems([
      {
        id: '2',
        created_at: '2026-04-10T13:00:00Z',
        llm_agent: 'qwen3-coder',
        fuzzy_agent: 'deepseek-r1',
        agreement: true,
        llm_confidence: 0.95,
        fuzzy_confidence: 0.90,
        cost_usd: 0.002,
        provider: 'anthropic',
        model: 'claude-sonnet-4-6',
        reason: 'high confidence match',
        selection_mode: 'SEMANTIC',
        fallback: 'none',
      },
    ]);
    render(<DataSourceTestProvider client={qc}><RoutingDecisionTable config={{}} /></DataSourceTestProvider>);
    await screen.findByText('qwen3-coder');
    expect(screen.getByText('anthropic')).toBeInTheDocument();
    expect(screen.getByText('claude-sonnet-4-6')).toBeInTheDocument();
    expect(screen.getByText('high confidence match')).toBeInTheDocument();
    expect(screen.getByText('SEMANTIC')).toBeInTheDocument();
    expect(screen.getByText('none')).toBeInTheDocument();
  });
});
