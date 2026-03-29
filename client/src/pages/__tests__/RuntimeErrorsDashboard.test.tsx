import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest';
import type { ReactNode } from 'react';
import RuntimeErrorsDashboard from '@/pages/RuntimeErrorsDashboard';
import { runtimeErrorsSource } from '@/lib/data-sources/runtime-errors-source';

vi.mock('@/lib/data-sources/runtime-errors-source', async () => {
  const actual = await vi.importActual<typeof import('@/lib/data-sources/runtime-errors-source')>(
    '@/lib/data-sources/runtime-errors-source'
  );
  return {
    ...actual,
    runtimeErrorsSource: {
      summary: vi.fn(),
      events: vi.fn(),
      triage: vi.fn(),
    },
  };
});

vi.mock('@/hooks/useWebSocket', () => ({
  useWebSocket: vi.fn(),
}));

let queryClient: QueryClient | null = null;

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

describe('RuntimeErrorsDashboard page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
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

  it('renders loading state then populated data', async () => {
    vi.mocked(runtimeErrorsSource.summary).mockResolvedValue({
      categoryCounts: {
        kafkaConsumer: 2,
        kafkaProducer: 0,
        database: 1,
        httpClient: 0,
        httpServer: 0,
        runtime: 0,
        unknown: 0,
      },
      topFingerprints: [],
      totalEvents: 3,
      window: '24h',
    });

    vi.mocked(runtimeErrorsSource.events).mockResolvedValue({
      events: [
        {
          id: 'evt-1',
          loggerFamily: 'kafka',
          logLevel: 'ERROR',
          messageTemplate: 'Connection refused',
          errorCategory: 'KAFKA_CONSUMER',
          severity: 'ERROR',
          fingerprint: 'fp1',
          exceptionType: 'ConnectionError',
          exceptionMessage: 'Connection refused',
          hostname: 'host-1',
          serviceLabel: 'runtime',
          emittedAt: new Date().toISOString(),
        },
      ],
      window: '24h',
    });

    vi.mocked(runtimeErrorsSource.triage).mockResolvedValue({
      triageEntries: [
        {
          fingerprint: 'fp1',
          action: 'AUTO_FIXED',
          actionStatus: 'SUCCESS',
          ticketId: null,
          ticketUrl: null,
          autoFixType: 'restart',
          autoFixVerified: true,
          severity: 'ERROR',
          errorCategory: 'KAFKA_CONSUMER',
          container: 'omninode-runtime',
          operatorAttentionRequired: false,
          recurrenceCount: 3,
          firstSeenAt: new Date().toISOString(),
          lastSeenAt: new Date().toISOString(),
          lastTriagedAt: new Date().toISOString(),
        },
      ],
    });

    const result = renderWithClient(<RuntimeErrorsDashboard />);

    await waitFor(() => {
      expect(screen.getByText('Runtime Errors')).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByText('Total Errors')).toBeInTheDocument();
    });

    // Triage section should render
    await waitFor(() => {
      expect(screen.getByText('Triage State')).toBeInTheDocument();
    });

    expect(screen.getByText('AUTO FIXED')).toBeInTheDocument();
    expect(screen.getByText('omninode-runtime')).toBeInTheDocument();

    result.unmount();
  });

  it('shows empty state when no errors', async () => {
    vi.mocked(runtimeErrorsSource.summary).mockResolvedValue({
      categoryCounts: {
        kafkaConsumer: 0,
        kafkaProducer: 0,
        database: 0,
        httpClient: 0,
        httpServer: 0,
        runtime: 0,
        unknown: 0,
      },
      topFingerprints: [],
      totalEvents: 0,
      window: '24h',
    });

    vi.mocked(runtimeErrorsSource.events).mockResolvedValue({
      events: [],
      window: '24h',
    });

    vi.mocked(runtimeErrorsSource.triage).mockResolvedValue({
      triageEntries: [],
    });

    const result = renderWithClient(<RuntimeErrorsDashboard />);

    await waitFor(() => {
      expect(screen.getByText('No runtime errors in this window')).toBeInTheDocument();
    });

    result.unmount();
  });
});
