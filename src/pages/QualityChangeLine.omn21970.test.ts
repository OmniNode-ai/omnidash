// Found in the 2026-11-02 dashboard tour (Lakshman: "Fix all issues if we have"): the local store serves
// quality_gate_passed as 1 or 0, and the Delegation Quality change line counted only true/false, so on 7, 15 and 30
// days it never showed. Failure modes:
//   Q1 verdicts served as 1/0 are ignored, so the change line is missing on a store that has two full windows
//   Q2 the line counts a run with no verdict (null) as a failure
//   Q3 boolean verdicts stop working (the Postgres path serves true/false)
import { describe, expect, it } from 'vitest';
import { qualityChangeLine } from './LocalDashboardPage';

const NOW = Date.parse('2026-11-02T12:00:00Z');
const DAY = 86_400_000;
// 14 days: the earlier 7 pass half the time, the latest 7 always pass.
function runs(passed: (day: number) => unknown, extra: Record<string, unknown> = {}) {
  return Array.from({ length: 14 }, (_, offset) => ({
    created_at: new Date(NOW - offset * DAY).toISOString(),
    quality_gate_passed: passed(offset),
    ...extra,
  })).concat(Array.from({ length: 14 }, (_, offset) => ({
    created_at: new Date(NOW - offset * DAY - 3_600_000).toISOString(),
    quality_gate_passed: offset >= 7 ? passed(offset + 100) : passed(offset),
  })));
}

describe('Delegation Quality change line', () => {
  it('Q1: verdicts served as 1/0 give the change versus the previous 7 days', () => {
    const decisions = runs(offset => (offset < 7 ? 1 : offset % 2 === 0 ? 1 : 0));
    expect(qualityChangeLine(decisions, { kind: 'days', days: 7 }, NOW)).toMatch(/^Last 7 days: \+[\d.]+ pts vs previous 7 days$/);
  });

  it('Q3: boolean verdicts give the same line', () => {
    const decisions = runs(offset => (offset < 7 ? true : offset % 2 === 0));
    expect(qualityChangeLine(decisions, { kind: 'days', days: 7 }, NOW)).toMatch(/^Last 7 days: \+[\d.]+ pts vs previous 7 days$/);
  });

  it('Q2: a run with no verdict is left out, never counted as a failure', () => {
    const allPass = runs(() => 1);
    const withUnknown = [...allPass, { created_at: new Date(NOW).toISOString(), quality_gate_passed: null }];
    expect(qualityChangeLine(withUnknown, { kind: 'days', days: 7 }, NOW)).toBe('Last 7 days: no change vs previous 7 days');
  });
});
