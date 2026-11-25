// @vitest-environment jsdom
// OMN-26665 AC5: no 7-day figure is drawn from rows that do not reach the window's start. A read capped at its newest
// 500 runs can all lie inside the last 24 hours; a "7 days" figure from them is a one-day figure with a seven-day label.
// One shared helper (windowCoverage) decides, and an uncovered figure reads "Not measured for the full window".
//
// Failure modes, each with a test below:
//   V1  500 rows from the last 24 h under a 7-day window draw a Runs figure (KPI) as if they were the week
//   V2  (control) rows that do reach back past the window's start still draw their figures
//   V3  a read that walked every page is complete, so rows all from the last day are every run and are drawn
//   V4  charts built from the rows (no served days) are drawn for a window the rows do not cover
//   V5  charts built from served per-day totals do not depend on the rows' reach and stay drawn
//   V6  the all-time window has no start to reach, so it never says "not measured"
//   H1  the helper itself: the boundary is "an older day than the window's first day was read"
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { InsightsSection, InsightsWindowContext } from './insight-charts';
import type { ActivityWindow } from './insight-charts';
import { servedDailyDays } from './insights';
import { windowCoverage } from './insight-aggregates';
import { toInsightRuns } from './insights';

const NOW = Date.parse('2026-11-25T12:00:00Z');
const DAY_MS = 86_400_000;
const day = (offset: number) => new Date(NOW - offset * DAY_MS).toISOString().slice(0, 10);
const NOT_COVERED = /Not measured for the full window/;

const row = (at: string) => ({
  written_at: at, quality_gate_passed: 1, terminal_ok: 1, tokens_input: 100, tokens_output: 10, latency_ms: 400,
  cost_tier_name: 'local', task_type: 'document', model_name: 'm',
});
/** 500 runs, every one inside the last 24 hours, as a capped read of a busy day holds. */
const LAST_DAY = Array.from({ length: 500 }, (_, index) => row(new Date(NOW - (index % 20) * 3_600_000 - index * 1000).toISOString()));
/** The same 500 runs with the oldest eight days back: the read reaches past a 7-day window's first day. */
const SPANNING = LAST_DAY.map((r, index) => (index === 499 ? row(`${day(8)}T10:00:00Z`) : index % 7 === 0 ? row(`${day(3)}T10:00:00Z`) : r));

const SERVED = Array.from({ length: 8 }, (_, index) => ({
  day: day(7 - index), runs: 40, passed: 30, failed: 10, unrecorded: 0,
  tokensIn: 4000, tokensOut: 400, tokensInUnmeasured: 0, tokensOutUnmeasured: 0,
}));
const DAILY_ROW = { tenant_id: 't', days: SERVED, total_runs: 320, latest_projection_updated_at: `${day(0)}T11:00:00Z` };

function draw(window: ActivityWindow, rows: unknown[], opts: { view?: 'all' | 'summary'; complete?: boolean; daily?: boolean } = {}) {
  return render(<InsightsWindowContext.Provider value={{ window, setWindow: () => undefined }}>
    <InsightsSection decisions={rows} now={NOW} view={opts.view ?? 'all'} complete={opts.complete ?? false}
      servedDays={opts.daily ? servedDailyDays([DAILY_ROW]) : null} />
  </InsightsWindowContext.Provider>);
}
const SEVEN: ActivityWindow = { kind: 'days', days: 7 };

describe('OMN-26665 AC5: a 7-day figure needs rows that reach the window start', () => {
  it('V1: 500 rows from the last 24 h under a 7-day window read Not measured, not 500 runs', () => {
    draw(SEVEN, LAST_DAY);
    expect(screen.getAllByText(NOT_COVERED).length).toBeGreaterThan(0);
    const kpis = screen.getByRole('region', { name: /^Runs in / });
    expect(kpis.textContent).not.toMatch(/\b500\b/);
    expect(kpis.textContent).toMatch(NOT_COVERED);
  });

  it('V2 control: rows spanning past the window start still draw the Runs figure and no notice', () => {
    draw(SEVEN, SPANNING);
    expect(screen.queryByText(NOT_COVERED)).toBeNull();
    expect(screen.getByRole('region', { name: /^Runs in / }).textContent).toMatch(/\d/);
  });

  it('V3: a complete read (every page walked) of last-day rows is every run, so it is drawn', () => {
    draw(SEVEN, LAST_DAY, { complete: true });
    expect(screen.queryByText(NOT_COVERED)).toBeNull();
    expect(screen.getByRole('region', { name: /^Runs in / }).textContent).toMatch(/500/);
  });

  it('V4: the charts built from rows say Not measured instead of drawing a week of one day', () => {
    draw(SEVEN, LAST_DAY, { view: 'summary' });
    expect(screen.getAllByText(NOT_COVERED).length).toBeGreaterThan(0);
    expect(screen.queryByRole('group', { name: 'Runs per day' })).toBeNull();
  });

  it('V5: charts built from served per-day totals stay drawn whatever the rows reach', () => {
    draw(SEVEN, LAST_DAY, { view: 'summary', daily: true });
    expect(screen.getByRole('group', { name: 'Runs per day' })).toBeInTheDocument();
    // The failure causes still come from the rows (no served categories here), so only that panel says so.
    expect(screen.getAllByText(NOT_COVERED)).toHaveLength(1);
  });

  it('V6: the all-time window never says it', () => {
    draw({ kind: 'all' }, LAST_DAY);
    expect(screen.queryByText(NOT_COVERED)).toBeNull();
  });
});

describe('OMN-26665 AC5: windowCoverage', () => {
  const runsFrom = (days: number[]) => toInsightRuns(days.map(offset => row(`${day(offset)}T10:00:00Z`)));
  it('H1: covered only when a day older than the first day of the window was read, or the read is complete', () => {
    // A 7-day window ending today starts six days back.
    expect(windowCoverage(runsFrom([0, 1]), SEVEN, NOW, false).covered).toBe(false);
    expect(windowCoverage(runsFrom([0, 6]), SEVEN, NOW, false).covered).toBe(false); // the first day itself may be cut mid-day
    expect(windowCoverage(runsFrom([0, 7]), SEVEN, NOW, false).covered).toBe(true);
    expect(windowCoverage(runsFrom([0, 1]), SEVEN, NOW, true).covered).toBe(true);
    expect(windowCoverage(runsFrom([]), SEVEN, NOW, false).covered).toBe(false);
    expect(windowCoverage(runsFrom([0, 1]), { kind: 'all' }, NOW, false).covered).toBe(true);
  });
});
