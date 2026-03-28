/**
 * StatusDashboard Page Tests (OMN-6845)
 *
 * Tests for the Status dashboard page with compliance metrics integration.
 * Covers: rendering, compliance metrics display, loading states, empty state.
 */

import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest';
import StatusDashboard from '@/pages/StatusDashboard';

// ===========================
// Mocks
// ===========================

vi.mock('@/lib/data-sources/status-source', () => ({
  statusSource: {
    prs: vi.fn().mockResolvedValue({}),
    hooks: vi.fn().mockResolvedValue([]),
    workstreams: vi.fn().mockResolvedValue({ workstreams: [], snapshot_at: null }),
    summary: vi.fn().mockResolvedValue({
      triage_counts: {},
      ci_failure_repos: [],
      total_prs: 0,
      workstream_count: 0,
    }),
  },
}));

vi.mock('@/hooks/useWebSocket', () => ({
  useWebSocket: () => ({
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    isConnected: false,
    connectionStatus: 'disconnected',
  }),
}));

vi.mock('date-fns', () => ({
  formatDistanceToNow: () => '5 minutes ago',
}));

// Mock global fetch for compliance API
const mockFetch = vi.fn();
global.fetch = mockFetch;

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  });
}

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = createTestQueryClient();
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

// ===========================
// Tests
// ===========================

describe('StatusDashboard', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders page title and subtitle', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          summary: { total: 10, passed: 9, failed: 1, passRate: 90.0 },
          evaluations: [],
        }),
    });

    renderWithProviders(<StatusDashboard />);

    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText(/Compliance metrics, PR triage/)).toBeInTheDocument();
  });

  it('displays compliance metrics when data is available', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          summary: { total: 50, passed: 45, failed: 5, passRate: 90.0 },
          evaluations: [],
        }),
    });

    renderWithProviders(<StatusDashboard />);

    await waitFor(() => {
      expect(screen.getByText('90%')).toBeInTheDocument();
    });
    expect(screen.getByText('50')).toBeInTheDocument();
    expect(screen.getByText('45')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('shows pass rate in green when at or above target', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          summary: { total: 100, passed: 95, failed: 5, passRate: 95.0 },
          evaluations: [],
        }),
    });

    renderWithProviders(<StatusDashboard />);

    await waitFor(() => {
      const passRate = screen.getByText('95%');
      expect(passRate).toBeInTheDocument();
      expect(passRate.className).toContain('text-green-500');
    });
  });

  it('shows pass rate in yellow when between 70 and target', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          summary: { total: 100, passed: 75, failed: 25, passRate: 75.0 },
          evaluations: [],
        }),
    });

    renderWithProviders(<StatusDashboard />);

    await waitFor(() => {
      const passRate = screen.getByText('75%');
      expect(passRate).toBeInTheDocument();
      expect(passRate.className).toContain('text-yellow-500');
    });
  });

  it('shows pass rate in red when below 70', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          summary: { total: 100, passed: 50, failed: 50, passRate: 50.0 },
          evaluations: [],
        }),
    });

    renderWithProviders(<StatusDashboard />);

    await waitFor(() => {
      const passRate = screen.getByText('50%');
      expect(passRate).toBeInTheDocument();
      expect(passRate.className).toContain('text-red-500');
    });
  });

  it('renders three-column layout sections', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          summary: { total: 0, passed: 0, failed: 0, passRate: 0 },
          evaluations: [],
        }),
    });

    renderWithProviders(<StatusDashboard />);

    expect(screen.getByText('Workstreams')).toBeInTheDocument();
    expect(screen.getByText('PR Triage')).toBeInTheDocument();
    expect(screen.getByText('Live Activity')).toBeInTheDocument();
  });
});
