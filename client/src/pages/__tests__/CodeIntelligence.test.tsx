import { render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, beforeEach, vi } from 'vitest';
import CodeIntelligence from '../CodeIntelligence';
import { codeIntelligenceSource } from '@/lib/data-sources';

type LocalStorageMock = {
  getItem: ReturnType<typeof vi.fn>;
  setItem: ReturnType<typeof vi.fn>;
};

vi.mock('@/lib/data-sources', async () => {
  const actual = await vi.importActual<typeof import('@/lib/data-sources')>('@/lib/data-sources');
  return {
    ...actual,
    codeIntelligenceSource: {
      fetchAll: vi.fn(),
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

describe('CodeIntelligence page', () => {
  const localStorageMocks = window.localStorage as unknown as LocalStorageMock;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMocks.getItem.mockReturnValue('24h');
  });

  it('renders code metrics, compliance breakdown, and quality panels when data is available', async () => {
    const now = new Date().toISOString();
    vi.mocked(codeIntelligenceSource.fetchAll).mockResolvedValue({
      codeAnalysis: {
        files_analyzed: 2000,
        avg_complexity: 9.5,
        code_smells: 12,
        security_issues: 1,
        complexity_trend: [
          { timestamp: now, value: 8.2 },
          { timestamp: new Date(Date.now() - 600000).toISOString(), value: 7.8 },
        ],
        quality_trend: [
          { timestamp: now, value: 91 },
          { timestamp: new Date(Date.now() - 600000).toISOString(), value: 89 },
        ],
      },
      compliance: {
        summary: {
          totalFiles: 300,
          compliantFiles: 240,
          nonCompliantFiles: 45,
          pendingFiles: 15,
          compliancePercentage: 92,
          avgComplianceScore: 0.9,
        },
        statusBreakdown: [
          { status: 'compliant', count: 240, percentage: 80 },
          { status: 'non_compliant', count: 45, percentage: 15 },
          { status: 'pending', count: 15, percentage: 5 },
        ],
        nodeTypeBreakdown: [
          { nodeType: 'api', compliantCount: 30, totalCount: 40, percentage: 75 },
          { nodeType: 'service', compliantCount: 50, totalCount: 60, percentage: 83.3 },
        ],
        trend: [
          { period: new Date().toISOString(), compliancePercentage: 92, totalFiles: 300 },
          { period: new Date(Date.now() - 86400000).toISOString(), compliancePercentage: 89, totalFiles: 280 },
        ],
      },
      isMock: false,
    });

    renderWithClient(<CodeIntelligence />);

    await waitFor(() => {
      expect(screen.getByText('Code Intelligence Metrics')).toBeInTheDocument();
    });

    expect(screen.getByText('Files Analyzed')).toBeInTheDocument();
    expect(screen.getAllByText('2,000').length).toBeGreaterThan(0);
    expect(screen.getByText('ONEX Compliance Coverage')).toBeInTheDocument();
    expect(screen.getByText('Compliance Rate')).toBeInTheDocument();
    expect(screen.getByText('Node Type Breakdown')).toBeInTheDocument();
    expect(screen.getAllByText(/Code Coverage/)[0]).toBeInTheDocument();
    expect(screen.getByText('Performance Thresholds')).toBeInTheDocument();
  });

  it('shows loading placeholders before query resolves', () => {
    vi.mocked(codeIntelligenceSource.fetchAll).mockImplementation(() => new Promise(() => {}));

    renderWithClient(<CodeIntelligence />);

    expect(screen.getAllByText('...').length).toBeGreaterThan(0);
  });

  it('falls back to zeroed compliance summary when data is empty', async () => {
    vi.mocked(codeIntelligenceSource.fetchAll).mockResolvedValue({
      codeAnalysis: {
        files_analyzed: 0,
        avg_complexity: 0,
        code_smells: 0,
        security_issues: 0,
        complexity_trend: [],
        quality_trend: [],
      },
      compliance: {
        summary: {
          totalFiles: 0,
          compliantFiles: 0,
          nonCompliantFiles: 0,
          pendingFiles: 0,
          compliancePercentage: 0,
          avgComplianceScore: 0,
        },
        statusBreakdown: [],
        nodeTypeBreakdown: [],
        trend: [],
      },
      isMock: true,
    });

    renderWithClient(<CodeIntelligence />);

    await waitFor(() => {
      expect(screen.getByText('ONEX Compliance Coverage')).toBeInTheDocument();
    });

    expect(screen.getByText('0 files tracked')).toBeInTheDocument();
    expect(screen.getAllByText('0').length).toBeGreaterThan(0);
  });
});
