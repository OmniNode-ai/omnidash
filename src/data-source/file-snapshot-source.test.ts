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

  // M8 (review §4) — error-path coverage parity with HttpSnapshotSource.

  it('yields nothing when manifest fetch returns 500', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    const source = new FileSnapshotSource({ baseUrl: '/_fixtures' });
    const snaps: unknown[] = [];
    for await (const s of source.readAll('onex.snapshot.error.v1')) snaps.push(s);
    expect(snaps).toHaveLength(0);
  });

  it('yields nothing when manifest body is not an array', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ unexpected: 'shape' }),
    }));
    const source = new FileSnapshotSource({ baseUrl: '/_fixtures' });
    const snaps: unknown[] = [];
    for await (const s of source.readAll('onex.snapshot.shape.v1')) snaps.push(s);
    expect(snaps).toHaveLength(0);
  });

  it('skips an individual failing file but yields the rest', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ['a.json', 'broken.json', 'c.json'] })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ entity_id: 'a' }) })
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ entity_id: 'c' }) });
    vi.stubGlobal('fetch', fetchMock);

    const source = new FileSnapshotSource({ baseUrl: '/_fixtures' });
    const snaps: unknown[] = [];
    for await (const s of source.readAll('onex.snapshot.partial.v1')) snaps.push(s);

    expect(snaps).toHaveLength(2);
    expect((snaps[0] as { entity_id: string }).entity_id).toBe('a');
    expect((snaps[1] as { entity_id: string }).entity_id).toBe('c');
  });

  it('strips trailing slash from baseUrl so URLs are well-formed', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: false, status: 404 });
    vi.stubGlobal('fetch', fetchMock);

    const source = new FileSnapshotSource({ baseUrl: '/_fixtures/' });
    for await (const _s of source.readAll('onex.snapshot.test.v1')) {
      // no-op; we only care about the URL
    }
    expect(fetchMock).toHaveBeenCalledWith('/_fixtures/onex.snapshot.test.v1/index.json');
  });

  it('propagates network errors to the caller (fetch rejects)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    const source = new FileSnapshotSource({ baseUrl: '/_fixtures' });
    await expect(async () => {
      for await (const _s of source.readAll('onex.snapshot.test.v1')) {
        /* unreachable */
      }
    }).rejects.toThrow('network down');
  });
});
