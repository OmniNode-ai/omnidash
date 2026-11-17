// OMN-24616 AC5: a window parameter that names an Object.prototype member (constructor, toString, __proto__) is a
// malformed address, read as all time with a notice, never a lookup that returns a function and blanks the page.
import { describe, expect, it } from 'vitest';
import { readOverviewWindow } from './page-headline';

describe('readOverviewWindow with a prototype member as the window', () => {
  for (const name of ['constructor', 'toString', '__proto__', 'hasOwnProperty', 'valueOf']) {
    it(`?window=${name} is all time and marked malformed`, () => {
      const read = readOverviewWindow(`?window=${name}`, Date.parse('2026-11-15T12:00:00Z'));
      expect(read).toEqual({ overview: 'all', activity: { kind: 'all' }, malformed: true });
    });
  }

  it('?window=7d still reads as the last 7 days', () => {
    const read = readOverviewWindow('?window=7d', Date.parse('2026-11-15T12:00:00Z'));
    expect(read).toEqual({ overview: 'range:2026-11-09..2026-11-15', activity: { kind: 'days', days: 7 }, malformed: false });
  });
});
