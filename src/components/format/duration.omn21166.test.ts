import { describe, it, expect } from 'vitest';
import { formatDuration, exactMs } from './duration';

// OMN-21166 AC55 failure mode 4: 999 ms must not round up to "1.0 s" early, null must not read "0 s", and no
// rounding may print "60.0 s" or "1000 ms" at a unit boundary.
describe('formatDuration', () => {
  const cases: Array<[unknown, string]> = [
    [0, '0 ms'],
    [999, '999 ms'],
    [999.4, '999 ms'],
    [999.6, '1.0 s'],
    [1000, '1.0 s'],
    [12181, '12.2 s'],
    [59949, '59.9 s'],
    [59950, '1 min 0 s'],
    [59999, '1 min 0 s'],
    [60000, '1 min 0 s'],
    [64000, '1 min 4 s'],
    [3600000, '1 h 0 min'],
    ['12181', '12.2 s'],
    ['132.5', '133 ms'],
    [null, 'Not recorded'],
    [undefined, 'Not recorded'],
    ['', 'Not recorded'],
    ['abc', 'Not recorded'],
    ['0x10', 'Not recorded'],
    ['1e3', 'Not recorded'],
    [NaN, 'Not recorded'],
    [Infinity, 'Not recorded'],
    [-1, 'Not recorded'],
    [true, 'Not recorded'],
  ];

  it.each(cases)('formatDuration(%j) === %j', (input, expected) => {
    expect(formatDuration(input)).toBe(expected);
  });
});

describe('exactMs', () => {
  it('keeps the exact served milliseconds, grouped', () => {
    expect(exactMs(12181)).toBe('12,181 ms');
    expect(exactMs('132.5')).toBe('132.5 ms');
  });

  it('gives no title for a missing value', () => {
    expect(exactMs(null)).toBeUndefined();
    expect(exactMs('abc')).toBeUndefined();
  });
});
