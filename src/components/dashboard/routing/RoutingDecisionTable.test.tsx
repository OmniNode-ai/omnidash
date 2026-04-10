import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import RoutingDecisionTable from './RoutingDecisionTable';

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

describe('RoutingDecisionTable', () => {
  beforeEach(() => { qc.clear(); vi.stubGlobal('fetch', vi.fn()); });
  afterEach(() => vi.restoreAllMocks());

  it('shows loading state initially', () => {
    (fetch as any).mockReturnValue(new Promise(() => {}));
    render(<QueryClientProvider client={qc}><RoutingDecisionTable config={{}} /></QueryClientProvider>);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('renders decision rows when data is available', async () => {
    (fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ([
        { id: '1', created_at: '2026-04-10T12:00:00Z', llm_agent: 'claude-opus', fuzzy_agent: 'gpt-4o', agreement: true, llm_confidence: 0.92, fuzzy_confidence: 0.88, cost_usd: 0.0042 },
      ]),
    });
    render(<QueryClientProvider client={qc}><RoutingDecisionTable config={{}} /></QueryClientProvider>);
    expect(await screen.findByText('claude-opus')).toBeInTheDocument();
    expect(screen.getByText('gpt-4o')).toBeInTheDocument();
    expect(screen.getByText('Agree')).toBeInTheDocument();
  });

  it('shows empty state when no decisions', async () => {
    (fetch as any).mockResolvedValueOnce({ ok: true, json: async () => ([]) });
    render(<QueryClientProvider client={qc}><RoutingDecisionTable config={{}} /></QueryClientProvider>);
    expect(await screen.findByText(/no routing decisions/i)).toBeInTheDocument();
  });
});
