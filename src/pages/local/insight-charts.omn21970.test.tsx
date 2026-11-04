// @vitest-environment jsdom
// OMN-21970 AC2, AC3, AC4: Runs per day and Tokens per day draw the served per-day totals, and nothing says "latest
// 500" once every run was read.
//
// Failure modes, each with a test below:
//   D1  the daily charts count the rows the page holds instead of the served per-day totals, so days before the newest
//       rows are drawn empty and the drawn runs do not add up to the served total
//   D2  a served day inside the selected range is dropped, or a day outside it is drawn
//   D3  the latest-500 notice stays after the whole store was read
//   D4  a served day whose runs carry no token counts is drawn as zero instead of not recorded (AC4 on served totals)
//   D5  an incomplete read stops saying its rows are only the latest ones
//   D6  a days list served as JSON text, or a row with none, is misread
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { InsightsSection, InsightsWindowContext } from './insight-charts';
import type { ActivityWindow } from './insight-charts';
import { servedDailyDays } from './insights';

const NOW = Date.parse('2026-11-02T12:00:00Z');
const DAY_MS = 86_400_000;
const day = (offset: number) => new Date(NOW - offset * DAY_MS).toISOString().slice(0, 10);

// 20 served days, oldest first, 30 runs each: 600 runs in all, the newest 500 of which fall on the last 17 days.
const SERVED = Array.from({ length: 20 }, (_, index) => ({
  day: day(19 - index), runs: 30, passed: 25, failed: 5, unrecorded: 0,
  tokensIn: 3000, tokensOut: 300, tokensInUnmeasured: 0, tokensOutUnmeasured: 0,
}));
const DAILY_ROW = { tenant_id: 't', days: SERVED, total_runs: 600, latest_projection_updated_at: `${day(0)}T11:00:00Z` };

// The page's rows: only the newest 2 days' runs, as a capped read would hold.
const ROWS = Array.from({ length: 60 }, (_, index) => ({
  written_at: `${day(index < 30 ? 0 : 1)}T0${index % 9}:00:00Z`, quality_gate_passed: 1, terminal_ok: 1,
  tokens_input: 100, tokens_output: 10, latency_ms: 400, cost_tier_name: 'local', task_type: 'document', model_name: 'm',
}));

function bars(name: string) {
  return within(screen.getByRole('group', { name })).getAllByRole('button');
}
const runsOf = (label: string | null) => Number(/: ([\d,]+) runs?/.exec(label ?? '')?.[1]?.replace(/,/g, '') ?? Number.NaN);

function draw(window: ActivityWindow, daily: unknown[] | null, complete: boolean) {
  return render(<InsightsWindowContext.Provider value={{ window, setWindow: () => undefined }}>
    <InsightsSection decisions={ROWS} now={NOW} view="summary" servedDays={daily === null ? null : servedDailyDays(daily)} complete={complete} />
  </InsightsWindowContext.Provider>);
}

