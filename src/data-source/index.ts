import type { ProtocolSnapshotSource } from './protocol-snapshot-source';
import { FileSnapshotSource } from './file-snapshot-source';
import { HttpSnapshotSource } from './http-snapshot-source';
import { resolveProjectionBaseUrl } from './projection-base-url';
import { resolveEffectiveDataSource } from './data-source-override';

// OMN-10756: data-source selection defaults come from contract.yaml (via the
// generated config at src/config/generated/data-source-defaults.ts).
// VITE_* env vars are optional overrides — they are not required.
// OMN-13007: the EFFECTIVE mode comes from `resolveEffectiveDataSource()`, which
// layers the runtime chrome override over env. All live modes resolve their base
// URL through `resolveProjectionBaseUrl()` (the single seam) so a chrome-pinned
// backend URL is honored everywhere — no per-mode env read here.
// CARVE-OUT: this module is the ONLY location in src/ permitted to reference
// localhost URLs directly. All other files must route through src/data-source/.

export function createSnapshotSource(): ProtocolSnapshotSource {
  const { mode } = resolveEffectiveDataSource();
  if (mode === 'file') {
    return new FileSnapshotSource({
      // eslint-disable-next-line local/no-env-fallback -- '/_fixtures' is the documented Vite public path default (VITE_FIXTURES_DIR optional)
      baseUrl: import.meta.env.VITE_FIXTURES_DIR ?? '/_fixtures',
    });
  }
  // All live modes (http / sqlite / postgres) read via the single HTTP projection
  // backend. `resolveProjectionBaseUrl()` is the one origin authority: it returns
  // the chrome override base when pinned, the same-origin proxy base ('') when
  // VITE_PROJECTION_API_URL is set, or the absolute env/contract default. It only
  // returns null in file mode, which we've already handled above.
  if (mode === 'http' || mode === 'sqlite' || mode === 'postgres') {
    const baseUrl = resolveProjectionBaseUrl() ?? '';
    return new HttpSnapshotSource({ baseUrl });
  }
  throw new Error(`Unknown data source mode: ${mode}`);
}

// OMN-12969: getWebSocketUrl() and the `/ws` invalidation client were removed.
// The deployed projection backend (FastAPI projection-api) serves HTTP + an
// advisory SSE hint only — it never registered a `/ws` route — so the browser's
// upgrade was rejected (403) and no INVALIDATE/event frame was ever delivered.
// Live updates are driven by `useProjectionQuery`'s polling refetch against the
// single projection backend. Reintroducing a raw browser WebSocket here is
// guarded by the `local/no-projection-websocket` ESLint rule.

export type { ProtocolSnapshotSource };
export { FileSnapshotSource } from './file-snapshot-source';
export { HttpSnapshotSource } from './http-snapshot-source';
export { SnapshotSourceProvider, useSnapshotSource } from './SnapshotSourceProvider';
export {
  getDataSourceOverride,
  setDataSourceOverride,
  clearDataSourceOverride,
  subscribeDataSourceOverride,
  resolveEffectiveDataSource,
  type DataSourceOverride,
  type EffectiveDataSource,
} from './data-source-override';
