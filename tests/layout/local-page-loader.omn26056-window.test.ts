// OMN-26056: the decisions record window is declared config (contract.yaml refresh.decisions_page_limit, 0 = the
// server's own page of 500). With a window set, the newest-page read and each Load more page ask for that many runs;
// one run's own row (correlation_id) is never windowed. With none set, no limit is sent: today's behaviour.
// Failure modes:
//   P1  a configured window not reaching the decisions request, so the page still reads 500 runs;
//   P2  the window being sent on the per-run read, which would cut a run's own row;
//   P3  a default dashboard (no window) sending a limit it never sent before.
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProjectionSnapshot, ProtocolSnapshotSource } from '@/data-source/protocol-snapshot-source';

const answer = (): ProjectionSnapshot => ({ rows: [], rowCount: 0, dataFreshness: 'fresh', latestEventAt: null, readAt: '2026-11-19T10:00:00Z' });

async function readOverview(limit: number | null) {
  vi.resetModules();
  if (limit !== null) {
    vi.doMock('@/config/generated/data-source-defaults', async (importOriginal) => ({
      ...(await importOriginal<typeof import('@/config/generated/data-source-defaults')>()),
      DECISIONS_PAGE_LIMIT_DEFAULT: limit,
    }));
  }
  const loader = await import('@/layout/local-page-loader');
  const calls: Array<Readonly<Record<string, string>> | undefined> = [];
  const source: ProtocolSnapshotSource = {
    async *readAll() { /* unused */ },
    readSnapshot: async (topic, params) => {
      if (topic === loader.DELEGATION_DECISIONS_TOPIC) calls.push(params);
      return answer();
    },
  };
  const page = loader.loadLocalPageConfig('runs');
  const topics = new Set(page.components.flatMap((c) => (c.data_bindings ?? []).map((b) => b.projection_topic)));
  await loader.loadLocalPageSnapshots(page, source, { mode: 'http', availableTopics: topics, decisionsWalk: { maxPages: 0 } });
  return { calls, loader };
}

afterEach(() => { vi.doUnmock('@/config/generated/data-source-defaults'); vi.resetModules(); });

describe('OMN-26056 configured decisions window', () => {
  it('P1: a window of 50 is sent on the newest-page decisions read', async () => {
    const { calls } = await readOverview(50);
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.every((params) => params?.correlation_id !== undefined || params?.limit === '50')).toBe(true);
    expect(calls.some((params) => params?.limit === '50')).toBe(true);
  });

  it('P3: with no window the decisions read sends no limit', async () => {
    const { calls } = await readOverview(null);
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.every((params) => params?.limit === undefined)).toBe(true);
  });

  it('P2: the window helper leaves a per-run read alone', async () => {
    vi.resetModules();
    vi.doMock('@/config/generated/data-source-defaults', async (importOriginal) => ({
      ...(await importOriginal<typeof import('@/config/generated/data-source-defaults')>()),
      DECISIONS_PAGE_LIMIT_DEFAULT: 50,
    }));
    const { withDecisionsWindow } = await import('@/contracts/local-read-budget');
    expect(withDecisionsWindow(undefined)).toEqual({ limit: '50' });
    expect(withDecisionsWindow({ since: '7' })).toEqual({ since: '7', limit: '50' });
    expect(withDecisionsWindow({ correlation_id: 'run-1' })).toEqual({ correlation_id: 'run-1' });
  });
});
