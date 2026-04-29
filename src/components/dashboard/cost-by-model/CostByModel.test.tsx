/**
 * OMN-10291: cost-by-model manifest migration tests.
 *
 * CostByModel.tsx (bespoke router) was deleted; the widget is now dispatched
 * via the adapter resolver. These tests assert:
 *   1. resolveChartAdapter('IBarChartAdapter', 'threejs') → BarChartThreeJs (2D variant)
 *   2. resolveChartAdapter('IDoughnutChartAdapter', 'threejs') → DoughnutChartAdapterThreeJs (3D variant)
 *   3. DoughnutChartAdapter correctly aggregates model costs from projection rows
 */
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { DataSourceTestProvider } from '@/test-utils/dataSourceTestProvider';
import {
  resolveChartAdapter,
} from '@/components/charts/adapter-resolver';
import { BarChartThreeJs } from '@/components/charts/threejs/BarChart';
import {
  DoughnutChartAdapter,
  DoughnutChartAdapterThreeJs,
} from '@/components/charts/threejs/DoughnutChartAdapter';

// Stub three.js WebGLRenderer for jsdom.
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

describe('cost-by-model manifest migration (OMN-10291)', () => {
  beforeEach(() => {
    qc.clear();
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
  });
  afterEach(() => vi.restoreAllMocks());

  describe('adapter resolver — manifest dispatch', () => {
    it('resolves IBarChartAdapter + threejs to BarChartThreeJs (2D variant)', () => {
      const result = resolveChartAdapter('IBarChartAdapter', 'threejs');
      expect(result).toBe(BarChartThreeJs);
    });

    it('resolves IDoughnutChartAdapter + threejs to DoughnutChartAdapterThreeJs (3D variant)', () => {
      const result = resolveChartAdapter('IDoughnutChartAdapter', 'threejs');
      expect(result).toBe(DoughnutChartAdapterThreeJs);
    });
  });

  describe('DoughnutChartAdapter — projection row aggregation', () => {
    const costRows = [
      { model_name: 'deepseek-r1-32b', total_cost_usd: '2.00', bucket_time: '2026-04-20T01:00:00Z' },
      { model_name: 'deepseek-r1-32b', total_cost_usd: '1.00', bucket_time: '2026-04-20T02:00:00Z' },
      { model_name: 'claude-sonnet-4-6', total_cost_usd: '1.00', bucket_time: '2026-04-20T03:00:00Z' },
      { model_name: 'qwen3-coder-30b', total_cost_usd: '1.00', bucket_time: '2026-04-20T04:00:00Z' },
    ];

    it('renders legend entries for each unique model', async () => {
      render(
        <DataSourceTestProvider client={qc}>
          <DoughnutChartAdapter
            projectionData={costRows}
            fieldMappings={{ label: 'model_name', value: 'total_cost_usd' }}
          />
        </DataSourceTestProvider>,
      );
      expect(await screen.findByText('deepseek-r1-32b')).toBeInTheDocument();
      expect(screen.getByText('claude-sonnet-4-6')).toBeInTheDocument();
      expect(screen.getByText('qwen3-coder-30b')).toBeInTheDocument();
    });

    it('shows correct total and percentage shares in legend', async () => {
      render(
        <DataSourceTestProvider client={qc}>
          <DoughnutChartAdapter
            projectionData={costRows}
            fieldMappings={{ label: 'model_name', value: 'total_cost_usd' }}
          />
        </DataSourceTestProvider>,
      );
      // deepseek $3 = 60%, claude $1 = 20%, qwen $1 = 20%, total $5
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
  });
});
