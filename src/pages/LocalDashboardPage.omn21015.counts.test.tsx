// @vitest-environment jsdom
// OMN-21015 headline counts and directional tokens, on the one source every page's headline reads since OMN-23330
// AC1/AC2 (Lakshman 2026-11-10, "All on metering"): metering-summary.v1's all-time row.
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { loadLocalPageConfig } from '@/layout/local-page-loader';
import { MeteringTotalCard } from './LocalDashboardPage';

const page = loadLocalPageConfig('overview');
const NOW = Date.parse('2026-10-22T12:00:00Z');
const row = { window_kind: 'all', window_start: '', as_of: '2026-10-22T10:00:00Z', baseline_model: 'claude-sonnet-5-5',
  pricing_manifest_version: '1.0.0', baseline_state: 'resolved', runs_total: '59188', runs_measured: '59188',
  runs_unknown_tokens: '0', runs_unknown_spend: '0', tokens_in: '300000001', tokens_out: '9271490' };
afterEach(cleanup);
function card(id: string, data: Record<string, unknown> = row, window: 'all' | 'today' = 'all') {
  const component = page.components.find(c => c.component_id === id)!;
  const config = page.dashboard.widgets.find(w => w.data_source === id)!.config;
  return render(<MeteringTotalCard component={component} config={config as Parameters<typeof MeteringTotalCard>[0]['config']}
    rows={[data]} window={window} now={NOW} />);
}
describe('OMN-21015 headline counts and directional tokens', () => {
  it('compacts calls and preserves their exact value', () => {
    const { container } = card('overview-measured');
    expect(container.querySelector('.local-dashboard-metric')?.textContent).toBe('59.18K');
    expect(container.querySelector('.local-dashboard-metric')?.getAttribute('title')).toBe('59188');
  });
  it('keeps tokens total and directions compact (OMN-22168), distinct and labelled with the exact count', () => {
    const { container } = card('overview-tokens');
    expect(container.querySelector('.local-dashboard-metric')?.textContent).toBe('309.27M');
    expect(container.querySelector('[data-field-tone="tokens-in"]')?.textContent).toBe('300M');
    expect(container.querySelector('[data-field-tone="tokens-out"]')?.textContent).toBe('9.27M');
    expect(screen.getByLabelText('Input tokens: 300M, exactly 300,000,001').getAttribute('title')).toBe('Input tokens: 300,000,001');
    expect(screen.getByLabelText('Output tokens: 9.27M, exactly 9,271,490').getAttribute('title')).toBe('Output tokens: 9,271,490');
    expect(container.querySelectorAll('.local-token-direction svg')).toHaveLength(2);
  });
  it('keeps a true zero direction', () => {
    const { container } = card('overview-tokens', { ...row, tokens_out: 0 });
    expect(container.querySelector('[data-field-tone="tokens-out"]')?.textContent).toBe('0');
  });
  it.each([null, undefined, false, 'bad', '1.25'])('refuses invalid input %s without inventing a total', value => {
    const { container } = card('overview-tokens', { ...row, tokens_in: value });
    expect(container.querySelector('.local-dashboard-metric')?.textContent).toMatch(/Not measured/);
    expect(container.textContent).not.toContain('309.27M');
  });
});
