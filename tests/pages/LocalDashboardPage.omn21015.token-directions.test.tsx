// @vitest-environment jsdom
// OMN-21015 (AC5, plan amendment AC15): the Tokens processed card's input and output read the directions its exposure
// actually serves. Since OMN-23330 AC1/AC2 (Lakshman 2026-11-10, "All on metering") that exposure is
// metering-summary.v1, which serves them as tokens_in and tokens_out; the retired cost.savings-overview.v1 names
// (tokens_input_total, tokens_output_total) are never read.
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { loadLocalPageConfig } from '@/layout/local-page-loader';
import { MeteringTotalCard } from '@/pages/LocalDashboardPage';

const page = loadLocalPageConfig('overview');
const NOW = Date.parse('2026-10-25T12:00:00Z');

/** A metering-summary.v1 all-time row as omnimarket serves it: only the exposure's own column names. */
const served = {
  window_kind: 'all', window_start: '', as_of: '2026-10-25T10:00:00Z', baseline_model: 'claude-sonnet-5-5',
  pricing_manifest_version: '1.0.0', baseline_state: 'resolved', runs_total: '59188', runs_measured: '59188',
  runs_unknown_tokens: '0', runs_unknown_spend: '0', tokens_in: '300000001', tokens_out: '9271490',
};

afterEach(cleanup);

function tokensCard(row: Record<string, unknown>) {
  const component = page.components.find(c => c.component_id === 'overview-tokens')!;
  const config = page.dashboard.widgets.find(w => w.data_source === 'overview-tokens')!.config;
  return render(<MeteringTotalCard component={component}
    config={config as Parameters<typeof MeteringTotalCard>[0]['config']} rows={[row]} window="all" now={NOW} />);
}

/** The served row without the named columns, as a row that lacks them is served. */
const without = (keys: readonly string[]) =>
  Object.fromEntries(Object.entries(served).filter(([key]) => !keys.includes(key)));

const direction = (container: HTMLElement, tone: 'tokens-in' | 'tokens-out') =>
  container.querySelector(`[data-field-tone="${tone}"]`)?.textContent;
const total = (container: HTMLElement) => container.querySelector('.local-dashboard-metric')?.textContent;

describe('OMN-21015 Tokens processed reads the served token directions', () => {
  // OMN-22168 (product owner 2026-11-07): the directions read short; the served totals stay whole on hover.
  it('shows the served input and output totals short, in full on hover', () => {
    const { container } = tokensCard(served);
    expect(direction(container, 'tokens-in')).toBe('300M');
    expect(direction(container, 'tokens-out')).toBe('9.27M');
    expect(container.querySelector('[data-field-tone="tokens-in"]')?.getAttribute('title')).toBe('Input tokens: 300,000,001');
    expect(container.querySelector('[data-field-tone="tokens-out"]')?.getAttribute('title')).toBe('Output tokens: 9,271,490');
  });

  it('reads nothing the exposure does not serve: the retired aggregate names alone show no figure', () => {
    const { container } = tokensCard({ ...without(['tokens_in', 'tokens_out']),
      tokens_input_total: '300000001', tokens_output_total: '9271490', tokens_total: '309271491' });
    expect(total(container)).toMatch(/Not measured/);
    expect(container.innerHTML).not.toMatch(/300M|9\.27M|309\.27M/);
  });

  it('keeps a served true zero apart from a missing direction', () => {
    const zero = tokensCard({ ...served, tokens_out: '0' });
    expect(direction(zero.container, 'tokens-out')).toBe('0');
    zero.unmount();
    const missing = tokensCard({ ...served, tokens_in: null });
    expect(total(missing.container)).toMatch(/Not measured/);
  });

  it('never derives a missing direction, or a total, from the other direction', () => {
    const { container } = tokensCard(without(['tokens_out']));
    expect(total(container)).toMatch(/Not measured/);
    expect(container.innerHTML).not.toContain('9,271,490');
    expect(container.innerHTML).not.toContain('309.27M');
  });
});
