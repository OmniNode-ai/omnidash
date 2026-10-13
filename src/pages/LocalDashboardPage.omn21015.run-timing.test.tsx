// @vitest-environment jsdom
// OMN-21015: the Workflow page's run summary shows where a run's time went and which model was asked for. A run's
// receipt carries its queue wait, its execution time and the requested model; delegation.decisions.v1 serves each as
// a column of the run's row since omnimarket v0.4.309 (OMN-19448), beside the duration the page already showed. The
// three timings are also drawn as bars, side by side (Lakshman, chat 2026-10-13 about 17:07Z: "first implement
// dashbaord please", after the receipt comparison).
//
// Failure modes, each with a test below:
//   T1  the timings are served and the summary shows no tile for one, or no chart;
//   T2  a bar is not the served value, is drawn under another timing's name, or the bars are in another order;
//   T3  a timing the row does not carry gets a bar (of zero or anything else), or its tile reads 0 ms;
//   T4  a served zero is dropped from the chart or reads Not recorded: a measured zero is a figure;
//   T5  no timing is measured and an empty chart is drawn;
//   T6  the bars are stacked or a total is drawn: the runtime serves no sum of these;
//   T7  a bar's label or tooltip shows a number the chart made, not the served text;
//   T8  a timing changes colour when another is not measured;
//   T9  the requested model is not shown as served, or a missing one reads as something else;
//   T10 the page reads a field its contract does not declare, or one nothing shows is served.
//   T12 a timing served as something other than one number (a list, an object) is read as a number and drawn;
//   T11 the chart's caption speaks of several bars "side by side" when one is drawn, or drops the warning when several are.
import { readFileSync } from 'node:fs';
import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Option = Record<string, any>;
const harness = vi.hoisted(() => ({ handed: [] as Array<Record<string, any>> }));
vi.mock('echarts-for-react/lib/core', () => ({
  default: ({ option }: { option: Option }) => {
    harness.handed.push(option);
    return <div data-testid="served-chart" />;
  },
}));

import { RunSummary } from './LocalDashboardPage';
import { SERVED_SINCE_CAPTURE } from './local/servedSinceCapture';

const run = (extra: Record<string, unknown> = {}) => ({
  correlation_id: 'run-a', quality_gate_passed: 1, quality_gate_detail: 'completed', actual_score: 1, required_bar: 0.8,
  task_type: 'document', model_name: 'local-model', backend_id: 'local-coder', host: 'lab-host', cost_tier_name: 'local',
  latency_ms: 743, tokens_input: 262, tokens_output: 7, finish_reason: 'stop', truncated: 0, escalation_count: 0,
  requested_model: 'asked-model', queue_wait_ms: 12, execution_ms: 4788, ...extra,
});
function summary(): HTMLElement {
  return screen.getByRole('region', { name: 'Run summary' });
}
function fields(): Record<string, string> {
  return Object.fromEntries(within(summary()).getAllByRole('term').map((term) => [term.textContent ?? '', term.nextElementSibling?.textContent ?? '']));
}
function drawn(): Array<[string, number]> {
  const option = harness.handed.at(-1)!;
  return option.yAxis.data.map((label: string, index: number) => [label, option.series[0].data[index].value]);
}

beforeEach(() => { harness.handed.length = 0; });

