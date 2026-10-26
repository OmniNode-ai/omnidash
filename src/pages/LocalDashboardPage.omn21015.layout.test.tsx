// @vitest-environment jsdom
// OMN-21015 stage 5: the charts are at the top of a page, where a reader sees them without scrolling. On Overview the
// four headline tiles come first, then one row of the two charts (spend per day, tier mix) and the newest run, then
// the rest: the dashboard requirements ask that the tiles (Q3) and the newest run's status, model and age (Q2) be
// read without scrolling at 1440x900, and Lakshman asked the same of the charts. On Usage the two charts come first,
// side by side, and the table after them. The order drawn is the order the page's
// component contracts list, and a panel's width is the width the page file declares for it.
// OMN-21166 AC24 promotes Quality beside Tier mix in the compact composition. The
// original flat page declaration remains intact; assert its grid separately from
// the approved rendered order rather than treating the two as interchangeable.
//
// Failure modes, each with a test below:
//   Y1  a chart sits under a table or a tile it should be above (the order on the page is not the one above);
//   Y2  reorganising dropped, doubled or renamed a panel;
//   Y3  the widths of a row do not add up to the twelve columns, leaving a hole or pushing a chart to the next row;
//   Y4  a panel declares a width the stylesheet has no rule for, so it silently takes the whole row;
//   Y5  the page file's declared row and column say one arrangement and the page draws another.
//   Y6  the two wide run tables are given a floor again that their panel cannot hold: a longer one-line cut of the
//       run id, letter-spaced headers or a padded pill. At 9ch, with both, the Runs table scrolled sideways by 29px
//       at 1440 on rows with a long host and model (measured by tests/e2e/local-dashboard-omn20759.spec.ts).
//   Y7  the newest run's status, cause, model and age are no longer the first things its card says, so in the narrow
//       panel beside the charts they slide under the fold (requirement Q2 asks for them without scrolling).
// Whether the charts really are inside the first screen is measured in a real browser at 1440x900 by
// tests/e2e/local-dashboard-omn21015.spec.ts; jsdom lays nothing out.
import { readFileSync } from 'node:fs';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('echarts-for-react/lib/core', () => ({ default: () => <div data-testid="served-chart" /> }));
vi.mock('@/data-source', () => ({
  createSnapshotSource: () => ({
    async *readAll() { yield []; },
    readSnapshot: async () => ({ rows: [], rowCount: 0, dataFreshness: 'fresh', latestEventAt: null, readAt: new Date().toISOString() }),
  }),
}));
vi.mock('@/data-source/data-source-override', () => ({ resolveEffectiveDataSource: () => ({ mode: 'http' }) }));
vi.mock('@/data-source/exposure-census', () => ({ fetchExposureCensus: async () => ({ rows: [] }) }));

import { LastRunCard, LocalDashboardPage } from './LocalDashboardPage';

