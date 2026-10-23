import { describe, expect, it } from 'vitest';
import { dailyMeteringTokens } from './daily-metering-tokens';

// Failure modes: mixing baselines, summing duplicate windows, fabricating missing days,
// unsafe integer rounding, missing directions becoming zero, and replacing producer time with fetch time.
const all = { window_kind: 'all', baseline_model: 'baseline-a', as_of: '2026-10-22T10:00:00Z' };
const day = { window_kind: 'day', baseline_model: 'baseline-a', window_start: '2026-10-22',
  as_of: '2026-10-22T09:47:13Z', tokens_in: '5635984', tokens_out: '514634', runs_unknown_tokens: 2 };

describe('served daily metering tokens, without a fabricated model split', () => {
  it('retains exact direction counts, coverage and the producer timestamp', () => {
    const result = dailyMeteringTokens([all, day]);
    expect(result.reason).toBeNull();
    expect(result.baseline).toBe('baseline-a');
    expect(result.days).toEqual([{ day: '2026-10-22', input: '5635984', output: '514634',
      unknownTokenRuns: '2', asOf: '2026-10-22T09:47:13Z' }]);
  });

  it('uses the newest all-time context and never adds another baseline', () => {
    const result = dailyMeteringTokens([
      all, day, { ...all, baseline_model: 'baseline-b', as_of: '2026-10-22T11:00:00Z' },
      { ...day, baseline_model: 'baseline-b', tokens_in: 7, tokens_out: 3 },
    ]);
    expect(result.baseline).toBe('baseline-b');
    expect(result.days[0]?.input).toBe('7');
    expect(result.days[0]?.output).toBe('3');
  });

  it('refuses tied all-time contexts', () => {
    const result = dailyMeteringTokens([all, { ...all, baseline_model: 'baseline-b' }, day]);
    expect(result.days).toEqual([]);
    expect(result.reason).toMatch(/ambiguous/i);
  });

  it('does not guess a context from day rows alone', () => {
    const result = dailyMeteringTokens([day]);
    expect(result.days).toEqual([]);
    expect(result.reason).toMatch(/all-time|context/i);
  });

  it('refuses duplicate days instead of double-counting them', () => {
    const result = dailyMeteringTokens([all, day, { ...day }]);
    expect(result.days).toEqual([]);
    expect(result.reason).toMatch(/duplicate/i);
  });

  it('keeps a known zero apart from a missing direction', () => {
    const result = dailyMeteringTokens([all, { ...day, tokens_in: 0, tokens_out: null, runs_unknown_tokens: null }]);
    expect(result.days[0]).toMatchObject({ input: '0', output: null, unknownTokenRuns: null });
  });

  it('preserves arbitrary integer strings and rejects unsafe numeric counts', () => {
    const result = dailyMeteringTokens([all, { ...day, tokens_in: '9007199254740993', tokens_out: 9007199254740992 }]);
    expect(result.days[0]).toMatchObject({ input: '9007199254740993', output: null });
  });

  it.each([-1, '1.2', '', false, Number.NaN])('keeps an invalid token count unknown: %s', value => {
    const result = dailyMeteringTokens([all, { ...day, tokens_in: value }]);
    expect(result.days[0]?.input).toBeNull();
    expect(result.days[0]?.output).toBe('514634');
  });

  it('retains only served dates in sorted order, without padding absent days with zero', () => {
    const result = dailyMeteringTokens([all, day, { ...day, window_start: '2026-10-20' }]);
    expect(result.days.map(row => row.day)).toEqual(['2026-10-20', '2026-10-22']);
  });

  it('refuses impossible calendar dates', () => {
    const result = dailyMeteringTokens([all, { ...day, window_start: '2026-02-30' }]);
    expect(result.days).toEqual([]);
    expect(result.reason).toMatch(/date/i);
  });
});
