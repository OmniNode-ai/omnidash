import type { ProtocolSnapshotSource } from './protocol-snapshot-source';

export interface FileSnapshotSourceOptions {
  baseUrl: string;
}

export class FileSnapshotSource implements ProtocolSnapshotSource {
  private readonly baseUrl: string;
  constructor(options: FileSnapshotSourceOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
  }

  async *readAll(topic: string): AsyncIterable<unknown> {
    const encoded = encodeURIComponent(topic);
    const manifestResp = await fetch(`${this.baseUrl}/${encoded}/index.json`);
    if (!manifestResp.ok) return;
    const files = (await manifestResp.json()) as unknown;
    if (!Array.isArray(files)) return;
    for (const f of files as string[]) {
      const r = await fetch(`${this.baseUrl}/${encoded}/${encodeURIComponent(f)}`);
      if (r.ok) yield await r.json();
    }
  }
}
