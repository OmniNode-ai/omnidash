// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CostTrend3D from './CostTrend3D';

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

// Stub three.js — jsdom has no WebGL context, and CSS2DRenderer also
// needs a DOM that's safe to query during render. Mirrors the pattern in
// CostByModelPie.test.tsx so we exercise reshape + JSX paths without a
// real WebGL stack.
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

function mockFetchWithItems(items: unknown[]) {
  const fileNames = items.map((_, i) => `${i}.json`);
  const fileMap = new Map(fileNames.map((name, i) => [name, items[i]]));
  (fetch as any)
    .mockResolvedValueOnce({ ok: true, json: async () => fileNames })
    .mockImplementation((url: string) => {
      const filename = url.split('/').pop() ?? '';
      const item = fileMap.get(filename) ?? null;
      return Promise.resolve({ ok: true, json: async () => item });
    });
}

describe('CostTrend3D (T9 — H9 acceptance)', () => {
  beforeEach(() => {
    qc.clear();
    vi.stubGlobal('fetch', vi.fn());
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
  });
  afterEach(() => vi.restoreAllMocks());

  it('shows loading state while data is in-flight', () => {
    (fetch as any).mockReturnValue(new Promise(() => {}));
    render(
      <QueryClientProvider client={qc}>
        <CostTrend3D config={{}} />
      </QueryClientProvider>,
    );
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('shows empty state when there is no cost data', async () => {
    mockFetchWithItems([]);
    render(
      <QueryClientProvider client={qc}>
        <CostTrend3D config={{}} />
      </QueryClientProvider>,
    );
    expect(await screen.findByText(/no cost data available/i)).toBeInTheDocument();
  });

  it('renders without throwing against populated data', async () => {
    mockFetchWithItems([
      { bucket_time: '2026-04-20T01:00:00Z', model_name: 'deepseek-r1-32b', total_cost_usd: '2.00', total_tokens: 1000 },
      { bucket_time: '2026-04-20T02:00:00Z', model_name: 'claude-sonnet-4-6', total_cost_usd: '1.00', total_tokens: 500 },
    ]);
    render(
      <QueryClientProvider client={qc}>
        <CostTrend3D config={{}} />
      </QueryClientProvider>,
    );
    // The widget header is the most stable assertion — any thrown error
    // during reshape/render would crash the harness before this resolves.
    expect(await screen.findByText('Cost Trend (3D)')).toBeInTheDocument();
  });
});
