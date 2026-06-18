import type { JSX } from 'react';
import type { VisualizationContract, VisualizationType } from '@shared/types/visualization-contract';
import type {
  RendererCapabilityContract,
  WidgetKind,
} from '@shared/types/renderer-capability';
import {
  CapabilityDispatcher,
  type RendererRequirement,
} from '@/components/renderer-dispatch/capability-dispatcher';

export interface VizAdapter {
  render(props: { data: unknown[]; contract: VisualizationContract }): JSX.Element;
}

// `vizRegistry` remains the single registration store: visualization modules
// register themselves by side-effect import via `registerViz`. Resolution is
// capability-driven — `resolveViz` derives a `RendererCapabilityContract` for
// the requested visualization and routes selection through the general
// `CapabilityDispatcher`, so the same dispatch primitive that backs
// `resolveChartAdapter` (OMN-13131, W4) also drives visualization selection.
export const vizRegistry: Partial<Record<VisualizationType, VizAdapter>> = {};

export function registerViz(type: VisualizationType, adapter: VizAdapter): void {
  vizRegistry[type] = adapter;
}

// Each visualization type maps to the component kind it renders (from the
// shipped EnumWidgetType vocabulary). Capability dispatch keys on this kind.
const VIZ_COMPONENT_KIND: Record<VisualizationType, WidgetKind> = {
  table: 'table',
  bar_chart: 'chart',
  scatter_plot: 'chart',
  trend_line: 'chart',
  kpi_tiles: 'metric_card',
};

const VIZ_CONTRACT_VERSION = { major: 1, minor: 0, patch: 0 } as const;

function capabilityForType(type: VisualizationType): RendererCapabilityContract {
  return {
    renderer_id: `viz.${type}`,
    platform: 'web',
    supported_component_kinds: [VIZ_COMPONENT_KIND[type]],
    interaction_model: 'pointer',
    accessibility_tier: 'aa',
    contract_version: VIZ_CONTRACT_VERSION,
    supports_interaction: true,
    supports_streaming: false,
    supports_theming: true,
  };
}

/**
 * Capability-driven resolution of a visualization adapter. The
 * `VisualizationType` names the renderer the user selected; resolution then runs
 * through the general `CapabilityDispatcher` over the registered adapter's
 * advertised capability surface for that type's component kind.
 *
 * Returns the adapter when a renderer is registered AND its capability satisfies
 * the type's component kind, or `null` otherwise — an absent capability is
 * handled, never a crash.
 */
export function resolveViz(type: VisualizationType): VizAdapter | null {
  const adapter = vizRegistry[type];
  if (adapter === undefined) {
    return null;
  }

  const dispatcher = new CapabilityDispatcher<VizAdapter>([
    { capability: capabilityForType(type), adapter },
  ]);
  const requirement: RendererRequirement = { componentKind: VIZ_COMPONENT_KIND[type] };
  const result = dispatcher.dispatch(requirement);
  return result.matched ? result.entry.adapter : null;
}
