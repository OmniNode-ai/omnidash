// @vitest-environment jsdom
// OMN-21166 AC26 (mockup build, 2026-10-18): "Since your last visit" on the Overview header. The last visit is a
// per-browser convenience kept in localStorage; the counts are the served runs written after it.
//
// Failure modes, each with a test below:
//   V1  a first visit (nothing stored) shows invented counts instead of nothing
//   V2  runs before the last visit are counted, or runs after it are missed
//   V3  a run with no recorded verdict is counted as failed
//   V4  the stored visit is not moved forward, so the same runs read as new on every load
//   V5  storage that throws (private window, blocked site data) breaks the page
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LAST_VISIT_KEY, SinceLastVisit } from './since-last-visit';

const NOW = Date.parse('2026-10-18T09:30:00Z');
const row = (at: string, passed: unknown = 1) => ({ written_at: at, quality_gate_passed: passed });
const ROWS = [row('2026-10-17T10:00:00Z'), row('2026-10-17T19:00:00Z'), row('2026-10-18T08:00:00Z', 0), row('2026-10-18T09:00:00Z', null)];

afterEach(() => { window.localStorage.clear(); vi.restoreAllMocks(); });

describe('OMN-21166: since your last visit', () => {
  it('V1: a first visit shows nothing and records the visit', () => {
    const { container } = render(<SinceLastVisit decisions={ROWS} now={NOW} />);
    expect(container).toBeEmptyDOMElement();
    expect(window.localStorage.getItem(LAST_VISIT_KEY)).toBe(String(NOW));
  });

  it('V2, V3: counts only runs after the last visit; an unrecorded verdict is not a failure', () => {
    window.localStorage.setItem(LAST_VISIT_KEY, String(Date.parse('2026-10-17T18:30:00Z')));
    render(<SinceLastVisit decisions={ROWS} now={NOW} />);
    expect(screen.getByRole('status', { name: 'Since your last visit' })).toHaveTextContent(
      'Since your last visit · Oct 17, 18:30 UTC3 new runs1 failed');
  });

  it('V4: the stored visit moves to now', () => {
    window.localStorage.setItem(LAST_VISIT_KEY, String(Date.parse('2026-10-17T18:30:00Z')));
    render(<SinceLastVisit decisions={ROWS} now={NOW} />);
    expect(window.localStorage.getItem(LAST_VISIT_KEY)).toBe(String(NOW));
  });

  it('V5: storage that throws leaves the page drawing, with nothing shown', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    const { container } = render(<SinceLastVisit decisions={ROWS} now={NOW} />);
    expect(container).toBeEmptyDOMElement();
  });
});
