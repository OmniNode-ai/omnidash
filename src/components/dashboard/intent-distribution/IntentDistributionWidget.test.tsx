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

  it('renders intent rows sorted by count descending', async () => {
    mockFetchWithItems([
      { intent_category: 'testing', count: 10, percentage: 25 },
      { intent_category: 'debugging', count: 30, percentage: 75 },
    ]);
    render(
      <DataSourceTestProvider client={qc}>
        <IntentDistributionWidget />
      </DataSourceTestProvider>,
    );
    const rows = await screen.findAllByTestId('intent-row');
    expect(rows.length).toBe(2);
    // First row should be debugging (highest count)
    expect(rows[0]).toHaveTextContent('debugging');
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