describe('OMN-21970: the daily charts draw served per-day totals', () => {
  it('D1, D2: with All selected, 20 served days are drawn and add up to the 600 served runs', () => {
    draw({ kind: 'all' }, [DAILY_ROW], true);
    const drawn = bars('Runs per day').map(bar => bar.getAttribute('aria-label'));
    const withRuns = drawn.filter(label => runsOf(label) > 0);
    expect(withRuns).toHaveLength(20);
    expect(drawn.reduce((sum, label) => sum + (runsOf(label) || 0), 0)).toBe(600);
  });

  it('D2: with All selected, a served history longer than 30 days (the measured store spans 35) is drawn whole', () => {
    // 2026-09-29 to 2026-11-02, as served on the dev lane 2026-11-02: the oldest day had 2 runs.
    const long = Array.from({ length: 35 }, (_, index) => ({ ...SERVED[0]!, day: day(34 - index), runs: index === 0 ? 2 : 10, passed: index === 0 ? 2 : 10, failed: 0 }));
    draw({ kind: 'all' }, [{ ...DAILY_ROW, days: long, total_runs: 2 + 34 * 10 }], true);
    const drawn = bars('Runs per day').map(bar => bar.getAttribute('aria-label'));
    expect(drawn).toHaveLength(35);
    expect(drawn.reduce((sum, label) => sum + (runsOf(label) || 0), 0)).toBe(342);
  });

  it.each([[15, 450], [7, 210]])('D2: with %i days selected, exactly those days are drawn and sum to %i', (days, total) => {
    draw({ kind: 'days', days }, [DAILY_ROW], true);
    const drawn = bars('Runs per day').map(bar => bar.getAttribute('aria-label'));
    expect(drawn).toHaveLength(days);
    expect(drawn.reduce((sum, label) => sum + (runsOf(label) || 0), 0)).toBe(total);
  });

  it('D1 positive control: without served totals the same chart counts only the 60 rows the page holds', () => {
    draw({ kind: 'all' }, null, true);
    const drawn = bars('Runs per day').map(bar => bar.getAttribute('aria-label'));
    expect(drawn.reduce((sum, label) => sum + (runsOf(label) || 0), 0)).toBe(60);
  });

  it('D3: once every run was read, the Runs per day panel shows no latest-500 notice, even with 600 rows', () => {
    const many = Array.from({ length: 600 }, (_, index) => ({ ...ROWS[0], written_at: new Date(NOW - index * 60_000).toISOString() }));
    render(<InsightsWindowContext.Provider value="all">
      <InsightsSection decisions={many} now={NOW} view="runs" servedDays={servedDailyDays([DAILY_ROW])} complete />
    </InsightsWindowContext.Provider>);
    expect(document.body.textContent).not.toMatch(/Showing the latest/);
  });

  it('D3 positive control: an incomplete read of 500 rows says how many it read and that the rest were not, never "latest 500"', () => {
    const capped = Array.from({ length: 500 }, (_, index) => ({ ...ROWS[0], written_at: new Date(NOW - index * 60_000).toISOString() }));
    render(<InsightsWindowContext.Provider value="all">
      <InsightsSection decisions={capped} now={NOW} view="runs" servedDays={null} complete={false} />
    </InsightsWindowContext.Provider>);
    expect(document.body.textContent).toMatch(/Showing 500 runs read; the rest could not be read/);
    expect(document.body.textContent).not.toMatch(/Showing the latest/);
  });

  it('D3: once every run was read, the caption names all served runs, not the latest ones', () => {
    draw({ kind: 'all' }, [DAILY_ROW], true);
    const caption = screen.getByTestId('insights-total').textContent ?? '';
    expect(caption).toMatch(/60 served runs/);
    expect(caption).not.toMatch(/latest/i);
  });

  it('D5: an incomplete read keeps saying its rows are the latest ones', () => {
    draw({ kind: 'all' }, null, false);
    expect(screen.getByTestId('insights-total').textContent).toMatch(/Latest 60 served runs/);
  });

  it('D4: a served day with runs and no token counts is not recorded on Tokens per day, never a zero bar', () => {
    const gap = SERVED.map((served, index) => index === 10
      ? { ...served, tokensIn: null, tokensOut: null, tokensInUnmeasured: 30, tokensOutUnmeasured: 30 } : served);
    draw({ kind: 'all' }, [{ ...DAILY_ROW, days: gap }], true);
    const label = bars('Tokens per day').map(bar => bar.getAttribute('aria-label')).find(text => text?.startsWith(
      new Date(`${SERVED[10]!.day}T00:00:00Z`).toLocaleString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })));
    expect(label).toMatch(/not recorded in, not recorded out/);
    expect(label).not.toMatch(/\b0 in\b/);
  });

  it('D6: servedDailyDays reads a days list served as JSON text too, and refuses a row with no days', () => {
    expect(servedDailyDays([{ ...DAILY_ROW, days: JSON.stringify(SERVED) }])).toHaveLength(20);
    expect(servedDailyDays([{ tenant_id: 't' }])).toBeNull();
    expect(servedDailyDays([])).toBeNull();
  });
});
