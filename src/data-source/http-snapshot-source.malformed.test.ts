// OMN-24616 AC5: a 200 response that is neither a projection envelope nor an array of rows is a malformed read. It is
// refused with a reason the page can show, never turned into an empty successful read ("No runs yet").
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpSnapshotSource, ProjectionReadMalformedError } from './http-snapshot-source';

const tenantResolver = vi.hoisted(() => ({ resolveTenantFor: vi.fn() }));
vi.mock('./projection-tenant', () => ({
  resolveTenantFor: tenantResolver.resolveTenantFor,
  TenantNotConfiguredError: class TenantNotConfiguredError extends Error {},
}));

const TOPIC = 'onex.snapshot.projection.delegation.decisions.v1';
const answer = (body: unknown) => vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => body })));

describe('HttpSnapshotSource refuses a malformed 200 body', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    tenantResolver.resolveTenantFor.mockResolvedValue({ kind: 'unscoped' });
  });

  for (const [name, body] of [
    ['an error object without rows', { error: 'projection_table_missing' }],
    ['an envelope whose rows is not an array', { rows: 'nope', row_count: 3 }],
    ['a bare string', 'Internal error'],
    ['null', null],
    ['an envelope with a null row', { rows: [null], row_count: 1 }],
    ['a plain array holding a string', ['a row']],
  ] as const) {
    it(`readSnapshot refuses ${name}`, async () => {
      answer(body);
      const read = new HttpSnapshotSource({ baseUrl: 'http://projection-api' }).readSnapshot(TOPIC);
      await expect(read).rejects.toBeInstanceOf(ProjectionReadMalformedError);
      await expect(read).rejects.toMatchObject({ topic: TOPIC });
    });

    it(`readAll refuses ${name}`, async () => {
      answer(body);
      const rows: unknown[] = [];
      const walk = async () => { for await (const row of new HttpSnapshotSource({ baseUrl: 'http://projection-api' }).readAll(TOPIC)) rows.push(row); };
      await expect(walk()).rejects.toBeInstanceOf(ProjectionReadMalformedError);
      expect(rows).toEqual([]);
    });
  }

  it('still reads a plain array of rows (file fixtures) and an envelope', async () => {
    answer([{ id: 'a' }]);
    expect((await new HttpSnapshotSource({ baseUrl: 'http://projection-api' }).readSnapshot(TOPIC)).rows).toEqual([{ id: 'a' }]);
    answer({ rows: [{ id: 'b' }], row_count: 1 });
    expect((await new HttpSnapshotSource({ baseUrl: 'http://projection-api' }).readSnapshot(TOPIC)).rows).toEqual([{ id: 'b' }]);
  });
});
