// OMN-21166 AC26/AC29: presentation-only comparisons and usage summaries from served rows.
// Failure modes: a capped previous period is treated as complete; a missing previous verdict is called zero;
// null costs/tokens become zero; unmeasured calls enter the cost-per-call denominator; a zero denominator divides.
import { expect, it } from 'vitest';
import { cumulative, durationBuckets, summary, toInsightRuns } from './insights';

const NOW = Date.parse('2026-10-21T12:00:00Z');

function row(day: number, passed: boolean | null): Record<string, unknown> {
  return {
    written_at: new Date(Date.UTC(2026, 9, day, 9)).toISOString(),
    quality_gate_passed: passed,
  };
}

it('AC26 compares equal-length windows and refuses a delta when the returned rows truncate the previous window', async () => {
  const modulePath: string = './insight-aggregates';
  const module = await import(/* @vite-ignore */ modulePath) as Record<string, unknown>;
  const compare = module.compareWindow;
  expect(typeof compare).toBe('function');
  if (typeof compare !== 'function') return;

  const full = compare([
    { ...row(8, true), written_at: '2026-10-08T00:00:00.000Z' }, row(8, false), row(15, true), row(21, true), row(21, true),
  ], NOW, 7) as {
    currentPassRate: number | null; previousPassRate: number | null; passRateDeltaPoints: number | null; previousComplete: boolean;
  };
  expect(full).toMatchObject({
    currentPassRate: 100,
    previousPassRate: 50,
    passRateDeltaPoints: 50,
    previousComplete: true,
  });

  const truncated = compare([row(10, true), row(15, false), row(21, true)], NOW, 7) as {
    currentPassRate: number | null; previousPassRate: number | null; passRateDeltaPoints: number | null; previousComplete: boolean;
  };
  expect(truncated.previousComplete).toBe(false);
  expect(truncated.passRateDeltaPoints).toBeNull();
});

it('AC26 keeps unrecorded durations out of the median and spreads a 7.78 second run across the histogram', () => {
  const runs = toInsightRuns([
    { ...row(21, true), latency_ms: 7780 },
    { ...row(21, false), latency_ms: 1200 },
    { ...row(21, null), latency_ms: null },
  ]);
  expect(summary(runs).medianLatency).toBe(4490);
  const distribution = durationBuckets(runs, [0, 1000, 2000, 5000, 10000, 20000, 30000, 60000, Infinity]);
  expect(distribution.buckets).toEqual([0, 1, 0, 1, 0, 0, 0, 0]);
  expect(distribution.unrecorded).toBe(1);
});

it('AC26 cumulative savings carries a missing day forward without counting it as zero evidence', () => {
  expect(cumulative([0.4, null, 0, null, 0.15])).toEqual([0.4, 0.4, 0.4, 0.4, 0.55]);
  expect(cumulative([null, null, 0.4, null, 0])).toEqual([null, null, 0.4, 0.4, 0.4]);
});

it('AC26 uses one served baseline and refuses totals for a partially returned window', async () => {
  const modulePath: string = './insight-aggregates';
  const loaded = await import(/* @vite-ignore */ modulePath).catch(() => null) as Record<string, unknown> | null;
  const aggregate = loaded?.aggregateMeteringWindow;
  expect(typeof aggregate).toBe('function');
  if (typeof aggregate !== 'function') return;
  const metering = [
    { window_kind: 'all', baseline_model: 'baseline-a', as_of: '2026-10-21T11:00:00Z' },
    { window_kind: 'day', window_start: '2026-10-20', baseline_model: 'baseline-a', spend_usd: '0.25', savings_usd: '0.40', counterfactual_usd: '0.65', runs_total: 2 },
  ];
  const window = aggregate(metering, NOW, 7) as { spend: number | null; saved: number | null; cumulativeSaved: (number | null)[]; available: boolean; windowComplete: boolean; days: Array<{ served: boolean }> };
  expect(window.available).toBe(true);
  expect(window.windowComplete).toBe(false);
  expect(window.days.filter(day => day.served)).toHaveLength(1);
  expect(window.spend).toBeNull();
  expect(window.saved).toBeNull();
  expect(window.cumulativeSaved).toEqual([null, null, null, null, null, 0.4, 0.4]);
  const unavailable = aggregate([], NOW, 7) as { available: boolean; spend: number | null; reason: string | null };
  expect(unavailable).toMatchObject({ available: false, spend: null });
  expect(unavailable.reason).toContain('unavailable');
});

it('AC26 refuses a partial money total when a served day has a null value', async () => {
  const modulePath: string = './insight-aggregates';
  const loaded = await import(/* @vite-ignore */ modulePath).catch(() => null) as Record<string, unknown> | null;
  const aggregate = loaded?.aggregateMeteringWindow;
  expect(typeof aggregate).toBe('function');
  if (typeof aggregate !== 'function') return;
  const dates = Array.from({ length: 7 }, (_, index) => new Date(Date.UTC(2026, 9, 15 + index)).toISOString().slice(0, 10));
  const window = aggregate([
    { window_kind: 'all', baseline_model: 'baseline-a', as_of: '2026-10-21T11:00:00Z' },
    ...dates.map(day => ({ window_kind: 'day', window_start: day, baseline_model: 'baseline-a', spend_usd: '0.10', savings_usd: day === '2026-10-18' ? null : '0.20', counterfactual_usd: '0.30', runs_total: 1 })),
  ], NOW, 7) as { windowComplete: boolean; spend: number | null; saved: number | null; counterfactual: number | null; cumulativeSaved: (number | null)[] };
  expect(window.windowComplete).toBe(true);
  expect(window.spend).toBeCloseTo(0.7);
  expect(window.saved).toBeNull();
  expect(window.counterfactual).toBeCloseTo(2.1);
  expect(window.cumulativeSaved[0]).toBeCloseTo(0.2);
  expect(window.cumulativeSaved[1]).toBeCloseTo(0.4);
  expect(window.cumulativeSaved[2]).toBeCloseTo(0.6);
  expect(window.cumulativeSaved.slice(3)).toEqual([null, null, null, null]);
});