type PageName = 'overview' | 'usage';
const ORDER: Record<PageName, Array<[title: string, width: number]>> = {
  // The flat page declaration after the live review of 2026-10-25 (Lakshman removed Environment, Last run, Recent runs,
  // Spend per day and the secondary metrics from Overview; Environment moved to API Keys).
  overview: [
    ['Actual spend', 3], ['Savings', 3], ['Agent calls', 3], ['Tokens processed', 3],
    ['Quality', 12],
    ['Trends and breakdowns', 12],
    ['Model usage', 12],
    ['Tier mix', 12],
  ],
  usage: [
    ['Savings per day', 12], ['Tokens per day', 12],
    ['Usage insights', 12],
    ['Usage by model and day', 12],
  ],
};
const RENDERED_ORDER: Record<PageName, Array<[title: string, width: number]>> = {
  // Live review 2026-10-25: five headline cards (Delegation Quality is the fifth), then Runs per day, Tokens per day
  // Model usage and Tier mix, each the full row. The cards are one strip of five equal cells, so the twelve-column row check (Y3)
  // runs on the panels after it. The original declarative grid is still checked separately by Y4/Y5.
  overview: [
    ['Actual spend', 3], ['Savings', 3], ['Agent calls', 3], ['Tokens processed', 3], ['Delegation Quality', 3],
    ['Runs per day', 12], ['Tokens per day', 12], ['Model usage', 12], ['Tier mix', 12],
  ],
  // Each chart takes the full row; under "More usage" each chart is its own panel, then the model-by-day table (part 17).
  usage: [
    ['Savings per day', 12], ['Savings by model', 12], ['Spend by model', 12], ['Tokens per day', 12],
    ['Cost per run', 12], ['Tokens by model', 12], ['Cost by route', 12], ['Usage by model and day', 12],
  ],
};
const HEADLINE_STRIP = new Set(['Actual spend', 'Savings', 'Agent calls', 'Tokens processed', 'Delegation Quality']);
/** The preserved panel set, plus the approved OMN-19988 Environment addition; each appears once. */
// D2 (Lakshman2026-10-20): all secondary metrics remain on Overview in its native disclosure.
const BEFORE: Record<PageName, string[]> = {
  // OMN-21166 Maple grid: "Activity trends" is drawn as its three slices, each once.
  // Live review 2026-10-25: Overview draws the four headline cards, recent runs, quality, runs and tokens per day and
  // tier mix; Environment and the "Additional runtime metrics" panels are not drawn there.
  overview: ['Actual spend', 'Savings', 'Agent calls', 'Tokens processed', 'Delegation Quality', 'Runs per day', 'Tokens per day', 'Model usage', 'Tier mix'].sort(),
  // OMN-21166 Maple grid: Usage insights is drawn as Spend by model and, under "More usage", one panel per chart (part 17:
  // Cost per run, Tokens by model, Cost by route); the day-by-day token list is gone (the table holds its rows).
  usage: ['Savings per day', 'Savings by model', 'Tokens per day', 'Spend by model', 'Cost per run', 'Tokens by model', 'Cost by route',
    'Usage by model and day'].sort(),
};

async function panels(pageName: PageName): Promise<Array<[string, number]>> {
  const { container } = render(<LocalDashboardPage pageName={pageName} />);
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  return [...container.querySelectorAll('article.local-dashboard-panel')].map((panel) => [
    panel.querySelector(':scope > h2')?.textContent ?? '', Number(panel.getAttribute('data-width')),
  ]);
}

