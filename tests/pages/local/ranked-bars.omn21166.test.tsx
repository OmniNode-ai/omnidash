// @vitest-environment jsdom
// OMN-21166 AC64: the one ranked bar chart of the local pages (one bar per model, value above, name below, pattern by
// how the figure was obtained). Failure modes, each with a test below:
//   B1  a value that is not served gets a scaled bar or reads $0.00, so it looks measured;
//   B2  measured and estimated bars share one pattern, so the class is told by colour only;
//   B3  the ranking is wrong, or a not-served item is ranked among the served values;
//   B4  the legend names a class the chart does not draw, or leaves out one it does;
//   B5  a negative served value is drawn as a bar above the baseline;
//   B6  a measured zero is drawn as not served, or a not-served item as a measured zero.
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RankedBars, type RankedBarItem } from '@/components/dashboard/RankedBars';

const item = (name: string, value: number | null, basis: RankedBarItem['basis'] = 'measured'): RankedBarItem => ({
  key: name, name, value, basis, display: value === null ? 'Not measured' : `$${value.toFixed(2)}`, color: '#888',
});

function bars() {
  return [...document.querySelectorAll<HTMLElement>('[data-ranked-item]')];
}
function height(name: string): string {
  return (bars().find(bar => bar.dataset.rankedItem === name)!.querySelector('.rb-bar') as HTMLElement).style.height;
}

describe('RankedBars', () => {
  it('B1/B6: a value that is not served gets no scaled bar and its own label; a measured zero stays a measured zero', () => {
    render(<RankedBars label="Spend by model" unit="USD" items={[item('a', 0.5), item('b', null), item('c', 0)]} />);
    const unknown = bars().find(bar => bar.dataset.rankedItem === 'b')!;
    expect(unknown.dataset.basis).toBe('unknown');
    expect(height('b')).toBe('');
    expect(unknown.textContent).toContain('Not measured');
    expect(unknown.textContent).not.toContain('$0.00');
    const zero = bars().find(bar => bar.dataset.rankedItem === 'c')!;
    expect(zero.dataset.basis).toBe('measured');
    expect(height('c')).toBe('0%');
    expect(zero.textContent).toContain('$0.00');
    expect(height('a')).toBe('100%');
  });

  it('B1: an item marked measured but served without a value is still drawn as not served', () => {
    render(<RankedBars label="x" unit="USD" items={[item('a', 1), { ...item('b', null), basis: 'measured' }]} />);
    expect(bars().find(bar => bar.dataset.rankedItem === 'b')!.dataset.basis).toBe('unknown');
  });

  it('B2: measured, estimated and not-served bars each carry a different pattern class', () => {
    render(<RankedBars label="x" unit="USD" items={[item('a', 1), item('b', 2, 'estimated'), item('c', null)]} />);
    const patterns = bars().map(bar => bar.querySelector('.rb-bar')!.getAttribute('data-pattern'));
    expect(new Set(patterns).size).toBe(3);
  });

  it('B3: ranks served values ascending by default and descending on request, with not-served items last', () => {
    const { unmount } = render(<RankedBars label="x" unit="USD" items={[item('big', 3), item('none', null), item('small', 1), item('mid', 2)]} />);
    expect(bars().map(bar => bar.dataset.rankedItem)).toEqual(['small', 'mid', 'big', 'none']);
    unmount();
    render(<RankedBars label="x" unit="USD" order="desc" items={[item('big', 3), item('none', null), item('small', 1), item('mid', 2)]} />);
    expect(bars().map(bar => bar.dataset.rankedItem)).toEqual(['big', 'mid', 'small', 'none']);
  });

  it('B4: the legend names exactly the classes drawn', () => {
    const { unmount } = render(<RankedBars label="x" unit="USD" items={[item('a', 1), item('b', 2)]} />);
    const legend = screen.getByRole('list', { name: 'Chart key' });
    expect(within(legend).getAllByRole('listitem').map(entry => entry.textContent)).toEqual(['Measured']);
    unmount();
    render(<RankedBars label="x" unit="USD" items={[item('a', 1, 'estimated'), item('b', null)]} />);
    expect(within(screen.getByRole('list', { name: 'Chart key' })).getAllByRole('listitem').map(entry => entry.textContent))
      .toEqual(['Estimated', 'Not measured']);
  });

  it('B5: a negative served value keeps its label and draws no bar above the baseline', () => {
    render(<RankedBars label="x" unit="USD" items={[item('neg', -0.4, 'estimated'), item('pos', 0.8, 'estimated')]} />);
    expect(height('neg')).toBe('0%');
    expect(bars().find(bar => bar.dataset.rankedItem === 'neg')!.textContent).toContain('$-0.40');
  });

  it('names each bar with its value and class for a screen reader', () => {
    render(<RankedBars label="Spend by model" unit="USD" items={[item('qwen', 0), item('gemini', 0.07)]} />);
    expect(screen.getByRole('figure', { name: 'Spend by model' })).toBeInTheDocument();
    expect(screen.getByLabelText('gemini: $0.07, measured')).toBeInTheDocument();
  });
});
