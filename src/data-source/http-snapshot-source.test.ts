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

  it('unwraps projection API envelope and yields rows', async () => {
    const envelope = {
      topic: 'onex.snapshot.projection.cost.summary.v1',
      projection_version: '1.0.0',
      generated_at: '2026-05-01T12:00:00+00:00',
      data_freshness: 'fresh',
      latest_event_at: '2026-05-01T11:59:00+00:00',
      latest_projection_updated_at: '2026-05-01T11:59:00+00:00',
      row_count: 2,
      rows: [{ aggregation_key: 'claude', total_cost_usd: 1.5 }, { aggregation_key: 'openai', total_cost_usd: 0.8 }],
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => envelope,
    }));

    const source = new HttpSnapshotSource({ baseUrl: 'http://localhost:3002' });
    const results: unknown[] = [];
    for await (const item of source.readAll('onex.snapshot.projection.cost.summary.v1')) {
      results.push(item);
    }

    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({ aggregation_key: 'claude', total_cost_usd: 1.5 });
    expect(results[1]).toEqual({ aggregation_key: 'openai', total_cost_usd: 0.8 });
  });

  it('yields nothing when envelope rows is empty', async () => {
    const envelope = { topic: 't', projection_version: '1.0.0', generated_at: '', data_freshness: 'degraded', latest_event_at: null, latest_projection_updated_at: null, row_count: 0, rows: [] };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => envelope,
    }));

    const source = new HttpSnapshotSource({ baseUrl: 'http://localhost:3002' });
    const results: unknown[] = [];
    for await (const item of source.readAll('onex.snapshot.empty.v1')) {
      results.push(item);
    }

    expect(results).toHaveLength(0);
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

  // M8 (review §4) — additional error-path coverage matching the
  // FileSnapshotSource test set.

  it('yields nothing for an empty array body (200, [])', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    }));

    const source = new HttpSnapshotSource({ baseUrl: 'http://localhost:3002' });
    const results: unknown[] = [];
    for await (const item of source.readAll('onex.snapshot.empty.v1')) {
      results.push(item);
    }

    expect(results).toHaveLength(0);
  });

  it('propagates network errors to the caller (fetch rejects)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new Error('connect ECONNREFUSED')));

    const source = new HttpSnapshotSource({ baseUrl: 'http://localhost:3002' });
    await expect(async () => {
      for await (const _item of source.readAll('onex.snapshot.test.v1')) {
        /* unreachable */
      }
    }).rejects.toThrow(/ECONNREFUSED/);
  });
});
