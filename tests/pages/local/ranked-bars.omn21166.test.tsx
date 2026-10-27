// @vitest-environment jsdom
// OMN-21166 AC64: the one ranked bar chart of the local pages (one bar per model, value above, name below). Live review
// 2026-10-26 ("all bar graph follow this style", option "Hatch all, say it in words"): every drawn bar is hatched, so
// measured and modelled are told in words (the unit line and each bar's name), not by pattern. Failure modes:
//   B1  a value that is not served gets a scaled bar or reads $0.00, so it looks measured;
//   B2  a not-served item is drawn like a served bar; or the measured/modelled class is in no words at all;
//   B3  the ranking is wrong, or a not-served item is ranked among the served values;
//   B4  a pattern key is still drawn, though the pattern no longer carries a class;
//   B5  a negative served value is drawn as a bar above the baseline;
//   B6  a measured zero is drawn as not served, or a not-served item as a measured zero.
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RankedBars, type RankedBarItem } from '@/components/dashboard/RankedBars';

const item = (name: string, value: number | null, basis: RankedBarItem['basis'] = 'measured'): RankedBarItem => ({
  key: name, name, value, basis, display: value === null ? 'Not measured' : `$${value.toFixed(2)}`, color: '#888',
});

function bars() {
  return [...document.querySelectorAll<HTMLElement>('[data-ranked-item]')];
}
function height(name: string): string {
  return (bars().find(bar => bar.dataset.rankedItem === name)!.querySelector('.rb-bar') as HTMLElement).style.getPropertyValue('--rb-size');
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

  it('B2: a drawn bar is hatched whatever its class; a not-served item is an outline; the class is in words', () => {
    render(<RankedBars label="x" unit="USD" items={[item('a', 1), item('b', 2, 'estimated'), item('c', null)]} />);
    const patterns = bars().map(bar => bar.querySelector('.rb-bar')!.getAttribute('data-pattern'));
    expect(patterns).toEqual(['hatched', 'hatched', 'outline']);
    expect(screen.getByLabelText('a: $1.00, measured')).toBeInTheDocument();
    expect(screen.getByLabelText('b: $2.00, modelled')).toBeInTheDocument();
    expect(screen.getByLabelText('c: Not measured, not measured')).toBeInTheDocument();
  });

  it('B3: ranks served values ascending by default and descending on request, with not-served items last', () => {
    const { unmount } = render(<RankedBars label="x" unit="USD" items={[item('big', 3), item('none', null), item('small', 1), item('mid', 2)]} />);
    expect(bars().map(bar => bar.dataset.rankedItem)).toEqual(['small', 'mid', 'big', 'none']);
    unmount();
    render(<RankedBars label="x" unit="USD" order="desc" items={[item('big', 3), item('none', null), item('small', 1), item('mid', 2)]} />);
    expect(bars().map(bar => bar.dataset.rankedItem)).toEqual(['big', 'mid', 'small', 'none']);
  });

  it('B4: no pattern key is drawn', () => {
    render(<RankedBars label="x" unit="USD" items={[item('a', 1, 'estimated'), item('b', null)]} />);
    expect(screen.queryByRole('list', { name: 'Chart key' })).toBeNull();
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