it('AC29 aggregates usage rows independently from metering-only all-cloud costs', async () => {
  const modulePath: string = './insight-aggregates';
  const loaded = await import(/* @vite-ignore */ modulePath).catch(() => null) as Record<string, unknown> | null;
  const aggregate = loaded?.aggregateUsageRows;
  expect(typeof aggregate).toBe('function');
  if (typeof aggregate !== 'function') return;

  const result = aggregate([
    { usage_day: '2026-10-21', model_id: 'model-a', input_tokens: 10, output_tokens: 4, measured_cost_usd: '0.30', call_count: 2, unmeasured_call_count: 1 },
    { usage_day: '2026-10-21', model_id: 'model-a', input_tokens: 5, output_tokens: 2, measured_cost_usd: '0.20', call_count: 1, unmeasured_call_count: 0 },
    { usage_day: '2026-10-21', model_id: 'model-b', input_tokens: null, output_tokens: 3, measured_cost_usd: null, call_count: 1, unmeasured_call_count: 1 },
    { usage_day: '2026-10-20', model_id: 'model-c', input_tokens: 0, output_tokens: 0, measured_cost_usd: 0, call_count: 1, unmeasured_call_count: 0 },
  ], [
    { written_at: '2026-10-08T09:00:00Z', quality_gate_passed: true, model_name: 'model-a' },
    { written_at: '2026-10-08T10:00:00Z', quality_gate_passed: false, model_name: 'model-b' },
    { written_at: '2026-10-21T09:00:00Z', quality_gate_passed: true, model_name: 'model-a' },
    { written_at: '2026-10-21T10:00:00Z', quality_gate_passed: false, model_name: 'model-b' },
  ], NOW, 7) as {
    models: Array<Record<string, unknown>>;
    days: Array<Record<string, unknown>>;
  };

  expect(result.models).toContainEqual(expect.objectContaining({
    model: 'model-a', measuredCost: 0.5, measuredCalls: 2, unmeasuredCalls: 1, inputTokens: 15, outputTokens: 6,
    share: 0.6, passRate: 1, returnedRuns: 1, recordedVerdicts: 1,
  }));
  expect(result.models).toContainEqual(expect.objectContaining({
    model: 'model-b', measuredCost: null, measuredCalls: 0, unmeasuredCalls: 1, inputTokens: null, outputTokens: 3,
    share: 0.2, passRate: 0, returnedRuns: 1, recordedVerdicts: 1,
  }));
  expect(result.models).toContainEqual(expect.objectContaining({
    model: 'model-c', measuredCost: 0, measuredCalls: 1, unmeasuredCalls: 0, inputTokens: 0, outputTokens: 0,
    share: 0.2, passRate: null, returnedRuns: 0, recordedVerdicts: 0,
  }));
  expect(result.days).toContainEqual(expect.objectContaining({
    day: '2026-10-21', measuredCostPerCall: 0.25, measuredCalls: 2, unmeasuredCalls: 2,
  }));
  expect(result.days).toContainEqual(expect.objectContaining({
    day: '2026-10-20', measuredCostPerCall: 0, measuredCalls: 1, unmeasuredCalls: 0,
  }));
});

// An unknown all-time time must not be invented: a missing or unparseable as_of is never time 0.
it('AC26 refuses to pick a newest all-time row when any of several rows has no usable as_of', async () => {
  const modulePath: string = './insight-aggregates';
  const loaded = await import(/* @vite-ignore */ modulePath).catch(() => null) as Record<string, unknown> | null;
  const totals = loaded?.meteringAllTimeTotals;
  expect(typeof totals).toBe('function');
  if (typeof totals !== 'function') return;
  type Totals = { available: boolean; baseline: string | null; spend: number | null };
  const dated = { window_kind: 'all', baseline_model: 'baseline-dated', as_of: '2026-10-21T11:00:00Z', spend_usd: '1.5' };

  // (a) one dated + one undated (missing, and unparseable): cannot say which is newest.
  expect(totals([dated, { window_kind: 'all', baseline_model: 'baseline-undated', spend_usd: '9' }]) as Totals).toMatchObject({ available: false, spend: null });
  expect(totals([{ window_kind: 'all', baseline_model: 'baseline-bad', as_of: 'not-a-date', spend_usd: '9' }, dated]) as Totals).toMatchObject({ available: false, spend: null });
  // (b) two undated rows.
  expect(totals([
    { window_kind: 'all', baseline_model: 'baseline-x', spend_usd: '1' },
    { window_kind: 'all', baseline_model: 'baseline-y', as_of: '', spend_usd: '2' },
  ]) as Totals).toMatchObject({ available: false, spend: null });
  // (c) a single undated row is the only row, so it is used.
  expect(totals([{ window_kind: 'all', baseline_model: 'baseline-only', spend_usd: '3' }]) as Totals)
    .toMatchObject({ available: true, baseline: 'baseline-only', spend: 3 });
  // (d) control: two dated rows of different times give the newest.
  expect(totals([
    { window_kind: 'all', baseline_model: 'baseline-old', as_of: '2026-10-20T11:00:00Z', spend_usd: '1' },
    dated,
  ]) as Totals).toMatchObject({ available: true, baseline: 'baseline-dated', spend: 1.5 });
});
