import { describe, expect, it } from 'vitest';
import { formatDashboardCount, formatFullCount } from './dashboard-count';

// Failure modes: rounding across a scale boundary, binary precision loss, malformed/missing
// values displayed as zero, exponent overflow and compacting an explicitly directional token count.
describe('OMN-21015 compact counts', () => {
  it.each([
    [0, '0'], [999, '999'], [1000, '1K'], [1250, '1.25K'], [999999, '999.99K'],
    [1000000, '1M'], [309271491, '309.27M'], [1000000000, '1B'], [1250000000000, '1.25T'],
    ['9007199254740993', '9,007.19T'], ['999999999999999999999999', '999,999,999,999.99T'],
    ['001250.000', '1.25K'], ['1e6', '1M'], [-1250, '-1.25K'], ['999.999', '999.99'],
    ['1.239', '1.23'], ['0.009', '0'], ['1e-30', '0'], ['-0', '0'],
  ])('%s → %s', (value, expected) => expect(formatDashboardCount(value)).toBe(expected));
  it.each([null, undefined, '', ' ', NaN, Infinity, false, {}, [], 'unmeasured', '1,000', '1e100000'])('refuses %s', value => {
    expect(formatDashboardCount(value)).toBe('Not measured');
    expect(formatFullCount(value)).toBe('Not measured');
  });
  it.each([
    [0, '0'], [309271491, '309,271,491'], ['9007199254740993', '9,007,199,254,740,993'],
    ['1e6', '1,000,000'], ['001250', '1,250'], [-1250, '-1,250'],
  ])('full %s → %s', (value, expected) => expect(formatFullCount(value)).toBe(expected));
  it('does not round or invent fractional tokens', () => expect(formatFullCount('1250.5')).toBe('Not measured'));
  // JSON numbers beyond the safe integer boundary have already lost source precision.
  // Exact decimal strings remain accepted by the existing full/compact positive controls.
  it.each([Number.MAX_SAFE_INTEGER + 1, -(Number.MAX_SAFE_INTEGER + 1)])('refuses an imprecise numeric count %s', value => {
    expect(formatFullCount(value)).toBe('Not measured');
    expect(formatDashboardCount(value)).toBe('Not measured');
  });
});