beforeEach(() => { vi.useFakeTimers({ now: new Date('2026-10-13T12:00:00Z') }); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe.each(['overview', 'usage'] as const)('OMN-21015: %s puts its charts first', (pageName) => {
  it('Y1: the panels are drawn in the order that puts the charts at the top, each at its declared width', async () => {
    expect(await panels(pageName)).toEqual(RENDERED_ORDER[pageName]);
  });

  it('Y2: it is the same set of panels as before, each once', async () => {
    expect((await panels(pageName)).map(([title]) => title).sort()).toEqual(BEFORE[pageName]);
  });

  it('Y3: every row of panels fills the twelve columns exactly', async () => {
    const rows: number[] = [];
    let open = 0;
    for (const [title, width] of (await panels(pageName)).filter(([title]) => !HEADLINE_STRIP.has(title))) {
      expect(`${title}: ${open + width <= 12 ? 'fits its row' : 'OVERFLOWS its row'}`).toBe(`${title}: fits its row`);
      open += width;
      if (open === 12) { rows.push(open); open = 0; }
    }
    expect(open).toBe(0);
    expect(rows.every((sum) => sum === 12)).toBe(true);
  });

  it('Y4: every declared width has a rule in the stylesheet', async () => {
    const css = readFileSync('src/styles/local-dashboard.css', 'utf8');
    const widths = [...new Set((await panels(pageName)).map(([, width]) => width))].filter((width) => width !== 12);
    for (const width of widths) {
      expect(`width ${width}: ${new RegExp(`\\.local-dashboard-panel\\[data-width='${width}'\\]\\s*\\{\\s*grid-column:\\s*span ${width};`).test(css)}`).toBe(`width ${width}: true`);
    }
  });

  it('Y5: the preserved flat page declaration matches its contracts, with no gap or overlap', () => {
    const page = JSON.parse(readFileSync(`src/pages/local/${pageName}.page.yaml`, 'utf8')) as { widgets: Array<{ title: string; row: number; col: number; width: number; height: number }> };
    const contracts = JSON.parse(readFileSync(`src/pages/local/${pageName}.contracts.yaml`, 'utf8')) as { components: Array<{ title: string }> };
    const byPosition = [...page.widgets].sort((a, b) => a.row - b.row || a.col - b.col);
    expect(byPosition.map((widget) => widget.title)).toEqual(contracts.components.map((component) => component.title));
    expect(byPosition.map((widget) => [widget.title, widget.width])).toEqual(ORDER[pageName]);
    // Within a row the columns follow each other; a new row starts at column 0, below the tallest panel of the last.
    let col = 0;
    let row = 0;
    let tallest = 0;
    for (const widget of byPosition) {
      if (col === 12) { col = 0; row += tallest; tallest = 0; }
      expect([widget.title, widget.row, widget.col]).toEqual([widget.title, row, col]);
      col += widget.width;
      tallest = Math.max(tallest, widget.height);
    }
  });
});

describe('OMN-21015: the wide run tables keep to what their panel holds', () => {
  it('Y6: the stylesheet cuts a run id at 7ch or less, and gives these tables no header letter spacing and a slim pill', () => {
    const css = readFileSync('src/styles/local-dashboard.css', 'utf8');
    const rule = (selector: string) => {
      const found = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].filter(([, sel]) => sel!.replace(/\/\*[\s\S]*?\*\//g, '').trim() === selector).map(([, , body]) => body!);
      expect(`${selector}: ${found.length} rule(s)`).toBe(`${selector}: 1 rule(s)`);
      return found[0]!;
    };
    const cut = /max-width:\s*([\d.]+)ch/.exec(rule('.local-dashboard-table-wrap--fit .local-dashboard-cell-token a'));
    expect(cut).not.toBeNull();
    expect(Number(cut![1])).toBeLessThanOrEqual(7);
    expect(rule('.local-dashboard-table-wrap--fit th')).toMatch(/letter-spacing:\s*0\s*;/);
    const padding = /padding:\s*[\d.]+px\s+([\d.]+)px/.exec(rule('.local-dashboard-table-wrap--fit .local-run-pill'));
    expect(padding).not.toBeNull();
    expect(Number(padding![1])).toBeLessThanOrEqual(6);
  });
});

describe('OMN-21015: the newest run answers "is delegation working?" first', () => {
  const run = (passed: boolean) => ({
    correlation_id: 'run-a', written_at: '2026-10-13T10:00:00Z', created_at: '2026-10-13T10:00:00Z', model_name: 'local-model',
    quality_gate_passed: passed, quality_gate_detail: passed ? 'completed' : 'quality_gate_failed', terminal_ok: passed,
    latency_ms: 700, tokens_input: 250, tokens_output: 13, task_type: 'document', cost_tier_name: 'local', actual_score: 1,
    backend_id: 'local-coder', host: 'lab-host',
  });
  const labels = (container: HTMLElement) => [...container.querySelectorAll('dt')].map((term) => term.textContent);

  it('Y7: a passed run leads with Status, Model, Age', () => {
    const { container } = render(<LastRunCard decisions={[run(true)]} sessions={[]} now={Date.parse('2026-10-13T12:00:00Z')} />);
    expect(labels(container).slice(0, 3)).toEqual(['Status', 'Model', 'Age']);
    expect(labels(container)).toHaveLength(14);
  });

  it('Y7: a failed run leads with Status, Cause, Model, Age', () => {
    const { container } = render(<LastRunCard decisions={[run(false)]} sessions={[]} now={Date.parse('2026-10-13T12:00:00Z')} />);
    expect(labels(container).slice(0, 4)).toEqual(['Status', 'Cause', 'Model', 'Age']);
    expect(labels(container)).toHaveLength(15);
  });
});
