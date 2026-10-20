// OMN-21166 AC26 (mockup build, rule change R-B approved 2026-10-18): the Overview's charts count and group the
// served delegation.decisions.v1 rows in the browser. Each count is presentation over those rows, so it must agree
// with them exactly and must never turn a value the runtime did not serve into a number.
//
// Failure modes, each with a test below:
//   F1  a run with no recorded verdict is counted as passed or failed
//   F2  a run with no recorded duration lands in a duration bucket (as 0 ms)
//   F3  a run with no measured cost adds $0 to spend, so spend reads as measured when it was not
//   F4  a run outside the chosen window is counted
//   F5  a run at 23:59:59Z and one at 00:00:00Z land on the same UTC day
//   F6  a token count served as text is dropped, or text that is not a number is read as 0
//   F7  failure causes are not grouped by their label, or a missing detail disappears
//   F8  the activity grid uses the viewer's time zone instead of UTC
//   F9  a running total skips or double-counts a day
//   F10 a run with no task, tier or model disappears from the breakdown instead of reading Not recorded
import { describe, expect, it } from 'vitest';
import {
  causes, countBy, cumulative, dailySeries, durationBuckets, hourGrid, summary, toInsightRuns, windowRuns,
} from './insights';

const NOW = Date.parse('2026-10-18T09:30:00Z');

function row(at: string | null, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    written_at: at, quality_gate_passed: 1, quality_gate_detail: 'completed', latency_ms: 500,
    tokens_input: 200, tokens_output: 20, cost_usd: 0,
    cost_tier_name: 'local', task_type: 'document', model_name: 'Qwen3.8-27B', ...extra,
  };
}

