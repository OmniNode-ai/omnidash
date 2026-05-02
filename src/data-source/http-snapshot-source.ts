import type { ProtocolSnapshotSource } from './protocol-snapshot-source';

export interface HttpSnapshotSourceOptions { baseUrl: string; }

interface ProjectionEnvelope {
  rows: unknown[];
}

function isProjectionEnvelope(v: unknown): v is ProjectionEnvelope {
  return typeof v === 'object' && v !== null && 'rows' in v && Array.isArray((v as ProjectionEnvelope).rows);
}

export class HttpSnapshotSource implements ProtocolSnapshotSource {
  constructor(private readonly options: HttpSnapshotSourceOptions) {}

  async *readAll(topic: string): AsyncIterable<unknown> {
    const res = await fetch(`${this.options.baseUrl}/projection/${encodeURIComponent(topic)}`);
    if (!res.ok) return;
    const body = await res.json();
    // Projection API returns { rows: [...], ...envelope } — unwrap if present.
    // Plain array responses (file-based fixtures, legacy) are yielded directly.
    const items: unknown[] = isProjectionEnvelope(body) ? body.rows : (body as unknown[]);
    for (const i of items) yield i;
  }
}
