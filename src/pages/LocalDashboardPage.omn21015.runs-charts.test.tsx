// @vitest-environment jsdom
// OMN-21015: the Runs page draws the runs it lists. Above the table, the listed runs' durations are bars coloured by
// each run's status, and their tokens in and out are bars side by side. They are the table's own rows, in the table's
// order, after the same filters and on the same page of the list; a bar opens its run on Workflow as the run id in
// its row does (Lakshman, chat 2026-10-13: charts on the MVP pages, interactive; "implement best dahsbaord?").
//
// Failure modes, each with a test below:
//   R1  runs are listed and a chart is missing;
//   R2  a bar is not its run's served value, the bars are in another order than the rows, or a run that is filtered
//       out or on another page of the list is drawn;
//   R3  a run whose row carries no duration or token count gets a bar of zero;
//   R4  a served zero is dropped: a measured zero is a figure;
//   R5  a bar's colour says another status than its run's;
//   R6  a bar opens another run than its own, or a run with no recorded id opens something;
//   R7  hiding a status or a series moves, recolours or removes another's bars;
//   R8  the tooltip writes a number the chart made, or leaves out which run it is;
//   R9  no run matches the filters and a chart is still drawn;
//   R10 the bars are stacked, or a total or an average of the listed runs is drawn or written;
//   R11 a value served as a list is read as a number.
//   R12 a value axis writes "0" at its origin: on these pages a zero has to be one a reader can trust as measured
//       (the OMN-19981 browser check for an unmeasured zero found the tokens axis doing so).
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Option = Record<string, any>;
type Handed = { option: Option; onEvents?: Record<string, (param: Record<string, unknown>) => void> };
const harness = vi.hoisted(() => ({ handed: [] as Array<Record<string, any>> }));
vi.mock('echarts-for-react/lib/core', () => ({
  default: (props: Handed) => {
    harness.handed.push(props);
    return <div data-testid="served-chart" />;
  },
}));

import { RunsTable } from './LocalDashboardPage';

const NOW = Date.parse('2026-10-04T07:00:00Z');
function decision(id: string | null, minute: number, extra: Record<string, unknown> = {}): Record<string, unknown> {
  const at = `2026-10-04T06:${String(minute).padStart(2, '0')}:00Z`;
  return {
    correlation_id: id, written_at: at, created_at: at, model_name: 'model-a', quality_gate_passed: true, quality_gate_detail: 'completed',
    latency_ms: 813, tokens_input: 162, tokens_output: 52, task_type: 'summarization', cost_tier_name: 'local', actual_score: 0.92,
    backend_id: 'local-coder', host: 'lab-host', ...extra,
  };
}
// Served oldest first on purpose: the table lists newest first, and the bars have to follow the table, not the wire.
const RUNS = [
  decision('aaaaaaaa-0000-4000-8000-000000000001', 10, { latency_ms: 700, tokens_input: 250, tokens_output: 13 }),
  decision('bbbbbbbb-0000-4000-8000-000000000002', 20, { latency_ms: 4925, tokens_input: 262, tokens_output: 7, quality_gate_passed: false, quality_gate_detail: 'quality_gate_failed', backend_id: 'byok' }),
  decision('cccccccc-0000-4000-8000-000000000003', 30, { latency_ms: 1200, tokens_input: 90, tokens_output: 400 }),
];

function open(decisions: unknown[], pageSize = 25) {
  harness.handed.length = 0;
  return render(<RunsTable now={NOW} decisions={decisions} sessions={[]} pageSize={pageSize} />);
}
/** The option the figure with this name was last handed. The duration figure is drawn first, the tokens figure second. */
function chart(name: 'Duration per run' | 'Tokens per run', tokenNames = ['Tokens in', 'Tokens out']): Handed {
  expect(screen.getByRole('figure', { name })).toBeTruthy();
  const handed = harness.handed as Handed[];
  const mine = handed.filter(({ option }) => name === 'Duration per run'
    ? option.series.length === 1 && option.series[0].name === 'Duration'
    : option.series.length === tokenNames.length && option.series.every((series: Option, index: number) => series.name === tokenNames[index]));
  return mine.at(-1)!;
}
const durations = () => chart('Duration per run').option.series[0].data.map((entry: Option) => entry.value);
const tokens = (names = ['Tokens in', 'Tokens out']) => chart('Tokens per run', names).option.series.map((series: Option) => [series.name, series.data]);
const rowIds = () => within(screen.getByRole('table')).getAllByRole('row').slice(1).map((row) => row.querySelector('td')?.textContent ?? '');

beforeEach(() => { harness.handed.length = 0; window.history.replaceState(null, '', '/runs'); });

