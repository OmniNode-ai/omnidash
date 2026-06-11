import type { ProtocolSnapshotSource } from './protocol-snapshot-source';
import { FileSnapshotSource } from './file-snapshot-source';
import { HttpSnapshotSource } from './http-snapshot-source';
import {
  DATA_SOURCE_DEFAULT_MODE,
  DATA_SOURCE_DEFAULT_URL,
} from '@/config/generated/data-source-defaults';
import { resolveProjectionBaseUrl } from './projection-base-url';

// OMN-10756: data-source selection defaults come from contract.yaml (via the
// generated config at src/config/generated/data-source-defaults.ts).
// VITE_* env vars are optional overrides — they are not required.
// CARVE-OUT: this module is the ONLY location in src/ permitted to reference
// localhost URLs directly. All other files must route through src/data-source/.

export function createSnapshotSource(): ProtocolSnapshotSource {
  const mode = import.meta.env.VITE_DATA_SOURCE ?? DATA_SOURCE_DEFAULT_MODE;
  if (mode === 'file') {
    return new FileSnapshotSource({
      // eslint-disable-next-line local/no-env-fallback -- '/_fixtures' is the documented Vite public path default (VITE_FIXTURES_DIR optional)
      baseUrl: import.meta.env.VITE_FIXTURES_DIR ?? '/_fixtures',
    });
  }
  if (mode === 'http') {
    // OMN-12833 (A2.5): all projection reads resolve through resolveProjectionBaseUrl
    // so there is exactly ONE backend. When VITE_PROJECTION_API_URL is set the base
    // is '' (relative) and the serving layer proxies same-origin `/projection/*` to
    // that single backend; otherwise VITE_HTTP_DATA_SOURCE_URL is the absolute base.
    // resolveProjectionBaseUrl only returns null in file mode; in http mode it
    // resolves to '' (proxy-relative) or an absolute base, never null.
    const baseUrl = resolveProjectionBaseUrl() ?? '';
    return new HttpSnapshotSource({ baseUrl });
  }
  // sqlite mode: the Express server reads from the local delegation.sqlite DB.
  // The browser side uses the same HTTP projection endpoint — no direct SQLite
  // access in the browser. URL defaults to contract.yaml default; set
  // VITE_SQLITE_DATA_SOURCE_URL to override.
  //
  // JSDoc rationale (OMN-10756): removed the hard-require on VITE_SQLITE_DATA_SOURCE_URL.
  // The contract.yaml default (http://localhost:3002) is now the canonical fallback,
  // so standalone installs work without any env var configuration.
  if (mode === 'sqlite') {
    const baseUrl = import.meta.env.VITE_SQLITE_DATA_SOURCE_URL ?? DATA_SOURCE_DEFAULT_URL;
    return new HttpSnapshotSource({ baseUrl });
  }
  // postgres mode is also served to the browser through the Express projection
  // endpoint; only the server process talks to Postgres directly.
  if (mode === 'postgres') {
    const baseUrl = import.meta.env.VITE_HTTP_DATA_SOURCE_URL ?? DATA_SOURCE_DEFAULT_URL;
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
