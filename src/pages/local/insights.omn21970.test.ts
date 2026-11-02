// SPDX-FileCopyrightText: 2026 OmniNode.ai Inc.
// SPDX-License-Identifier: MIT
/**
 * OMN-21970 AC4 and AC7: a day with no runs is zero, a day whose runs carry no token counts is not recorded.
 *
 * Failures caught:
 * - a day with no served runs reads "not recorded in, not recorded out" (the 2026-10-28 report), when it had nothing
 *   to record;
 * - a day whose runs really carry no token counts is drawn as zero instead of not recorded;
 * - a partly measured day loses its measured tokens or its count of unmeasured runs.
 */
import { describe, expect, it } from 'vitest';
import { dailySeries, toInsightRuns } from './insights';

const NOW = Date.parse('2026-10-30T12:00:00Z');
const run = (day: string, tokens: number | null) => ({
  written_at: `${day}T09:00:00Z`,
  terminal_ok: true,
  quality_gate_passed: true,
  tokens_input: tokens,
  tokens_output: tokens === null ? null : tokens / 10,
});

describe('Tokens per day (OMN-21970)', () => {
  const days = dailySeries(
    toInsightRuns([run('2026-10-29', 100), run('2026-10-29', 200), run('2026-10-30', null)]),
    NOW,
    3,
  );
  const byDay = Object.fromEntries(days.map(day => [day.day, day]));

  it('a day with no runs is zero runs and zero tokens, not "not recorded"', () => {
    expect(byDay['2026-10-28'].runs).toBe(0);
    expect(byDay['2026-10-28'].tokensIn).toBe(0);
    expect(byDay['2026-10-28'].tokensOut).toBe(0);
    expect(byDay['2026-10-28'].tokensInUnmeasured).toBe(0);
  });

  it('a day whose runs carry no token counts stays not recorded, never zero', () => {
    expect(byDay['2026-10-30'].runs).toBe(1);
    expect(byDay['2026-10-30'].tokensIn).toBeNull();
    expect(byDay['2026-10-30'].tokensInUnmeasured).toBe(1);
  });

  it('a measured day keeps its totals', () => {
    expect(byDay['2026-10-29'].tokensIn).toBe(300);
    expect(byDay['2026-10-29'].tokensOut).toBe(30);
  });
});
