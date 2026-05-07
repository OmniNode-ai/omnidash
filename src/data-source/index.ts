import type { ProtocolSnapshotSource } from './protocol-snapshot-source';
import { FileSnapshotSource } from './file-snapshot-source';
import { HttpSnapshotSource } from './http-snapshot-source';

// HARD-CODING CARVE-OUT: this module is the ONLY location permitted to
// reference localhost:3002 / ws://localhost:3002 directly. All other files
// in src/ must remain free of localhost literals (Task 1 rule). Prefer the
// VITE_* env vars so URLs are configurable.

export function createSnapshotSource(): ProtocolSnapshotSource {
  const mode = import.meta.env.VITE_DATA_SOURCE ?? 'file';
  if (mode === 'file') {
    return new FileSnapshotSource({
      baseUrl: import.meta.env.VITE_FIXTURES_DIR ?? '/_fixtures',
    });
  }
  if (mode === 'http') {
    const baseUrl = import.meta.env.VITE_HTTP_DATA_SOURCE_URL ?? 'http://localhost:3002';
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
 * Returns the WebSocket invalidation URL. Symmetric carve-out to the HTTP
 * snapshot source above. Reads VITE_WS_URL when set; otherwise derives a
 * ws:// URL from VITE_HTTP_DATA_SOURCE_URL; otherwise falls back to the
 * documented dev default.
 */
export function getWebSocketUrl(): string {
  const explicit = import.meta.env.VITE_WS_URL;
  if (explicit) return explicit;
  // In sqlite mode, use VITE_SQLITE_DATA_SOURCE_URL as the WS base so the
  // WebSocket invalidation channel targets the same server as HTTP projections.
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
  return 'ws://localhost:3002/ws';
}

export type { ProtocolSnapshotSource };
export { FileSnapshotSource } from './file-snapshot-source';
export { HttpSnapshotSource } from './http-snapshot-source';
export { SnapshotSourceProvider, useSnapshotSource } from './SnapshotSourceProvider';
