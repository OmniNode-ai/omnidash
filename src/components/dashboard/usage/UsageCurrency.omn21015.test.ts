// Failure modes: rounding up, floating point cent loss, tiny values hidden as zero,
// negative sign lost, decimal strings coerced through an imprecise float, missing data fabricated.
// OMN-22168 (Lakshman 2026-11-04, "show full don't cut"; he chose the full served value): every served digit is shown,
// trailing zeros trimmed, at least two decimals; still no float rounding, and nothing is cut to the cent.
import { describe, expect, it } from 'vitest';
import { formatUsd } from './UsageByModelDayWidget';

describe('OMN-21015 monetary display amendment', () => {
  it.each([
    [3.5923, '$3.5923'], ['1074.2157', '$1,074.2157'], [0.01999, '$0.01999'],
    [0.009, '$0.009'], [0, '$0.00'], [-3.5923, '-$3.5923'], [-0.009, '-$0.009'],
    [1.15, '$1.15'], ['1.99999999', '$1.99999999'], ['1e-8', '$0.00000001'],
    ['-1e-8', '-$0.00000001'], ['001.2300', '$1.23'], ['0.000', '$0.00'],
    ['18.188068', '$18.188068'], ['0.232022', '$0.232022'],
    ['9007199254740993.1299', '$9,007,199,254,740,993.1299'],
  ])('%s renders as %s', (value, expected) => expect(formatUsd(value)).toBe(expected));
  it.each([null, undefined, '', ' ', NaN, Infinity, 'unmeasured', false])('refuses %s', value => {
    expect(formatUsd(value)).toBe('Not measured');
  });
});
