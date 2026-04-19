import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FileSnapshotSource } from './file-snapshot-source';

describe('FileSnapshotSource', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('fetches topic manifest and yields parsed snapshots', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ['a.json', 'b.json'] })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ entity_id: 'a', state: 's1' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ entity_id: 'b', state: 's2' }) });
    vi.stubGlobal('fetch', fetchMock);

    const source = new FileSnapshotSource({ baseUrl: '/_fixtures' });
    const snaps: unknown[] = [];
    for await (const s of source.readAll('onex.snapshot.test.v1')) snaps.push(s);

    expect(snaps).toHaveLength(2);
    expect((snaps[0] as any).entity_id).toBe('a');
    expect(fetchMock).toHaveBeenCalledWith('/_fixtures/onex.snapshot.test.v1/index.json');
  });

  it('yields nothing when manifest fetch 404s', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    const source = new FileSnapshotSource({ baseUrl: '/_fixtures' });
    const snaps: unknown[] = [];
    for await (const s of source.readAll('onex.snapshot.missing.v1')) snaps.push(s);
    expect(snaps).toHaveLength(0);
  });
});
