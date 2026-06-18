// OMN-13131 (W6, G-H): the CapabilityGate must render a TYPED empty state
// (EnumEmptyStateReason.UPSTREAM_BLOCKED) when the renderer-capability projection
// is absent or degraded — proven not-blank and not-crashed via the rendered DOM.

import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { CapabilityGate } from './CapabilityGate';
import type { CapabilityProjectionState } from './capability-empty-state';
import type { RendererRequirement } from './capability-dispatcher';
import type { RendererCapabilityContract } from '@shared/types/renderer-capability';

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

const chartRequirement: RendererRequirement = { componentKind: 'chart' };

function renderGate(state: CapabilityProjectionState) {
  return render(
    <CapabilityGate state={state} requirement={chartRequirement}>
      {(entry) => <div data-testid="matched">{entry.capability.renderer_id}</div>}
    </CapabilityGate>,
  );
}

describe('CapabilityGate — G-H typed empty state in the DOM', () => {
  it('renders the matched child when a fresh capability satisfies the requirement', () => {
    renderGate({ capabilities: [chartCapability], isDegraded: false });
    expect(screen.getByTestId('matched').textContent).toBe('viz.bar_chart');
  });

  it('renders a TYPED upstream-blocked empty state when the projection is absent (not blank)', () => {
    const { container } = renderGate({ capabilities: [], isDegraded: false });
    const empty = container.querySelector('[data-empty-state-reason]');
    expect(empty).not.toBeNull();
    expect(empty?.getAttribute('data-empty-state-reason')).toBe('upstream-blocked');
    // Proves it is not a blank render — visible status text is present.
    expect(screen.getByRole('status').textContent?.length ?? 0).toBeGreaterThan(0);
    // Proves the matched child did NOT render.
    expect(screen.queryByTestId('matched')).toBeNull();
  });

  it('renders a TYPED upstream-blocked empty state when the projection is degraded', () => {
    const { container } = renderGate({ capabilities: [chartCapability], isDegraded: true });
    const empty = container.querySelector('[data-empty-state-reason]');
    expect(empty?.getAttribute('data-empty-state-reason')).toBe('upstream-blocked');
    expect(screen.queryByTestId('matched')).toBeNull();
  });

  it('does not crash (throws) on an absent projection', () => {
    expect(() => renderGate({ capabilities: [], isDegraded: false })).not.toThrow();
  });
});
