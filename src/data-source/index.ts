import type { ProtocolSnapshotSource } from './protocol-snapshot-source';
import { FileSnapshotSource } from './file-snapshot-source';
import { HttpSnapshotSource } from './http-snapshot-source';

export function createSnapshotSource(): ProtocolSnapshotSource {
  // eslint-disable-next-line local/no-env-fallback -- 'file' is the documented default mode (VITE_DATA_SOURCE optional)
  const mode = import.meta.env.VITE_DATA_SOURCE ?? 'file';
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
  // sqlite mode: the Express server reads from the local delegation.sqlite DB
  // when OMNIDASH_DATA_SOURCE=sqlite. The browser side uses the same HTTP
  // projection endpoint — no direct SQLite access in the browser.
  // VITE_SQLITE_DATA_SOURCE_URL is required; no implicit localhost fallback so
  // misconfigured standalone installs fail loudly rather than silently hitting
  // a wrong server.
  if (mode === 'sqlite') {
    const baseUrl = import.meta.env.VITE_SQLITE_DATA_SOURCE_URL;
    if (!baseUrl) {
      throw new Error(
        'VITE_DATA_SOURCE=sqlite requires VITE_SQLITE_DATA_SOURCE_URL to be set (e.g. http://localhost:3002)',
      );
    }
    return new HttpSnapshotSource({ baseUrl });
  }
  throw new Error(`Unknown VITE_DATA_SOURCE: ${mode}`);
}

/**
 * Returns the WebSocket invalidation URL. Reads VITE_WS_URL when set;
 * otherwise derives a ws:// URL from VITE_HTTP_DATA_SOURCE_URL or
 * VITE_SQLITE_DATA_SOURCE_URL. Throws if no URL can be derived — callers
 * must set at least one of these vars when using WS invalidation.
 */
export function getWebSocketUrl(): string {
  const explicit = import.meta.env.VITE_WS_URL;
  if (explicit) return explicit;
  // In sqlite mode, use VITE_SQLITE_DATA_SOURCE_URL as the WS base so the
  // WebSocket invalidation channel targets the same server as HTTP projections.
  // eslint-disable-next-line local/no-env-fallback -- 'file' is the documented default mode (VITE_DATA_SOURCE optional)
  const mode = import.meta.env.VITE_DATA_SOURCE ?? 'file';
  if (mode === 'sqlite') {
    const sqliteUrl = import.meta.env.VITE_SQLITE_DATA_SOURCE_URL;
    if (sqliteUrl) {
      return sqliteUrl.replace(/^http:/i, 'ws:').replace(/^https:/i, 'wss:').replace(/\/$/, '') + '/ws';
    }
  }
  const httpUrl = import.meta.env.VITE_HTTP_DATA_SOURCE_URL;
  if (httpUrl) {
    return httpUrl.replace(/^http:/i, 'ws:').replace(/^https:/i, 'wss:').replace(/\/$/, '') + '/ws';
  }
  throw new Error(
    'Cannot derive WebSocket URL: set VITE_WS_URL, VITE_HTTP_DATA_SOURCE_URL, or VITE_SQLITE_DATA_SOURCE_URL.',
  );
}

export type { ProtocolSnapshotSource };
export { FileSnapshotSource } from './file-snapshot-source';
export { HttpSnapshotSource } from './http-snapshot-source';
export { SnapshotSourceProvider, useSnapshotSource } from './SnapshotSourceProvider';
