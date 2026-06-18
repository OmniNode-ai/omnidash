// Chart adapter resolution (OMN-10282), now SUBSUMED by the capability-driven
// renderer dispatcher (OMN-13131, W4).
//
// Historically `resolveChartAdapter` resolved a concrete chart component from an
// ad-hoc (adapterKey, implementationKey) pair via a nested record lookup. W4
// generalizes that into a single `RendererCapabilityContract`-driven dispatcher:
// each registry entry is now a renderer that advertises a capability surface,
// and resolution is capability-driven selection rather than a bespoke 2-level
// map. The public API and error semantics below are preserved so existing
// callers and the OMN-10282 contract tests keep passing; the resolution path
// underneath is the general dispatcher.

import { BarChartThreeJs } from './threejs/BarChart';
import { TrendChartThreeJs } from './threejs/TrendChart';
import { KPITileClusterThreeJs } from './threejs/KPITileCluster';
import { DataTableThreeJs } from './threejs/DataTable';
import { DoughnutChartAdapterThreeJs } from './threejs/DoughnutChartAdapter';
import type { RendererCapabilityContract, WidgetKind } from '@shared/types/renderer-capability';
import { CapabilityDispatcher } from '../renderer-dispatch/capability-dispatcher';

export type AdapterKey =
  | 'IBarChartAdapter'
  | 'ITrendChartAdapter'
  | 'IKPITileClusterAdapter'
  | 'IDataTableAdapter'
  | 'IDoughnutChartAdapter';

export class UnknownAdapterError extends Error {
  constructor(adapterKey: string) {
    super(`Unknown adapter key: "${adapterKey}". No registry entry exists for this adapter.`);
    this.name = 'UnknownAdapterError';
  }
}

export class UnknownImplementationError extends Error {
  constructor(adapterKey: string, implementationKey: string) {
    super(
      `Unknown implementation "${implementationKey}" for adapter "${adapterKey}". ` +
        `No concrete component is registered at (${adapterKey}, ${implementationKey}).`,
    );
    this.name = 'UnknownImplementationError';
  }
}

// Chart adapters are modelled as renderers that advertise a component kind from
// the shipped `EnumWidgetType` vocabulary. The (adapterKey, implementationKey)
// coordinates ride on the capability surface — `renderer_id` carries the adapter
// key and `platform` carries the implementation key — so resolution selects by
// capability, not by an opaque nested-record lookup.
const CHART_CONTRACT_VERSION = { major: 1, minor: 0, patch: 0 } as const;

interface ChartRendererSpec {
  adapterKey: AdapterKey;
  implementationKey: string;
  component: unknown;
  componentKind: WidgetKind;
}

const CHART_RENDERERS: readonly ChartRendererSpec[] = [
  { adapterKey: 'IBarChartAdapter', implementationKey: 'threejs', component: BarChartThreeJs, componentKind: 'chart' },
  { adapterKey: 'ITrendChartAdapter', implementationKey: 'threejs', component: TrendChartThreeJs, componentKind: 'chart' },
  { adapterKey: 'IKPITileClusterAdapter', implementationKey: 'threejs', component: KPITileClusterThreeJs, componentKind: 'metric_card' },
  { adapterKey: 'IDataTableAdapter', implementationKey: 'threejs', component: DataTableThreeJs, componentKind: 'table' },
  { adapterKey: 'IDoughnutChartAdapter', implementationKey: 'threejs', component: DoughnutChartAdapterThreeJs, componentKind: 'chart' },
];

function toCapability(spec: ChartRendererSpec): RendererCapabilityContract {
  return {
    renderer_id: spec.adapterKey,
    platform: spec.implementationKey,
    supported_component_kinds: [spec.componentKind],
    interaction_model: 'pointer',
    accessibility_tier: 'aa',
    contract_version: CHART_CONTRACT_VERSION,
    supports_interaction: true,
    supports_streaming: false,
    supports_theming: true,
  };
}

const chartDispatcher = new CapabilityDispatcher<unknown>(
  CHART_RENDERERS.map((spec) => ({ capability: toCapability(spec), adapter: spec.component })),
);

const KNOWN_ADAPTER_KEYS: ReadonlySet<string> = new Set(
  CHART_RENDERERS.map((spec) => spec.adapterKey),
);

/**
 * Resolves a (adapterKey, implementationKey) pair to the concrete component.
 *
 * Resolution is capability-driven: each chart adapter is registered as a
 * renderer whose advertised capability carries the adapter key (`renderer_id`)
 * and implementation key (`platform`). This function is a thin, error-preserving
 * facade over the general `CapabilityDispatcher`.
 *
 * Throws UnknownAdapterError if adapterKey is not registered.
 * Throws UnknownImplementationError if adapterKey is known but implementationKey is not.
 * Never silently falls back to a default — callers must explicitly request a registered key.
 */
export function resolveChartAdapter(adapterKey: AdapterKey, implementationKey: string): unknown {
  if (!KNOWN_ADAPTER_KEYS.has(adapterKey)) {
    throw new UnknownAdapterError(adapterKey);
  }

  // Capability-driven selection: match the renderer whose advertised capability
  // carries this adapter key (renderer_id) AND this implementation key (platform).
  const match = chartDispatcher
    .capabilities()
    .find((cap) => cap.renderer_id === adapterKey && cap.platform === implementationKey);

  if (match === undefined) {
    throw new UnknownImplementationError(adapterKey, implementationKey);
  }

  const spec = CHART_RENDERERS.find(
    (s) => s.adapterKey === adapterKey && s.implementationKey === implementationKey,
  );
  // KNOWN_ADAPTER_KEYS membership + the capability match above guarantee a spec.
  return spec!.component;
}
