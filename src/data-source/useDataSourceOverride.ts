// OMN-13007 — React binding for the runtime data-source override seam.
//
// `useSyncExternalStore` subscribes the component tree to the module-level
// override store so the chrome control, the data-mode banner, and the snapshot
// provider all re-render when the operator switches source at runtime.
import { useSyncExternalStore } from 'react';
import {
  getDataSourceOverride,
  subscribeDataSourceOverride,
  getEffectiveDataSourceSnapshot,
  type DataSourceOverride,
  type EffectiveDataSource,
} from './data-source-override';

// Both getSnapshot callbacks below return referentially-stable values between
// mutations (`current` and the cached effective snapshot), which is the
// `useSyncExternalStore` contract — otherwise React loops on every render.

/** Reactive read of the raw override (null when env defaults apply). */
export function useDataSourceOverride(): DataSourceOverride | null {
  return useSyncExternalStore(
    subscribeDataSourceOverride,
    getDataSourceOverride,
    getDataSourceOverride,
  );
}

/** Reactive read of the effective data source (override layered over env). */
export function useEffectiveDataSource(): EffectiveDataSource {
  return useSyncExternalStore(
    subscribeDataSourceOverride,
    getEffectiveDataSourceSnapshot,
    getEffectiveDataSourceSnapshot,
  );
}
