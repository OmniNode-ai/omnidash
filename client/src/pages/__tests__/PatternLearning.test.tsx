import { render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, beforeEach, vi } from 'vitest';
import PatternLearning from '../PatternLearning';
import { patternLearningSource } from '@/lib/data-sources';

type LocalStorageMock = {
  getItem: ReturnType<typeof vi.fn>;
  setItem: ReturnType<typeof vi.fn>;
};

vi.mock('@/lib/data-sources', async () => {
  const actual = await vi.importActual<typeof import('@/lib/data-sources')>('@/lib/data-sources');
  return {
    ...actual,
    patternLearningSource: {
      fetchSummary: vi.fn(),
      fetchTrends: vi.fn(),
      fetchQualityTrends: vi.fn(),
      fetchPatternList: vi.fn(),
      fetchDiscovery: vi.fn(),
      fetchLanguageBreakdown: vi.fn(),
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

describe('PatternLearning page', () => {
  const localStorageMocks = window.localStorage as unknown as LocalStorageMock;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMocks.getItem.mockReturnValue('24h');
  });

  it('renders pattern metrics, charts, and lists when data loads', async () => {
    const now = new Date().toISOString();
    vi.mocked(patternLearningSource.fetchSummary).mockResolvedValue({
      totalPatterns: 320,
      newPatternsToday: 12,
      avgQualityScore: 0.87,
      activeLearningCount: 18,
    });
    vi.mocked(patternLearningSource.fetchTrends).mockResolvedValue([
      { period: now, manifestsGenerated: 8, avgPatternsPerManifest: 4.2, avgQueryTimeMs: 120 },
    ]);
    vi.mocked(patternLearningSource.fetchQualityTrends).mockResolvedValue([
      { period: now, avgQuality: 0.9, manifestCount: 5 },
    ]);
    vi.mocked(patternLearningSource.fetchPatternList).mockResolvedValue([
      {
        id: 'pattern-1',
        name: 'Auth Gateway Handler',
        description: 'Ensures secure routing for auth requests',
        quality: 0.9,
        usage: 25,
        trend: 'up',
        trendPercentage: 12,
        category: 'security',
        language: 'typescript',
      },
    ]);
    vi.mocked(patternLearningSource.fetchDiscovery).mockResolvedValue({
      data: [
        {
          name: 'Async Retry Wrapper',
          file_path: '/src/utils/retry.ts',
          createdAt: now,
        },
      ],
      isMock: false,
    });
    vi.mocked(patternLearningSource.fetchLanguageBreakdown).mockResolvedValue([
      { language: 'typescript', count: 12, percentage: 60 },
      { language: 'python', count: 8, percentage: 40 },
    ]);

    renderWithClient(<PatternLearning />);

    await waitFor(() => {
      expect(screen.getByText('Pattern Learning Metrics')).toBeInTheDocument();
    });

    expect(screen.getByText('Total Patterns')).toBeInTheDocument();
    expect(screen.getByText('Pattern Language Distribution')).toBeInTheDocument();
    expect(screen.getByText('Live Pattern Discovery')).toBeInTheDocument();
    expect(screen.getByText('Filter Patterns')).toBeInTheDocument();
    expect(screen.getByText('Auth Gateway Handler')).toBeInTheDocument();
    expect(screen.getByText('Async Retry Wrapper')).toBeInTheDocument();
  });

  it('shows loading screen when summary or pattern list queries are pending', () => {
    vi.mocked(patternLearningSource.fetchSummary).mockImplementation(() => new Promise(() => {}));
    vi.mocked(patternLearningSource.fetchPatternList).mockImplementation(() => new Promise(() => {}));
    vi.mocked(patternLearningSource.fetchTrends).mockResolvedValue([]);
    vi.mocked(patternLearningSource.fetchQualityTrends).mockResolvedValue([]);
    vi.mocked(patternLearningSource.fetchDiscovery).mockResolvedValue({ data: [], isMock: false });
    vi.mocked(patternLearningSource.fetchLanguageBreakdown).mockResolvedValue([]);

    renderWithClient(<PatternLearning />);

    expect(screen.getByText('Loading pattern data...')).toBeInTheDocument();
  });

  it('renders error state when summary query fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(patternLearningSource.fetchSummary).mockRejectedValue(new Error('summary failed'));
    vi.mocked(patternLearningSource.fetchPatternList).mockResolvedValue([]);
    vi.mocked(patternLearningSource.fetchTrends).mockResolvedValue([]);
    vi.mocked(patternLearningSource.fetchQualityTrends).mockResolvedValue([]);
    vi.mocked(patternLearningSource.fetchDiscovery).mockResolvedValue({ data: [], isMock: false });
    vi.mocked(patternLearningSource.fetchLanguageBreakdown).mockResolvedValue([]);

    renderWithClient(<PatternLearning />);

    await waitFor(() => {
      expect(screen.getByText('Failed to load pattern data')).toBeInTheDocument();
    });

    consoleError.mockRestore();
  });
});
