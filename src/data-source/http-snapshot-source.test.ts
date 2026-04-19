import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HttpSnapshotSource } from './http-snapshot-source';

describe('HttpSnapshotSource', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('yields each item from a 200 response returning an array', async () => {
    const items = [{ id: 'a', value: 1 }, { id: 'b', value: 2 }];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => items,
    }));

    const source = new HttpSnapshotSource({ baseUrl: 'http://localhost:3002' });
    const results: unknown[] = [];
    for await (const item of source.readAll('onex.snapshot.test.v1')) {
      results.push(item);
    }

    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({ id: 'a', value: 1 });
    expect(results[1]).toEqual({ id: 'b', value: 2 });
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:3002/projection/onex.snapshot.test.v1',
    );
  });

  it('encodes the topic in the URL', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => [{ id: 'x' }],
    }));

    const source = new HttpSnapshotSource({ baseUrl: 'http://localhost:3002' });
    const results: unknown[] = [];
    for await (const item of source.readAll('onex.snapshot.projection/special.v1')) {
      results.push(item);
    }

    expect(results).toHaveLength(1);
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:3002/projection/onex.snapshot.projection%2Fspecial.v1',
    );
  });

  it('yields nothing when response is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 404,
    }));

    const source = new HttpSnapshotSource({ baseUrl: 'http://localhost:3002' });
    const results: unknown[] = [];
    for await (const item of source.readAll('onex.snapshot.missing.v1')) {
      results.push(item);
    }

    expect(results).toHaveLength(0);
  });

  it('yields nothing on a 500 error response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 500,
    }));

    const source = new HttpSnapshotSource({ baseUrl: 'http://localhost:3002' });
    const results: unknown[] = [];
    for await (const item of source.readAll('onex.snapshot.error.v1')) {
      results.push(item);
    }

    expect(results).toHaveLength(0);
  });
});
