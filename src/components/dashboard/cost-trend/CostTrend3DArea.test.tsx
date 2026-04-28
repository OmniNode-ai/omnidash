// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { DataSourceTestProvider } from '@/test-utils/dataSourceTestProvider';
import { mockFetchWithItems } from '@/test-utils/mockFetch';
import CostTrend3DArea from './CostTrend3DArea';

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

// Stub three.js — same pattern as CostTrend3DBars.test.tsx since the two
// renderers share the same scene scaffold and just differ in geometry.
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
    getContext() {
      return {} as WebGLRenderingContext;
    }
  }
  return { ...actual, WebGLRenderer: FakeWebGLRenderer };
});

vi.mock('three/examples/jsm/renderers/CSS2DRenderer.js', () => {
  class FakeCSS2DRenderer {
    domElement = (() => {
      const el = document.createElement('div');
      el.style.position = 'absolute';
      return el;
    })();
    setSize() {}
    render() {}
  }
  class FakeCSS2DObject {
    constructor(public element: HTMLElement) {}
    position = { set() {} };
  }
  return { CSS2DRenderer: FakeCSS2DRenderer, CSS2DObject: FakeCSS2DObject };
});

class FakeResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

describe('CostTrend3DArea', () => {
  beforeEach(() => {
    qc.clear();
    vi.stubGlobal('fetch', vi.fn());
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
  });
  afterEach(() => vi.restoreAllMocks());

  it('shows empty state when there is no cost data', async () => {
    mockFetchWithItems([]);
    render(
      <DataSourceTestProvider client={qc}>
        <CostTrend3DArea config={{}} />
      </DataSourceTestProvider>,
    );
    expect(await screen.findByText(/no cost data available/i)).toBeInTheDocument();
  });

  it('renders without throwing against populated data', async () => {
    mockFetchWithItems([
      { bucket_time: '2026-04-20T01:00:00Z', model_name: 'deepseek-r1-32b', total_cost_usd: '2.00', total_tokens: 1000 },
      { bucket_time: '2026-04-20T02:00:00Z', model_name: 'claude-sonnet-4-6', total_cost_usd: '1.00', total_tokens: 500 },
    ]);
    expect(() =>
      render(
        <DataSourceTestProvider client={qc}>
          <CostTrend3DArea config={{}} />
        </DataSourceTestProvider>,
      ),
    ).not.toThrow();
  });
});
