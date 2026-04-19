import type { ProtocolSnapshotSource } from './protocol-snapshot-source';
import { FileSnapshotSource } from './file-snapshot-source';
import { HttpSnapshotSource } from './http-snapshot-source';

export function createSnapshotSource(): ProtocolSnapshotSource {
  const mode = import.meta.env.VITE_DATA_SOURCE ?? 'file';
  if (mode === 'file') {
    return new FileSnapshotSource({
      baseUrl: import.meta.env.VITE_FIXTURES_DIR ?? '/_fixtures',
    });
  }
  if (mode === 'http') {
    // HARD-CODING CARVE-OUT: the HTTP adapter factory is the ONLY location
    // permitted to reference localhost:3002 directly. All other files in
    // src/ must remain free of localhost literals (Task 1 rule). Prefer
    // VITE_HTTP_DATA_SOURCE_URL when set so the URL is configurable.
    const baseUrl = import.meta.env.VITE_HTTP_DATA_SOURCE_URL ?? 'http://localhost:3002';
    return new HttpSnapshotSource({ baseUrl });
  }
  throw new Error(`Unknown VITE_DATA_SOURCE: ${mode}`);
}

export type { ProtocolSnapshotSource };
export { FileSnapshotSource } from './file-snapshot-source';
export { HttpSnapshotSource } from './http-snapshot-source';
