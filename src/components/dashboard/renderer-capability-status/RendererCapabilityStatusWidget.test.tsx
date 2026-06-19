// OMN-13131 (W6 live wiring, G-H): the widget that LIVE-mounts the
// renderer-capability gate must render the typed UPSTREAM_BLOCKED empty-state
// (data-empty-state-reason='upstream-blocked') when the live projection read is
// absent or degraded — never a blank/blind render, never a crash — and render the
// declared renderer rows when a fresh, satisfying capability is present.
//
// The live read (`useRendererCapabilities`) is mocked so the absent/degraded/
// populated branches are driven deterministically; the wiring through
// CapabilityGate → TypedEmptyState is the unit under test.

import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { RendererCapabilityContract } from '@shared/types/renderer-capability';

const mockUseRendererCapabilities = vi.fn();

vi.mock('@/components/renderer-dispatch/useRendererCapabilities', () => ({
  useRendererCapabilities: () => mockUseRendererCapabilities(),
}));

// WidgetChrome context is consumed by ComponentWrapper; provide the minimal
// default so the wrapper renders without a provider.
vi.mock('@/components/dashboard/WidgetChromeContext', () => ({
  useWidgetChrome: () => ({
    authorityLabel: undefined,
    onConfigure: undefined,
    onDuplicate: undefined,
    onDelete: undefined,
    draggable: false,
    isDragging: false,
    isDropTarget: false,
  }),
}));

import RendererCapabilityStatusWidget from './RendererCapabilityStatusWidget';

const chartCapability: RendererCapabilityContract = {
  renderer_id: 'viz.bar_chart',
  platform: 'web',
  supported_component_kinds: ['chart'],
  interaction_model: 'pointer',
  accessibility_tier: 'aa',
  contract_version: { major: 1, minor: 0, patch: 0 },
  supports_interaction: true,
  supports_streaming: false,
  supports_theming: true,
};

afterEach(() => {
  mockUseRendererCapabilities.mockReset();
});

describe('RendererCapabilityStatusWidget — G-H live mount', () => {
  it('renders the typed upstream-blocked empty-state when the projection is absent', () => {
    mockUseRendererCapabilities.mockReturnValue({
      capabilities: [],
      isDegraded: false,
      isLoading: false,
    });
    const { container } = render(<RendererCapabilityStatusWidget />);
    const empty = container.querySelector('[data-empty-state-reason]');
    expect(empty).not.toBeNull();
    expect(empty?.getAttribute('data-empty-state-reason')).toBe('upstream-blocked');
    // Not blank — visible status text present.
    expect(screen.getByRole('status').textContent?.length ?? 0).toBeGreaterThan(0);
    expect(screen.queryByTestId('renderer-capability-rows')).toBeNull();
  });

  it('renders the typed upstream-blocked empty-state when the projection is degraded', () => {
    mockUseRendererCapabilities.mockReturnValue({
      capabilities: [chartCapability],
      isDegraded: true,
      isLoading: false,
    });
    const { container } = render(<RendererCapabilityStatusWidget />);
    const empty = container.querySelector('[data-empty-state-reason]');
    expect(empty?.getAttribute('data-empty-state-reason')).toBe('upstream-blocked');
    expect(screen.queryByTestId('renderer-capability-rows')).toBeNull();
  });

  it('renders the declared renderer rows when a fresh capability satisfies the requirement', () => {
    mockUseRendererCapabilities.mockReturnValue({
      capabilities: [chartCapability],
      isDegraded: false,
      isLoading: false,
    });
    render(<RendererCapabilityStatusWidget />);
    expect(screen.getByTestId('renderer-capability-rows')).toBeInTheDocument();
    expect(screen.getByText('viz.bar_chart')).toBeInTheDocument();
    expect(screen.getByText('1 renderer declared')).toBeInTheDocument();
  });

  it('does not crash on an absent projection (no throw)', () => {
    mockUseRendererCapabilities.mockReturnValue({
      capabilities: [],
      isDegraded: false,
      isLoading: false,
    });
    expect(() => render(<RendererCapabilityStatusWidget />)).not.toThrow();
  });
});
