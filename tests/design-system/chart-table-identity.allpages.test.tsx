// SPDX-FileCopyrightText: 2026 OmniNode.ai Inc.
// SPDX-License-Identifier: MIT
// @vitest-environment jsdom
// OMN-23330 AC37 follow-up (operator review of the live Overview, 2026-11-11): a chart's table must read like the Runs
// table, every column with its field's icon and colour, values written as the pages write them, and the view switch in
// two colours, one for the chart and one for the table. Seen live on the Daily trend table: headers "TOKENS-IN" and
// "TOKENS-OUT" (the series keys), days "2026-09-29", savings "0.0006" and spend "0" with no currency, a grey single
// "Show as table" text button.
// Failure modes:
//   I1  a header shows a series key ("tokens-in") instead of its label;
//   I2  a known field's header has no icon or no field tone;
//   I3  a value cell does not wear its column's field tone;
//   I4  money is written without its currency, or with cents lost ("0.0006", "0");
//   I5  a day is written as the served ISO date instead of the pages' short day;
//   I6  a share is written as a fraction ("0.7000") instead of a percent;
//   I7  a not-recorded cell is not marked unavailable, so it wears the field colour like a real value;
//   I8  the view switch is one button, or chart and table share one colour.
//   I9  the chart's day labels stay drawn under the table (seen live 2026-11-11: "Sep 29 ... Nov 11" below the rows).
//   I10 a column header has no tooltip saying what the column holds, as the Runs table's headers do (operator
//       2026-11-11), or the tooltip cannot be reached by keyboard.
//   I11 a column named only "in" or "out" (Tokens per day) loses its token field, or a column with no name (Runs by
//       tier, seen live 2026-11-11) shows an empty header.
//   I12 a ranked-bar table writes a rounded figure and its share in one cell ("2.92K · 94.0%", seen live on Model
//       usage) under a generic "Name" header, instead of the exact count and the share in their own columns.
//   I13 a named row (a tier, a model) is written in plain ink in its table although its bar wears its own colour
//       (operator 2026-11-11 on the Tier mix table: "colored and use one design system").
//   I14 the table does not fill its panel (operator 2026-11-11: "table should be full width like before"), one column
//       takes all the spare width so the columns stand far apart ("why too much gap on columns"), or a long name is
//       cut instead of wrapping onto a taller row ("column will be dynamic and rows").
//   I15 a share has no colour of its own, or a different one per table (operator 2026-11-11: "one color for all place").
//   I16 a ranked-bar table of amounts (Evidence's cost against the baseline) keeps the generic "Name" header and the
//       chart's unit sentence as its value header, or its amounts lose their rows' colours; Evidence's Delegations by model
//       is not the Model usage table of Overview (operator 2026-11-11: "do the same in all other pages - one design system").
//   I17 a run's status is one colour whatever it says (seen live on Duration per run, 2026-11-11: "passed" and "failed"
//       both teal), not the pass and fail colours the Runs table's status pills wear.
//   I18 a ranked-bar table lists its rows in the served order while its chart ranks them (seen live on Evidence's
//       Delegations by model: 43 above 53), or a row's name loses its colour to the page-wide header rule.
//   I19 a row colour too light for its theme: measured live 2026-11-11 on Evidence in light, 16 of 32 row-coloured cells
//       under 4.5:1 (lowest 4.08) at a 75% mix; at 60% in light every one passes, dark keeps 75% (lowest 5.6).
//   I20 a ranked-bar table on Usage, Runs or Overview's headline keeps the generic "Name" header and the bar's run-on text
//       ("$0.10 · 3 runs · 25.0%"), or reformats a chart coordinate that is not the served figure (Usage's spend, a
//       pass rate on a 0 to 100 scale) instead of writing the bar's own exact text.
//   I21 a grouped-bar table keeps the generic "Name" row header (Usage's Cost per run by UTC day and Token counts by
//       model, live sweep 2026-11-11).
//   I22 the run timing table's name column is uncoloured (live sweep of Workflow, 2026-11-11).
//   I23 a day table lists the oldest day first, so today is at the bottom of a long scroll (operator 2026-11-11:
//       "current date should be top").
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('echarts-for-react/lib/core', () => ({ default: () => <div data-testid="served-chart" /> }));
import { GroupedBars, MultiLinePlot, RankedBars, RunDurationChart, RunTimingChart, TierMix } from '@/theme/design-system/charts';

