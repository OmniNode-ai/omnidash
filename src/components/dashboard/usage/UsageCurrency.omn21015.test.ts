// Failure modes: rounding up, floating point cent loss, tiny values hidden as zero,
// negative sign lost, decimal strings coerced through an imprecise float, missing data fabricated.
// OMN-22168 (Jonah 2026-11-06, replacing "show full don't cut"): two decimals from $1 up, up to four below $1 with
// trailing zeros trimmed to two; digits past that are cut, never rounded up, and a tiny nonzero amount is never zero.
import { describe, expect, it } from 'vitest';
import { formatDashboardUsd as formatUsd } from '@/theme/format';

describe('OMN-21015 monetary display amendment', () => {
  it.each([
    [3.5923, '$3.59'], ['1074.2157', '$1,074.21'], [0.01999, '$0.0199'],
    [0.009, '$0.009'], [0, '$0.00'], [-3.5923, '-$3.59'], [-0.009, '-$0.009'],
    [1.15, '$1.15'], ['1.99999999', '$1.99'], ['1e-8', '$0.0001'],
    ['-1e-8', '-$0.0001'], ['001.2300', '$1.23'], ['0.000', '$0.00'],
    ['18.188068', '$18.18'], ['0.232022', '$0.232'], ['0.5', '$0.50'], ['0.99999', '$0.9999'],
    ['1', '$1.00'], ['0.00012345', '$0.0001'], ['1e-400', '$0.0001'],
    ['9007199254740993.1299', '$9,007,199,254,740,993.12'],
  ])('%s renders as %s', (value, expected) => expect(formatUsd(value)).toBe(expected));
  it.each([null, undefined, '', ' ', NaN, Infinity, 'unmeasured', false])('refuses %s', value => {
    expect(formatUsd(value)).toBe('Not measured');
  });
});
