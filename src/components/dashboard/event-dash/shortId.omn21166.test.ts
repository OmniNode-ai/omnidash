/**
 * OMN-21166 AC6: Delegation Evidence must open on real served rows.
 *
 * `delegation.decisions.v1` serves `id` as an integer (read 2026-10-18 from a
 * lab store of 21 real runs). The page's run chain shows it through `shortId`,
 * which assumed a string: a number skipped the length test and reached
 * `id.indexOf`, so the whole page threw `e.indexOf is not a function` and
 * rendered blank.
 *
 * Failure modes:
 * - a numeric id throws instead of rendering;
 * - a numeric id renders as something other than its digits;
 * - the string behaviour the page already relies on changes.
 */

import { describe, expect, it } from 'vitest';
import { shortId } from './primitives';

describe('shortId', () => {
  it('renders a numeric id, as decisions.v1 serves it, without throwing', () => {
    expect(() => shortId(17)).not.toThrow();
    expect(shortId(17)).toBe('17');
  });

  it('renders the largest integer id exactly as its own digits', () => {
    const big = Number.MAX_SAFE_INTEGER;
    expect(shortId(big)).toBe('9007199254740991');
    expect(shortId(big)).toBe(shortId(String(big)));
  });

  it('keeps zero as zero rather than reading it as missing', () => {
    expect(shortId(0)).toBe('0');
  });

  it('keeps the string behaviour the page relies on', () => {
    expect(shortId(null)).toBe('—');
    expect(shortId(undefined)).toBe('—');
    expect(shortId('')).toBe('—');
    expect(shortId('abc')).toBe('abc');
    expect(shortId('a90ffaff-b44e-4b99-85c8-6fc1ffc23c1d')).toBe('a90ffaff…3c1d');
  });
});
