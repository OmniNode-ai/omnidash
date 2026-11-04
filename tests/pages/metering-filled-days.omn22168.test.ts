/**
 * OMN-22168 (Lakshman 2026-11-04, "do all"; item 1: Runs per day and the Daily trend must not disagree). When the
 * decisions read stopped short of every run, Runs per day and Tokens per day draw metering-summary.v1's served day
 * totals; the pass and fail split comes from the run rows read for that day, and the rest of the day's runs are
 * "verdict not recorded", never folded into passed or failed. Failure modes, each a test below:
 *   M1 a day's run total is the served runs_total, its verdicts the rows read, the remainder not recorded;
 *   M2 verdicts read can never exceed the served total (passed + failed + not recorded = runs);
 *   M3 a day served by two rows is left out, never one of the two;  M4 tokens are the served day totals, and a day
 *   without them is not recorded (null), never 0;  M5 no day rows gives null so the caller keeps the rows;
 *   M6 the all-time row is never a day.
 */
import { describe, expect, it } from 'vitest';
import { meteringFilledDays } from '@/pages/local/insights';

const day = (date: string, runs: number | null, tokensIn: number | null = 1000, tokensOut: number | null = 400) => ({
  window_kind: 'day', window_start: `${date}T00:00:00Z`, runs_total: runs, tokens_in: tokensIn, tokens_out: tokensOut });
const run = (date: string, passed: boolean | null, n: number) => ({ correlation_id: `${date}-${n}-${String(passed)}`,
  created_at: `${date}T10:${String(n).padStart(2, '0')}:00Z`, written_at: `${date}T10:${String(n).padStart(2, '0')}:00Z`, quality_gate_passed: passed });

describe('metering-filled days', () => {
  it('M1: served total, verdicts from the rows read, the rest not recorded', () => {
    const decisions = [run('2026-11-04', true, 1), run('2026-11-04', true, 2), run('2026-11-04', false, 3)];
    expect(meteringFilledDays([day('2026-11-03', 120), day('2026-11-04', 10)], decisions)).toEqual([
      { day: '2026-11-03', runs: 120, passed: 0, failed: 0, unrecorded: 120, tokensIn: 1000, tokensOut: 400, tokensInUnmeasured: 0, tokensOutUnmeasured: 0 },
      { day: '2026-11-04', runs: 10, passed: 2, failed: 1, unrecorded: 7, tokensIn: 1000, tokensOut: 400, tokensInUnmeasured: 0, tokensOutUnmeasured: 0 },
    ]);
  });

  it('M2: verdicts read never exceed the served total', () => {
    const decisions = [run('2026-11-04', true, 1), run('2026-11-04', true, 2), run('2026-11-04', false, 3)];
    const [only] = meteringFilledDays([day('2026-11-04', 2)], decisions)!;
    expect(only).toMatchObject({ runs: 2, passed: 2, failed: 0, unrecorded: 0 });
  });

  it('M3: a day served by two rows is left out', () => {
    expect(meteringFilledDays([day('2026-11-04', 5), day('2026-11-04', 9), day('2026-11-03', 1)], [])!.map(entry => entry.day)).toEqual(['2026-11-03']);
  });

  it('M4: tokens are the served day totals, and missing ones stay not recorded', () => {
    const [only] = meteringFilledDays([day('2026-11-04', 3, null, 50)], [])!;
    expect(only).toMatchObject({ tokensIn: null, tokensOut: 50 });
  });

  it('M5 and M6: no day rows gives null, and the all-time row is never a day', () => {
    expect(meteringFilledDays([], [])).toBeNull();
    expect(meteringFilledDays([{ window_kind: 'all', window_start: null, runs_total: 99 }], [])).toBeNull();
  });
});
