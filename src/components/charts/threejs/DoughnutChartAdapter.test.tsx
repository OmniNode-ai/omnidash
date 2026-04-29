// @vitest-environment jsdom
/**
 * Unit tests for DoughnutChartAdapter (OMN-10291).
 *
 * Tests the adapter's aggregation logic and empty-state handling.
 * Three.js canvas stubs avoid WebGL errors in jsdom.
 */
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { DataSourceTestProvider } from '@/test-utils/dataSourceTestProvider';
import { DoughnutChartAdapter } from './DoughnutChartAdapter';

vi.mock('three', async () => {
  const actual = await vi.importActual<typeof import('three')>('three');
  class FakeWebGLRenderer {
    domElement = (() => {
      const el = document.createElement('canvas');
      el.style.display = 'block';
      return el;
    })();
    setPixelRatio() {}
    setClearColor() {}
    setSize() {}
    render() {}
    dispose() {}
  }
  return { ...actual, WebGLRenderer: FakeWebGLRenderer };
});

class FakeResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

const COST_ROWS = [
  { model_name: 'deepseek-r1-32b', total_cost_usd: '3.00', bucket_time: '2026-04-20T01:00:00Z' },
  { model_name: 'claude-sonnet-4-6', total_cost_usd: '1.00', bucket_time: '2026-04-20T01:00:00Z' },
  { model_name: 'qwen3-coder-30b', total_cost_usd: '1.00', bucket_time: '2026-04-20T01:00:00Z' },
];

describe('DoughnutChartAdapter', () => {
  beforeEach(() => {
    qc.clear();
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
  });
  afterEach(() => vi.restoreAllMocks());

  it('renders a legend entry per unique model', async () => {
    render(
      <DataSourceTestProvider client={qc}>
        <DoughnutChartAdapter
          projectionData={COST_ROWS}
          fieldMappings={{ label: 'model_name', value: 'total_cost_usd' }}
        />
      </DataSourceTestProvider>,
    );
    expect(await screen.findByText('deepseek-r1-32b')).toBeInTheDocument();
    expect(screen.getByText('claude-sonnet-4-6')).toBeInTheDocument();
    expect(screen.getByText('qwen3-coder-30b')).toBeInTheDocument();
  });

  it('shows percentage shares and total in legend', async () => {
    render(
      <DataSourceTestProvider client={qc}>
        <DoughnutChartAdapter
          projectionData={COST_ROWS}
          fieldMappings={{ label: 'model_name', value: 'total_cost_usd' }}
        />
      </DataSourceTestProvider>,
    );
    // deepseek $3 / $5 = 60%; claude & qwen $1 / $5 = 20% each
    expect(await screen.findByText('60.0%')).toBeInTheDocument();
    expect(screen.getAllByText('20.0%')).toHaveLength(2);
    expect(screen.getByText('$5.00')).toBeInTheDocument();
  });

  it('renders empty state when projectionData is empty', async () => {
    render(
      <DataSourceTestProvider client={qc}>
        <DoughnutChartAdapter
          projectionData={[]}
          fieldMappings={{ label: 'model_name', value: 'total_cost_usd' }}
          emptyState={{ defaultMessage: 'No cost data available' }}
        />
      </DataSourceTestProvider>,
    );
    expect(await screen.findByText(/no cost data available/i)).toBeInTheDocument();
  });

  it('aggregates multiple rows for the same model', async () => {
    const rows = [
      { model_name: 'deepseek-r1-32b', total_cost_usd: '2.00' },
      { model_name: 'deepseek-r1-32b', total_cost_usd: '1.00' },
      { model_name: 'claude-sonnet-4-6', total_cost_usd: '2.00' },
    ];
    render(
      <DataSourceTestProvider client={qc}>
        <DoughnutChartAdapter
          projectionData={rows}
          fieldMappings={{ label: 'model_name', value: 'total_cost_usd' }}
        />
      </DataSourceTestProvider>,
    );
    // deepseek $3 = 60%, claude $2 = 40%; total $5
    expect(await screen.findByText('60.0%')).toBeInTheDocument();
    expect(screen.getByText('40.0%')).toBeInTheDocument();
    expect(screen.getByText('$5.00')).toBeInTheDocument();
  });
});
