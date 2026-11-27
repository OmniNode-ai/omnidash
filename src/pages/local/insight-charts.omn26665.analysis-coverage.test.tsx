// @vitest-environment jsdom
// OMN-26665 AC5 (review blockers): the Runs page's analysis tabs, the same charts under "view all", and the summary's
// More activity figures are not drawn from rows that do not reach the 7-day window start. Failure modes:
//   A1  the summary's More activity Runs / Median tiles draw 500 last-day rows as the week
//   A2  an analysis tab (tasks, pass rate, failures, duration, models, hours) draws counts from those rows
//   A3  (control) rows that reach past the window start still draw every analysis tab
//   A4  the view-all sections (routing, quality, performance, hour) draw counts from those rows
//   A5  (control) the same sections with spanning rows say nothing about coverage
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { InsightsSection, InsightsWindowContext } from './insight-charts';
import type { ActivityWindow } from './insight-charts';

const NOW = Date.parse('2026-11-25T12:00:00Z');
const DAY_MS = 86_400_000;
const day = (offset: number) => new Date(NOW - offset * DAY_MS).toISOString().slice(0, 10);
const NOT_COVERED = /Not measured for the full window/;

const row = (at: string) => ({
  written_at: at, quality_gate_passed: 1, terminal_ok: 1, tokens_input: 100, tokens_output: 10, latency_ms: 400,
  cost_tier_name: 'local', task_type: 'document', model_name: 'm',
});
const LAST_DAY = Array.from({ length: 500 }, (_, index) => row(new Date(NOW - (index % 20) * 3_600_000 - index * 1000).toISOString()));
const SPANNING = LAST_DAY.map((r, index) => (index === 499 ? row(`${day(8)}T10:00:00Z`) : index % 7 === 0 ? row(`${day(3)}T10:00:00Z`) : r));
const SEVEN: ActivityWindow = { kind: 'days', days: 7 };
const TABS = ['Tasks', 'Pass rate per day', 'Why runs failed', 'How long runs take', 'Model scoreboard', 'When runs happen'];

function draw(rows: unknown[], view: 'all' | 'summary' | 'analysis') {
  return render(<InsightsWindowContext.Provider value={{ window: SEVEN, setWindow: () => undefined }}>
    <InsightsSection decisions={rows} now={NOW} view={view} />
  </InsightsWindowContext.Provider>);
}
const openTab = (name: string) => fireEvent.click(screen.getByRole('tab', { name: new RegExp(name) }));

describe('OMN-26665 AC5: row-drawn figures outside the Runs KPI row need covering rows', () => {
  it('A1: the summary More activity KPIs read Not measured for 500 last-day rows under a 7-day window', () => {
    const { container } = draw(LAST_DAY, 'summary');
    const more = container.querySelector('[data-section="More activity"]')!;
    const kpis = more.querySelector('[aria-label^="Runs in "]')!;
    expect(kpis.textContent).toMatch(NOT_COVERED);
    expect(kpis.textContent).not.toMatch(/\b500\b/);
  });

  it.each(TABS)('A2: the %s analysis tab does not draw counts from last-day rows', (name) => {
    draw(LAST_DAY, 'analysis');
    openTab(name);
    expect(screen.getByRole('tabpanel').textContent).toMatch(NOT_COVERED);
  });

  it.each(TABS)('A3 control: the %s analysis tab still draws when the rows reach the window start', (name) => {
    draw(SPANNING, 'analysis');
    openTab(name);
    expect(screen.getByRole('tabpanel').textContent).not.toMatch(NOT_COVERED);
  });

  it('A4: view all says Not measured in the routing, quality, performance and hour sections', () => {
    const { container } = draw(LAST_DAY, 'all');
    for (const title of ['Routing and workload', 'Quality and outcomes', 'Performance by model', 'Activity by UTC hour']) {
      const section = container.querySelector(`section[aria-label="${title}"]`)!;
      expect(section.textContent, title).toMatch(NOT_COVERED);
    }
  });

  it('A5 control: view all with spanning rows draws those sections without a coverage notice', () => {
    draw(SPANNING, 'all');
    expect(screen.queryByText(NOT_COVERED)).toBeNull();
  });
});
