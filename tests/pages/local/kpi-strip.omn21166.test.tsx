// @vitest-environment jsdom
// OMN-21166 part 11 AC63: the KPI strips of Runs and Usage. Failure modes: a sparkline drawn from no served day rows,
// a missing day drawn as zero, a missing figure shown as 0, an unavailable figure given a sparkline.
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { KpiStrip, Sparkline } from '@/components/dashboard/KpiStrip';
import { RunsKpis, UsageKpis } from '@/pages/LocalDashboardPage';

const segments = (svg: SVGElement | null) => (svg?.querySelector('path')?.getAttribute('d') ?? '').match(/M/g)?.length ?? 0;

describe('Sparkline', () => {
  it('draws nothing from fewer than two served values', () => {
    const { container } = render(<Sparkline values={[null, 4, null]} />);
    expect(container.querySelector('svg')).toBeNull();
  });

  it('breaks the line at a missing day instead of drawing it as zero', () => {
    const { container } = render(<Sparkline values={[1, 2, null, 3, 4]} />);
    expect(segments(container.querySelector('svg'))).toBe(2);
  });
});

describe('KpiStrip', () => {
  it('gives an unavailable figure no sparkline even when a series is passed', () => {
    render(<KpiStrip label="Strip" items={[{ label: 'Saved', value: 'Not measured', unavailable: true, series: [1, 2, 3] }]} />);
    expect(screen.getByRole('region', { name: 'Strip' }).querySelector('svg')).toBeNull();
  });
});

const ALL = { window_kind: 'all', window_start: '', as_of: '2026-10-25T10:00:00Z', baseline_model: 'claude-sonnet-5-5', baseline_state: 'resolved',
  spend_usd: '0.232022', counterfactual_usd: '3.997402', savings_usd: '3.765380', runs_total: 605, runs_unknown_tokens: 7, tokens_in: 578671, tokens_out: 284006 };
const day = (start: string, savings: string | null) => ({ ...ALL, window_kind: 'day', window_start: start, savings_usd: savings, spend_usd: '0.01' });

describe('UsageKpis', () => {
  it('shows the served all-time figures and draws no sparkline without day rows', () => {
    render(<UsageKpis rows={[ALL]} />);
    const strip = screen.getByRole('region', { name: 'Usage summary' });
    expect(within(strip).getByText('$0.23')).toBeInTheDocument();
    expect(within(strip).getByText('$3.99')).toBeInTheDocument();
    expect(within(strip).getByText('$3.76')).toBeInTheDocument();
    expect(within(strip).getByText('578,671')).toBeInTheDocument();
    expect(strip.querySelector('svg')).toBeNull();
  });

  it('reads a spend the row does not serve as Not measured, never $0.00', () => {
    render(<UsageKpis rows={[{ ...ALL, spend_usd: null }]} />);
    const strip = screen.getByRole('region', { name: 'Usage summary' });
    expect(within(strip).getAllByText('Not measured').length).toBeGreaterThan(0);
    expect(within(strip).queryByText('$0.00')).toBeNull();
  });

  it('breaks the savings sparkline at a day whose saving is not recorded', () => {
    render(<UsageKpis rows={[ALL, day('2026-10-21', '0.10'), day('2026-10-22', '0.20'), day('2026-10-23', null), day('2026-10-24', '0.30'), day('2026-10-25', '0.40')]} />);
    const saved = screen.getByText('Saved').closest('.kpi-item') as HTMLElement;
    expect(segments(saved.querySelector('svg'))).toBe(2);
  });

  it('draws nothing when no all-time row is served', () => {
    const { container } = render(<UsageKpis rows={[day('2026-10-25', '0.40')]} />);
    expect(container.querySelector('.kpi-strip')).toBeNull();
  });
});

const run = (id: string, over: Record<string, unknown> = {}) => ({
  correlation_id: id, created_at: '2026-10-25T10:00:00Z', written_at: '2026-10-25T10:00:00Z', quality_gate_passed: 1,
  terminal_ok: 1, latency_ms: 1000, model_name: 'm', cost_tier_name: 'local', task_type: 'document', ...over,
});

describe('RunsKpis', () => {
  it('counts the returned runs, their pass rate and failures', () => {
    render(<RunsKpis now={Date.parse('2026-10-25T12:00:00Z')} rows={[run('a'), run('b', { quality_gate_passed: 0, terminal_ok: 0 }), run('c')]} />);
    const strip = screen.getByRole('region', { name: 'Run summary' });
    expect(within(strip).getByText('3')).toBeInTheDocument();
    expect(within(strip).getByText('66.7%')).toBeInTheDocument();
    expect(within(strip).getByText('1')).toBeInTheDocument();
  });

  it('reads durations and escalations that no row records as Not recorded, never 0', () => {
    render(<RunsKpis now={Date.parse('2026-10-25T12:00:00Z')} rows={[run('a', { latency_ms: null }), run('b', { latency_ms: null })]} />);
    const strip = screen.getByRole('region', { name: 'Run summary' });
    expect(within(strip).getAllByText('Not recorded').length).toBeGreaterThanOrEqual(3);
    expect(within(strip).queryByText('0 ms')).toBeNull();
  });
});
