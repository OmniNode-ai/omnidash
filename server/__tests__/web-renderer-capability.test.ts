import { describe, it, expect } from 'vitest';
import {
  WEB_RENDERER_SUPPORTED_COMPONENT_KINDS,
  WEB_RENDERER_ID,
  WEB_RENDERER_PLATFORM,
  webRendererCapability,
  type WebWidgetKind,
} from '../../shared/types/web-renderer-capability.js';

// The shipped EnumWidgetType vocabulary (mirror of the generated enum
// src/shared/types/generated/onex-models.ts → EnumWidgetType). The
// WebWidgetKind union is the structural mirror; this list anchors the value
// set the web renderer's declared kinds must be a subset of.
const ALL_WIDGET_KINDS: readonly WebWidgetKind[] = [
  'chart',
  'table',
  'metric_card',
  'status_grid',
  'event_feed',
];

describe('web renderer capability surface (W-cap)', () => {
  it('declares the canonical web renderer identity', () => {
    const cap = webRendererCapability();
    expect(cap.renderer_id).toBe(WEB_RENDERER_ID);
    expect(cap.platform).toBe(WEB_RENDERER_PLATFORM);
    expect(WEB_RENDERER_ID).toBe('omnidash-web');
    expect(WEB_RENDERER_PLATFORM).toBe('web');
  });

  it('supported_component_kinds is a subset of the shipped EnumWidgetType vocabulary', () => {
    for (const kind of WEB_RENDERER_SUPPORTED_COMPONENT_KINDS) {
      expect(ALL_WIDGET_KINDS).toContain(kind);
    }
  });

  it('declares exactly the component kinds the W4 dispatcher adapters register (no guess, no drift)', () => {
    // Source of truth: the component kinds the W4 dispatcher's chart adapter
    // registry (src/components/charts/adapter-resolver.ts CHART_RENDERERS) and
    // the visualization registry
    // (src/components/dashboard/projection-container/viz-registry.ts
    // VIZ_COMPONENT_KIND) advertise. Both register chart, metric_card, and
    // table. The web renderer declaration must equal that distinct set so the
    // capability the renderer advertises matches the kinds the dispatcher can
    // actually resolve.
    const dispatcherRegisteredKinds = new Set<string>(['chart', 'metric_card', 'table']);
    expect(new Set<string>(WEB_RENDERER_SUPPORTED_COMPONENT_KINDS)).toEqual(
      dispatcherRegisteredKinds,
    );
  });

  it('declares the full advertised surface the W5 reducer projects', () => {
    const cap = webRendererCapability();
    expect(cap.supports_interaction).toBe(true);
    expect(cap.interaction_model).toBe('pointer');
    expect(cap.accessibility_tier).toBe('aa');
    expect(cap.contract_version).toEqual({ major: 1, minor: 0, patch: 0 });
  });
});
