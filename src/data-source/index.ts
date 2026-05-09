import type { ProtocolSnapshotSource } from './protocol-snapshot-source';
import { FileSnapshotSource } from './file-snapshot-source';
import { HttpSnapshotSource } from './http-snapshot-source';
import {
  DATA_SOURCE_DEFAULT_MODE,
  DATA_SOURCE_DEFAULT_URL,
  DATA_SOURCE_DEFAULT_WS_URL,
} from '@/config/generated/data-source-defaults';

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
    const baseUrl = import.meta.env.VITE_HTTP_DATA_SOURCE_URL;
    if (!baseUrl) {
      throw new Error(
        'VITE_DATA_SOURCE=http requires VITE_HTTP_DATA_SOURCE_URL to be set (e.g. http://localhost:3002)',
      );
    }
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
  throw new Error(`Unknown data source mode: ${mode}`);
}

/**
 * Returns the WebSocket invalidation URL. Reads VITE_WS_URL when set;
 * otherwise derives a ws:// URL from VITE_HTTP_DATA_SOURCE_URL or
 * VITE_SQLITE_DATA_SOURCE_URL. Falls back to contract.yaml default.
 *
 * JSDoc rationale (OMN-10756): hardcoded 'ws://localhost:3002/ws' replaced by
 * DATA_SOURCE_DEFAULT_WS_URL from contract.yaml so all defaults are co-located
 * in one file and env vars are optional overrides only.
 */
export function getWebSocketUrl(): string {
  const explicit = import.meta.env.VITE_WS_URL;
  if (explicit) return explicit;
  // In sqlite mode, use VITE_SQLITE_DATA_SOURCE_URL as the WS base so the
  // WebSocket invalidation channel targets the same server as HTTP projections.
  const mode = import.meta.env.VITE_DATA_SOURCE ?? DATA_SOURCE_DEFAULT_MODE;
  if (mode === 'sqlite') {
    const sqliteUrl = import.meta.env.VITE_SQLITE_DATA_SOURCE_URL ?? DATA_SOURCE_DEFAULT_URL;
    return sqliteUrl.replace(/^http:/i, 'ws:').replace(/^https:/i, 'wss:').replace(/\/$/, '') + '/ws';
  }
  const httpUrl = import.meta.env.VITE_HTTP_DATA_SOURCE_URL;
  if (httpUrl) {
    return httpUrl.replace(/^http:/i, 'ws:').replace(/^https:/i, 'wss:').replace(/\/$/, '') + '/ws';
  }
  return DATA_SOURCE_DEFAULT_WS_URL;
}

export type { ProtocolSnapshotSource };
export { FileSnapshotSource } from './file-snapshot-source';
export { HttpSnapshotSource } from './http-snapshot-source';
export { SnapshotSourceProvider, useSnapshotSource } from './SnapshotSourceProvider';
