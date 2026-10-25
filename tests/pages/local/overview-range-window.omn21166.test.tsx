// OMN-21166 (Lakshman, live review 2026-10-25, "unified"): one window drives the cards and the charts. A 7, 15 or 30
// day window sums the served day rows, as AC42 (2026-10-21) already does for the window figures. Failure modes:
//   R1  a day with no served row (no runs that day) is not counted as zero, or the total hides that it holds such days
//       (Lakshman's ruling, live review 2026-10-25: "instead of not measured say 0"; it replaces AC42's missing-day rule);
//   R2  money is summed in binary floating point and loses a cent;
//   R3  rows of an older baseline are added to the current one's;
//   R4  a field the cards read (runs measured, tokens, runs not counted) is missing from the summed row;
//   R5  the savings percentage of one day is carried into a multi-day sum.
import { describe, expect, it } from 'vitest';
import { meteringRangeFor, pickMeteringRow } from '@/pages/LocalDashboardPage';

const NOW = Date.parse('2026-10-25T12:00:00Z');
const day = (start: string, over: Record<string, unknown> = {}) => ({
  window_kind: 'day', window_start: start, as_of: `${start}T23:00:00Z`, baseline_model: 'b', pricing_manifest_version: '1.0.0',
  spend_usd: '0.10', savings_usd: '0.70', counterfactual_usd: '0.80', runs_total: 3, runs_measured: 2, runs_unknown_tokens: 1,
  runs_unknown_spend: 0, tokens_in: 100, tokens_out: 50, savings_pct_of_counterfactual: 0.875, ...over,
});
const ALL = { window_kind: 'all', window_start: '', as_of: '2026-10-25T23:00:00Z', baseline_model: 'b', pricing_manifest_version: '1.0.0', spend_usd: '9' };

describe('meteringRangeFor', () => {
  it('names the last N UTC days ending today', () => {
    expect(meteringRangeFor(3, NOW)).toBe('range:2026-10-23..2026-10-25');
  });
});

describe('pickMeteringRow for a range', () => {
  const three = [ALL, day('2026-10-23'), day('2026-10-24'), day('2026-10-25')];

  it('R2/R4: sums every field the cards read, money exactly', () => {
    const picked = pickMeteringRow(three, 'range:2026-10-23..2026-10-25', NOW);
    expect('row' in picked).toBe(true);
    const row = (picked as { row: Record<string, unknown> }).row;
    expect(row.spend_usd).toBe('0.30');
    expect(row.savings_usd).toBe('2.10');
    expect([row.runs_total, row.runs_measured, row.runs_unknown_tokens, row.runs_unknown_spend, row.tokens_in, row.tokens_out])
      .toEqual([9, 6, 3, 0, 300, 150]);
    expect(row.baseline_model).toBe('b');
  });

  it('R5: carries no single-day savings percentage', () => {
    const row = (pickMeteringRow(three, 'range:2026-10-23..2026-10-25', NOW) as { row: Record<string, unknown> }).row;
    expect(row.savings_pct_of_counterfactual).toBeUndefined();
  });

  it('R1: a day with no served row counts as a day with no runs, and the row says how many such days it holds', () => {
    const row = (pickMeteringRow([ALL, day('2026-10-23'), day('2026-10-25')], 'range:2026-10-23..2026-10-25', NOW) as { row: Record<string, unknown> }).row;
    expect([row.spend_usd, row.runs_measured, row.tokens_in, row.days_without_runs]).toEqual(['0.20', 4, 200, 1]);
  });

  it('R1: with no metering rows at all the window stays Not measured (nothing was read, so nothing is zero)', () => {
    expect('message' in pickMeteringRow([], 'range:2026-10-23..2026-10-25', NOW)).toBe(true);
  });

  it('R1: a day row missing a value makes that figure Not measured, not a partial sum', () => {
    const row = (pickMeteringRow([ALL, day('2026-10-24', { spend_usd: null }), day('2026-10-25')], 'range:2026-10-24..2026-10-25', NOW) as { row: Record<string, unknown> }).row;
    expect(row.spend_usd).toBeNull();
    expect(row.tokens_in).toBe(200);
  });

  it('R3: only the current baseline\'s day rows are summed', () => {
    const rows = [...three, day('2026-10-25', { baseline_model: 'old', spend_usd: '5.00', as_of: '2026-10-25T01:00:00Z' })];
    const row = (pickMeteringRow(rows, 'range:2026-10-23..2026-10-25', NOW) as { row: Record<string, unknown> }).row;
    expect(row.spend_usd).toBe('0.30');
  });
});
