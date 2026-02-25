import { render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest';
import KnowledgeGraph from '@/_archive/pages/KnowledgeGraph';
import { knowledgeGraphSource } from '@/lib/data-sources';

type LocalStorageMock = {
  getItem: ReturnType<typeof vi.fn>;
  setItem: ReturnType<typeof vi.fn>;
};

let queryClient: QueryClient | null = null;

vi.mock('@/lib/data-sources', async () => {
  const actual = await vi.importActual<typeof import('@/lib/data-sources')>('@/lib/data-sources');
  return {
    ...actual,
    knowledgeGraphSource: {
      fetchGraph: vi.fn(),
    },
  };
});

function renderWithClient(ui: ReactNode) {
  queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        refetchInterval: false,
        refetchOnWindowFocus: false,
        gcTime: Infinity,
        staleTime: Infinity,
      },
    },
  });

  const result = render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);

  return { queryClient, ...result };
}

describe('KnowledgeGraph page', () => {
  const localStorageMocks = window.localStorage as unknown as LocalStorageMock;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    localStorageMocks.getItem.mockReturnValue('24h');
  });

  afterEach(async () => {
    if (queryClient) {
      queryClient.clear();
      await queryClient.cancelQueries();
      queryClient = null;
    }
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('shows loading state before graph data resolves', async () => {
    vi.mocked(knowledgeGraphSource.fetchGraph).mockResolvedValue({
      nodes: [],
      edges: [],
      isMock: false,
    });

    const result = renderWithClient(<KnowledgeGraph />);
    queryClient = result.queryClient;

    expect(screen.getByText('Loading...')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Knowledge Graph')).toBeInTheDocument();
    });

    result.unmount();
  });

  it('renders metrics when graph data is available', async () => {
    vi.mocked(knowledgeGraphSource.fetchGraph).mockResolvedValue({
      nodes: [
        { id: 'n1', label: 'Pattern A', type: 'pattern' },
        { id: 'n2', label: 'Service B', type: 'service' },
        { id: 'n3', label: 'Pattern C', type: 'pattern' },
      ],
      edges: [
        { source: 'n1', target: 'n2', type: 'uses' },
        { source: 'n2', target: 'n3', type: 'connects' },
      ],
      isMock: false,
    });

    const result = renderWithClient(<KnowledgeGraph />);
    queryClient = result.queryClient;

    await waitFor(() => {
      expect(screen.getByText(/Interactive exploration of 3 nodes/)).toBeInTheDocument();
    });

    expect(screen.getByText('Total Nodes')).toBeInTheDocument();
    expect(screen.getByText('Total Edges')).toBeInTheDocument();
    expect(screen.getByText('Connected Components')).toBeInTheDocument();
    expect(screen.getByText('Graph Density')).toBeInTheDocument();

    result.unmount();
  });

  it('falls back to mock visualization when graph is empty', async () => {
    vi.mocked(knowledgeGraphSource.fetchGraph).mockResolvedValue({
      nodes: [],
      edges: [],
      isMock: false,
    });

    const result = renderWithClient(<KnowledgeGraph />);
    queryClient = result.queryClient;

    // Wait for loading to complete - when empty, it shows "0 nodes"
    await waitFor(() => {
      expect(screen.getByText(/Interactive exploration of 0 nodes/)).toBeInTheDocument();
    });

    // Now the mock badges should be visible
    expect(screen.getByText('MOCK DATA: Knowledge Graph')).toBeInTheDocument();
    expect(screen.getByText('MOCK DATA: Relationship Types')).toBeInTheDocument();

    result.unmount();
  });
});
