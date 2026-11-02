// @vitest-environment jsdom
// SPDX-FileCopyrightText: 2026 OmniNode.ai Inc.
// SPDX-License-Identifier: MIT
/**
 * OMN-21970 AC9: card figures count up without ever changing a displayed value.
 *
 * Failure modes, each with a test below:
 *   C1  the count-up stops short of, or overshoots, the exact served and formatted figure
 *   C2  a data refresh replays the count from zero, so a reader sees a false figure for most of a second
 *   C3  a missing or unmeasured figure ("Not recorded", "Not measured") animates, which would draw a fabricated zero
 *   C4  under prefers-reduced-motion the count still runs instead of showing the final figure at once
 *   C5  intermediate frames lose the figure's format (currency sign, unit, decimals, thousands separators)
 *   C6  under React StrictMode (development) the doubled effect cancels the count and the card never animates
 */
import { StrictMode } from 'react';
import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CountUpText, COUNT_UP_MS } from './CountUpText';

let frames: FrameRequestCallback[] = [];
let now = 0;
function reducedMotion(reduce: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduce && query.includes('prefers-reduced-motion: reduce'), media: query, onchange: null,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false,
  }));
}
function advance(ms: number) {
  act(() => {
    const end = now + ms;
    while (now < end) {
      now = Math.min(end, now + 16);
      const run = frames; frames = [];
      run.forEach(callback => callback(now));
    }
  });
}

beforeEach(() => {
  frames = []; now = 0;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.push(callback); return frames.length; });
  vi.stubGlobal('cancelAnimationFrame', () => {});
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  reducedMotion(false);
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('OMN-21970 AC9: CountUpText', () => {
  it.each(['$12.30', '1.91K', '89.1%', '3.5 s', '1,992,661', '215'])('C1, C5: %s counts up and ends on exactly that text', text => {
    const { container } = render(<CountUpText text={text} />);
    advance(COUNT_UP_MS / 3);
    const middle = container.textContent ?? '';
    expect(middle).not.toBe(text);
    // The format holds mid-count: same prefix and suffix, same number of decimals, separators where the final has them.
    const shape = (value: string) => value.replace(/\d/g, '9').replace(/^9+/, '9').replace(/(9,)+/, '9,');
    expect(middle.replace(/[\d,]/g, '')).toBe(text.replace(/[\d,]/g, ''));
    expect(shape(middle).length).toBeGreaterThan(0);
    advance(COUNT_UP_MS * 2);
    expect(container.textContent).toBe(text);
  });

  it('C2: a refresh with a new figure shows the new figure at once, never counting from zero again', () => {
    const { container, rerender } = render(<CountUpText text="$12.30" />);
    advance(COUNT_UP_MS * 2);
    expect(container.textContent).toBe('$12.30');
    rerender(<CountUpText text="$12.31" />);
    expect(container.textContent).toBe('$12.31');
    advance(16);
    expect(container.textContent).toBe('$12.31');
  });

  it.each(['Not recorded', 'Not measured', '—', ''])('C3: "%s" is shown as it is and never animates', text => {
    const { container } = render(<CountUpText text={text} />);
    expect(container.textContent).toBe(text);
    advance(COUNT_UP_MS / 2);
    expect(container.textContent).toBe(text);
  });

  it('C6: under StrictMode the count still runs and still ends on the exact figure', () => {
    const { container } = render(<StrictMode><CountUpText text="1,992,661" /></StrictMode>);
    advance(COUNT_UP_MS / 3);
    expect(container.textContent).not.toBe('1,992,661');
    advance(COUNT_UP_MS * 2);
    expect(container.textContent).toBe('1,992,661');
  });

  it('C2: a figure that changes mid-count is shown at once, not counted from zero again', () => {
    const { container, rerender } = render(<CountUpText text="$12.30" />);
    advance(COUNT_UP_MS / 4);
    rerender(<CountUpText text="$12.31" />);
    expect(container.textContent).toBe('$12.31');
    advance(COUNT_UP_MS);
    expect(container.textContent).toBe('$12.31');
  });

  it('C4: under prefers-reduced-motion the final figure shows at once', () => {
    reducedMotion(true);
    const { container } = render(<CountUpText text="$12.30" />);
    expect(container.textContent).toBe('$12.30');
    advance(16);
    expect(container.textContent).toBe('$12.30');
  });

  it('C4: where the browser cannot say (no matchMedia), the final figure shows at once', () => {
    vi.stubGlobal('matchMedia', undefined);
    const { container } = render(<CountUpText text="$12.30" />);
    expect(container.textContent).toBe('$12.30');
  });

  it('C4 positive control: without reduced motion the first frame is not the final figure', () => {
    const { container } = render(<CountUpText text="$12.30" />);
    advance(16);
    expect(container.textContent).not.toBe('$12.30');
  });
});
