// @vitest-environment jsdom
// OMN-21166 AC42: the Overview metering KPIs (spend and savings for the selected AC40 window). Moved from
// src/pages/local/insight-charts.omn21166.test.tsx so the hosted merge-base control overlays it (tests/ paths only).
import { render, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MeteringActivityInsights } from '@/pages/local/insight-charts';

const NOW = Date.parse('2026-10-18T09:30:00Z');

// AC42 (Lakshman 2026-10-21 ~19:10Z; All is spend only, ~19:40Z, AC37): the metering KPIs follow the All and custom
// windows too. Failure modes: All shows "Unavailable" although the all-time row is served, shows a sum of day rows
// instead of that row, or shows a second savings figure beside the Overview's one savings headline; a custom range shows "Unavailable" although every day in it is served; a custom range that reaches past
// the served day rows, or has a day with no served row, is summed as if the missing day were zero; a range with no
// served day rows prints $0.00; an end date before the start date shows a figure.
describe('AC42: metering KPIs for the All and custom windows', () => {
  const METERING_ROWS = [
    { window_kind: 'all', window_start: '', as_of: '2026-10-18T09:00:00Z', baseline_model: 'baseline-a', spend_usd: '9.99', savings_usd: '8.88', counterfactual_usd: '18.87', runs_total: 12 },
    { window_kind: 'day', window_start: '2026-10-10', baseline_model: 'baseline-a', spend_usd: '0.10', savings_usd: '0.05', counterfactual_usd: '0.15', runs_total: 1 },
    { window_kind: 'day', window_start: '2026-10-11', baseline_model: 'baseline-a', spend_usd: '0.20', savings_usd: '0.15', counterfactual_usd: '0.35', runs_total: 2 },
    { window_kind: 'day', window_start: '2026-10-12', baseline_model: 'baseline-a', spend_usd: '0.30', savings_usd: '0.25', counterfactual_usd: '0.55', runs_total: 3 },
    { window_kind: 'day', window_start: '2026-10-14', baseline_model: 'baseline-a', spend_usd: '0.40', savings_usd: '0.35', counterfactual_usd: '0.75', runs_total: 4 },
  ];
  const kpis = (window: Parameters<typeof MeteringActivityInsights>[0]['window'], rows: readonly unknown[] = METERING_ROWS) => {
    const view = render(<MeteringActivityInsights now={NOW} unavailable={null} window={window} rows={rows} display="kpis" />);
    return Object.assign(within(view.container).getByRole('region', { name: /^Metered spend summary for / }), { unmount: view.unmount });
  };

  it('All shows the served all-time spend, not a sum of the day rows, and no Saved figure', () => {
    const summary = kpis({ kind: 'all' });
    expect(within(summary).getByText('You paid')).toBeInTheDocument();
    expect(summary).toHaveTextContent('$9.99');
    expect(summary).not.toHaveTextContent('Unavailable');
    expect(summary).not.toHaveTextContent('$1.00');
    expect(within(summary).queryByText('Saved')).toBeNull();
    expect(summary).not.toHaveTextContent('$8.88');
  });

  it('All with no served all-time row stays unavailable and shows no figure', () => {
    const summary = kpis({ kind: 'all' }, METERING_ROWS.slice(1));
    expect(within(summary).getAllByText('Unavailable')).toHaveLength(1);
    expect(summary).not.toHaveTextContent('$');
  });

  it('a custom range inside the served day rows shows the sum of those served days', () => {
    const summary = kpis({ kind: 'custom', start: '2026-10-10', end: '2026-10-11' });
    expect(summary).toHaveTextContent('$0.30');
    expect(summary).toHaveTextContent('$0.20');
    expect(summary).not.toHaveTextContent('Unavailable');
  });

  it('a custom range partly outside the served day rows, or with an unserved day, stays unavailable with a reason', () => {
    const outside = kpis({ kind: 'custom', start: '2026-10-12', end: '2026-10-16' });
    expect(within(outside).getAllByText('Unavailable')).toHaveLength(2);
    expect(outside).toHaveTextContent(/outside the dates with served daily rows/);
    expect(outside).not.toHaveTextContent('$');
    outside.unmount();
    const gap = kpis({ kind: 'custom', start: '2026-10-12', end: '2026-10-14' });
    expect(within(gap).getAllByText('Unavailable')).toHaveLength(2);
    expect(gap).toHaveTextContent('2 of 3 daily rows served');
    expect(gap).not.toHaveTextContent('$');
  });

  it('a custom range with no served day rows never shows $0.00, and an end before the start stays typed', () => {
    const none = kpis({ kind: 'custom', start: '2026-09-01', end: '2026-09-02' });
    expect(within(none).getAllByText('Unavailable')).toHaveLength(2);
    expect(none).not.toHaveTextContent('$');
    none.unmount();
    const reversed = kpis({ kind: 'custom', start: '2026-10-12', end: '2026-10-10' });
    expect(within(reversed).getAllByText('Unavailable')).toHaveLength(2);
    expect(reversed).toHaveTextContent('End date must be on or after the start date');
    expect(reversed).not.toHaveTextContent('$');
  });
});
