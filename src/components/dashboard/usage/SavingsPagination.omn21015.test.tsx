// @vitest-environment jsdom
// Failure modes: missing/duplicated days, mixing baselines, stale page after refresh,
// all-time rows mistaken for days, and keyboard controls that cannot reach the last row.
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { MeteringDaySeries } from './SavingsSeriesWidget';
afterEach(cleanup);
const rows = (count: number, baseline = 'baseline-a') => Array.from({ length: count }, (_, i) => ({
  window_kind: 'day', window_start: `day-${i + 1}`, baseline_model: baseline,
  baseline_state: 'resolved', savings_usd: '1.2399', runs_total: i + 1,
}));
it.each([1, 8, 9, 59])('pages all %s days exactly once', count => {
  render(<MeteringDaySeries rows={rows(count)} />);
  const table = screen.getByRole('table', { name: 'Savings per day vs baseline-a' });
  const found: string[] = [];
  for (;;) {
    const visible = within(table).getAllByRole('row').slice(1);
    expect(visible.length).toBeLessThanOrEqual(8);
    found.push(...visible.map(row => within(row).getAllByRole('cell')[0]!.textContent!));
    const next = screen.getByRole('button', { name: 'Next savings days for baseline-a' });
    if (next.hasAttribute('disabled')) break;
    fireEvent.click(next);
  }
  expect(found).toEqual(rows(count).map(row => row.window_start));
  expect(screen.getByRole('button', { name: 'Next savings days for baseline-a' })).toBeDisabled();
});
it('clamps a shortened refresh and keeps each baseline independent', () => {
  const view = render(<MeteringDaySeries rows={[...rows(9), ...rows(1, 'baseline-b')]} />);
  fireEvent.click(screen.getByRole('button', { name: 'Next savings days for baseline-a' }));
  expect(within(screen.getByRole('table', { name: 'Savings per day vs baseline-a' })).getByText('day-9')).toBeVisible();
  expect(within(screen.getByRole('table', { name: 'Savings per day vs baseline-b' })).getByText('day-1')).toBeVisible();
  view.rerender(<MeteringDaySeries rows={rows(1)} />);
  expect(within(screen.getByRole('table')).getByText('day-1')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Previous savings days for baseline-a' })).toBeDisabled();
  view.rerender(<MeteringDaySeries rows={[]} />);
  expect(screen.getByRole('status')).toHaveTextContent('No daily savings data');
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});
