// OMN-13131 (W6, G-H): typed empty-state resolution from the renderer-capability
// projection. A stale/absent/degraded capability projection — or a requirement no
// advertised capability satisfies — must resolve to a TYPED EnumEmptyStateReason
// ('upstream-blocked'), never a blank/blind render and never a crash.

import { describe, it, expect } from 'vitest';
import {
  resolveCapabilityEmptyState,
  type CapabilityProjectionState,
} from '../capability-empty-state';
import type { RendererRequirement } from '../capability-dispatcher';
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

function freshState(
  capabilities: RendererCapabilityContract[],
): CapabilityProjectionState {
  return { capabilities, isDegraded: false };
}

describe('resolveCapabilityEmptyState — G-H typed empty-state', () => {
  it('renders the matched entry when a fresh capability satisfies the requirement', () => {
    const result = resolveCapabilityEmptyState(
      freshState([chartCapability]),
      chartRequirement,
    );
    expect(result.rendered).toBe(true);
    if (result.rendered) {
      expect(result.entry.capability.renderer_id).toBe('viz.bar_chart');
    }
  });

  it('resolves UPSTREAM_BLOCKED when the projection has NO capability rows (absent)', () => {
    const result = resolveCapabilityEmptyState(freshState([]), chartRequirement);
    expect(result.rendered).toBe(false);
    if (!result.rendered) {
      // Keyed on the enum VALUE, not the symbol name (plan §0b.5).
      expect(result.reason).toBe('upstream-blocked');
    }
  });

  it('resolves UPSTREAM_BLOCKED when the capability projection is DEGRADED (stale heartbeat)', () => {
    const result = resolveCapabilityEmptyState(
      { capabilities: [chartCapability], isDegraded: true },
      chartRequirement,
    );
    expect(result.rendered).toBe(false);
    if (!result.rendered) {
      expect(result.reason).toBe('upstream-blocked');
    }
  });

  it('resolves UPSTREAM_BLOCKED when no advertised capability satisfies the requirement', () => {
    const tableOnly: RendererCapabilityContract = {
      ...chartCapability,
      renderer_id: 'viz.table',
      supported_component_kinds: ['table'],
    };
    const result = resolveCapabilityEmptyState(
      freshState([tableOnly]),
      chartRequirement,
    );
    expect(result.rendered).toBe(false);
    if (!result.rendered) {
      expect(result.reason).toBe('upstream-blocked');
    }
  });

  it('carries a non-empty diagnostic miss reason (never blank) on the blocked path', () => {
    const result = resolveCapabilityEmptyState(freshState([]), chartRequirement);
    expect(result.rendered).toBe(false);
    if (!result.rendered) {
      expect(result.detail.length).toBeGreaterThan(0);
    }
  });

  it('does not throw when the projection is empty — absent capability handled, not crashed', () => {
    expect(() =>
      resolveCapabilityEmptyState(freshState([]), chartRequirement),
    ).not.toThrow();
  });
});
