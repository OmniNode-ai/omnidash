// @vitest-environment jsdom
/**
 * OMN-22168 AC3: one chart kit in src/design-system/charts, imported by every page chart. Written before the kit.
 * Each case names the failure it catches; every chart's not-recorded and empty states are covered, not only its data.
 *
 *   K1  a value that is not served is drawn as a 0 bar, a 0 point or a 0 label, instead of no mark;
 *   K2  a chart with nothing to draw renders an empty frame (axes, $0 ticks) and says nothing;
 *   K3  the readout (the chart's tooltip) moves the chart: it must keep its line at rest and fill on hover or focus;
 *   K4  hover works but keyboard focus does not, or the readout never clears when the pointer leaves;
 *   K5  the last shown series can be turned off, leaving an empty chart, or a toggle does not say whether it is on;
 *   K6  a legend names a series without its swatch, or a swatch without its name (colour as the only label);
 *   K7  day labels collide: more ticks than fit, or the last day left unnamed;
 *   K8  a line joins across a missing day, inventing values for it;
 *   K9  shares that add up to more than one whole are drawn as one ring;
 *   K10 a meter is drawn for a value off its scale;
 *   K11 heights or widths are scaled against something other than the largest served value.
 */
import { act, cleanup, fireEvent, render, renderHook, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('echarts-for-react/lib/core', () => ({ default: () => <div data-testid="served-chart" /> }));

import {
  BarSparkline, BarTrack, ChartCard, ChartEmpty, ChartNotRecorded, ChartReadout, CostQualityScatter, DayColumns, dayTicks,
  EVERY_SERIES_HIDDEN, GroupedBars, Histogram, HourHeatmap, LinePlot, linePath, Meter, NamedByPanel, RankedBars,
  SeriesLegend, SeriesToggles, SpendByDayChart, TierMix, useSeriesToggles,
} from '@/design-system/charts';

afterEach(cleanup);

describe('frame: card, readout, empty and not-recorded states', () => {
  it('a card is a figure named by its title; inside a panel that names it, the title is hidden but still names it', () => {
    const { rerender } = render(<ChartCard title="Runs per day" concept="runs-daily" delay={0}><p>plot</p></ChartCard>);
    expect(screen.getByRole('figure', { name: 'Runs per day' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Runs per day' })).toBeVisible();
    rerender(<NamedByPanel.Provider value><ChartCard title="Runs per day" concept="runs-daily" delay={0}><p>plot</p></ChartCard></NamedByPanel.Provider>);
    expect(screen.getByRole('figure', { name: 'Runs per day' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Runs per day' })).toBeNull();
  });

  it('K3: the readout keeps its line at rest, fills when active, and renders nothing for null', () => {
    const { container, rerender } = render(<ChartReadout testId="r" text="" active={false} />);
    const line = screen.getByTestId('r');
    expect(line).toHaveTextContent('');
    expect(line).toHaveAttribute('aria-live', 'polite');
    expect(line.className).not.toContain('ins-readout--active');
    rerender(<ChartReadout testId="r" text="Oct 13 · 4 runs" active />);
    expect(screen.getByTestId('r')).toHaveTextContent('Oct 13 · 4 runs');
    expect(screen.getByTestId('r').className).toContain('ins-readout--active');
    rerender(<ChartReadout testId="r" text={null} active={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('K2: the empty state is said in words; in a panel it is a status', () => {
    const { rerender } = render(<ChartEmpty>No failed runs in this window</ChartEmpty>);
    expect(screen.getByText('No failed runs in this window')).toBeInTheDocument();
    expect(screen.queryByRole('status')).toBeNull();
    rerender(<ChartEmpty status>Nothing served</ChartEmpty>);
    expect(screen.getByRole('status')).toHaveTextContent('Nothing served');
  });

  it('K1: the not-recorded state names what was not drawn', () => {
    render(<ChartNotRecorded data-testid="nr">Not drawn: a, b</ChartNotRecorded>);
    expect(screen.getByTestId('nr')).toHaveTextContent('Not drawn: a, b');
  });
});

describe('legend', () => {
  it('K5: toggles say whether each series is shown, and the last shown series stays on', () => {
    const { result } = renderHook(() => useSeriesToggles(['passed', 'failed']));
    expect(result.current.shown).toEqual({ passed: true, failed: true });
    act(() => result.current.toggle('passed'));
    expect(result.current.shown).toEqual({ passed: false, failed: true });
    act(() => result.current.toggle('failed'));
    expect(result.current.shown, 'the last shown series cannot be turned off').toEqual({ passed: false, failed: true });
    act(() => result.current.toggle('passed'));
    expect(result.current.shown).toEqual({ passed: true, failed: true });
  });

  it('K5/K6: toggle buttons are pressed per series, carry a swatch and a name, and call back with their key', () => {
    const onToggle = vi.fn();
    render(<SeriesToggles label="Series" onToggle={onToggle} series={[
      { key: 'passed', label: 'Passed', color: 'var(--ds-ok)', tone: 'pass', shown: true },
      { key: 'failed', label: 'Failed', color: 'var(--ds-bad)', tone: 'fail', shown: false },
    ]} />);
    const group = screen.getByRole('group', { name: 'Series' });
    expect(within(group).getByRole('button', { name: 'Passed' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(group).getByRole('button', { name: 'Failed' })).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(within(group).getByRole('button', { name: 'Failed' }));
    expect(onToggle).toHaveBeenCalledWith('failed');
    expect(within(group).getByRole('button', { name: 'Failed' })).toHaveStyle({ '--ins-swatch': 'var(--ds-bad)' });
  });

  it('K6: a static legend names every series beside its swatch', () => {
    render(<SeriesLegend label="Token series" series={[{ label: 'Tokens in', color: 'var(--ds-field-tokens-in)', tone: 'tokens-in' }, { label: 'Tokens out', color: 'var(--ds-field-tokens-out)' }]} />);
    const items = within(screen.getByRole('list', { name: 'Token series' })).getAllByRole('listitem');
    expect(items.map(item => item.textContent)).toEqual(['Tokens in', 'Tokens out']);
    for (const item of items) expect(item.querySelector('i')).not.toBeNull();
    expect(items[0]).toHaveAttribute('data-field-tone', 'tokens-in');
  });
});

describe('daily bars', () => {
  const days = [
    { key: '2026-10-01', ariaLabel: 'Oct 1: 4 passed, 0 failed', tick: true, values: [
      { key: 'passed', value: 4, color: 'var(--ds-ok)', label: '4' }, { key: 'failed', value: 0, color: 'var(--ds-bad)', label: '0' }] },
    { key: '2026-10-02', ariaLabel: 'Oct 2: not recorded', tick: false, values: [
      { key: 'passed', value: null, color: 'var(--ds-ok)', label: '' }, { key: 'failed', value: 2, color: 'var(--ds-bad)', label: '2' }] },
  ];

  it('K1/K11: a value not served and a zero draw no bar and no number; heights are against the largest value', () => {
    render(<DayColumns label="Runs per day" days={days} max={4} hover={null} onHover={() => {}} dayLabel={key => key.slice(5)} />);
    const [first, second] = screen.getAllByRole('button');
    expect(first!.querySelector('[data-series="failed"] .gdb-bar')).toBeNull();
    expect(first!.querySelector('[data-series="failed"] .gdb-val')).toBeNull();
    expect(second!.querySelector('[data-series="passed"] .gdb-bar')).toBeNull();
    expect(second!.querySelector('[data-series="passed"] .gdb-val')).toBeNull();
    expect(first!.querySelector('[data-series="passed"] .gdb-bar')).toHaveStyle({ height: '100%' });
    expect(second!.querySelector('[data-series="failed"] .gdb-bar')).toHaveStyle({ height: '50%' });
  });

  it('K4/K7: hover and focus both point at a day, leaving clears it, ticks label only their days, a click opens the day', () => {
    const onHover = vi.fn();
    const onOpen = vi.fn();
    render(<DayColumns label="Runs per day" days={days} max={4} hover={0} onHover={onHover} onOpen={onOpen} dayLabel={key => key.slice(5)} />);
    const [first, second] = screen.getAllByRole('button');
    fireEvent.mouseEnter(second!);
    expect(onHover).toHaveBeenLastCalledWith(1);
    fireEvent.focus(first!);
    expect(onHover).toHaveBeenLastCalledWith(0);
    fireEvent.mouseLeave(screen.getByRole('group', { name: 'Runs per day' }));
    expect(onHover).toHaveBeenLastCalledWith(null);
    expect(first!.querySelector('.gdb-day-label')).toHaveTextContent('10-01');
    expect(second!.querySelector('.gdb-day-label')).toHaveTextContent('');
    expect(second).toHaveAttribute('data-dim', 'true');
    fireEvent.click(second!);
    expect(onOpen).toHaveBeenCalledWith('2026-10-02');
  });

  it('K7: day ticks never exceed the limit, always name the last day, and never sit beside it', () => {
    const month = Array.from({ length: 30 }, (_, i) => ({ day: `d${i}` }));
    const ticks = [...dayTicks(month, 8)].sort((a, b) => a - b);
    expect(ticks.length).toBeLessThanOrEqual(8);
    expect(ticks.at(-1)).toBe(29);
    expect(29 - ticks.at(-2)!).toBeGreaterThanOrEqual(Math.ceil(30 / 8));
    expect(dayTicks([], 8).size).toBe(0);
  });

  it('K1: a histogram bucket with no runs draws no bar; each bucket is named', () => {
    render(<Histogram label="Duration buckets" hover={null} onHover={() => {}} color="var(--ds-field-duration)"
      buckets={[{ key: 'a', ariaLabel: 'Under 1 s: 3 runs', value: 3 }, { key: 'b', ariaLabel: '1 to 2 s: no runs', value: 0 }]} />);
    expect(screen.getByRole('button', { name: 'Under 1 s: 3 runs' }).querySelector('.gdb-bar')).toHaveStyle({ height: '100%' });
    expect(screen.getByRole('button', { name: '1 to 2 s: no runs' }).querySelector('.gdb-bar')).toBeNull();
  });
});

describe('ranked and grouped bars (model usage)', () => {
  it('K1: an unserved value is an outline, named not measured, after the ranked bars', () => {
    render(<RankedBars label="Runs by model" unit="Runs" order="desc" items={[
      { key: 'a', name: 'a', value: 2, display: '2', basis: 'measured', color: 'var(--ds-chart-1)' },
      { key: 'b', name: 'b', value: null, display: 'Not measured', basis: 'measured', color: 'var(--ds-chart-2)' },
      { key: 'c', name: 'c', value: 5, display: '5', basis: 'measured', color: 'var(--ds-chart-3)' },
    ]} />);
    const bars = screen.getAllByRole('listitem');
    expect(bars.map(bar => bar.getAttribute('aria-label'))).toEqual(['c: 5, measured', 'a: 2, measured', 'b: Not measured, not measured']);
    expect(bars[2]!.querySelector('[data-pattern="outline"]')).not.toBeNull();
  });

  it('K1/K6: a grouped value not served shows neither number nor bar; the legend names each series', () => {
    render(<GroupedBars label="Tokens by model" legend={[{ label: 'In', color: 'var(--ds-chart-1)' }]} groups={[
      { key: 'm', name: 'm', label: 'm: 10 in, out not recorded', values: [
        { key: 'in', value: 10, display: '10', color: 'var(--ds-chart-1)' }, { key: 'out', value: null, display: '', color: 'var(--ds-chart-2)' }] },
    ]} />);
    const group = screen.getByRole('listitem', { name: 'm: 10 in, out not recorded' });
    expect(group.querySelector('[data-series="out"] .gdb-val')).toBeNull();
    expect(group.querySelector('[data-series="out"] .gdb-bar')).toBeNull();
    expect(screen.getByRole('list', { name: 'Series' })).toHaveTextContent('In');
  });
});

describe('stacked spend bars', () => {
  // The chart plots only currency columns, as the page's declared columns are (charts.tsx before the kit did the same).
  const COLUMNS = [{ key: 'window_start', header: 'Day' }, { key: 'spend_usd', header: 'Spend', format: 'currency' }];
  it('K2: no served day rows draws nothing', () => {
    const { container } = render(<SpendByDayChart rows={[]} columns={COLUMNS} />);
    expect(container).toBeEmptyDOMElement();
  });
  it('K5: with every series hidden the chart says why instead of drawing an empty plot', () => {
    render(<SpendByDayChart columns={COLUMNS} rows={[{ window_kind: 'day', window_start: '2026-10-01', baseline_model: 'm', spend_usd: '0.1' }]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Spend' }));
    expect(screen.getByRole('status')).toHaveTextContent(EVERY_SERIES_HIDDEN);
    expect(screen.queryByTestId('served-chart')).toBeNull();
  });
});

describe('line, sparkline, heatmap, scatter', () => {
  it('K8: a missing day breaks the line into two runs; a flat line still has height', () => {
    expect(linePath([10, null, 20, 30], 0, 100, 300, 120).match(/M/g)).toHaveLength(2);
    expect(linePath([50, 50], 50, 50, 100, 120)).not.toContain('NaN');
  });

  it('K4/K8: the line plot names every day, marks the pointed day, and draws no dot for a day without a value', () => {
    const onHover = vi.fn();
    const { container } = render(<LinePlot label="Pass rate per day" values={[90, null, 80]} min={70} max={100} hover={2} onHover={onHover}
      labels={['a', 'b', 'c']} keys={['d1', 'd2', 'd3']} color="var(--ds-ok)" />);
    expect(container.querySelectorAll('.ins-dot')).toHaveLength(2);
    expect(container.querySelector('.ins-marker')).toHaveStyle({ left: '100%' });
    fireEvent.focus(screen.getByRole('button', { name: 'b' }));
    expect(onHover).toHaveBeenLastCalledWith(1);
  });

  it('K1: a sparkline day not covered by the sample has no height and says so', () => {
    render(<BarSparkline label="m: runs per day" days={[
      { key: 'd1', value: null, title: 'd1: not covered' }, { key: 'd2', value: 2, title: 'd2: 2 runs' }, { key: 'd3', value: 4, title: 'd3: 4 runs' }]} />);
    const marks = screen.getByRole('img', { name: 'm: runs per day' }).querySelectorAll('i');
    expect(marks[0]).toHaveAttribute('data-covered', 'false');
    expect(marks[0]!.getAttribute('style')).toBeNull();
    expect(marks[1]).toHaveStyle({ '--spark-height': '50%' });
  });

  it('K4: the hour heatmap is worked with arrow keys and reports the cell inspected', () => {
    const onInspect = vi.fn();
    render(<HourHeatmap label="Runs by hour" rows={[{ key: 'd1', label: 'Mon' }]} counts={[Array.from({ length: 24 }, (_, h) => (h === 3 ? 4 : 0))]}
      cellLabel={(row, hour) => `Mon ${hour}`} onInspect={onInspect} />);
    const first = screen.getByRole('button', { name: 'Mon 0' });
    fireEvent.focus(first);
    expect(onInspect).toHaveBeenLastCalledWith([0, 0]);
    fireEvent.keyDown(first, { key: 'ArrowRight' });
    expect(screen.getByRole('button', { name: 'Mon 1' })).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Mon 3' }).getAttribute('style')).toContain('100%');
    expect(screen.getByRole('button', { name: 'Mon 2' }).getAttribute('style')).toBeNull();
  });

  it('K2: a scatter with nothing measured draws no axes and lists what could not be drawn', () => {
    const { container } = render(<CostQualityScatter label="Cost versus quality per model" points={[]} unplotted={['a', 'b']} formatCost={String} />);
    expect(container.querySelector('svg')).toBeNull();
    expect(screen.getByText(/No model has both a measured cost and a verdict yet: a, b/)).toBeInTheDocument();
  });

  it('K4: a scatter point says its detail on focus as on hover', () => {
    render(<CostQualityScatter label="Cost versus quality per model" formatCost={value => `$${value}`} unplotted={[]}
      points={[{ key: 'm', name: 'm', cost: 0.5, rate: 0.8, runs: 3, color: 'var(--ds-chart-1)', detail: 'm: $0.5 per run' }]} />);
    fireEvent.focus(screen.getByRole('img', { name: 'm: $0.5 per run' }));
    expect(document.querySelector('[data-quality-readout]')).toHaveTextContent('m: $0.5 per run');
  });
});

describe('tier mix, meters and tracks', () => {
  const name = (tier: string) => tier.toUpperCase();
  it('K9: shares over one whole are refused in words, not drawn', () => {
    render(<TierMix nameOf={name} shares={{ segments: [{ name: 'local', share: 0.8, count: 8 }, { name: 'claude', share: 0.5, count: 5 }], unmeasured: [] }} />);
    expect(screen.getByRole('status')).toHaveTextContent('more than the whole');
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('K1/K2: each slice sweeps its served share; an unserved tier is named, not guessed; nothing served draws nothing', () => {
    const { container, rerender } = render(<TierMix nameOf={name} shares={{ segments: [{ name: 'local', share: 0.25, count: 1 }], unmeasured: ['claude'] }} />);
    expect(screen.getByTestId('tier-segment')).toHaveAttribute('data-sweep', '0.25');
    expect(screen.getByText('No share served for: CLAUDE')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Inspect LOCAL' }));
    // One decimal, as percent() and src/pages/local/shares.omn21015.test.tsx have it (AC7: no displayed value changes).
    expect(screen.getByRole('status')).toHaveTextContent('25.0% of tier-routed runs');
    rerender(<TierMix nameOf={name} shares={{ segments: [], unmeasured: [] }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('K10: a meter states its value, marks a threshold, and is not drawn off its scale', () => {
    const { container, rerender } = render(<Meter className="m" label="Quality" min={0} max={1} now={0.6} share={0.6} mark={0.8} valueText="0.6 of 0.8" />);
    const meter = screen.getByRole('meter', { name: 'Quality' });
    expect(meter).toHaveAttribute('aria-valuenow', '0.6');
    expect(meter.querySelector('span')).toHaveStyle({ width: '60%' });
    expect(meter.querySelector('i')).toHaveStyle({ left: '80%' });
    rerender(<Meter className="m" label="Quality" min={0} max={1} now={1.4} share={1.4} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('K11: a track fills its share of the largest value', () => {
    const { container } = render(<BarTrack share={0.25} delay={60} />);
    expect(container.querySelector('.ins-fill')).toHaveStyle({ width: '25%', animationDelay: '60ms' });
  });
});