describe('OMN-21015: the Runs page draws the runs it lists', () => {
  it('R1, R2: one bar per listed run, in the rows\' order, each its run\'s served value', () => {
    open(RUNS);
    expect(rowIds().map((id) => id.slice(0, 8))).toEqual(['cccccccc', 'bbbbbbbb', 'aaaaaaaa']);
    expect(chart('Duration per run').option.xAxis.data).toEqual(['cccccccc', 'bbbbbbbb', 'aaaaaaaa']);
    expect(durations()).toEqual([1200, 4925, 700]);
    expect(chart('Tokens per run').option.xAxis.data).toEqual(['cccccccc', 'bbbbbbbb', 'aaaaaaaa']);
    expect(tokens()).toEqual([['Tokens in', [90, 262, 250]], ['Tokens out', [400, 7, 13]]]);
  });

  it('R2: a run the filters leave out is not drawn', () => {
    open(RUNS);
    fireEvent.change(screen.getByLabelText('Backend'), { target: { value: 'byok' } });
    expect(rowIds().map((id) => id.slice(0, 8))).toEqual(['bbbbbbbb']);
    expect(durations()).toEqual([4925]);
    expect(tokens()).toEqual([['Tokens in', [262]], ['Tokens out', [7]]]);
  });

  it('R2: only the runs on the shown page of the list are drawn', () => {
    open(RUNS, 2);
    expect(durations()).toEqual([1200, 4925]);
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(rowIds().map((id) => id.slice(0, 8))).toEqual(['aaaaaaaa']);
    expect(durations()).toEqual([700]);
    expect(tokens()).toEqual([['Tokens in', [250]], ['Tokens out', [13]]]);
  });

  it('R3: a run whose row carries no duration or token count has no bar, not a bar of zero', () => {
    open([RUNS[0], decision('dddddddd-0000-4000-8000-000000000004', 40, { latency_ms: null, tokens_input: undefined, tokens_output: null })]);
    expect(durations()).toEqual([null, 700]);
    expect(tokens()).toEqual([['Tokens in', [null, 250]], ['Tokens out', [null, 13]]]);
  });

  it('R4: a served zero is a figure and keeps its place', () => {
    open([RUNS[0], decision('dddddddd-0000-4000-8000-000000000004', 40, { latency_ms: 0, tokens_output: 0 })]);
    expect(durations()).toEqual([0, 700]);
    expect(tokens()[1]).toEqual(['Tokens out', [0, 13]]);
  });

  it('R5: a bar carries the colour of its run\'s status, and the two statuses differ', () => {
    open(RUNS);
    const colours = chart('Duration per run').option.series[0].data.map((entry: Option) => entry.itemStyle.color);
    expect(colours[0]).toBe(colours[2]);
    expect(colours[1]).not.toBe(colours[0]);
    // The key above the chart names each status that is drawn, once, in the rows' order.
    const key = within(screen.getByRole('figure', { name: 'Duration per run' })).getByRole('group', { name: 'Statuses shown' });
    expect(within(key).getAllByRole('button').map((button) => button.textContent)).toEqual(['passed', 'failed']);
  });

  it('R6: a bar opens its own run on Workflow', () => {
    open(RUNS);
    // The address a bar opens is the one the run id in the same row links to.
    const links = within(screen.getByRole('table')).getAllByRole('link').map((link) => link.getAttribute('href'));
    expect(links[1]).toContain('bbbbbbbb-0000-4000-8000-000000000002');
    expect(links[2]).toContain('aaaaaaaa-0000-4000-8000-000000000001');
    chart('Duration per run').onEvents!.click!({ dataIndex: 1 });
    expect(`${window.location.pathname}${window.location.search}`).toBe(links[1]);
    window.history.replaceState(null, '', '/runs');
    chart('Tokens per run').onEvents!.click!({ dataIndex: 2 });
    expect(`${window.location.pathname}${window.location.search}`).toBe(links[2]);
  });

  it('R6: a run with no recorded id has a bar and opens nothing', () => {
    open([RUNS[0], decision(null, 40, { latency_ms: 55 })]);
    expect(chart('Duration per run').option.xAxis.data).toEqual(['Not recorded', 'aaaaaaaa']);
    chart('Duration per run').onEvents!.click!({ dataIndex: 0 });
    expect(`${window.location.pathname}${window.location.search}`).toBe('/runs');
  });

  it('R7: hiding a status leaves the other runs\' bars where and as they were', () => {
    open(RUNS);
    const before = chart('Duration per run').option.series[0].data;
    const figure = screen.getByRole('figure', { name: 'Duration per run' });
    fireEvent.click(within(figure).getByRole('button', { name: 'failed' }));
    expect(within(figure).getByRole('button', { name: 'failed' }).getAttribute('aria-pressed')).toBe('false');
    const after = chart('Duration per run').option.series[0].data;
    expect(after.map((entry: Option) => entry.value)).toEqual([1200, null, 700]);
    expect([after[0].itemStyle.color, after[2].itemStyle.color]).toEqual([before[0].itemStyle.color, before[2].itemStyle.color]);
    expect(chart('Duration per run').option.xAxis.data).toEqual(['cccccccc', 'bbbbbbbb', 'aaaaaaaa']);
    // The table is not filtered by the key: it still lists the failed run.
    expect(rowIds()).toHaveLength(3);
  });

  it('R7: hiding a token series leaves the other series as it was', () => {
    open(RUNS);
    const figure = screen.getByRole('figure', { name: 'Tokens per run' });
    const colourOfOut = chart('Tokens per run').option.series[1].itemStyle.color;
    fireEvent.click(within(figure).getByRole('button', { name: 'Tokens in' }));
    expect(tokens(['Tokens out'])).toEqual([['Tokens out', [400, 7, 13]]]);
    expect(chart('Tokens per run', ['Tokens out']).option.series[0].itemStyle.color).toBe(colourOfOut);
  });

  it('R8: the tooltip names the run, its status and model, and writes the served text', () => {
    open([decision('eeeeeeee-0000-4000-8000-000000000005', 50, { latency_ms: '0813', tokens_input: '0162', tokens_output: 52 })]);
    const duration = chart('Duration per run').option.tooltip.formatter([{ dataIndex: 0, seriesIndex: 0, marker: '' }]);
    expect(duration).toBe('eeeeeeee-0000-4000-8000-000000000005<br/>passed · model-a<br/>Duration: 0813 ms');
    const both = chart('Tokens per run').option.tooltip.formatter([{ dataIndex: 0, seriesIndex: 0, marker: '', seriesName: 'Tokens in' }, { dataIndex: 0, seriesIndex: 1, marker: '', seriesName: 'Tokens out' }]);
    expect(both).toBe('eeeeeeee-0000-4000-8000-000000000005<br/>passed · model-a<br/>Tokens in: 162<br/>Tokens out: 52');
  });

  it('R8: the tooltip says Not recorded for a run with no value', () => {
    open([RUNS[0], decision('dddddddd-0000-4000-8000-000000000004', 40, { latency_ms: null })]);
    expect(chart('Duration per run').option.tooltip.formatter([{ dataIndex: 0, seriesIndex: 0, marker: '' }])).toContain('Duration: Not recorded');
  });

  it('R9: when no run matches the filters there is no chart', () => {
    open(RUNS);
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'Not recorded' } });
    expect(screen.getByRole('status').textContent).toBe('No runs match these filters');
    expect(screen.queryByRole('figure')).toBeNull();
  });

  it('R9: when no listed run carries a duration, that chart is not drawn and the tokens chart is', () => {
    open([decision('aaaaaaaa-0000-4000-8000-000000000001', 10, { latency_ms: null })]);
    expect(screen.queryByRole('figure', { name: 'Duration per run' })).toBeNull();
    expect(screen.getByRole('figure', { name: 'Tokens per run' })).toBeTruthy();
  });

  it('R10: nothing is stacked, and no total or average of the listed runs is drawn or written', () => {
    open(RUNS);
    for (const name of ['Duration per run', 'Tokens per run'] as const) {
      for (const series of chart(name).option.series) expect('stack' in series).toBe(false);
    }
    // 700 + 4925 + 1200, its mean, 250 + 262 + 90 and 13 + 7 + 400: none appears in either figure.
    const written = [...screen.getAllByRole('figure')].map((figure) => figure.textContent).join(' ');
    expect(written).not.toMatch(/6825|2275|602|420|[Tt]otal|[Aa]verage|[Mm]ean/);
    const drawn = [...durations(), ...tokens().flatMap(([, data]: [string, number[]]) => data)];
    for (const sum of [6825, 2275, 602, 420]) expect(drawn).not.toContain(sum);
  });

  it('R12: neither value axis writes a zero at its origin', () => {
    open(RUNS);
    for (const name of ['Duration per run', 'Tokens per run'] as const) {
      const label = chart(name).option.yAxis.axisLabel.formatter as (value: number) => string;
      expect(label(0)).toBe('');
    }
    expect(chart('Duration per run').option.yAxis.axisLabel.formatter(2000)).toBe('2000 ms');
    expect(chart('Tokens per run').option.yAxis.axisLabel.formatter(300)).toBe('300');
  });

  it('R11: a value served as a list is a gap, not the number inside it', () => {
    open([RUNS[0], decision('dddddddd-0000-4000-8000-000000000004', 40, { latency_ms: [55], tokens_input: ['9'] })]);
    expect(durations()).toEqual([null, 700]);
    expect(tokens()[0]).toEqual(['Tokens in', [null, 250]]);
  });
});
