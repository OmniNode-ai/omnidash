// @vitest-environment jsdom
// OMN-20008 AC5 (Jonah's decision on the ticket, comment 4f0e618d, 2026-10-09T21:08:53Z): the Overview Savings card
// brings back the percentage line, labelled as modelled, e.g. "42% below the claude-sonnet-5-5 baseline (modelled)".
// The ratio is metering-summary.v1's served savings_pct_of_counterfactual; the browser divides nothing (OMN-19980).
//
// Failure modes, each with a test below:
//   L1  a served ratio, as the decimal text Postgres numeric serves or as a number, renders the line with the served
//       baseline model and "(modelled)";
//   L2  a negative served ratio (spend above the baseline's price) is not shown as "-N% below";
//   L3  a null ratio renders no line, and every other line of the card is exactly what it was before;
//   L4  an absent ratio (the exposure does not serve the column yet) renders no line and still shows the figure: the
//       new field must not turn the whole card into Not measured;
//   L5  a ratio the browser cannot read as a number renders no line, never NaN% or 0%;
//   L6  an unresolved baseline shows no line even if a ratio is served: a line must name the baseline it compares to;
//   L7  only the all-time row is read: a day row's ratio is not the headline's line;
//   L8  the card never says "verified", and the headline title stays "Savings";
//   L9  the contract asks metering-summary.v1 for the column, so the server is asked for what the card shows;
//   P1  on the page, the Savings panel shows the line from the served all-time row.
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadLocalPageConfig } from '../layout/local-page-loader';

const METERING = 'onex.snapshot.projection.metering-summary.v1';
const PCT = 'savings_pct_of_counterfactual';

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
const savings = page.components.find((candidate) => candidate.component_id === 'overview-savings')!;
const config = page.dashboard.widgets.find((widget) => widget.data_source === 'overview-savings')?.config as Config;

/** The all-time row, without the ratio: the shape every lab row had before the column was served. */
const allRow = (fields: Record<string, unknown> = {}): Record<string, unknown> => ({
  window_kind: 'all', window_start: '', as_of: '2026-10-09T21:00:00Z', baseline_model: 'claude-sonnet-5-5',
  pricing_manifest_version: '1.0.0', baseline_state: 'resolved', savings_usd: '0.0156', ...fields,
});

/** What the card showed before this change, line by line (OMN-20008 AC3 and OMN-19980 Step B). */
const BEFORE = [
  '$0.0156',
  'Baseline claude-sonnet-5-5 · pricing manifest v1.0.0',
  "Modelled: the runs' tokens priced at the baseline model's list price. The baseline never ran.",
];

function lines(rows: readonly unknown[]): string[] {
  const { container } = render(<MeteringTotalCard component={savings} config={config} rows={rows} />);
  return [...container.querySelectorAll('p')].map((p) => p.textContent ?? '');
}

/** Any percentage line, anywhere in a card's text (no anchor: the line sits between other lines). */
const PCT_LINE = /\d+% (below|above) the .+? baseline \(modelled\)/;

