import type { ProtocolSnapshotSource } from './protocol-snapshot-source';

export interface HttpSnapshotSourceOptions { baseUrl: string; }

export class HttpSnapshotSource implements ProtocolSnapshotSource {
  constructor(private readonly options: HttpSnapshotSourceOptions) {}

  async *readAll(topic: string): AsyncIterable<unknown> {
    // Existing server exposes /projection/<topic> returning an array
    const res = await fetch(`${this.options.baseUrl}/projection/${encodeURIComponent(topic)}`);
    if (!res.ok) return;
    const items = (await res.json()) as unknown[];
    for (const i of items) yield i;
  }
}
