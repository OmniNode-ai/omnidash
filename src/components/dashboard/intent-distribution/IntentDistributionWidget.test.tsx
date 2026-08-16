import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { DataSourceTestProvider } from '@/test-utils/dataSourceTestProvider';
import { mockFetchWithItems } from '@/test-utils/mockFetch';
import IntentDistributionWidget from './IntentDistributionWidget';

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

describe('IntentDistributionWidget', () => {
  beforeEach(() => {
    qc.clear();
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => vi.restoreAllMocks());

  it('shows loading state initially', () => {
    (fetch as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {}));
    render(
      <DataSourceTestProvider client={qc}>
        <IntentDistributionWidget />
      </DataSourceTestProvider>,
    );
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('groups raw event rows and sorts by count descending', async () => {
    // Raw projection rows (OMN-14751): the widget groups client-side.
    const event = (
      i: number,
      intent_category: string,
      agent_source: 'claude' | 'cursor' | null,
    ) => ({
      intent_id: `intent-${i}`,
      session_ref: `session-${i}`,
      intent_category,
      confidence: 0.9,
      agent_source,
      created_at: '2026-07-27T22:47:37Z',
    });
    mockFetchWithItems([
      event(1, 'testing', 'claude'),
      event(2, 'debugging', 'cursor'),
      event(3, 'debugging', 'claude'),
      event(4, 'debugging', null),
    ]);
    render(
      <DataSourceTestProvider client={qc}>
        <IntentDistributionWidget />
      </DataSourceTestProvider>,
    );
    const rows = await screen.findAllByTestId('intent-row');
    expect(rows.length).toBe(2);
    // First row should be debugging (3 of 4 events)
    expect(rows[0]).toHaveTextContent('debugging');
    expect(rows[0]).toHaveTextContent('75.0%');
    // Per-source split surfaces in the count tooltip
    expect(rows[0].querySelector('.mono.tnum')?.getAttribute('title')).toContain(
      'cursor: 1',
    );
  });

  it('shows empty state when no data', async () => {
    mockFetchWithItems([]);
    render(
      <DataSourceTestProvider client={qc}>
        <IntentDistributionWidget />
      </DataSourceTestProvider>,
    );
    expect(await screen.findByText('No intent data')).toBeInTheDocument();
  });
});
