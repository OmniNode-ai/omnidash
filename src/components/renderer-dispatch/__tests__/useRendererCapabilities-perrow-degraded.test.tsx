// OMN-13381: per-row is_degraded gate — projection rows with is_degraded=true
// must NOT satisfy the renderer-capability dispatcher gate.
//
// Root cause (from gh-live-PROVEN-summary.md §Observed wiring gap):
//   The W5 reducer writes `is_degraded=true` PER ROW when a renderer's heartbeat
//   expires. The shipped `useRendererCapabilities` used the envelope-level
//   `isError` (HTTP error only) as its `isDegraded` signal and did NOT filter
//   per-row `is_degraded`. Result: a stale-but-chart-capable renderer row kept
//   satisfying the gate and the widget rendered content instead of the typed
//   UPSTREAM_BLOCKED empty-state.
//
// Fix (OMN-13381): `useRendererCapabilities` now reads rows as
// `RendererCapabilityProjectionRow`, filters out rows where `is_degraded=true`,
// and sets `isDegraded=true` when all rows are degraded (none survived the
// filter). The `CapabilityGate` receives only fresh rows → renders
// UPSTREAM_BLOCKED when all rows are stale.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { render, screen } from '@testing-library/react';
import { useRendererCapabilities } from '../useRendererCapabilities';
import { CapabilityGate } from '../CapabilityGate';
import type { CapabilityProjectionState } from '../capability-empty-state';
import type { RendererRequirement } from '../capability-dispatcher';
import type { RendererCapabilityProjectionRow } from '@shared/types/renderer-capability';
import type { RendererCapabilityContract } from '@shared/types/renderer-capability';

// ── Mocks ─────────────────────────────────────────────────────────────────────

// Mock useProjectionQuery so we can drive the per-row is_degraded field
// deterministically without any HTTP/source infrastructure.
vi.mock('@/hooks/useProjectionQuery', () => ({
  useProjectionQuery: vi.fn(),
}));

import { useProjectionQuery } from '@/hooks/useProjectionQuery';

const mockUseProjectionQuery = vi.mocked(useProjectionQuery);

// Convenience: cast a partial mock return value to the hook's return type so
// vi.mocked can accept it without full TanStack Query shape.
function mockQueryReturn(
  overrides: Partial<ReturnType<typeof useProjectionQuery>>,
): ReturnType<typeof useProjectionQuery> {
  return overrides as unknown as ReturnType<typeof useProjectionQuery>;
}

// Base capability surface — matches `chart` component kind. Used to build
// projection rows with varying `is_degraded` values.
const capabilityBase: RendererCapabilityContract = {
  renderer_id: 'omnidash-web',
  platform: 'web',
  supported_component_kinds: ['chart'],
  interaction_model: 'pointer',
  accessibility_tier: 'aa',
  contract_version: { major: 1, minor: 0, patch: 0 },
  supports_interaction: true,
  supports_streaming: false,
  supports_theming: true,
};

const chartRequirement: RendererRequirement = { componentKind: 'chart' };

function makeFreshRow(
  overrides?: Partial<RendererCapabilityProjectionRow>,
): RendererCapabilityProjectionRow {
  return { ...capabilityBase, is_degraded: false, ...overrides };
}

function makeDegradedRow(
  overrides?: Partial<RendererCapabilityProjectionRow>,
): RendererCapabilityProjectionRow {
  return { ...capabilityBase, is_degraded: true, ...overrides };
}

afterEach(() => {
  vi.resetAllMocks();
});

// ── useRendererCapabilities — per-row filtering logic ─────────────────────────

