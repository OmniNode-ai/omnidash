import { describe, it, expect } from 'vitest';
import type { RendererCapabilityContract } from '@shared/types/renderer-capability';
import {
  CapabilityDispatcher,
  capabilitySatisfies,
  type RendererRequirement,
} from '../capability-dispatcher';

// ── Test capability fixtures ───────────────────────────────────────────────
//
// Each fixture is a full RendererCapabilityContract (mirror of the canonical
// Python ModelRendererCapabilityContract). Dispatch is driven by these
// capability surfaces — NOT by ad-hoc metadata flags.

const v1 = { major: 1, minor: 0, patch: 0 };

const chartRenderer: RendererCapabilityContract = {
  renderer_id: 'ui.effect.web.charts',
  platform: 'web',
  supported_component_kinds: ['chart'],
  interaction_model: 'pointer',
  accessibility_tier: 'aa',
  contract_version: v1,
  supports_interaction: true,
  supports_streaming: false,
  supports_theming: true,
};

const tableRenderer: RendererCapabilityContract = {
  renderer_id: 'ui.effect.web.tables',
  platform: 'web',
  supported_component_kinds: ['table'],
  interaction_model: 'pointer',
  accessibility_tier: 'aaa',
  contract_version: v1,
  supports_interaction: true,
  supports_streaming: true,
  supports_theming: false,
};

const streamingChartRenderer: RendererCapabilityContract = {
  renderer_id: 'ui.effect.web.charts.streaming',
  platform: 'web',
  supported_component_kinds: ['chart', 'metric_card'],
  interaction_model: 'pointer',
  accessibility_tier: 'aa',
  contract_version: v1,
  supports_interaction: true,
  supports_streaming: true,
  supports_theming: true,
};

// A concrete adapter is opaque to the dispatcher — it just rides along with the
// capability surface. We use string sentinels to assert which one was selected.
const CHART_ADAPTER = Symbol('chart-adapter');
const TABLE_ADAPTER = Symbol('table-adapter');
const STREAMING_CHART_ADAPTER = Symbol('streaming-chart-adapter');

function makeDispatcher() {
  return new CapabilityDispatcher<symbol>([
    { capability: chartRenderer, adapter: CHART_ADAPTER },
    { capability: tableRenderer, adapter: TABLE_ADAPTER },
    { capability: streamingChartRenderer, adapter: STREAMING_CHART_ADAPTER },
  ]);
}

// ── capabilitySatisfies — pure predicate ───────────────────────────────────

describe('capabilitySatisfies', () => {
  it('matches when the required component kind is advertised', () => {
    const req: RendererRequirement = { componentKind: 'chart' };
    expect(capabilitySatisfies(chartRenderer, req)).toBe(true);
  });

  it('rejects when the required component kind is NOT advertised', () => {
    const req: RendererRequirement = { componentKind: 'event_feed' };
    expect(capabilitySatisfies(chartRenderer, req)).toBe(false);
  });

  it('requires every requested supports_* flag to be advertised', () => {
    const req: RendererRequirement = {
      componentKind: 'chart',
      requiredCapabilities: ['supports_streaming'],
    };
    // chartRenderer does NOT support streaming -> no match
    expect(capabilitySatisfies(chartRenderer, req)).toBe(false);
    // streamingChartRenderer does -> match
    expect(capabilitySatisfies(streamingChartRenderer, req)).toBe(true);
  });

  it('matches a multi-flag requirement only when all flags are present', () => {
    const req: RendererRequirement = {
      componentKind: 'chart',
      requiredCapabilities: ['supports_interaction', 'supports_theming'],
    };
    expect(capabilitySatisfies(chartRenderer, req)).toBe(true);
    expect(capabilitySatisfies(streamingChartRenderer, req)).toBe(true);
  });

  it('enforces interaction model when requested', () => {
    const req: RendererRequirement = { componentKind: 'chart', interactionModel: 'voice' };
    expect(capabilitySatisfies(chartRenderer, req)).toBe(false);
    expect(
      capabilitySatisfies(chartRenderer, { componentKind: 'chart', interactionModel: 'pointer' }),
    ).toBe(true);
  });

  it('enforces a minimum accessibility tier (ordinal aaa > aa > a)', () => {
    // chartRenderer is tier 'aa'; require 'aaa' -> fail
    expect(
      capabilitySatisfies(chartRenderer, { componentKind: 'chart', minAccessibilityTier: 'aaa' }),
    ).toBe(false);
    // tableRenderer is 'aaa'; require 'aa' -> pass (exceeds minimum)
    expect(
      capabilitySatisfies(tableRenderer, { componentKind: 'table', minAccessibilityTier: 'aa' }),
    ).toBe(true);
  });
});

// ── CapabilityDispatcher.dispatch ──────────────────────────────────────────

describe('CapabilityDispatcher.dispatch', () => {
  it('selects the renderer whose capability set satisfies the requirement', () => {
    const dispatcher = makeDispatcher();
    const result = dispatcher.dispatch({ componentKind: 'table' });
    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.entry.adapter).toBe(TABLE_ADAPTER);
      expect(result.entry.capability.renderer_id).toBe('ui.effect.web.tables');
    }
  });

  it('selects by capability flags, not by component kind alone', () => {
    const dispatcher = makeDispatcher();
    // Both chartRenderer and streamingChartRenderer advertise 'chart', but only
    // the streaming one supports streaming -> dispatch must pick it.
    const result = dispatcher.dispatch({
      componentKind: 'chart',
      requiredCapabilities: ['supports_streaming'],
    });
    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.entry.adapter).toBe(STREAMING_CHART_ADAPTER);
    }
  });

  it('handles an absent capability gracefully — miss is returned, not thrown', () => {
    const dispatcher = makeDispatcher();
    let result: ReturnType<typeof dispatcher.dispatch> | undefined;
    expect(() => {
      result = dispatcher.dispatch({ componentKind: 'event_feed' });
    }).not.toThrow();
    expect(result!.matched).toBe(false);
    if (result && !result.matched) {
      expect(result.reason).toContain('event_feed');
    }
  });

  it('returns a miss when the component kind is present but a required flag is absent', () => {
    const dispatcher = new CapabilityDispatcher<symbol>([
      { capability: chartRenderer, adapter: CHART_ADAPTER },
    ]);
    const result = dispatcher.dispatch({
      componentKind: 'chart',
      requiredCapabilities: ['supports_streaming'],
    });
    expect(result.matched).toBe(false);
    if (!result.matched) {
      expect(result.reason).toContain('supports_streaming');
    }
  });

  it('is deterministic — first registered satisfying entry wins', () => {
    const dispatcher = makeDispatcher();
    // A bare 'chart' requirement is satisfied by both chart renderers; the
    // first-registered (chartRenderer) must win for stable selection.
    const result = dispatcher.dispatch({ componentKind: 'chart' });
    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.entry.adapter).toBe(CHART_ADAPTER);
    }
  });

  it('subsumes resolveChartAdapter: a (kind, capability) requirement resolves the adapter', () => {
    // The OMN-10282 resolveChartAdapter keyed on (adapterKey, implementationKey).
    // The general dispatcher subsumes it: a component kind + advertised
    // capabilities selects the concrete adapter without any ad-hoc key.
    const dispatcher = makeDispatcher();
    const result = dispatcher.dispatch({
      componentKind: 'metric_card',
      requiredCapabilities: ['supports_streaming'],
    });
    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.entry.adapter).toBe(STREAMING_CHART_ADAPTER);
    }
  });
});