describe('OMN-21166: insights over served decision rows', () => {
  it('F1: a run with no recorded verdict is its own count, never passed or failed', () => {
    const runs = toInsightRuns([row('2026-10-18T08:00:00Z'), row('2026-10-18T08:01:00Z', { quality_gate_passed: null }), row('2026-10-18T08:02:00Z', { quality_gate_passed: 0, quality_gate_detail: 'MALFORMED: x' })]);
    const s = summary(runs);
    expect([s.runs, s.passed, s.failed, s.unrecorded]).toEqual([3, 1, 1, 1]);
    expect(s.passRate).toBeCloseTo(50, 6);
  });

  it('F1: with no recorded verdict at all the pass rate is unknown, not 0%', () => {
    expect(summary(toInsightRuns([row('2026-10-18T08:00:00Z', { quality_gate_passed: null })])).passRate).toBeNull();
  });

  it('F2: a missing duration is counted as unrecorded, not in the first bucket', () => {
    const runs = toInsightRuns([row('2026-10-18T08:00:00Z', { latency_ms: 120 }), row('2026-10-18T08:01:00Z', { latency_ms: null }), row('2026-10-18T08:02:00Z', { latency_ms: 1800 })]);
    const result = durationBuckets(runs, [0, 250, 1000, Infinity]);
    expect(result.buckets).toEqual([1, 0, 1]);
    expect(result.unrecorded).toBe(1);
    expect(summary(runs).medianLatency).toBe(960);
  });

  // Review failure: an even population used its upper middle sample as the median.
  it.each([
    { values: [120, 1800], expected: 960 },
    { values: [1800, 0, 120, 500], expected: 310 },
    { values: [0, 0], expected: 0 },
    { values: [120, null, 1800], expected: 960 },
    { values: [120, 500, 1800], expected: 500 },
    { values: [null, null], expected: null },
  ])('median keeps zero, excludes missing values and averages an even middle: $values', ({ values, expected }) => {
    const runs = toInsightRuns(values.map(latency_ms => row('2026-10-18T08:00:00Z', { latency_ms })));
    expect(summary(runs).medianLatency).toBe(expected);
  });

  it('F3: an unmeasured cost leaves spend partial and says how many runs were not measured', () => {
    const s = summary(toInsightRuns([row('2026-10-18T08:00:00Z', { cost_usd: 0.002 }), row('2026-10-18T08:01:00Z', { cost_usd: null })]));
    expect(s.spend).toBeCloseTo(0.002, 9);
    expect(s.spendUnmeasured).toBe(1);
    expect(summary(toInsightRuns([row('2026-10-18T08:00:00Z', { cost_usd: null })])).spend).toBeNull();
  });

  it('F4: the window keeps only runs from its UTC days, today included', () => {
    const runs = toInsightRuns([row('2026-10-18T00:00:00Z'), row('2026-10-12T00:00:00Z'), row('2026-10-11T23:59:59Z'), row(null)]);
    expect(windowRuns(runs, NOW, 1)).toHaveLength(1);
    expect(windowRuns(runs, NOW, 7)).toHaveLength(2);
  });

  it('F5: runs either side of UTC midnight land on their own days', () => {
    const series = dailySeries(toInsightRuns([row('2026-10-17T23:59:59Z'), row('2026-10-18T00:00:00Z')]), NOW, 2);
    expect(series.map(d => [d.day, d.runs])).toEqual([['2026-10-17', 1], ['2026-10-18', 1]]);
  });

  it('F6: token counts served as text are read; text that is not a number is not', () => {
    const s = summary(toInsightRuns([row('2026-10-18T08:00:00Z', { tokens_input: '269' }), row('2026-10-18T08:01:00Z', { tokens_input: 'n/a' }), row('2026-10-18T08:02:00Z', { tokens_input: 31 })]));
    expect(s.tokensIn).toBe(300);
  });

  it('F7: causes group by the label before the colon; a failed run with no detail reads Not recorded', () => {
    const runs = toInsightRuns([
      row('2026-10-18T08:00:00Z', { quality_gate_passed: 0, quality_gate_detail: 'MALFORMED: does not compile; TASK_MISMATCH: no code' }),
      row('2026-10-18T08:01:00Z', { quality_gate_passed: 0, quality_gate_detail: 'MALFORMED: invalid syntax' }),
      row('2026-10-18T08:02:00Z', { quality_gate_passed: 0, quality_gate_detail: null }),
      row('2026-10-18T08:03:00Z'),
    ]);
    expect(causes(runs)).toEqual([{ cause: 'MALFORMED', count: 2 }, { cause: 'Not recorded', count: 1 }]);
  });

  it('F8: the activity grid places a run by its UTC hour and day', () => {
    const grid = hourGrid(toInsightRuns([row('2026-10-18T00:30:00Z'), row('2026-10-17T23:30:00Z'), row('2026-10-17T23:45:00Z')]), NOW, 2);
    expect(grid.days).toEqual(['2026-10-17', '2026-10-18']);
    expect(grid.counts[0]![23]).toBe(2);
    expect(grid.counts[1]![0]).toBe(1);
    expect(grid.max).toBe(2);
  });

  it('F9: a running total adds each day once and carries empty days forward', () => {
    expect(cumulative([1, 0, 2.5, 0])).toEqual([1, 1, 3.5, 3.5]);
    expect(cumulative([1, null, 2])).toEqual([1, 1, 3]);
    const series = dailySeries(toInsightRuns([row('2026-10-16T08:00:00Z', { tokens_input: 500 }), row('2026-10-18T08:00:00Z', { tokens_input: 250 })]), NOW, 3);
    expect(series.map(d => d.runs)).toEqual([1, 0, 1]);
    expect(cumulative(series.map(d => d.tokensIn))).toEqual([500, 500, 750]);
  });

  it('F10: a run with no task, tier or model is counted under Not recorded', () => {
    const runs = toInsightRuns([row('2026-10-18T08:00:00Z'), row('2026-10-18T08:01:00Z', { task_type: null, quality_gate_passed: 0 }), row('2026-10-18T08:02:00Z')]);
    expect(countBy(runs, 'task')).toEqual([
      { key: 'document', runs: 2, passed: 2, failed: 0, unrecorded: 0 },
      { key: 'Not recorded', runs: 1, passed: 0, failed: 1, unrecorded: 0 },
    ]);
    expect(countBy(runs, 'tier').reduce((total, entry) => total + entry.runs, 0)).toBe(3);
  });
});
