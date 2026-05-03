import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { DataSourceTestProvider } from '@/test-utils/dataSourceTestProvider';
import { mockFetchWithItems } from '@/test-utils/mockFetch';
import SessionTimelineWidget from './SessionTimelineWidget';

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

describe('SessionTimelineWidget', () => {
  beforeEach(() => {
    qc.clear();
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => vi.restoreAllMocks());

  it('shows loading state initially', () => {
    (fetch as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {}));
    render(
      <DataSourceTestProvider client={qc}>
        <SessionTimelineWidget />
      </DataSourceTestProvider>,
    );
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('renders scatter chart by default', async () => {
    mockFetchWithItems([
      {
        intent_id: 'i1',
        session_ref: 's1',
        intent_category: 'debugging',
        confidence: 0.9,
        keywords: ['kafka'],
        created_at: '2026-05-01T12:00:00Z',
      },
    ]);
    render(
      <DataSourceTestProvider client={qc}>
        <SessionTimelineWidget />
      </DataSourceTestProvider>,
    );
    // Wait for the list toggle to become active (data has loaded)
    await screen.findByText('List');
    // The chart SVG should be in the DOM once data renders
    await vi.waitFor(() => {
      expect(document.querySelector('svg')).not.toBeNull();
    });
  });

  it('shows empty state when no data', async () => {
    mockFetchWithItems([]);
    render(
      <DataSourceTestProvider client={qc}>
        <SessionTimelineWidget />
      </DataSourceTestProvider>,
    );
    expect(await screen.findByText('No session timeline data')).toBeInTheDocument();
  });

  it('toggles between chart and list modes', async () => {
    mockFetchWithItems([
      {
        intent_id: 'i1',
        session_ref: 's1',
        intent_category: 'debugging',
        confidence: 0.95,
        keywords: ['react'],
        created_at: '2026-05-01T12:00:00Z',
      },
    ]);
    render(
      <DataSourceTestProvider client={qc}>
        <SessionTimelineWidget />
      </DataSourceTestProvider>,
    );
    // Wait for data
    const listBtn = await screen.findByText('List');
    listBtn.click();
    // List mode renders timeline rows
    const rows = await screen.findAllByTestId('timeline-row');
    expect(rows.length).toBe(1);
  });
});
