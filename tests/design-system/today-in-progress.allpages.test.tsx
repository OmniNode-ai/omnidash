// SPDX-FileCopyrightText: 2026 OmniNode.ai Inc.
// SPDX-License-Identifier: MIT
// @vitest-environment jsdom
// OMN-23330 AC35 (operator, chat 2026-11-11: chosen from a benchmark of 20 open-source dashboards): on every daily chart
// today's UTC day, while it is in progress, is drawn distinctly (a dashed segment into today on a line, a lighter bar on a
// bar chart) and its readout says "Today so far"; finished days are drawn as before. Fixed clock: 2026-11-11 12:00Z.
// Failure modes:
//   P1  today is drawn as a finished day (no mark, solid line into it);
//   P2  a finished day is marked in progress;
//   P3  the readout for today does not say "Today so far", or a finished day's does;
//   P4  the kit stylesheet does not lighten the marked day or dash the segment.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { render } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { BarSparkline, ChartReadout, CumulativeColumns, DayColumns, LinePlot, MultiLinePlot, SpendColumns, isTodayInProgress } from '@/theme/design-system/charts';

const TODAY = '2026-11-11';
const YESTERDAY = '2026-11-10';
beforeAll(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-11T12:00:00Z')); });
afterAll(() => { vi.useRealTimers(); });
const none = () => undefined;
const marked = (container: HTMLElement) => [...container.querySelectorAll('[data-in-progress="true"]')].map(el => el.getAttribute('data-day') ?? el.getAttribute('aria-label'));

describe('OMN-23330 AC35: today in progress is drawn and read distinctly', () => {
  it('P1 P2: only today (UTC) is in progress', () => {
    expect(isTodayInProgress(TODAY)).toBe(true);
    expect(isTodayInProgress(YESTERDAY)).toBe(false);
    expect(isTodayInProgress('2026-11-12')).toBe(false);
  });

  it('P1 P2: bar charts mark today\'s column and no other', () => {
    const days = [YESTERDAY, TODAY];
    const columns = render(<DayColumns label="Runs per day" max={10} hover={null} onHover={none} dayLabel={k => k}
      days={days.map(key => ({ key, ariaLabel: key, tick: true, values: [{ key: 'runs', value: 5, color: 'red', label: '5' }] }))} />);
    expect(marked(columns.container)).toEqual([TODAY]);
    columns.unmount();
    const spend = render(<SpendColumns label="Spend" max={10} onHover={none}
      days={days.map(key => ({ key, ariaLabel: key, dayText: key, valuesText: '', spend: 1, saved: 1, baseline: null }))} />);
    expect(marked(spend.container)).toEqual([TODAY]);
    spend.unmount();
    const cumulative = render(<CumulativeColumns label="Saved" max={10} onHover={none} days={days.map(key => ({ key, ariaLabel: key, value: 2 }))} />);
    expect(marked(cumulative.container)).toEqual([TODAY]);
    cumulative.unmount();
    const spark = render(<BarSparkline label="Runs" days={days.map(key => ({ key, value: 3, title: key }))} />);
    expect(marked(spark.container)).toEqual([TODAY]);
    spark.unmount();
  });

  it('P1 P2: a line into today is dashed for its last segment only, and not when the last day is finished', () => {
    const multi = (keys: string[]) => render(<MultiLinePlot label="Daily trend" keys={keys} labels={keys} hover={null} onHover={none}
      lines={[{ key: 'runs', color: 'red', values: [1, 3, 2] }]} />);
    const live = multi(['2026-11-09', YESTERDAY, TODAY]);
    expect(live.container.querySelectorAll('path.od-today').length).toBe(1);
    live.unmount();
    const done = multi(['2026-11-08', '2026-11-09', YESTERDAY]);
    expect(done.container.querySelectorAll('path.od-today').length).toBe(0);
    done.unmount();
    const single = render(<LinePlot label="Pass rate" keys={['2026-11-09', YESTERDAY, TODAY]} labels={['a', 'b', 'c']} values={[0.5, 0.7, 0.6]}
      min={0} max={1} hover={null} onHover={none} color="green" />);
    expect(single.container.querySelectorAll('path.od-today').length).toBe(1);
    single.unmount();
  });

  it('P3: the readout of today says "Today so far"; a finished day\'s does not', () => {
    const today = render(<ChartReadout active day={TODAY} text="Nov 11 · 2 runs" />);
    expect(today.container.textContent).toMatch(/^Today so far · Nov 11 · 2 runs$/);
    today.unmount();
    const byDefault = render(<ChartReadout active={false} day={TODAY} text="Nov 11 · 2 runs" />);
    expect(byDefault.container.textContent).toMatch(/^Today so far · /);
    byDefault.unmount();
    const past = render(<ChartReadout active day={YESTERDAY} text="Nov 10 · 9 runs" />);
    expect(past.container.textContent).toBe('Nov 10 · 9 runs');
    past.unmount();
  });

  it('P4: the kit stylesheet lightens a marked day and dashes the segment into today', () => {
    const css = readFileSync(path.resolve(__dirname, '../../src/theme/design-system/charts/day-axis.css'), 'utf8');
    expect(css).toMatch(/\[data-in-progress="true"\][^{]*\{[^}]*opacity:\s*0?\.\d+/);
    expect(css).toMatch(/\.od-today[^{]*\{[^}]*stroke-dasharray/);
  });
});
