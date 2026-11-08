// @vitest-environment jsdom
// OMN-19991: `node_projection_local_alerts` declares `bus_backed: true`, which is a promise that somebody
// looks at the exposure. Nothing did: omnibase_infra's exposure-reader-coverage gate named
// onex.snapshot.projection.local-alerts.v1 with `code: no_reader` and reddened every open pull request in
// that repository. The promise is kept here, on the System status page beside Environment, and these
// checks are the ones that fail if it is quietly withdrawn again:
// A1: the shipped System status document places a component bound to the exposure (what the gate reads);
// A2: an open alert the exposure serves is on the page a person opens, by code and subject;
// A3: a served-but-empty exposure says so, rather than rendering nothing at all.
import { act, cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const TOPIC = 'onex.snapshot.projection.local-alerts.v1';
const harness = vi.hoisted(() => ({ rows: [] as Record<string, unknown>[], reads: [] as string[] }));

vi.mock('echarts-for-react/lib/core', () => ({ default: () => <div /> }));
vi.mock('@/data-source', () => ({
  createSnapshotSource: () => ({
    async *readAll() { yield []; },
    readSnapshot: async (topic: string) => {
      harness.reads.push(topic);
      const rows = topic === 'onex.snapshot.projection.local-alerts.v1' ? harness.rows : [];
      return { rows, rowCount: rows.length, dataFreshness: 'fresh', latestEventAt: null, readAt: '2026-11-08T15:00:00Z' };
    },
  }),
}));
vi.mock('@/data-source/data-source-override', () => ({ resolveEffectiveDataSource: () => ({ mode: 'http' }) }));
vi.mock('@/data-source/exposure-census', () => ({
  fetchExposureCensus: async () => {
    const { loadLocalPageConfig } = await import('@/layout/local-page-loader');
    const topics = new Set(loadLocalPageConfig('status').components
      .flatMap(component => component.data_bindings?.map(binding => binding.projection_topic) ?? []));
    return { rows: [...topics].map(topic => ({ topic, reachability: 'reachable' })) };
  },
}));

import { LocalDashboardPage } from './LocalDashboardPage';
import { loadLocalPageConfig } from '@/layout/local-page-loader';

// The exposure's own columns, in the shape `omnidash_analytics.local_alerts` serves them.
const alert = {
  tenant_id: '22222222-2222-4222-8222-222222222222',
  code: 'SERVICE_DOWN', subject: 'valkey', mode: 'compose', service: 'valkey',
  state: 'open', severity: 'critical',
  raised_at: '2026-11-08T14:40:00Z', cleared_at: null,
  evidence: { reason: 'connection refused' },
  last_transition_id: '33333333-3333-4333-8333-333333333333',
  last_transition_at: '2026-11-08T14:40:00Z', updated_at: '2026-11-08T14:40:00Z',
  projection_cursor: '1',
};

async function open(rows: Record<string, unknown>[]) {
  harness.rows = rows;
  render(<LocalDashboardPage pageName="status" embedded />);
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
}

beforeEach(() => {
  vi.useFakeTimers({ now: new Date('2026-11-08T15:00:00Z') });
  harness.rows = []; harness.reads = [];
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('OMN-19991 local-alerts has a reader', () => {
  it('A1: the System status document places a component bound to the local-alerts exposure', () => {
    const page = loadLocalPageConfig('status');
    const placed = new Set(page.dashboard.widgets.map(widget => widget.data_source));
    const readers = page.components.filter(component => placed.has(component.component_id)
      && (component.data_bindings ?? []).some(binding => binding.projection_topic === TOPIC));
    // One reader, and it is placed: the gate resolves widgets through component bindings, so an
    // unplaced component is not a reader however it is bound.
    expect(readers.map(component => component.component_id)).toEqual(['status-alerts']);
    const binding = readers[0].data_bindings?.find(candidate => candidate.projection_topic === TOPIC);
    // The exposure orders `raised_at DESC`; a reader that ordered by anything else would show a
    // different alert first than the one the writer calls newest.
    expect(binding?.ordering_authority_field).toBe('raised_at');
    expect(binding?.ordering_direction).toBe('descending');
  });

  it('A2: an open alert the exposure serves is on the page, by code and subject', async () => {
    await open([alert]);
    expect(harness.reads).toContain(TOPIC);
    const heading = screen.getByRole('heading', { name: /^Open alerts$/ });
    const panel = heading.closest('article') as HTMLElement;
    expect(panel).not.toBeNull();
    expect(within(panel).getByText('SERVICE_DOWN', { exact: true })).toBeTruthy();
    // Subject and service are separate served fields that happen to hold the same value here, and both are declared.
    expect(within(panel).getAllByText('valkey', { exact: true })).toHaveLength(2);
    expect(within(panel).getByText('critical', { exact: true })).toBeTruthy();
    // Still open: the exposure records no cleared_at, and the table must not leave that cell blank.
    expect(within(panel).getByText('Not cleared', { exact: true })).toBeTruthy();
    // The run filters and the Runs columns belong to RunsTable, the renderer a table component falls through to.
    expect(within(panel).queryByText('Search runs', { exact: true })).toBeNull();
  });

  it('A3: a served exposure with no alerts says so rather than rendering nothing', async () => {
    await open([]);
    expect(harness.reads).toContain(TOPIC);
    const heading = screen.getByRole('heading', { name: /^Open alerts$/ });
    const panel = heading.closest('article') as HTMLElement;
    expect(panel).not.toBeNull();
    expect(panel.textContent ?? '').not.toBe('');
  });
});
