// @vitest-environment jsdom
// A1  summary KPI group shows the notice and not 500 when rows are all in the last day
// A2  each analysis tab panel shows the notice when rows are all in the last day
// A3  control: each analysis tab panel does not show the notice when rows span the window
// A4  each of the four all-view sections shows the notice when rows are all in the last day
// A5  control: no section in all-view shows the notice when rows span the window
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { InsightsSection, InsightsWindowContext } from './insight-charts';
import type { ActivityWindow } from './insight-charts';

const NOW = Date.parse('2026-11-25T12:00:00Z');
const DAY_MS = 86_400_000;
const day = (offset: number) => new Date(NOW - offset * DAY_MS).toISOString().slice(0, 10);
const NOT_COVERED = /Not measured for the full window/;
const row = (at: string) => ({ written_at: at, quality_gate_passed: 1, terminal_ok: 1, tokens_input: 100, tokens_output: 10, latency_ms: 400, cost_tier_name: 'local', task_type: 'document', model_name: 'm' });
const LAST_DAY = Array.from({ length: 500 }, (_, i) => row(new Date(NOW - (i % 20) * 3_600_000 - i * 1000).toISOString()));
const SPANNING = LAST_DAY.map((r, i) => (i === 499 ? row(`${day(8)}T10:00:00Z`) : i % 7 === 0 ? row(`${day(3)}T10:00:00Z`) : r));
const TABS = ['Tasks', 'Pass rate per day', 'Why runs failed', 'How long runs take', 'Model scoreboard', 'When runs happen'];
const window7: ActivityWindow = { kind: 'days', days: 7 };
const draw = (rows: unknown[], view: 'all' | 'summary' | 'analysis') => render(<InsightsWindowContext.Provider value={{ window: window7, setWindow: () => {} }}><InsightsSection decisions={rows} now={NOW} view={view} /></InsightsWindowContext.Provider>);
const openTab = (name: string) => fireEvent.click(screen.getByRole('tab', { name: new RegExp(name) }));

describe('OMN-26665 AC5: row-drawn figures outside the Runs KPI row need covering rows', () => {
  it('A1: the summary More activity KPIs read Not measured for 500 last-day rows under a 7-day window', () => {
    const { container } = draw(LAST_DAY, 'summary');
    const more = container.querySelector('[data-section="More activity"]')!;
    const kpis = more.querySelector('[aria-label^="Runs in "]')!;
    expect(kpis.textContent).toMatch(NOT_COVERED);
    expect(kpis.textContent).not.toMatch(/\b500\b/);
  });
  it.each(TABS)('A2: the %s analysis tab does not draw counts from last-day rows', (tab) => {
    draw(LAST_DAY, 'analysis');
    openTab(tab);
    expect(screen.getByRole('tabpanel').textContent).toMatch(NOT_COVERED);
  });
  it.each(TABS)('A3 control: the %s analysis tab still draws when the rows reach the window start', (tab) => {
    draw(SPANNING, 'analysis');
    openTab(tab);
    expect(screen.getByRole('tabpanel').textContent).not.toMatch(NOT_COVERED);
  });
  it('A4: view all sections read the notice for last-day rows', () => {
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
