// @vitest-environment jsdom
// OMN-21166 Maple grid: Usage's tokens per day as one vertical stacked chart (days across, one colour per model).
// Failure modes, each with a test below:
//   C1  a token count that is not served is drawn as a zero segment, or the day hides that it is missing;
//   C2  days are out of order, or more days than the window are drawn;
//   C3  the scale is set by a sum that adds a missing value, or a day's height is not its served total;
//   C4  the in/out switch draws the other direction's values;
//   C5  a served zero is dropped from the day's label instead of read as 0.
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { UsageTokensChart } from '@/components/dashboard/usage/UsageByModelDayWidget';

const row = (day: string, model: string, input: number | null, output: number | null) =>
  ({ usage_day: day, model_id: model, input_tokens: input, output_tokens: output, cost_tier_name: 'local' });

function columns() {
  return [...document.querySelectorAll<HTMLElement>('[data-token-day]')];
}
function segment(day: string, model: string) {
  return columns().find(column => column.dataset.tokenDay === day)!.querySelector<HTMLElement>(`[data-token-model="${model}"]`);
}

describe('UsageTokensChart', () => {
  it('C1: a count that is not served draws no segment and the day says it is not recorded', () => {
    render(<UsageTokensChart rows={[row('2026-10-24', 'a', 100, 10), row('2026-10-24', 'b', null, 5)]} />);
    expect(segment('2026-10-24', 'b')).toBeNull();
    const day = columns()[0]!;
    expect(day.getAttribute('aria-label')).toContain('b: not recorded');
    expect(day.querySelector('[data-token-missing]')).not.toBeNull();
  });

  it('C2: days run oldest to newest and only the latest days of the window are drawn', () => {
    const rows = Array.from({ length: 20 }, (_, index) => row(`2026-10-${String(index + 1).padStart(2, '0')}`, 'a', index + 1, 1));
    render(<UsageTokensChart rows={[...rows].reverse()} days={14} />);
    const days = columns().map(column => column.dataset.tokenDay);
    expect(days).toHaveLength(14);
    expect(days[0]).toBe('2026-10-07');
    expect(days[13]).toBe('2026-10-20');
  });

  it('C3: heights are each day\'s served total over the largest served total, missing values add nothing', () => {
    render(<UsageTokensChart rows={[row('2026-10-23', 'a', 50, 1), row('2026-10-24', 'a', 100, 1), row('2026-10-24', 'b', null, 1)]} />);
    const height = (day: string) => columns().find(column => column.dataset.tokenDay === day)!.querySelector<HTMLElement>('.utc-stack')!.style.height;
    expect(height('2026-10-24')).toBe('100%');
    expect(height('2026-10-23')).toBe('50%');
  });

  it('C4: the switch draws tokens out from the out column', () => {
    render(<UsageTokensChart rows={[row('2026-10-24', 'a', 100, 7)]} />);
    expect(columns()[0]!.getAttribute('aria-label')).toContain('a: 100');
    fireEvent.click(screen.getByRole('button', { name: 'Tokens out' }));
    expect(columns()[0]!.getAttribute('aria-label')).toContain('a: 7');
  });

  it('C5: a served zero is read as 0 in the day label', () => {
    render(<UsageTokensChart rows={[row('2026-10-24', 'a', 100, 1), row('2026-10-24', 'b', 0, 0)]} />);
    expect(columns()[0]!.getAttribute('aria-label')).toContain('b: 0');
  });
});
