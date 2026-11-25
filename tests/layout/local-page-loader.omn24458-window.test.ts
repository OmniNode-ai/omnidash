// OMN-24458: the overview's decisions read on a rolling window names that window, in the route's own form (`7d`), so
// the projection route reads only the rows of those days from the store (and serves them from its page cache keyed by
// window) instead of the newest page of the whole history. Failure modes, each with a test below:
//   V1  the decisions read of a windowed overview carrying no `window` (the dev access log: `decisions?limit=100`);
//   V2  the window leaking onto a read the route must not window: another exposure, or one run's own row;
//   V3  a load with no window (all time, the Runs page) sending one;
//   V4  a windowed read still sending a `since` page, which the route reads as the ascending walk and not the window.
import { describe, expect, it } from 'vitest';
import type { ProjectionSnapshot, ProtocolSnapshotSource } from '@/data-source/protocol-snapshot-source';
import { DELEGATION_DECISIONS_TOPIC, loadLocalPageConfig, loadLocalPageSnapshots } from '@/layout/local-page-loader';

const answer = (): ProjectionSnapshot => ({ rows: [], rowCount: 0, dataFreshness: 'fresh', latestEventAt: null, readAt: '2026-11-24T02:00:00Z' });

async function readPage(pageName: 'overview' | 'runs', decisionsRouteWindow?: string) {
  const calls: Array<{ topic: string; params: Readonly<Record<string, string>> | undefined }> = [];
  const source: ProtocolSnapshotSource = {
    async *readAll() { /* not used by the page loader */ },
    readSnapshot: async (topic, params) => {
      calls.push({ topic, params });
      return answer();
    },
  };
  const page = loadLocalPageConfig(pageName);
  const availableTopics = new Set(page.components.flatMap(component => (component.data_bindings ?? []).map(binding => binding.projection_topic)));
  await loadLocalPageSnapshots(page, source, {
    mode: 'http',
    availableTopics,
    decisionsWalk: { maxPages: 0 },
    ...(decisionsRouteWindow === undefined ? {} : { decisionsRouteWindow }),
  });
  return calls;
}

describe('OMN-24458: the overview decisions read names its window', () => {
  it('V1: a 7-day overview sends window=7d on the decisions read', async () => {
    const calls = await readPage('overview', '7d');
    const decisions = calls.filter(call => call.topic === DELEGATION_DECISIONS_TOPIC);
    expect(decisions).toHaveLength(1);
    expect(decisions[0]!.params?.window).toBe('7d');
  });

  it('V2: no other exposure carries a window', async () => {
    const calls = await readPage('overview', '7d');
    const others = calls.filter(call => call.topic !== DELEGATION_DECISIONS_TOPIC);
    expect(others.length).toBeGreaterThan(0);
    expect(others.every(call => call.params?.window === undefined)).toBe(true);
  });

  it('V3: a load with no window sends none', async () => {
    const calls = await readPage('overview');
    const decisions = calls.filter(call => call.topic === DELEGATION_DECISIONS_TOPIC);
    expect(decisions).toHaveLength(1);
    expect(decisions[0]!.params?.window).toBeUndefined();
  });

  it('V4: the windowed read is one request with no since page', async () => {
    const calls = await readPage('overview', '30d');
    const decisions = calls.filter(call => call.topic === DELEGATION_DECISIONS_TOPIC);
    expect(decisions.map(call => call.params?.window)).toEqual(['30d']);
    expect(decisions.every(call => call.params?.since === undefined)).toBe(true);
  });
});
