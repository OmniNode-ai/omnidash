// @vitest-environment jsdom
// OMN-23330 AC7 (the operator's 2026-11-09 review): the Daily trend labels each line's peak value, while every line stays
// scaled to its own busiest day (OMN-22168, Lakshman 2026-11-04) and keeps its monotone curves. The reader saw four lines
// reaching the same height with no number saying how far each one goes.
// Failure modes:
//   P1  a line's peak has no label, or the label names another value (not the line's own busiest day, in its own unit);
//   P2  labelling changes the scale: a line no longer reaches the top at its own peak, or the curve stops being monotone
//       (it overshoots the peak between two points);
//   P3  a line with no served value gets a label ("0", "NaN"), or a tie labels more than one day;
//   P4  two lines peaking on the same or a near day draw their labels on top of each other;
//   P5  a label at the first or last day leaves the plot box.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import postcss from 'postcss';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MultiLinePlot, smoothPath } from '@/theme/design-system/charts';
import { OverviewTrendPanel } from '@/pages/LocalDashboardPage';

const ROOT = path.resolve(__dirname, '../../..');
const DAYS = ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05'];
const plot = (lines: Array<{ key: string; color: string; values: Array<number | null>; peak?: string }>) =>
  render(<MultiLinePlot label="Daily trend" lines={lines} keys={DAYS} labels={DAYS} hover={null} onHover={() => {}} />).container;
const peaks = (container: HTMLElement) => [...container.querySelectorAll<HTMLElement>('.ins-peak')]
  .map((el) => ({ line: el.dataset.line, text: el.textContent, left: el.style.left, top: el.style.top, align: el.dataset.align, row: el.dataset.row }));

describe('OMN-23330 AC7: the Daily trend labels each line\'s peak', () => {
  it('P1: each line\'s busiest day carries its own value, in its own colour', () => {
    const container = plot([
      { key: 'runs', color: 'blue', values: [3, 9, 4, 2, 1], peak: '9 runs' },
      { key: 'spend', color: 'orange', values: [0.2, 0.1, 0.4, 1.25, 0.3], peak: '$1.25 spend' },
    ]);
    expect(peaks(container).map(({ line, text, left }) => ({ line, text, left }))).toEqual([
      { line: 'runs', text: '9 runs', left: '25%' },
      { line: 'spend', text: '$1.25 spend', left: '75%' },
    ]);
    expect((container.querySelector('.ins-peak[data-line="spend"]') as HTMLElement).style.color).toBe('orange');
  });

  it('P2: every line still reaches the top at its own peak, and the curve never overshoots it', () => {
    for (const values of [[3, 9, 4, 2, 1], [0.2, 0.1, 0.4, 1.25, 0.3]]) {
      const d = smoothPath(values, Math.max(...values), 600, 120);
      const ys = [...d.matchAll(/(-?[\d.]+) (-?[\d.]+)/g)].map((match) => Number(match[2]));
      // The peak sits at y = 6 (the top margin); a monotone curve's control points never go above it.
      expect(Math.min(...ys)).toBeCloseTo(6, 1);
    }
  });

  it('P3: a line with no served value gets no label, and a tie labels one day only', () => {
    const container = plot([
      { key: 'empty', color: 'grey', values: [null, null, null, null, null], peak: 'Not recorded' },
      { key: 'tie', color: 'green', values: [5, 2, 5, 1, 0], peak: '5 runs' },
    ]);
    expect(peaks(container).map(({ line, left }) => ({ line, left }))).toEqual([{ line: 'tie', left: '0%' }]);
  });

  it('P4: two lines peaking on the same day stack their labels instead of overlapping', () => {
    const container = plot([
      { key: 'a', color: 'blue', values: [1, 2, 9, 2, 1], peak: '9 runs' },
      { key: 'b', color: 'red', values: [1, 3, 7, 3, 1], peak: '7.1K tokens' },
    ]);
    const [a, b] = peaks(container);
    expect(a!.left).toBe(b!.left);
    expect(a!.row).not.toBe(b!.row);
  });

  it('P5: a label on the first or last day is anchored inward, so it stays inside the plot', () => {
    const container = plot([
      { key: 'first', color: 'blue', values: [9, 2, 1, 1, 1], peak: '9 runs' },
      { key: 'last', color: 'red', values: [1, 1, 1, 2, 9], peak: '$9.00 spend' },
    ]);
    expect(peaks(container).map(({ line, align }) => ({ line, align }))).toEqual([
      { line: 'first', align: 'start' }, { line: 'last', align: 'end' },
    ]);
  });

  it('the Overview Daily trend passes each line\'s peak in its own unit', () => {
    const rows = DAYS.map((day, index) => ({ window_kind: 'day', window_start: day, runs_total: [3, 9, 4, 2, 1][index],
      spend_usd: ['0.20', '0.10', '0.40', '1.25', '0.30'][index] }));
    const { container } = render(<OverviewTrendPanel rows={rows} window="all" now={Date.parse('2026-11-05T12:00:00Z')}
      columns={[{ key: 'runs_total', header: 'Runs', format: 'number' }, { key: 'spend_usd', header: 'Spend', format: 'currency' }]} />);
    expect(peaks(container).map(({ line, text }) => ({ line, text }))).toEqual([
      { line: 'runs', text: '9 runs' }, { line: 'spend', text: '$1.25 spend' },
    ]);
  });

  // Found by the lab Playwright run at 09186244 (readability specs): the labels drew at 11px, under the 12px floor every
  // visible text keeps (OMN-21166), and a one-run peak read "1 runs".
  it('P6: a peak label meets the 12px text floor', () => {
    const css = readFileSync(path.join(ROOT, 'src/theme/design-system/charts/line-plot.css'), 'utf8');
    const sizes: number[] = [];
    postcss.parse(css).walkDecls('font-size', (decl) => {
      if (/\.ins-peak/.test((decl.parent as postcss.Rule).selector)) sizes.push(parseFloat(decl.value));
    });
    expect(sizes.length).toBeGreaterThan(0);
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(12);
  });

  it('P7: a peak of one names its unit in the singular', () => {
    const rows = DAYS.map((day, index) => ({ window_kind: 'day', window_start: day, runs_total: [1, 0, 1, 0, 0][index],
      spend_usd: ['0.01', '0', '0', '0', '0'][index] }));
    const { container } = render(<OverviewTrendPanel rows={rows} window="all" now={Date.parse('2026-11-05T12:00:00Z')}
      columns={[{ key: 'runs_total', header: 'Runs', format: 'number' }, { key: 'spend_usd', header: 'Spend', format: 'currency' }]} />);
    expect(peaks(container).map(({ text }) => text)).toEqual(['1 run', '$0.01 spend']);
  });
});