describe('OMN-20008 AC5: the Savings card percentage line', () => {
  it('instrument: the line pattern matches a line inside a card\'s joined text, so a no-line check can fail', () => {
    expect(['$0.0156', '42% below the claude-sonnet-5-5 baseline (modelled)', ...BEFORE.slice(1)].join('\n')).toMatch(PCT_LINE);
    expect(`$0.015642% below the claude-sonnet-5-5 baseline (modelled)${BEFORE[1]}`).toMatch(PCT_LINE);
    expect(BEFORE.join('\n')).not.toMatch(PCT_LINE);
  });

  it.each([
    ['decimal text', '0.42', '42% below the claude-sonnet-5-5 baseline (modelled)'],
    ['a number', 0.42, '42% below the claude-sonnet-5-5 baseline (modelled)'],
    ['all of the counterfactual', '1', '100% below the claude-sonnet-5-5 baseline (modelled)'],
    ['Postgres numeric text', '0.4200000000000000', '42% below the claude-sonnet-5-5 baseline (modelled)'],
  ])('L1: a served ratio as %s renders the line, the rest of the card as before', (_name, served, expected) => {
    const shown = lines([allRow({ [PCT]: served })]);
    expect(shown).toContain(expected);
    expect(shown.filter((line) => line !== expected)).toEqual(BEFORE);
  });

  it('L2: a negative served ratio says above the baseline, never "-N% below"', () => {
    const shown = lines([allRow({ savings_usd: '-0.0010', [PCT]: '-0.1' })]);
    expect(shown).toContain('10% above the claude-sonnet-5-5 baseline (modelled)');
    expect(shown.join('\n')).not.toMatch(/-\d+% below/);
  });

  it('L3: a null ratio renders no line, and the card is exactly what it was', () => {
    expect(lines([allRow({ [PCT]: null })])).toEqual(BEFORE);
  });

  it('L4: an absent ratio renders no line and still shows the figure, never Not measured', () => {
    expect(lines([allRow()])).toEqual(BEFORE);
  });

  it.each([[''], ['n/a'], ['NaN'], [{}], [true]])('L5: an unreadable ratio %j renders no line', (served) => {
    const shown = lines([allRow({ [PCT]: served })]);
    expect(shown).toEqual(BEFORE);
    expect(shown.join('\n')).not.toMatch(/NaN|%/);
  });

  it('L6: an unresolved baseline shows no line even when a ratio is served', () => {
    const unresolved = lines([allRow({ baseline_state: 'unresolved', baseline_model: null, savings_usd: null, [PCT]: '0.42' })]);
    expect(unresolved[0]).toBe('Baseline unresolved');
    expect(unresolved.join('\n')).not.toMatch(PCT_LINE);
    const unnamed = lines([allRow({ baseline_model: '', [PCT]: '0.42' })]);
    expect(unnamed.join('\n')).not.toMatch(PCT_LINE);
  });

  it('L6: no figure, no line: a named but unresolved baseline, or a null saving, keeps the line off', () => {
    const unpriced = lines([allRow({ baseline_state: 'unresolved', savings_usd: null, [PCT]: '0.42' })]);
    expect(unpriced[0]).toBe('Baseline unresolved');
    expect(unpriced.join('\n')).not.toMatch(PCT_LINE);
    const unmeasured = lines([allRow({ savings_usd: null, [PCT]: '0.42' })]);
    expect(unmeasured[0]).toBe('Not measured');
    expect(unmeasured.join('\n')).not.toMatch(PCT_LINE);
  });

  it("L7: a day row's ratio is not the headline's line", () => {
    const day = allRow({ window_kind: 'day', window_start: '2026-10-09', [PCT]: '0.42' });
    expect(lines([day, allRow()])).toEqual(BEFORE);
  });

  it('L8: no line says "verified", and the headline title is still Savings', () => {
    const shown = lines([allRow({ [PCT]: '0.42' })]);
    expect(shown.join('\n')).not.toMatch(/verified/i);
    expect(savings.title).toBe('Savings');
  });

  it('L9: the Savings binding asks metering-summary.v1 for the ratio, beside the figure it qualifies', () => {
    expect(savings.data_bindings?.map((binding) => binding.projection_topic)).toEqual([METERING]);
    expect(savings.data_bindings?.[0]?.required_fields).toEqual(expect.arrayContaining(['savings_usd', 'baseline_model', PCT]));
  });
});

describe('OMN-20008 AC5: the Overview page', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'Date'] });
    vi.setSystemTime(new Date('2026-10-09T21:05:00Z'));
  });
  afterEach(() => { vi.useRealTimers(); });

  async function savingsPanel() {
    render(<LocalDashboardPage pageName="overview" />);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    return screen.getByRole('heading', { name: 'Savings' }).closest('article') as HTMLElement;
  }

  it('P1: the Savings panel shows the served line under its figure', async () => {
    harness.reachable = new Set([METERING]);
    harness.answer = (topic) => Promise.resolve(topic === METERING ? [allRow({ [PCT]: '0.42' })] : []);
    const panel = await savingsPanel();
    expect(panel.querySelector('.local-dashboard-metric')?.textContent).toBe('$0.0156');
    expect(panel.textContent).toContain('42% below the claude-sonnet-5-5 baseline (modelled)');
    expect(panel.textContent).not.toMatch(/verified/i);
  });

  it('P1 control: with the column not served, the panel shows the figure and no line', async () => {
    harness.reachable = new Set([METERING]);
    harness.answer = (topic) => Promise.resolve(topic === METERING ? [allRow()] : []);
    const panel = await savingsPanel();
    expect(panel.querySelector('.local-dashboard-metric')?.textContent).toBe('$0.0156');
    expect(panel.textContent).not.toMatch(PCT_LINE);
  });
});