afterEach(() => { cleanup(); sessionStorage.clear(); });
const none = () => undefined;
const DAYS = ['2026-09-29', '2026-09-30'];

function dailyTrendTable() {
  render(<MultiLinePlot label="Daily trend" keys={DAYS} labels={DAYS} hover={null} onHover={none} lines={[
    { key: 'runs', color: 'a', values: [2, null] },
    { key: 'tokens-in', color: 'b', values: [254, null] },
    { key: 'tokens-out', color: 'c', values: [12, null] },
    { key: 'spend', color: 'd', values: [0, null] },
    { key: 'savings', color: 'e', values: [0.0006, null] },
  ]} />);
  fireEvent.click(screen.getByRole('button', { name: 'Show as table: Daily trend' }));
  return screen.getByRole('table', { name: 'Daily trend as a table' });
}

describe('OMN-23330 AC37 follow-up: a chart table reads like the Runs table', () => {
  it('I1 I2: every header is a label with its field icon and tone', () => {
    const heads = within(dailyTrendTable()).getAllByRole('columnheader');
    expect(heads.map(head => head.textContent)).toEqual(['Day', 'Runs', 'Tokens in', 'Tokens out', 'Spend', 'Savings']);
    expect(heads.slice(1).map(head => head.getAttribute('data-field-tone'))).toEqual(['calls', 'tokens-in', 'tokens-out', 'cost', 'savings']);
    for (const head of heads) expect(head.querySelector('svg'), head.textContent ?? '').not.toBeNull();
  });

  it('I3 I4 I5 I7: values are written as the pages write them and wear their column tone', () => {
    // Newest day first (I23): Sep 30, not recorded, then Sep 29.
    const [second, first] = within(dailyTrendTable()).getAllByRole('row').slice(1);
    expect([...first!.querySelectorAll('th, td')].map(cell => cell.textContent)).toEqual(['Sep 29', '2', '254', '12', '$0.00', '$0.0006']);
    expect([...first!.querySelectorAll('td')].map(cell => cell.getAttribute('data-field-tone'))).toEqual(['calls', 'tokens-in', 'tokens-out', 'cost', 'savings']);
    for (const cell of first!.querySelectorAll('td')) expect(cell.getAttribute('data-field-unavailable')).toBe('false');
    for (const cell of second!.querySelectorAll('td')) {
      expect(cell.textContent).toBe('Not recorded');
      expect(cell.getAttribute('data-field-unavailable')).toBe('true');
    }
  });

  it('I6: a share is a percent', () => {
    render(<TierMix nameOf={t => (t === 'local' ? 'Local' : 'Cloud')}
      shares={{ segments: [{ name: 'local', share: 0.7, count: 70 }, { name: 'cloud', share: 0.3, count: 30 }], unmeasured: [] }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Show as table: Tier mix' }));
    const rows = within(screen.getByRole('table', { name: 'Tier mix as a table' })).getAllByRole('row').slice(1);
    expect(rows.map(row => [...row.querySelectorAll('th, td')].map(cell => cell.textContent))).toEqual([['Local', '70.0%', '70'], ['Cloud', '30.0%', '30']]);
  });

  it('I8: the view switch is two buttons, chart and table, each in its own colour', () => {
    render(<MultiLinePlot label="Daily trend" keys={DAYS} labels={DAYS} hover={null} onHover={none} lines={[{ key: 'runs', color: 'a', values: [2, 3] }]} />);
    const chart = screen.getByRole('button', { name: 'Show as chart: Daily trend' });
    const table = screen.getByRole('button', { name: 'Show as table: Daily trend' });
    expect(chart.getAttribute('aria-pressed')).toBe('true');
    expect(table.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(table);
    expect(screen.getByRole('button', { name: 'Show as chart: Daily trend' }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByRole('button', { name: 'Show as table: Daily trend' }).getAttribute('aria-pressed')).toBe('true');
    const css = readFileSync(path.resolve(__dirname, '../../src/theme/design-system/charts/chart-scroll.css'), 'utf8');
    const colourOf = (view: string) => new RegExp(`\\.ds-chart-view\\[data-view="${view}"\\]\\s*\\{[^}]*--view-ink:\\s*var\\((--[a-z0-9-]+)\\)`).exec(css)?.[1];
    expect(colourOf('chart')).toBeTruthy();
    expect(colourOf('table')).toBeTruthy();
    expect(colourOf('chart')).not.toBe(colourOf('table'));
  });

  it('I9: in table view the day labels drawn beside the chart are hidden', () => {
    const css = readFileSync(path.resolve(__dirname, '../../src/theme/design-system/charts/chart-scroll.css'), 'utf8');
    expect(css).toMatch(/\.ds-chart-table-frame\[data-as-table="true"\]\s*~\s*\.ds-day-axis\s*\{[^}]*display:\s*none/);
  });

  it('I10: every header explains its column on hover and on keyboard focus, as the Runs headers do', () => {
    const heads = within(dailyTrendTable()).getAllByRole('columnheader');
    const expected: Record<string, RegExp> = {
      Day: /UTC day/, Runs: /runs/i, 'Tokens in': /sent to the model/, 'Tokens out': /model returned/, Spend: /cost/, Savings: /baseline/,
    };
    for (const head of heads) {
      const anchor = head.querySelector<HTMLElement>('.ds-chart-table-head')!;
      expect(anchor.tabIndex, head.textContent ?? '').toBe(0);
      fireEvent.focus(anchor);
      const tip = screen.getByRole('tooltip');
      expect(tip.textContent, head.textContent ?? '').toMatch(expected[head.textContent ?? '']!);
      fireEvent.blur(anchor);
      fireEvent.mouseEnter(anchor.parentElement!);
      expect(screen.getByRole('tooltip').textContent).toBe(tip.textContent);
      fireEvent.mouseLeave(anchor.parentElement!);
      expect(screen.queryByRole('tooltip')).toBeNull();
    }
    // One look for every column-header tooltip, the Runs table's and every chart table's (operator 2026-11-11: "tool tip
    // should be same as runs table and use one design system always"): one kit rule, used by both.
    // The chart tables use the kit's ColumnTip, the one the Usage and Evidence tables use; it carries the kit class.
    expect(heads.every(head => head.querySelector('.local-column-tip.ds-column-tip') !== null)).toBe(true);
    const kit = readFileSync(path.resolve(__dirname, '../../src/theme/design-system/components/tooltip.css'), 'utf8');
    const tipRule = /\.ds-column-tip \.ds-tooltip:not\(#ds-important\)\s*\{([^}]*)\}/.exec(kit)?.[1] ?? '';
    for (const declaration of [/text-transform:\s*none/, /white-space:\s*normal/, /letter-spacing:\s*0/, /font-family:\s*var\(--ds-font-sans/,
      /line-height:\s*1\.4\b/, /max-width:\s*280px/, /border-top:[^;]*var\(--field-ink/])
      expect(tipRule).toMatch(declaration);
    const runs = readFileSync(path.resolve(__dirname, '../../src/pages/local/page-runs.tsx'), 'utf8');
    expect(runs.match(/className="local-runs-tip ds-column-tip"/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    // No second copy of the look anywhere else: only the kit rule paints a column tooltip's card.
    for (const file of ['src/theme/design-system/charts/chart-scroll.css', 'src/theme/design-system/kit/event-dash.css', 'src/theme/design-system/kit/editorial.css']) {
      const sheet = readFileSync(path.resolve(__dirname, '../..', file), 'utf8');
      expect(sheet, file).not.toMatch(/(local-column-tip|local-runs-tip|ds-chart-table thead) \.ds-tooltip[^{]*\{[^}]*background/);
    }
  });

  it('I11: "in" and "out" columns are the token fields, and a nameless column takes the chart\'s name', () => {
    render(<GroupedBars label="Tokens per day" legend={[]} groups={[{ key: 'a', name: 'Nov 8', label: 'Nov 8',
      values: [{ key: 'in', value: 10, display: '10', color: 'x' }, { key: 'out', value: 5, display: '5', color: 'y' }] }]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Show as table: Tokens per day' }));
    const tokens = within(screen.getByRole('table', { name: 'Tokens per day as a table' })).getAllByRole('columnheader');
    expect(tokens.slice(1).map(head => [head.textContent, head.getAttribute('data-field-tone')])).toEqual([['Tokens in', 'tokens-in'], ['Tokens out', 'tokens-out']]);
    cleanup();
    render(<RankedBars label="Runs by tier" unit="" items={[{ key: 'a', name: 'local', value: 3, display: '3', basis: 'measured', color: 'c' }]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Show as table: Runs by tier' }));
    const tiers = within(screen.getByRole('table', { name: 'Runs by tier as a table' })).getAllByRole('columnheader');
    expect(tiers[1]!.textContent).toBe('Runs by tier');
    expect(tiers[1]!.getAttribute('data-field-tone')).toBe('calls');
  });

  it('I12: a ranked-bar table can name its rows and gives the exact count and the share their own columns', () => {
    render(<RankedBars label="Runs by model" unit="" table={{ nameHeader: 'Model', countHeader: 'Runs' }} items={[
      { key: 'a', name: 'Qwen3.8-27B', value: 2920, count: 2920, share: 0.94, display: '2.92K · 94.0%', basis: 'measured', color: 'c' },
      { key: 'b', name: 'gemini', value: null, count: null, share: null, display: 'Not recorded', basis: 'measured', color: 'd' }]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Show as table: Runs by model' }));
    const table = screen.getByRole('table', { name: 'Runs by model as a table' });
    expect(within(table).getAllByRole('columnheader').map(head => [head.textContent, head.getAttribute('data-field-tone')]))
      .toEqual([['Model', 'model'], ['Runs', 'calls'], ['Share', 'share']]);
    expect(within(table).getAllByRole('row').slice(1).map(row => [...row.querySelectorAll('th, td')].map(cell => cell.textContent)))
      .toEqual([['Qwen3.8-27B', '2,920', '94.0%'], ['gemini', 'Not recorded', 'Not recorded']]);
  });

  it('I13: each named row and its share value wear the row\'s own colour, the one its bar wears', () => {
    render(<RankedBars label="Runs by tier" unit="" order="desc" table={{ nameHeader: 'Tier', countHeader: 'Runs' }} items={[
      { key: 'a', name: 'Local', value: 94, count: 2918, share: 0.94, display: '', basis: 'measured', color: 'rgb(1, 2, 3)' },
      { key: 'b', name: 'Cheap cloud', value: 2.4, count: 76, share: 0.024, display: '', basis: 'measured', color: 'rgb(4, 5, 6)' }]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Show as table: Runs by tier' }));
    const rows = within(screen.getByRole('table', { name: 'Runs by tier as a table' })).getAllByRole('row').slice(1);
    const colours = rows.map(row => {
      const [name, , share] = [...row.querySelectorAll<HTMLElement>('th, td')];
      return [name!.style.getPropertyValue('--row-ink'), name!.querySelector('.ds-chart-table-swatch') !== null, share!.style.getPropertyValue('--row-ink')];
    });
    // The share column's header wears the one share colour; each share value wears its row's colour (operator
    // 2026-11-11 on Model usage: "this should use models colors").
    expect(colours).toEqual([['rgb(1, 2, 3)', true, 'rgb(1, 2, 3)'], ['rgb(4, 5, 6)', true, 'rgb(4, 5, 6)']]);
    // Runs keeps its field colour; the row colour is for the row's own name and share.
    expect(rows[0]!.querySelectorAll('td')[0]!.getAttribute('data-field-tone')).toBe('calls');
  });

  it('I14: full width, columns weighted (a name column 2, every other 1), and a long name wraps onto a taller row', () => {
    render(<RankedBars label="Runs by model" unit="" table={{ nameHeader: 'Model', countHeader: 'Runs' }} items={[
      { key: 'a', name: 'nvidia/nemotron-3-ultra-550b-a55b:free', value: 43, count: 43, share: 0.014, display: '', basis: 'measured', color: 'c' }]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Show as table: Runs by model' }));
    const table = screen.getByRole('table', { name: 'Runs by model as a table' });
    expect([...table.querySelectorAll('colgroup > col')].map(col => (col as HTMLElement).style.width)).toEqual(['50%', '25%', '25%']);
    cleanup();
    dailyTrendTable();
    const daily = screen.getByRole('table', { name: 'Daily trend as a table' });
    expect(new Set([...daily.querySelectorAll('colgroup > col')].map(col => (col as HTMLElement).style.width)).size).toBe(1);
    const css = readFileSync(path.resolve(__dirname, '../../src/theme/design-system/charts/chart-scroll.css'), 'utf8');
    const rule = (selector: string) => new RegExp(`(^|\\n)${selector.replace(/[.[\]="]/g, m => `\\${m}`)}\\s*\\{([^}]*)\\}`).exec(css)?.[2] ?? '';
    expect(rule('.ds-chart-table')).toMatch(/(^|[^-])width:\s*100%/);
    expect(rule('.ds-chart-table-wrap')).not.toMatch(/fit-content/);
    expect(rule('.ds-chart-table tbody th[scope="row"]')).toMatch(/white-space:\s*normal/);
    expect(rule('.ds-chart-table tbody th[scope="row"]')).toMatch(/overflow-wrap:\s*anywhere/);
  });

  it('I15: one share colour, defined for both themes and given to every share column', () => {
    const tokens = readFileSync(path.resolve(__dirname, '../../src/theme/design-system/tokens.css'), 'utf8');
    expect(tokens.match(/--ds-field-share:/g)?.length).toBe(2);
    const tones = readFileSync(path.resolve(__dirname, '../../src/styles/field-identity.css'), 'utf8');
    expect(tones).toMatch(/\[data-field-tone="share"\]\s*\{\s*--field-ink:\s*var\(--ds-field-share\)/);
  });

  it('I16: an amounts table names its rows and its amounts, written as money in each row\'s colour', () => {
    render(<RankedBars label="Cost against the cloud baseline" unit="USD · baseline and saving modelled" order="desc" table={{ nameHeader: 'Measure', valueHeader: 'Amount (USD)', valueFrom: 'display' }} items={[
      { key: 'b', name: 'Cloud baseline cost', value: 25.29, display: '$25.29', basis: 'estimated', color: 'rgb(1, 2, 3)' },
      { key: 's', name: 'Saved', value: 0.000628, display: '$0.000628', basis: 'estimated', color: 'rgb(4, 5, 6)' }]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Show as table: Cost against the cloud baseline' }));
    const table = screen.getByRole('table', { name: 'Cost against the cloud baseline as a table' });
    expect(within(table).getAllByRole('columnheader').map(head => [head.textContent, head.getAttribute('data-field-tone')]))
      .toEqual([['Measure', null], ['Amount (USD)', 'cost']]);
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows.map(row => [...row.querySelectorAll('th, td')].map(cell => cell.textContent))).toEqual([['Cloud baseline cost', '$25.29'], ['Saved', '$0.000628']]);
    expect(rows.map(row => row.querySelector('td')!.style.getPropertyValue('--row-ink'))).toEqual(['rgb(1, 2, 3)', 'rgb(4, 5, 6)']);
    cleanup();
    render(<RankedBars label="Delegations by model" unit="" table={{ nameHeader: 'Model', countHeader: 'Delegations' }} items={[
      { key: 'a', name: 'Qwen3.8-27B', value: 2920, count: 2920, share: 0.94, display: '', basis: 'measured', color: 'rgb(7, 8, 9)' }]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Show as table: Delegations by model' }));
    const delegations = screen.getByRole('table', { name: 'Delegations by model as a table' });
    expect(within(delegations).getAllByRole('columnheader').map(head => head.getAttribute('data-field-tone'))).toEqual(['model', 'delegations', 'share']);
    expect([...within(delegations).getAllByRole('row')[1]!.querySelectorAll('th, td')].map(cell => cell.textContent)).toEqual(['Qwen3.8-27B', '2,920', '94.0%']);
  });

  it('I17: a passed run\'s status wears the pass colour and a failed run\'s the fail colour', () => {
    const run = (id: string, status: string) => ({ id, status, model: 'm', duration: 900, tokensIn: 1, tokensOut: 1 });
    render(<RunDurationChart runs={[run('aaaaaaaa1', 'passed'), run('bbbbbbbb2', 'failed'), run('cccccccc3', 'running')]} onOpen={none} />);
    fireEvent.click(screen.getByRole('button', { name: 'Show as table: Duration per run' }));
    const rows = within(screen.getByRole('table', { name: 'Duration per run as a table' })).getAllByRole('row').slice(1);
    expect(rows.map(row => row.querySelectorAll('td')[0]!.getAttribute('data-field-tone'))).toEqual(['pass', 'fail', 'run-outcome']);
  });

  it('I18: a ranked-bar table lists its rows in the order its chart draws them, and its row colour rule wins', () => {
    render(<RankedBars label="Delegations by model" unit="" order="desc" table={{ nameHeader: 'Model', countHeader: 'Delegations' }} items={[
      { key: 'q', name: 'qwen', value: 2922, count: 2922, share: 0.94, display: '', basis: 'measured', color: 'a' },
      { key: 'n', name: 'nemotron', value: 43, count: 43, share: 0.014, display: '', basis: 'measured', color: 'b' },
      { key: 'x', name: 'unknown-model', value: null, count: null, share: null, display: '', basis: 'measured', color: 'c' },
      { key: 'g', name: 'gemini', value: 53, count: 53, share: 0.017, display: '', basis: 'measured', color: 'd' }]} />);
    const drawn = [...document.querySelectorAll('li[data-ranked-item]')].map(item => item.getAttribute('data-ranked-item'));
    fireEvent.click(screen.getByRole('button', { name: 'Show as table: Delegations by model' }));
    const listed = within(screen.getByRole('table', { name: 'Delegations by model as a table' })).getAllByRole('row').slice(1)
      .map(row => row.querySelector('th')!.textContent);
    expect(listed).toEqual(['qwen', 'gemini', 'nemotron', 'unknown-model']);
    if (drawn.length > 0 && drawn.every(Boolean)) expect(drawn.length).toBe(listed.length);
    const css = readFileSync(path.resolve(__dirname, '../../src/theme/design-system/charts/chart-scroll.css'), 'utf8');
    // It must outrank the page-wide row-header rule, html body :is(.local-dashboard-page, main.ev-root[...]) table tbody
    // th[scope="row"]:not(#ds-important), specificity (1,3,6), which painted the names in ink live (2026-11-11): (1,4,3).
    expect(css).toMatch(/\.ds-chart-table-wrap > \.ds-chart-table > tbody > tr > th\[scope="row"\]\[data-row-color="true"\]:not\(#ds-important\)/);
  });

  it('I19: the row colour is mixed toward the ink by theme: at most 60% colour in light, 75% in dark', () => {
    const css = readFileSync(path.resolve(__dirname, '../../src/theme/design-system/charts/chart-scroll.css'), 'utf8');
    expect(css).toMatch(/color-mix\(in oklab, var\(--row-ink\) var\(--row-mix\), var\(--ds-ink\)\)/);
    const light = /\.ds-chart-table-wrap\s*\{[^}]*--row-mix:\s*(\d+)%/.exec(css)?.[1];
    const dark = /\[data-theme="dark"\] \.ds-chart-table-wrap\s*\{[^}]*--row-mix:\s*(\d+)%/.exec(css)?.[1];
    expect(Number(light)).toBeLessThanOrEqual(60);
    expect(Number(dark)).toBe(75);
  });

  it('I20: a table can take each bar\'s printed figure, or a value with its runs and share, under named headers', () => {
    render(<RankedBars label="Pass rate by model" unit="" order="desc" table={{ nameHeader: 'Model', valueHeader: 'Pass rate', valueFrom: 'display' }} items={[
      { key: 'a', name: 'qwen', value: 88.5, display: '89%', basis: 'measured', color: 'rgb(1, 2, 3)' }]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Show as table: Pass rate by model' }));
    const rate = screen.getByRole('table', { name: 'Pass rate by model as a table' });
    expect(within(rate).getAllByRole('columnheader').map(head => [head.textContent, head.getAttribute('data-field-tone')])).toEqual([['Model', 'model'], ['Pass rate', 'pass']]);
    expect([...within(rate).getAllByRole('row')[1]!.querySelectorAll('th, td')].map(cell => cell.textContent)).toEqual(['qwen', '89%']);
    cleanup();
    render(<RankedBars label="Cost per route" unit="" order="desc" table={{ nameHeader: 'Route', valueHeader: 'Cost (USD)', countHeader: 'Runs' }} items={[
      { key: 'l', name: 'local', value: 0.1, count: 3, share: 0.25, display: '$0.10 · 3 runs · 25.0%', basis: 'measured', color: 'rgb(4, 5, 6)' }]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Show as table: Cost per route' }));
    const route = screen.getByRole('table', { name: 'Cost per route as a table' });
    expect(within(route).getAllByRole('columnheader').map(head => [head.textContent, head.getAttribute('data-field-tone')]))
      .toEqual([['Route', 'routing'], ['Cost (USD)', 'cost'], ['Runs', 'calls'], ['Share', 'share']]);
    const cells = [...within(route).getAllByRole('row')[1]!.querySelectorAll<HTMLElement>('th, td')];
    expect(cells.map(cell => cell.textContent)).toEqual(['local', '$0.10', '3', '25.0%']);
    expect(cells.map(cell => cell.style.getPropertyValue('--row-ink'))).toEqual(['rgb(4, 5, 6)', 'rgb(4, 5, 6)', '', 'rgb(4, 5, 6)']);
  });

  it('I21: a grouped-bar table names its rows', () => {
    render(<GroupedBars label="Token counts by model" nameHeader="Model" legend={[]} groups={[{ key: 'a', name: 'qwen', label: 'qwen',
      values: [{ key: 'in', value: 10, display: '10', color: 'x' }, { key: 'out', value: 5, display: '5', color: 'y' }] }]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Show as table: Token counts by model' }));
    const heads = within(screen.getByRole('table', { name: 'Token counts by model as a table' })).getAllByRole('columnheader');
    expect(heads.map(head => [head.textContent, head.getAttribute('data-field-tone')])).toEqual([['Model', 'model'], ['Tokens in', 'tokens-in'], ['Tokens out', 'tokens-out']]);
  });

  it('I22: the run timing table names its timings in the timing colour', () => {
    render(<RunTimingChart timings={[{ key: 'q', label: 'Queue wait', value: 0 }, { key: 'e', label: 'Execution', value: 18400 }]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Show as table: Run timing' }));
    const heads = within(screen.getByRole('table', { name: 'Run timing as a table' })).getAllByRole('columnheader');
    expect(heads.map(head => [head.textContent, head.getAttribute('data-field-tone')])).toEqual([['Timing', 'timing'], ['Duration', 'duration']]);
  });

  it('I23: a day table lists the newest day first; rows that are not days keep their order', () => {
    const days = within(dailyTrendTable()).getAllByRole('row').slice(1).map(row => row.querySelector('th')!.textContent);
    expect(days).toEqual(['Sep 30', 'Sep 29']);
    cleanup();
    render(<TierMix nameOf={t => (t === 'local' ? 'Local' : 'Cloud')}
      shares={{ segments: [{ name: 'local', share: 0.7, count: 70 }, { name: 'cloud', share: 0.3, count: 30 }], unmeasured: [] }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Show as table: Tier mix' }));
    expect(within(screen.getByRole('table', { name: 'Tier mix as a table' })).getAllByRole('row').slice(1).map(row => row.querySelector('th')!.textContent))
      .toEqual(['Local', 'Cloud']);
  });
});
