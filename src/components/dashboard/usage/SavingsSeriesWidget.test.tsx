// @vitest-environment jsdom
// OMN-20006 Amendment 1, AC-US3: the daily savings series renders metering-summary.v1 day rows as served.
//
// Failure modes each test is written against:
//   * a null savings renders 0 or $0 instead of "Not measured" (D6);
//   * the baseline the savings are stated against is not named in the series title, or an unresolved baseline
//     reads as a number (D7);
//   * the all-time row is drawn as a day, or the page sums the days into a total (D8, TI1);
//   * rows stated against two baselines are mixed under one title.
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SavingsSeries } from './SavingsSeriesWidget';

const day = (overrides: Record<string, unknown>) => ({
  tenant_id: 'tenant-a',
  window_kind: 'day',
  window_start: '2026-10-01',
  window_end: '2026-10-02',
  as_of: '2026-10-02T12:00:00Z',
  baseline_model: 'claude-sonnet-5-5',
  pricing_manifest_version: '1',
  baseline_state: 'resolved',
  runs_total: 3,
  savings_usd: '1.20',
  ...overrides,
});

describe('SavingsSeries', () => {
  it('renders each served day\'s savings as served, with the baseline named in the series title (AC-US3)', () => {
    render(<SavingsSeries rows={[
      day({ window_kind: 'all', window_start: '', savings_usd: '9.99', runs_total: 7 }),
      day({}),
      day({ window_start: '2026-10-02', savings_usd: '0.40', runs_total: 2 }),
    ]} />);
    const table = screen.getByRole('table', { name: 'Savings per day vs claude-sonnet-5-5' });
    // The viewer reads the baseline in the visible column title, not only in the accessible name.
    expect(within(table).getByRole('columnheader', { name: 'Savings vs claude-sonnet-5-5' })).toBeVisible();
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows.map((r) => r.textContent)).toEqual(['2026-10-01$1.203', '2026-10-02$0.402']);
    expect(screen.queryByText(/9\.99/)).not.toBeInTheDocument();
    expect(screen.queryByText(/total/i)).not.toBeInTheDocument();
  });

  it('renders Not measured for a day with no measured run, never 0 (AC-US3)', () => {
    render(<SavingsSeries rows={[day({ savings_usd: null, runs_total: 1 })]} />);
    expect(screen.getByText('Not measured')).toBeInTheDocument();
    expect(screen.queryByText(/^\$?0(?:\.0+)?$/)).not.toBeInTheDocument();
  });

  it('renders Baseline unresolved when the day has no priced baseline', () => {
    render(<SavingsSeries rows={[day({ baseline_state: 'unresolved', savings_usd: null })]} />);
    expect(screen.getByText('Baseline unresolved')).toBeInTheDocument();
  });

  it('keeps each baseline\'s days under its own title', () => {
    render(<SavingsSeries rows={[day({}), day({ baseline_model: 'gpt-6', savings_usd: '2.00' })]} />);
    expect(within(screen.getByRole('table', { name: 'Savings per day vs gpt-6' })).getByText('$2.00')).toBeInTheDocument();
    expect(within(screen.getByRole('table', { name: 'Savings per day vs claude-sonnet-5-5' })).getByText('$1.20')).toBeInTheDocument();
  });

  it('says the figure is modelled, not a baseline run', () => {
    render(<SavingsSeries rows={[day({})]} />);
    expect(screen.getByText(/Modelled/)).toBeInTheDocument();
  });

  it('renders a typed state when no day row is served yet', () => {
    render(<SavingsSeries rows={[day({ window_kind: 'all', window_start: '' })]} />);
    expect(screen.getByRole('status')).toHaveTextContent('No savings rows yet');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});
