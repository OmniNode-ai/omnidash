// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { loadLocalPageConfig } from '@/layout/local-page-loader';
import { OverviewAggregateCard } from './LocalDashboardPage';
const page = loadLocalPageConfig('overview');
const row = { window: 'all', captured_at: '2026-10-22T10:00:00Z', run_count: '59188',
  tokens_total: '309271491', tokens_input: '300000001', tokens_output: '9271490' };
afterEach(cleanup);
function card(id: string, data: Record<string, unknown> = row, window: 'all' | 'today' = 'all') {
  const component = page.components.find(c => c.component_id === id)!;
  const config = page.dashboard.widgets.find(w => w.data_source === id)!.config;
  return render(<OverviewAggregateCard component={component} config={config as Parameters<typeof OverviewAggregateCard>[0]['config']} rows={[data]} window={window} />);
}
describe('OMN-21015 headline counts and directional tokens', () => {
  it('compacts calls and preserves their exact value', () => {
    const { container } = card('overview-measured');
    expect(container.querySelector('.local-dashboard-metric')?.textContent).toBe('59.18K');
    expect(container.querySelector('.local-dashboard-metric')?.getAttribute('title')).toBe('59188');
  });
  it('keeps tokens total compact and directions full, distinct and labelled', () => {
    const { container } = card('overview-tokens');
    expect(container.querySelector('.local-dashboard-metric')?.textContent).toBe('309.27M');
    expect(container.querySelector('[data-field-tone="tokens-in"]')?.textContent).toBe('300,000,001');
    expect(container.querySelector('[data-field-tone="tokens-out"]')?.textContent).toBe('9,271,490');
    expect(screen.getByLabelText('Input tokens: 300,000,001').getAttribute('title')).toBe('Input tokens: 300,000,001');
    expect(screen.getByLabelText('Output tokens: 9,271,490').getAttribute('title')).toBe('Output tokens: 9,271,490');
    expect(container.querySelectorAll('.local-token-direction svg')).toHaveLength(2);
  });
  it('keeps a true zero direction', () => {
    const { container } = card('overview-tokens', { ...row, tokens_output: 0 });
    expect(container.querySelector('[data-field-tone="tokens-out"]')?.textContent).toBe('0');
  });
  it.each([null, undefined, false, 'bad', '1.25'])('refuses invalid input %s without hiding output', value => {
    const { container } = card('overview-tokens', { ...row, tokens_input: value });
    expect(container.querySelector('[data-field-tone="tokens-in"]')?.textContent).toMatch(/Not measured/);
    expect(container.querySelector('[data-field-tone="tokens-out"]')?.textContent).toMatch(/9,271,490/);
  });
  it('never substitutes provenance subtotals for a missing call total', () => {
    card('overview-measured', { ...row, run_count: null, measured_run_count: 50398, unknown_run_count: 8929 });
    expect(screen.getByText('Not measured')).toBeTruthy();
  });
  it('does not mix all-time directions with an unavailable daily total', () => {
    const { container } = card('overview-tokens', row, 'today');
    expect(container.textContent).toContain('daily totals unavailable');
    expect(container.textContent).not.toContain('300,000,001');
  });
});
