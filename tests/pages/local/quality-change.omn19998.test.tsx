// OMN-24473: the Delegation Quality change line read 'No earlier data' whenever no served row reached back over the
// previous 7-day window, but a read that stopped at the newest page has not looked that far back — the gap it saw
// proved nothing about the rows it never read. Failure modes, each with a test below:
//   Q1  a complete read losing its old 'No earlier data' wording (the control for Q2)
//   Q2  a newest-page read drawn as 'No earlier data' instead of not measured with the count actually read
//   Q3  a newest-page read losing the rate line although the rows do reach back over the previous window
import { describe, expect, it } from 'vitest';
import { qualityChangeLine } from '@/pages/LocalDashboardPage';

const NOW = Date.parse('2026-11-02T12:00:00Z');
const DAY = 86_400_000;
// 400 rows drawn from the newest 8 days only: fifty a day, so no row sits at or before the previous 7-day window's
// start (2026-10-20).
function newestPages() {
  return Array.from({ length: 400 }, (_, offset) => ({
    created_at: new Date(NOW - Math.floor(offset / 50) * DAY - (offset % 50) * 600_000).toISOString(),
    quality_gate_passed: 1,
  }));
}
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

describe('Delegation Quality change line against a newest-page read', () => {
  it('Q1: a complete read whose rows stop short of the previous window still reads No earlier data', () => {
    expect(qualityChangeLine(newestPages(), { kind: 'days', days: 7 }, NOW)).toBe('No earlier data');
  });

  it('Q2: a newest-page read over the same rows reads not measured, never No earlier data', () => {
    const line = qualityChangeLine(newestPages(), { kind: 'days', days: 7 }, NOW, false);
    expect(line).toMatch(/^Not measured: only the newest/);
    expect(line).toContain('runs were read');
    expect(line).not.toContain('No earlier data');
  });

  it('Q3: a newest-page read keeps the rate line when a row reaches back over the previous window', () => {
    const decisions = runs(offset => (offset < 7 ? 1 : offset % 2 === 0 ? 1 : 0));
    expect(qualityChangeLine(decisions, { kind: 'days', days: 7 }, NOW, false))
      .toMatch(/^Last 7 days: \+[\d.]+ pts vs previous 7 days$/);
  });
});
