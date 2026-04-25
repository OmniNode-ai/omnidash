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
  const httpUrl = import.meta.env.VITE_HTTP_DATA_SOURCE_URL;
  if (httpUrl) {
    return httpUrl.replace(/^http:/i, 'ws:').replace(/^https:/i, 'wss:').replace(/\/$/, '') + '/ws';
  }
  return 'ws://localhost:3002/ws';
}

export type { ProtocolSnapshotSource };
export { FileSnapshotSource } from './file-snapshot-source';
export { HttpSnapshotSource } from './http-snapshot-source';