describe('OMN-21015: where a run\'s time went', () => {
  it('T1, T2: each served timing has a tile and a bar of its served value, tiles and bars in one order', () => {
    render(<RunSummary decision={run()} />);
    const shown = fields();
    expect([shown['Queue wait'], shown.Execution, shown.Duration]).toEqual(['12 ms', '4788 ms', '743 ms']);
    // The three timing tiles stand together, last in the summary, in the order the bars are drawn in.
    expect(Object.keys(shown).slice(-3)).toEqual(['Queue wait', 'Execution', 'Duration']);
    expect(within(summary()).getByRole('figure', { name: 'Run timing' })).toBeTruthy();
    expect(harness.handed).toHaveLength(1);
    expect(drawn()).toEqual([['Queue wait', 12], ['Execution', 4788], ['Duration', 743]]);
  });

  it('T3: a timing the row does not carry has no bar and its tile says Not recorded', () => {
    render(<RunSummary decision={run({ queue_wait_ms: null, execution_ms: undefined })} />);
    const shown = fields();
    expect([shown['Queue wait'], shown.Execution]).toEqual(['Not recorded', 'Not recorded']);
    expect(drawn()).toEqual([['Duration', 743]]);
    expect(within(summary()).getByRole('figure', { name: 'Run timing' }).textContent).toContain('No measured value to draw for: Queue wait, Execution');
  });

  it('T11: with one timing measured the caption does not speak of several', () => {
    render(<RunSummary decision={run({ queue_wait_ms: null, execution_ms: null })} />);
    const caption = within(summary()).getByRole('figure', { name: 'Run timing' }).querySelector('figcaption')?.textContent;
    expect(caption).toBe('Duration of this run in milliseconds, as served. No measured value to draw for: Queue wait, Execution.');
  });

  it('T11: with several measured the caption says they are not added together', () => {
    render(<RunSummary decision={run()} />);
    const caption = within(summary()).getByRole('figure', { name: 'Run timing' }).querySelector('figcaption')?.textContent;
    expect(caption).toBe('Queue wait, Execution, Duration of this run in milliseconds, each as served, side by side and not added together.');
  });

  it('T3: a timing that is not a number is not drawn', () => {
    render(<RunSummary decision={run({ queue_wait_ms: 'soon', execution_ms: -5 })} />);
    expect(drawn()).toEqual([['Duration', 743]]);
  });

  it.each([
    ['a number', 12, [['Queue wait', 12], ['Execution', 4788], ['Duration', 743]]],
    ['a decimal as text', '12', [['Queue wait', 12], ['Execution', 4788], ['Duration', 743]]],
    ['a list holding a number', [12], [['Execution', 4788], ['Duration', 743]]],
    ['a list holding text', ['12'], [['Execution', 4788], ['Duration', 743]]],
    ['an object', { ms: 12 }, [['Execution', 4788], ['Duration', 743]]],
    ['a boolean', true, [['Execution', 4788], ['Duration', 743]]],
    ['an empty text', '', [['Execution', 4788], ['Duration', 743]]],
  ])('T12: a queue wait served as %s is drawn only when it is one number', (_, served, bars) => {
    render(<RunSummary decision={run({ queue_wait_ms: served })} />);
    expect(drawn()).toEqual(bars);
  });

  it('T4: a served zero is a figure: it keeps its tile, its place in the chart and its label', () => {
    render(<RunSummary decision={run({ queue_wait_ms: 0 })} />);
    expect(fields()['Queue wait']).toBe('0 ms');
    expect(drawn()).toEqual([['Queue wait', 0], ['Execution', 4788], ['Duration', 743]]);
    expect(harness.handed[0]!.series[0].label.formatter({ dataIndex: 0 })).toBe('0 ms');
    expect(within(summary()).getByRole('figure', { name: 'Run timing' }).textContent).not.toContain('No measured value');
  });

  it('T5: with no timing measured there is no chart', () => {
    render(<RunSummary decision={run({ queue_wait_ms: null, execution_ms: null, latency_ms: null })} />);
    expect(within(summary()).queryByRole('figure')).toBeNull();
    expect(harness.handed).toHaveLength(0);
    expect(fields().Duration).toBe('Not recorded');
  });

  it('T6: one bar per timing, never stacked, and no total', () => {
    render(<RunSummary decision={run()} />);
    const option = harness.handed[0]!;
    expect(option.series).toHaveLength(1);
    expect(option.series[0].type).toBe('bar');
    expect('stack' in option.series[0]).toBe(false);
    // 12 + 4788 + 743 and 4788 + 743: no sum of the served timings is drawn or written anywhere in the summary.
    expect(option.series[0].data.map((entry: Option) => entry.value)).not.toContain(5543);
    expect(summary().textContent).not.toMatch(/5543|5531|4800|755/);
    expect(Object.keys(fields())).not.toContain('Total');
  });

  it('T7: a bar\'s label and the tooltip carry the served text', () => {
    render(<RunSummary decision={run({ execution_ms: '4788', latency_ms: '0743' })} />);
    const option = harness.handed[0]!;
    expect(option.series[0].label.formatter({ dataIndex: 1 })).toBe('4788 ms');
    expect(option.series[0].label.formatter({ dataIndex: 2 })).toBe('0743 ms');
    expect(option.tooltip.formatter({ dataIndex: 2, name: 'Duration', marker: '' })).toBe('Duration: 0743 ms');
  });

  it('T8: a timing keeps its colour when another is not measured', () => {
    render(<RunSummary decision={run()} />);
    const all = harness.handed[0]!.series[0].data.map((entry: Option) => entry.itemStyle.color);
    expect(new Set(all).size).toBe(3);
    render(<RunSummary decision={run({ queue_wait_ms: null })} />);
    const fewer = harness.handed[1]!.series[0].data.map((entry: Option) => entry.itemStyle.color);
    expect(fewer).toEqual([all[1], all[2]]);
  });

  it('T9: the requested model is shown as served, and a missing one says Not recorded', () => {
    render(<RunSummary decision={run()} />);
    expect(fields()['Requested model']).toBe('asked-model');
    // The answering model keeps its own tile; the two are never merged.
    expect(fields().Model).toBe('local-model');
  });

  it('T9: a run whose row names no requested model says Not recorded, not the answering model', () => {
    render(<RunSummary decision={run({ requested_model: null })} />);
    expect(fields()['Requested model']).toBe('Not recorded');
  });

  it('T10: the Workflow contract declares each new field, and each is in the lab capture or on the served-since list', () => {
    const contracts = JSON.parse(readFileSync('src/pages/local/workflow.contracts.yaml', 'utf8')) as {
      components: Array<{ data_bindings: Array<{ projection_topic: string; required_fields: string[] }> }>;
    };
    const binding = contracts.components.flatMap((c) => c.data_bindings).find((b) => b.projection_topic.endsWith('delegation.decisions.v1'));
    const catalogue = JSON.parse(readFileSync('src/pages/local/served-catalogue.lab.json', 'utf8')) as { exposures: Array<{ topic: string; columns: string[] }> };
    const captured = catalogue.exposures.find((e) => e.topic.endsWith('delegation.decisions.v1'))?.columns ?? [];
    const since = SERVED_SINCE_CAPTURE['onex.snapshot.projection.delegation.decisions.v1'] ?? {};
    for (const field of ['requested_model', 'queue_wait_ms', 'execution_ms', 'latency_ms']) {
      const known = captured.includes(field) || field in since;
      expect(`${field}: declared ${binding?.required_fields.includes(field)}, served ${known}`).toBe(`${field}: declared true, served true`);
    }
  });

  it('T10: the served-since list holds only columns the capture lacks, each with where it is declared', () => {
    const catalogue = JSON.parse(readFileSync('src/pages/local/served-catalogue.lab.json', 'utf8')) as { exposures: Array<{ topic: string; columns: string[] }> };
    for (const [topic, columns] of Object.entries(SERVED_SINCE_CAPTURE)) {
      const captured = catalogue.exposures.find((e) => e.topic === topic)?.columns;
      // The list is for exposures the capture knows; a whole exposure the lab does not serve is never excused here.
      expect(captured, topic).toBeDefined();
      for (const [column, declaredIn] of Object.entries(columns)) {
        // Once a recapture lists the column, its entry has to go: the list can only shrink.
        expect(captured!.includes(column), `${column} is in the capture now; take it off the list`).toBe(false);
        expect(declaredIn).toMatch(/omnimarket v\d+\.\d+\.\d+ .*OMN-\d+/);
      }
    }
    // Exactly the three this page reads; a fourth needs its own line and its own reason.
    expect(Object.keys(SERVED_SINCE_CAPTURE['onex.snapshot.projection.delegation.decisions.v1'] ?? {}).sort()).toEqual(['execution_ms', 'queue_wait_ms', 'requested_model']);
  });
});
