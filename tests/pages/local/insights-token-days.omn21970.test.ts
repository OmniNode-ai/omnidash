// SPDX-FileCopyrightText: 2026 OmniNode.ai Inc.
// SPDX-License-Identifier: MIT
// OMN-21970 AC7: the "missing token counts" on 2026-10-28 were a day the newest-500 read never reached, not runs
// without tokens. The cause and the per-day counts (2026-10-26 to 2026-10-31) are recorded on the ticket; this test
// replays those counts. Failure modes, declared before the code, each with a test:
//   T1  a day the read holds no runs for is drawn as "not recorded" instead of zero runs and zero tokens;
//   T2  a day whose runs are partly unmeasured loses its measured tokens, or miscounts its unmeasured runs;
//   T3  a day whose runs carry no token counts at all is drawn as zero instead of not recorded.
import { describe, expect, it } from 'vitest';
import { dailySeries, toInsightRuns } from '@/pages/local/insights';

// Runs with and without token counts per UTC day, as recorded on OMN-21970 on 2026-11-02. Every run without tokens
// was a failed run that no model answered.
const RECORDED: ReadonlyArray<readonly [day: string, withTokens: number, withoutTokens: number]> = [
  ['2026-10-26', 50, 0],
  ['2026-10-27', 55, 2],
  ['2026-10-28', 141, 9],
  ['2026-10-29', 240, 11],
  ['2026-10-30', 437, 19],
  ['2026-10-31', 164, 10],
];
const NOW = Date.parse('2026-10-31T23:00:00Z');

function rowsFor(day: string, withTokens: number, withoutTokens: number): Record<string, unknown>[] {
  const measured = Array.from({ length: withTokens }, () => ({
    written_at: `${day}T10:00:00Z`,
    terminal_ok: true,
    quality_gate_passed: true,
    tokens_input: 10,
    tokens_output: 2,
  }));
  const unmeasured = Array.from({ length: withoutTokens }, () => ({
    written_at: `${day}T11:00:00Z`,
    terminal_ok: false,
    quality_gate_passed: false,
    tokens_input: null,
    tokens_output: null,
  }));
  return [...measured, ...unmeasured];
}

describe('OMN-21970 AC7: per-day token counts', () => {
  it('T1: a day the read holds no runs for is zero runs and zero tokens', () => {
    // The newest-500 read of 2026-10-30 14:02Z held only 2026-10-29 and 2026-10-30.
    const read = toInsightRuns([...rowsFor('2026-10-29', 156, 0), ...rowsFor('2026-10-30', 344, 0)]);
    const day = dailySeries(read, NOW, 6).find((d) => d.day === '2026-10-28');
    expect(day?.runs).toBe(0);
    expect(day?.tokensIn).toBe(0);
    expect(day?.tokensOut).toBe(0);
  });

  it('T2: the full read keeps each recorded day measured, with its unmeasured runs counted', () => {
    const all = toInsightRuns(RECORDED.flatMap(([day, withTokens, withoutTokens]) => rowsFor(day, withTokens, withoutTokens)));
    const byDay = new Map(dailySeries(all, NOW, 6).map((d) => [d.day, d]));
    for (const [day, withTokens, withoutTokens] of RECORDED) {
      const series = byDay.get(day);
      expect(series?.runs, day).toBe(withTokens + withoutTokens);
      expect(series?.tokensIn, day).toBe(withTokens * 10);
      expect(series?.tokensOut, day).toBe(withTokens * 2);
      expect(series?.tokensInUnmeasured, day).toBe(withoutTokens);
    }
  });

  it('T3: a day whose runs carry no token counts stays not recorded', () => {
    const day = dailySeries(toInsightRuns(rowsFor('2026-10-31', 0, 3)), NOW, 1)[0];
    expect(day?.runs).toBe(3);
    expect(day?.tokensIn).toBeNull();
    expect(day?.tokensInUnmeasured).toBe(3);
  });
});
