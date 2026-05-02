// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient } from '@tanstack/react-query';
import { DataSourceTestProvider } from '@/test-utils/dataSourceTestProvider';
import { mockFetchWithItems } from '@/test-utils/mockFetch';
import { registerViz, vizRegistry } from './viz-registry';
import ProjectionContainer from './ProjectionContainer';
import type { VisualizationContract } from '../../../../shared/types/visualization-contract';
import type { JSX } from 'react';

const testContract: VisualizationContract = {
  version: '1.0.0',
  topic: 'onex.snapshot.projection.ab-compare.v1',
  display_name: 'A/B Model Cost Comparison',
  default_visualization: 'bar_chart',
  available_visualizations: ['bar_chart'],
  controls: [{ type: 'visualization_picker' }],
  display_name_field: 'display_name',
  cost_field: 'cost_usd',
  latency_field: 'latency_ms',
  group_by: 'correlation_id',
  query_params: {
    run_selector: { field: 'correlation_id', param: 'run_id' },
  },
};

const mockRow = {
  display_name: 'Qwen3-Local',
  cost_usd: 0.001,
  latency_ms: 120,
  correlation_id: 'run-abc',
};

describe('ProjectionContainer', () => {
  let qc: QueryClient;

  beforeEach(() => {
    qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    vi.stubGlobal('fetch', vi.fn());
    // Clear registry between tests.
    for (const key of Object.keys(vizRegistry)) {
      delete vizRegistry[key as keyof typeof vizRegistry];
    }
  });

  afterEach(() => vi.restoreAllMocks());

  it('renders loading skeleton while data is pending', () => {
    (fetch as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {}));
    render(
      <DataSourceTestProvider client={qc}>
        <ProjectionContainer contract={testContract} />
      </DataSourceTestProvider>,
    );
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('renders with mock data when adapter is registered', async () => {
    registerViz('bar_chart', {
      render: () => <div>bar chart rendered</div> as JSX.Element,
    });
    mockFetchWithItems([mockRow]);

    render(
      <DataSourceTestProvider client={qc}>
        <ProjectionContainer contract={testContract} />
      </DataSourceTestProvider>,
    );

    await waitFor(() => expect(screen.getByText('bar chart rendered')).toBeInTheDocument());
    expect(screen.getByText('A/B Model Cost Comparison')).toBeInTheDocument();
  });

  it('renders error state when required field missing', async () => {
    registerViz('bar_chart', {
      render: () => <div>bar chart rendered</div> as JSX.Element,
    });
    // Missing cost_usd field.
    mockFetchWithItems([{ display_name: 'Qwen3', latency_ms: 100, correlation_id: 'run-1' }]);

    render(
      <DataSourceTestProvider client={qc}>
        <ProjectionContainer contract={testContract} />
      </DataSourceTestProvider>,
    );

    await waitFor(() =>
      expect(screen.getByText(/Required fields missing in data/i)).toBeInTheDocument(),
    );
  });

  it('renders error state immediately for unsupported contract version', () => {
    const badContract: VisualizationContract = { ...testContract, version: '99.0.0' };
    render(
      <DataSourceTestProvider client={qc}>
        <ProjectionContainer contract={badContract} />
      </DataSourceTestProvider>,
    );
    expect(screen.getByText(/Unsupported contract version: 99.0.0/)).toBeInTheDocument();
  });

  it('renders empty state when no data rows', async () => {
    mockFetchWithItems([]);
    render(
      <DataSourceTestProvider client={qc}>
        <ProjectionContainer contract={testContract} />
      </DataSourceTestProvider>,
    );
    await waitFor(() =>
      expect(screen.getByText(/No data available for this projection/i)).toBeInTheDocument(),
    );
  });

  it('renders VizRenderer error state when no adapter registered for active type', async () => {
    // No registerViz call — registry is empty.
    mockFetchWithItems([mockRow]);
    render(
      <DataSourceTestProvider client={qc}>
        <ProjectionContainer contract={testContract} />
      </DataSourceTestProvider>,
    );
    await waitFor(() =>
      expect(screen.getByText(/No adapter registered for visualization type: bar_chart/i)).toBeInTheDocument(),
    );
  });
});
