// @vitest-environment jsdom
// OMN-20226: Compression and Cache hit rate render the served metering-summary.v1 value, and "Not measured" -- never
// 0, 0%, 0.00x or a blank -- while nothing measures them.
//
// Failure modes, each with a test below:
//   N1  a served all-time row whose field is null renders Not measured, for both cards;
//   N2  no served row at all renders a typed not-measured state, never a number;
//   N3  a served value is shown as served (the control: a card that always printed Not measured would pass N1 and N2);
//   N4  only the all-time row is read: a day row's value is not shown as the headline;
//   P1  on the page, a fresh store (an all-time row with neither field measured) shows both panels Not measured;
//   P2  on the page, with metering-summary.v1 not served at all, both panels say so and show no number.
import { act, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadLocalPageConfig } from '../layout/local-page-loader';

const METERING = 'onex.snapshot.projection.metering-summary.v1';

const harness = vi.hoisted(() => ({
  reachable: new Set<string>(),
  answer: (_topic: string): Promise<unknown[]> => Promise.resolve([]),
}));

vi.mock('@/data-source', () => ({
  createSnapshotSource: () => ({
    async *readAll() { yield []; },
    readSnapshot: async (topic: string) => {
      const rows = await harness.answer(topic);
      return { rows, rowCount: rows.length, dataFreshness: 'fresh', latestEventAt: null, readAt: new Date().toISOString() };
    },
  }),
}));
vi.mock('@/data-source/data-source-override', () => ({ resolveEffectiveDataSource: () => ({ mode: 'http' }) }));
vi.mock('@/data-source/exposure-census', () => ({
  fetchExposureCensus: async () => ({
    rows: [...harness.reachable].map((topic) => ({ topic, reachability: 'reachable' })),
  }),
}));

import { LocalDashboardPage, MeteringTotalCard } from './LocalDashboardPage';

type Config = Parameters<typeof MeteringTotalCard>[0]['config'];

const page = loadLocalPageConfig('overview');
const CARDS = [
  { id: 'overview-compression', field: 'compression_ratio', served: '2.34', shown: '2.34' },
  { id: 'overview-cache-hit-rate', field: 'cache_hit_rate', served: '0.25', shown: '0.250' },
] as const;

const allRow = (fields: Record<string, unknown>) => ({
  window_kind: 'all', window_start: '', as_of: '2026-10-07T06:00:57Z', baseline_model: 'claude-sonnet-5-5',
  baseline_state: 'resolved', runs_total: 3, runs_measured: 3, compression_ratio: null, cache_hit_rate: null,
  runs_cache_answered: null, ...fields,
});

function card(id: string) {
  const component = page.components.find((candidate) => candidate.component_id === id);
  const config = page.dashboard.widgets.find((widget) => widget.data_source === id)?.config as Config | undefined;
  if (!component || !config) throw new Error(`no ${id} on the Overview`);
  return { component, config };
}

const NUMBERS = /^-?\d|%$|x$/;

describe('OMN-20226 Compression and Cache hit rate cards', () => {
  for (const c of CARDS) {
    it(`N1: ${c.field} null in the served all-time row is Not measured`, () => {
      const { component, config } = card(c.id);
      const { container } = render(<MeteringTotalCard component={component} config={config} rows={[allRow({})]} />);
      expect(screen.getByText('Not measured')).toBeInTheDocument();
      expect(container.textContent ?? '').not.toMatch(NUMBERS);
    });

    it(`N2: no served row is a typed not-measured state for ${c.field}`, () => {
      const { component, config } = card(c.id);
      const { container } = render(<MeteringTotalCard component={component} config={config} rows={[]} />);
      expect(container.textContent).toMatch(/^Not measured/);
      expect(container.textContent ?? '').not.toMatch(/\d/);
    });

    it(`N3: a served ${c.field} is shown as served`, () => {
      const { component, config } = card(c.id);
      render(<MeteringTotalCard component={component} config={config} rows={[allRow({ [c.field]: c.served })]} />);
      expect(screen.getByText(c.shown)).toBeInTheDocument();
    });

    it(`N4: a day row's ${c.field} is not the headline`, () => {
      const { component, config } = card(c.id);
      const day = { ...allRow({ [c.field]: c.served }), window_kind: 'day', window_start: '2026-10-07' };
      render(<MeteringTotalCard component={component} config={config} rows={[day, allRow({})]} />);
      expect(screen.getByText('Not measured')).toBeInTheDocument();
      expect(screen.queryByText(c.shown)).toBeNull();
    });
  }
});

describe('OMN-20226 Overview page, fresh store', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'Date'] });
    vi.setSystemTime(new Date('2026-10-07T06:40:00Z'));
  });
  afterEach(() => { vi.useRealTimers(); });

  async function panel(title: string) {
    render(<LocalDashboardPage pageName="overview" />);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    return screen.getByRole('heading', { name: title }).closest('article') as HTMLElement;
  }

  for (const title of ['Compression', 'Cache hit rate']) {
    it(`P1: ${title} is Not measured on a fresh store's all-time row`, async () => {
      harness.reachable = new Set([METERING]);
      harness.answer = (topic) => Promise.resolve(topic === METERING ? [allRow({})] : []);
      const card = await panel(title);
      // The figure itself, not the panel's "As of" line, is what must never be a number.
      expect(card.querySelector('.local-dashboard-metric')?.textContent).toBe('Not measured');
    });

    it(`P2: ${title} shows no number when metering-summary.v1 is not served`, async () => {
      harness.reachable = new Set();
      harness.answer = () => Promise.resolve([]);
      const card = await panel(title);
      expect(within(card).getByRole('status').textContent).toBe(`Not served: ${METERING}`);
      expect(card.querySelector('.local-dashboard-metric')).toBeNull();
    });
  }
});
