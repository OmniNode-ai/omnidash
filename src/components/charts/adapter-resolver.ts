import { BarChartThreeJs } from './threejs/BarChart';
import { TrendChartThreeJs } from './threejs/TrendChart';
import { KPITileClusterThreeJs } from './threejs/KPITileCluster';
import { DataTableThreeJs } from './threejs/DataTable';

export type AdapterKey =
  | 'IBarChartAdapter'
  | 'ITrendChartAdapter'
  | 'IKPITileClusterAdapter'
  | 'IDataTableAdapter';

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

type ImplementationMap = Record<string, unknown>;

const REGISTRY: Record<AdapterKey, ImplementationMap> = {
  IBarChartAdapter: {
    threejs: BarChartThreeJs,
  },
  ITrendChartAdapter: {
    threejs: TrendChartThreeJs,
  },
  IKPITileClusterAdapter: {
    threejs: KPITileClusterThreeJs,
  },
  IDataTableAdapter: {
    threejs: DataTableThreeJs,
  },
};

/**
 * Resolves a manifest (adapterKey, implementationKey) pair to the concrete component.
 *
 * Throws UnknownAdapterError if adapterKey is not registered.
 * Throws UnknownImplementationError if adapterKey is known but implementationKey is not.
 * Never silently falls back to a default — callers must explicitly request a registered key.
 */
export function resolveChartAdapter(adapterKey: AdapterKey, implementationKey: string): unknown {
  const implementations = REGISTRY[adapterKey];
  if (implementations === undefined) {
    throw new UnknownAdapterError(adapterKey);
  }
  const component = implementations[implementationKey];
  if (component === undefined) {
    throw new UnknownImplementationError(adapterKey, implementationKey);
  }
  return component;
}
