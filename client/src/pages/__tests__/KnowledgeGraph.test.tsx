import { render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, beforeEach, vi } from 'vitest';
import KnowledgeGraph from '../KnowledgeGraph';
import { knowledgeGraphSource } from '@/lib/data-sources';

type LocalStorageMock = {
  getItem: ReturnType<typeof vi.fn>;
  setItem: ReturnType<typeof vi.fn>;
};

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
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);

  return queryClient;
}

describe('KnowledgeGraph page', () => {
  const localStorageMocks = window.localStorage as unknown as LocalStorageMock;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMocks.getItem.mockReturnValue('24h');
  });

  it('shows loading state before graph data resolves', async () => {
    vi.mocked(knowledgeGraphSource.fetchGraph).mockResolvedValue({
      nodes: [],
      edges: [],
      isMock: false,
    });

    renderWithClient(<KnowledgeGraph />);

    expect(screen.getByText('Loading...')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Knowledge Graph')).toBeInTheDocument();
    });
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

    renderWithClient(<KnowledgeGraph />);

    await waitFor(() => {
      expect(screen.getByText(/Interactive exploration of 3 nodes/)).toBeInTheDocument();
    });

    expect(screen.getByText('Total Nodes')).toBeInTheDocument();
    expect(screen.getByText('Total Edges')).toBeInTheDocument();
    expect(screen.getByText('Connected Components')).toBeInTheDocument();
    expect(screen.getByText('Graph Density')).toBeInTheDocument();
  });

  it('falls back to mock visualization when graph is empty', async () => {
    vi.mocked(knowledgeGraphSource.fetchGraph).mockResolvedValue({
      nodes: [],
      edges: [],
      isMock: false,
    });

    renderWithClient(<KnowledgeGraph />);

    await waitFor(() => {
      expect(screen.getByText('Knowledge Graph')).toBeInTheDocument();
    });

    expect(screen.getByText('MOCK DATA: Knowledge Graph')).toBeInTheDocument();
    expect(screen.getByText('MOCK DATA: Relationship Types')).toBeInTheDocument();
  });
});