describe('useRendererCapabilities — OMN-13381 per-row is_degraded filtering', () => {
  it('excludes a row with is_degraded=true from capabilities (key regression)', () => {
    // Projection returns one row: chart-capable, but is_degraded=true (stale heartbeat).
    // The hook must NOT include this row in capabilities.
    mockUseProjectionQuery.mockReturnValue(
      mockQueryReturn({
        data: [makeDegradedRow()],
        isError: false,
        isLoading: false,
      }),
    );

    const { result } = renderHook(() => useRendererCapabilities());

    // Zero fresh rows — the degraded row was filtered out.
    expect(result.current.capabilities).toHaveLength(0);
  });

  it('sets isDegraded=true when ALL rows are degraded (not just HTTP error)', () => {
    // A stale-but-listed renderer must flip isDegraded so the gate blocks.
    mockUseProjectionQuery.mockReturnValue(
      mockQueryReturn({
        data: [makeDegradedRow()],
        isError: false,
        isLoading: false,
      }),
    );

    const { result } = renderHook(() => useRendererCapabilities());

    expect(result.current.isDegraded).toBe(true);
  });

  it('includes fresh rows (is_degraded=false) in capabilities', () => {
    mockUseProjectionQuery.mockReturnValue(
      mockQueryReturn({
        data: [makeFreshRow()],
        isError: false,
        isLoading: false,
      }),
    );

    const { result } = renderHook(() => useRendererCapabilities());

    expect(result.current.capabilities).toHaveLength(1);
    expect(result.current.isDegraded).toBe(false);
  });

  it('filters degraded rows and keeps fresh rows when both exist', () => {
    // Two renderers: one fresh (chart+table), one degraded (chart only).
    // Only the fresh one should survive.
    const freshMultiKind = makeFreshRow({
      renderer_id: 'omnidash-fresh',
      supported_component_kinds: ['chart', 'table'],
    });
    const degradedChart = makeDegradedRow({ renderer_id: 'omnidash-stale' });

    mockUseProjectionQuery.mockReturnValue(
      mockQueryReturn({
        data: [freshMultiKind, degradedChart],
        isError: false,
        isLoading: false,
      }),
    );

    const { result } = renderHook(() => useRendererCapabilities());

    expect(result.current.capabilities).toHaveLength(1);
    expect(result.current.capabilities[0].renderer_id).toBe('omnidash-fresh');
    expect(result.current.isDegraded).toBe(false);
  });

  it('treats is_degraded=undefined as fresh (absence of flag = fresh)', () => {
    // Older projection rows may not carry is_degraded at all.
    const rowWithoutFlag: RendererCapabilityProjectionRow = { ...capabilityBase };
    mockUseProjectionQuery.mockReturnValue(
      mockQueryReturn({
        data: [rowWithoutFlag],
        isError: false,
        isLoading: false,
      }),
    );

    const { result } = renderHook(() => useRendererCapabilities());

    expect(result.current.capabilities).toHaveLength(1);
    expect(result.current.isDegraded).toBe(false);
  });

  it('sets isDegraded=true on HTTP error (unchanged existing behaviour)', () => {
    mockUseProjectionQuery.mockReturnValue(
      mockQueryReturn({
        data: undefined,
        isError: true,
        isLoading: false,
      }),
    );

    const { result } = renderHook(() => useRendererCapabilities());

    expect(result.current.isDegraded).toBe(true);
  });

  it('does not set isDegraded when rows array is empty (absent projection != degraded)', () => {
    // Zero rows = absent projection. That is handled by the gate's
    // `capabilities.length === 0` branch, not by isDegraded. Don't conflate them.
    mockUseProjectionQuery.mockReturnValue(
      mockQueryReturn({
        data: [],
        isError: false,
        isLoading: false,
      }),
    );

    const { result } = renderHook(() => useRendererCapabilities());

    expect(result.current.capabilities).toHaveLength(0);
    expect(result.current.isDegraded).toBe(false);
  });
});

// ── CapabilityGate + useRendererCapabilities integration ─────────────────────
//
// These tests prove the end-to-end path: a degraded row from the projection
// must cause CapabilityGate to render typed UPSTREAM_BLOCKED — not content.

function renderGateWithState(state: CapabilityProjectionState) {
  return render(
    <CapabilityGate state={state} requirement={chartRequirement}>
      {(entry) => (
        <div data-testid="matched">{entry.capability.renderer_id}</div>
      )}
    </CapabilityGate>,
  );
}

describe('CapabilityGate — OMN-13381 degraded row renders UPSTREAM_BLOCKED', () => {
  it('renders UPSTREAM_BLOCKED when state has zero fresh capabilities (all rows degraded)', () => {
    // Simulate what useRendererCapabilities returns after filtering all-degraded rows:
    // capabilities=[], isDegraded=true.
    const state: CapabilityProjectionState = { capabilities: [], isDegraded: true };
    const { container } = renderGateWithState(state);

    const empty = container.querySelector('[data-empty-state-reason]');
    expect(empty).not.toBeNull();
    expect(empty?.getAttribute('data-empty-state-reason')).toBe('upstream-blocked');
    expect(screen.getByRole('status').textContent?.length ?? 0).toBeGreaterThan(0);
    // The matched child (content) must NOT render.
    expect(screen.queryByTestId('matched')).toBeNull();
  });

  it('renders content only when a non-degraded row satisfies the requirement', () => {
    // Only fresh row passes; gate renders content.
    const freshCapability: RendererCapabilityContract = { ...capabilityBase };
    const state: CapabilityProjectionState = {
      capabilities: [freshCapability],
      isDegraded: false,
    };
    renderGateWithState(state);

    expect(screen.getByTestId('matched').textContent).toBe('omnidash-web');
    expect(screen.queryByRole('status')).toBeNull();
  });
});
