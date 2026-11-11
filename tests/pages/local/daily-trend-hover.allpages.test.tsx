// @vitest-environment jsdom
// The Daily trend's hover (the operator, 2026-11-10, on a screenshot of the hovered chart: "when hover then show where
// cursor point and proper details or we already showing details then why over graph needed?"). The readout above the plot
// already gives the pointed day in full, so the peak labels AC7 drew over the lines are removed (this ruling supersedes
// AC7's labels, and the earlier hover-only step); the plot instead shows where the pointer is: a guide line on that day
// and a dot where each line sits. Every line stays scaled to its own busiest day with monotone curves (OMN-22168).
// Failure modes:
//   H1  a value label is drawn over the plot (the readout is the one place values are given);
//   H2  pointing at a day draws no guide line, or no dot for a line served that day, or a dot for a line not served;
//   H3  the guide line has no colour on a multi-line plot (it took a colour only single-line plots set);
//   H4  the readout does not name the pointed day, or a count of one reads in the plural ("1 runs");
//   H5  the scale changes: a line no longer reaches the top at its own peak, or its curve overshoots the peak.
import postcss from 'postcss';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MultiLinePlot, smoothPath } from '@/theme/design-system/charts';
import { OverviewTrendPanel } from '@/pages/LocalDashboardPage';
import { pageStylesheet } from '@/tests/page-stylesheet';

const DAYS = ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05'];
const LINES = [
  { key: 'runs', color: 'blue', values: [3, 9, 4, 2, 1] },
  { key: 'spend', color: 'orange', values: [0.2, null, 0.4, 1.25, 0.3] },
];

describe('The Daily trend shows where the pointer is and gives values only in its readout', () => {
  it('H1: no value label is drawn over the Overview Daily trend', () => {
    const rows = DAYS.map((day, index) => ({ window_kind: 'day', window_start: day, runs_total: [3, 9, 4, 2, 1][index] }));
    const { container } = render(<OverviewTrendPanel rows={rows} window="all" now={Date.parse('2026-11-05T12:00:00Z')}
      columns={[{ key: 'runs_total', header: 'Runs', format: 'number' }]} />);
    expect(container.querySelector('.ins-plot--multi')).not.toBeNull();
    expect(container.querySelectorAll('.ins-peak')).toHaveLength(0);
    expect(container.querySelector('.ins-plot--multi')?.getAttribute('style') ?? '').not.toContain('--ins-peak-rows');
  });

  it('H2: pointing at a day draws its guide line and a dot for each line served that day', () => {
    const { container } = render(<MultiLinePlot label="Daily trend" lines={LINES} keys={DAYS} labels={DAYS} hover={1} onHover={() => {}} />);
    const marker = container.querySelector<HTMLElement>('.ins-marker');
    expect(marker?.style.left).toBe('25%');
    const dots = [...container.querySelectorAll<HTMLElement>('.ins-dot[data-active="true"]')];
    expect(dots.map((dot) => [dot.style.left, dot.style.background])).toEqual([['25%', 'blue']]);
  });

  it('H3: the guide line has a colour on a multi-line plot', () => {
    const css = pageStylesheet('local-dashboard');
    const backgrounds: string[] = [];
    postcss.parse(css).walkDecls('background', (decl) => {
      if (/\.ins-marker\b/.test((decl.parent as postcss.Rule).selector)) backgrounds.push(decl.value);
    });
    expect(backgrounds.length).toBeGreaterThan(0);
    // Every --ins-accent read has a fallback, since a multi-line plot sets no accent of its own.
    for (const value of backgrounds) expect(value.match(/var\(--ins-accent\)/g)).toBeNull();
  });

  it('H4: the readout names the pointed day, and a count of one reads in the singular', () => {
    const rows = DAYS.map((day, index) => ({ window_kind: 'day', window_start: day, runs_total: [1, 9, 4, 2, 1][index],
      spend_usd: ['0.01', '0.10', '0.40', '1.25', '0.30'][index] }));
    const { container } = render(<OverviewTrendPanel rows={rows} window="all" now={Date.parse('2026-11-05T12:00:00Z')}
      columns={[{ key: 'runs_total', header: 'Runs', format: 'number' }, { key: 'spend_usd', header: 'Spend', format: 'currency' }]} />);
    const hits = within(container).getAllByRole('button').filter((button) => button.classList.contains('ins-hit'));
    fireEvent.mouseEnter(hits[0]!);
    expect(container.querySelector('.ins-readout')?.textContent).toMatch(/^Nov 1 · 1 run · \$0\.01 spend$/);
    expect(screen.queryByText(/1 runs/)).toBeNull();
  });

  it('H5: every line still reaches the top at its own peak, and the curve never overshoots it', () => {
    for (const values of [[3, 9, 4, 2, 1], [0.2, 0.1, 0.4, 1.25, 0.3]]) {
      const d = smoothPath(values, Math.max(...values), 600, 120);
      const ys = [...d.matchAll(/(-?[\d.]+) (-?[\d.]+)/g)].map((match) => Number(match[2]));
      // The peak sits at y = 6 (the top margin); a monotone curve's control points never go above it.
      expect(Math.min(...ys)).toBeCloseTo(6, 1);
    }
  });
});
