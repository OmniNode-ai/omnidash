// @vitest-environment jsdom
// OMN-21015 (AC5, plan amendment AC15): the Tokens processed card's input and output read the directions
// cost.savings-overview.v1 actually serves. omnimarket#4341 serves them as tokens_input_total and
// tokens_output_total; the card read tokens_input and tokens_output, which that exposure never serves, so on a
// served page both directions read Not measured.
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { loadLocalPageConfig } from '@/layout/local-page-loader';
import { OverviewAggregateCard } from '@/pages/LocalDashboardPage';

const page = loadLocalPageConfig('overview');

/** A cost.savings-overview.v1 row as omnimarket serves it: only the exposure's own column names. */
const served = {
  window: 'all', captured_at: '2026-10-25T10:00:00Z', run_count: '59188',
  tokens_total: '309271491', tokens_input_total: '300000001', tokens_output_total: '9271490',
};

afterEach(cleanup);

function tokensCard(row: Record<string, unknown>) {
  const component = page.components.find(c => c.component_id === 'overview-tokens')!;
  const config = page.dashboard.widgets.find(w => w.data_source === 'overview-tokens')!.config;
  return render(<OverviewAggregateCard component={component}
    config={config as Parameters<typeof OverviewAggregateCard>[0]['config']} rows={[row]} window="all" />);
}

/** The served row without the named columns, as a row that lacks them is served. */
const without = (keys: readonly string[]) =>
  Object.fromEntries(Object.entries(served).filter(([key]) => !keys.includes(key)));

const direction = (container: HTMLElement, tone: 'tokens-in' | 'tokens-out') =>
  container.querySelector(`[data-field-tone="${tone}"]`)?.textContent;

describe('OMN-21015 Tokens processed reads the served token directions', () => {
  it('shows the served input and output totals in full', () => {
    const { container } = tokensCard(served);
    expect(direction(container, 'tokens-in')).toBe('300,000,001');
    expect(direction(container, 'tokens-out')).toBe('9,271,490');
  });

  it('reads nothing the exposure does not serve: the old names alone leave both directions not measured', () => {
    const { container } = tokensCard({ ...without(['tokens_input_total', 'tokens_output_total']),
      tokens_input: '300000001', tokens_output: '9271490' });
    expect(direction(container, 'tokens-in')).toMatch(/Not measured/);
    expect(direction(container, 'tokens-out')).toMatch(/Not measured/);
  });

  it('keeps a served true zero and a missing direction apart', () => {
    const { container } = tokensCard({ ...served, tokens_output_total: '0', tokens_input_total: null });
    expect(direction(container, 'tokens-out')).toBe('0');
    expect(direction(container, 'tokens-in')).toMatch(/Not measured/);
  });

  it('never derives a missing direction from the total and the other direction', () => {
    const { container } = tokensCard(without(['tokens_output_total']));
    expect(direction(container, 'tokens-in')).toBe('300,000,001');
    expect(direction(container, 'tokens-out')).toMatch(/Not measured/);
    expect(container.textContent).not.toContain('9,271,490');
  });
});
