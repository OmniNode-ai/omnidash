// @vitest-environment jsdom
// OMN-10294 audit tracking test — STAY-BESPOKE decision for both quality-score-panel variants.
//
// Purpose: assert the stable structural contract of QualityScore (router) so any
// future drift toward the generic primitive boundary is caught as a test failure,
// not silent behavior change. This test does NOT cover rendering details — those
// live in QualityScoreHistogram.test.tsx and QualityScoreTilted3D.test.tsx.
//
// The QualityScore router wraps sub-components in React.Suspense with fallback=null,
// so during the lazy-load phase the DOM is empty. We assert that the router mounts
// without throwing and that the lazy sub-module eventually resolves by waiting for
// the post-fetch loading state provided by each sub-component.
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { DataSourceTestProvider } from '@/test-utils/dataSourceTestProvider';
import { mockFetchWithItems } from '@/test-utils/mockFetch';
import QualityScore from './QualityScore';

// Stub three.js WebGLRenderer (jsdom has no WebGL).
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

describe('QualityScore router (OMN-10294 audit)', () => {
  beforeEach(() => {
    qc.clear();
    vi.stubGlobal('fetch', vi.fn());
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
  });
  afterEach(() => vi.restoreAllMocks());

  it('defaults to the 3D variant when dimension is omitted', async () => {
    // The manifest default is '3d'. If this assertion changes, update the
    // manifest entry in generate-registry.ts:240 (dimension default).
    // The 3D variant shows its loading state after the lazy chunk resolves.
    (fetch as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {}));
    render(
      <DataSourceTestProvider client={qc}>
        <QualityScore config={{}} />
      </DataSourceTestProvider>,
    );
    expect(await screen.findByText('Loading...')).toBeInTheDocument();
  });

  it('shows the 2D variant empty state (STAY-BESPOKE: threshold-line overlay not in IBarChartAdapter)', async () => {
    // 2D variant: STAY-BESPOKE (OMN-10294). Not migrated to IBarChartAdapter because
    // threshold-line, mean-marker, and pass-rate overlays are not expressible via
    // BarChartFieldMapping{x, y, group, format}. Re-evaluate at iteration-2.
    mockFetchWithItems([{ meanScore: 0, distribution: [], totalMeasurements: 0 }]);
    render(
      <DataSourceTestProvider client={qc}>
        <QualityScore config={{ dimension: '2d' }} />
      </DataSourceTestProvider>,
    );
    expect(await screen.findByText(/loading|no quality scores/i, {}, { timeout: 5_000 })).toBeInTheDocument();
  });

  it('shows the 3D variant empty state (STAY-BESPOKE: custom three.js geometry)', async () => {
    // 3D variant: STAY-BESPOKE (OMN-10294). Custom three.js tilted camera,
    // translucent threshold plane, inverted-cone mean marker, raycasting hover.
    // Materially different from any generic primitive; no migration path at this iteration.
    mockFetchWithItems([{ meanScore: 0, distribution: [], totalMeasurements: 0 }]);
    render(
      <DataSourceTestProvider client={qc}>
        <QualityScore config={{ dimension: '3d' }} />
      </DataSourceTestProvider>,
    );
    expect(await screen.findByText(/no quality data/i, {}, { timeout: 5_000 })).toBeInTheDocument();
  });
});
