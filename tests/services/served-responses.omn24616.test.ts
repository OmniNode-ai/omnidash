/**
 * OMN-24616 AC5: every served response is parsed, and a malformed one is refused with its reason, never read as an
 * empty, successful answer. #517 did this for the snapshot source; this covers the other two client seams.
 *
 * Failure modes, each with a test below:
 *   E1  a projection body whose rows is not an array is read as zero rows, fresh
 *   E2  a projection body with no rows, no error and no status is read as an empty success
 *   E3  a served envelope is refused (over-refusal)
 *   L1  a log-entries body that is not rows is read as no log entries
 *   M1  a provider row whose set_up is not a boolean renders as if it were set up or not
 *   M2  a provider test with a status the page does not know renders as a result
 *   M3  a well-formed provider list is refused (over-refusal)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchDelegationSummary, fetchLogEntries } from '@/services/event-dash-api';
import { listModelKeys, ModelKeysError } from '@/services/models-api';

vi.mock('@/data-source/projection-base-url', () => ({
  resolveProjectionBaseUrl: () => '',
  resolveCommandBaseUrl: () => '',
  projectionUrl: (topic: string) => `/projection/${encodeURIComponent(topic)}`,
}));
vi.mock('@/data-source/projection-tenant', () => ({
  resolveTenantFor: async () => ({ kind: 'unscoped' }),
}));

function serve(body: unknown): void {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => body }));
}

beforeEach(() => vi.restoreAllMocks());
afterEach(() => vi.unstubAllGlobals());

describe('projection reads refuse a malformed body', () => {
  it('E1: rows that is not an array is a degraded read that names it', async () => {
    serve({ rows: 'oops', row_count: 3, data_freshness: 'fresh' });
    const result = await fetchDelegationSummary();
    expect(result.rows).toEqual([]);
    expect(result.isDegraded).toBe(true);
    expect(result.degradedReason).toMatch(/malformed.*rows is a string/);
  });

  it('E2: a body with no rows, error or status is a degraded read that names it', async () => {
    serve({ hello: 'world' });
    const result = await fetchDelegationSummary();
    expect(result.isDegraded).toBe(true);
    expect(result.degradedReason).toMatch(/malformed.*no rows/);
  });

  it('E3: a served envelope still reads', async () => {
    serve({ rows: [{ a: 1 }], row_count: 1, data_freshness: 'fresh', latest_event_at: null });
    const result = await fetchDelegationSummary();
    expect(result.rows).toEqual([{ a: 1 }]);
    expect(result.isDegraded).toBe(false);
  });
});

describe('log entries refuse a malformed body', () => {
  it('L1: a 200 body that is not rows throws with its reason', async () => {
    serve({ entries: [] });
    await expect(fetchLogEntries('run-1')).rejects.toThrow(/malformed.*no rows/);
  });
});

describe('the provider list parses every row', () => {
  const row = { provider: 'openai', set_up: true, last_test: null, models: ['gpt-4o-mini'] };

  it('M1: a set_up that is not a boolean is refused, naming the field', async () => {
    serve({ providers: [{ ...row, set_up: 'yes' }] });
    const refused = await listModelKeys().catch((error: unknown) => error);
    expect(refused).toBeInstanceOf(ModelKeysError);
    expect((refused as ModelKeysError).code).toBe('bad_response');
    expect((refused as ModelKeysError).message).toMatch(/set_up/);
  });

  it('M2: a test status the page does not know is refused', async () => {
    serve({ providers: [{ ...row, last_test: { provider: 'openai', status: 'maybe', tested_at: '2026-11-16T00:00:00Z' } }] });
    await expect(listModelKeys()).rejects.toThrow(/last_test.status/);
  });

  it('M3: a well-formed list still reads', async () => {
    const tested = { provider: 'openai', status: 'passed', tested_at: '2026-11-16T00:00:00Z' };
    serve({ providers: [row, { ...row, provider: 'gemini', set_up: false, last_test: tested, models: [] }] });
    const providers = await listModelKeys();
    expect(providers.map(p => p.provider)).toEqual(['openai', 'gemini']);
  });
});
