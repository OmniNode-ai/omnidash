// @vitest-environment jsdom
// OMN-23330 AC5: the first and last day labels of every daily chart draw inside the chart box, never clipped. Measured
// live 2026-11-09: Overview Runs per day and Tokens per day cut "Sep 29" by 6 px on the left and "Nov 9" by 3 px on the
// right, because each label was centred under its 27 px day slot (42 days in 1,126 px) and a 39 px label overhung it.
// The operator's 2026-11-05 ruling ("Nov 5 should be in middle") stays: a label is centred on its day whenever that fits,
// and only an edge label that would cross the chart's edge is pulled inside.
// Failure mode F3: an end label is clipped at either edge, or overlaps its neighbour after the inset.
import { act, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DayAxis, placeDayLabels } from '@/theme/design-system/charts';

describe('OMN-23330 AC5: placeDayLabels keeps every label inside the axis', () => {
  // 42 days across 1,126 px, labels 39 px wide, as measured live.
  const width = 1126;
  const slot = width / 42;
  const centres = [0, 7, 14, 21, 28, 35, 41].map((index) => (index + 0.5) * slot);
  const widths = centres.map(() => 39);

  it('a centred end label that would cross an edge is pulled inside, flush with that edge', () => {
    const lefts = placeDayLabels(width, centres, widths);
    expect(lefts[0]).toBe(0);
    expect(lefts.at(-1)! + widths.at(-1)!).toBe(width);
  });

  it('control: centring alone would cut both ends (the bug this fixes)', () => {
    expect(centres[0]! - 39 / 2).toBeLessThan(0);
    expect(centres.at(-1)! + 39 / 2).toBeGreaterThan(width);
  });

  it('every label that fits is centred on its day (the 2026-11-05 ruling)', () => {
    const lefts = placeDayLabels(width, centres, widths);
    for (let index = 1; index < centres.length - 1; index += 1) expect(lefts[index]! + 39 / 2).toBeCloseTo(centres[index]!, 6);
  });

  it('an end label on a wide day stays centred, because it fits', () => {
    const wide = placeDayLabels(700, [50, 350, 650], [39, 39, 39]);
    expect(wide).toEqual([50 - 19.5, 350 - 19.5, 650 - 19.5]);
  });

  it('no two labels overlap after the inset, and every label lies within the axis', () => {
    const lefts = placeDayLabels(width, centres, widths);
    for (let index = 0; index < lefts.length; index += 1) {
      expect(lefts[index]!).toBeGreaterThanOrEqual(0);
      expect(lefts[index]! + widths[index]!).toBeLessThanOrEqual(width);
      if (index > 0) expect(lefts[index]!).toBeGreaterThanOrEqual(lefts[index - 1]! + widths[index - 1]!);
    }
  });

  it('at a phone width, a middle label that has no room is hidden; the first and last always show, inside the axis', () => {
    // 30 days in 300 px with eight 39 px labels cannot all fit: the old CSS showed only the first and last under 420 px.
    const narrow = 300; const step = narrow / 30;
    const ticks = [0, 4, 8, 12, 16, 20, 24, 29].map((index) => (index + 0.5) * step);
    const lefts = placeDayLabels(narrow, ticks, ticks.map(() => 39));
    expect(lefts[0]).toBe(0);
    expect(lefts.at(-1)).toBe(narrow - 39);
    const shown = lefts.map((left, index) => [left, index] as const).filter(([left]) => left !== null) as Array<[number, number]>;
    expect(shown.length).toBeLessThan(lefts.length);
    for (let index = 1; index < shown.length; index += 1) expect(shown[index]![0]).toBeGreaterThanOrEqual(shown[index - 1]![0] + 39);
  });
});

describe('OMN-23330 AC5: DayAxis draws its labels at the placed positions', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('draws only the ticked days, and pins the measured end labels inside the axis', async () => {
    // jsdom has no layout: give the axis and each label a measured width.
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      // Six 50 px day slots and 60 px labels: centred, the first would start at -5 px and the last end at 305 px.
      const width = this.classList.contains('ds-day-axis') ? 300 : this.classList.contains('ds-day-axis-label') ? 60 : 0;
      return { x: 0, y: 0, left: 0, top: 0, right: width, bottom: 0, width, height: 0, toJSON: () => ({}) } as DOMRect;
    });
    const days = ['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'];
    const { container } = render(<DayAxis days={days} ticks={new Set([0, 3, 5])} place="slot" />);
    await act(async () => {});
    const labels = [...container.querySelectorAll<HTMLElement>('.ds-day-axis-label')];
    expect(labels.map((label) => label.textContent)).toEqual(['Sep 29', 'Oct 2', 'Oct 4']);
    expect(labels.map((label) => label.style.left)).toEqual(['0px', `${(3.5 / 6) * 300 - 30}px`, '240px']);
    expect(container.querySelector('.ds-day-axis')!.getAttribute('aria-hidden')).toBe('true');
  });
});
