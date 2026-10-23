// Failure modes: rounding up, floating point cent loss, tiny values hidden as zero,
// negative sign lost, decimal strings coerced through an imprecise float, missing data fabricated.
import { describe, expect, it } from 'vitest';
import { formatUsd } from './UsageByModelDayWidget';

describe('OMN-21015 monetary display amendment', () => {
  it.each([
    [3.5923, '$3.59'], ['1074.2157', '$1,074.21'], [0.01999, '$0.01'],
    [0.009, '$0.01'], [0, '$0.00'], [-3.5923, '-$3.59'], [-0.009, '-$0.01'],
    [1.15, '$1.15'], ['1.99999999', '$1.99'], ['1e-8', '$0.01'],
    ['-1e-8', '-$0.01'], ['001.2300', '$1.23'], ['0.000', '$0.00'],
    ['9007199254740993.1299', '$9,007,199,254,740,993.12'],
  ])('%s renders as %s', (value, expected) => expect(formatUsd(value)).toBe(expected));
  it.each([null, undefined, '', ' ', NaN, Infinity, 'unmeasured', false])('refuses %s', value => {
    expect(formatUsd(value)).toBe('Not measured');
  });
});
