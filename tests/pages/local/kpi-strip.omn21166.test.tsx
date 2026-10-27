// @vitest-environment jsdom
// OMN-21166 part 11 AC63, reworked by part 15 AC91 (Lakshman 2026-10-25: "make sure all pages follow overview page
// style"): the headline figures of Runs and Usage are Overview's cards. Failure modes, each with a test below:
//   K1  a figure changes value on the way into a card (or a missing one reads 0);
//   K2  a caption or a sparkline is still drawn on the card face;
//   K3  a detail that sat on the card (its caption, run counts, baseline) is missing from the card's tooltip;
//   K4  the tooltip opens only for a mouse: the card has no focusable control describing it;
//   K5  two cards share an identity colour;
//   K6  the trend sentence (what the sparkline showed) counts a day with no served value as zero, or invents a trend
//       from fewer than two served days; an unavailable figure carries no trend.
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { KpiStrip, trendLine } from '@/components/dashboard/KpiStrip';
import { RunsKpis, UsageKpis } from '@/pages/LocalDashboardPage';

const cards = (region: HTMLElement) => [...region.querySelectorAll('article')] as HTMLElement[];
const face = (card: HTMLElement) => [...card.children].filter(child => !child.matches('.local-card-basis-tip')).map(child => child.textContent).join('|');
const tooltip = (card: HTMLElement) => card.querySelector('[role="tooltip"]')?.textContent ?? '';

const ALL = { window_kind: 'all', window_start: '', as_of: '2026-10-25T10:00:00Z', baseline_model: 'claude-sonnet-5-5', baseline_state: 'resolved',
  spend_usd: '0.232022', counterfactual_usd: '3.997402', savings_usd: '3.765380', runs_total: 605, runs_unknown_tokens: 7, tokens_in: 578671, tokens_out: 284006 };
const day = (start: string, savings: string | null) => ({ ...ALL, window_kind: 'day', window_start: start, savings_usd: savings, spend_usd: '0.01' });

describe('KpiStrip as Overview cards', () => {
  const items = [
    { label: 'You paid', value: '$0.23', accent: 'var(--field-cost)', lines: ['Measured spend, all time'] },
    { label: 'Saved', value: 'Not measured', unavailable: true, accent: 'var(--field-savings)', lines: ['Modelled · vs cloud baseline'],
      trend: { days: ['2026-10-24', '2026-10-25'], values: [1, 2], format: (n: number) => String(n) } },
  ];

  it('K2, K3: the face is the title and the figure; the caption is in the tooltip', () => {
    render(<KpiStrip label="Strip" items={items} />);
    const [paid] = cards(screen.getByRole('region', { name: 'Strip' }));
    expect(face(paid!)).toBe('You paid|$0.23');
    expect(tooltip(paid!)).toContain('Measured spend, all time');
    expect(screen.getByRole('region', { name: 'Strip' }).querySelector('svg.kpi-sparkline')).toBeNull();
  });

  it('K4: a keyboard user reaches each card\'s details through a control the tooltip describes', () => {
    render(<KpiStrip label="Strip" items={items} />);
    const button = screen.getByRole('button', { name: 'About You paid' });
    expect(button).toHaveAccessibleDescription('Measured spend, all time');
    fireEvent.focus(button);
    expect(button.closest('.local-card-basis-tip')).toHaveAttribute('data-open', 'true');
  });

  it('K6: an unavailable figure carries no trend sentence', () => {
    render(<KpiStrip label="Strip" items={items} />);
    const saved = cards(screen.getByRole('region', { name: 'Strip' }))[1]!;
    expect(tooltip(saved)).not.toMatch(/UTC days/);
  });
});

describe('trendLine', () => {
  const fmt = (n: number) => `$${n.toFixed(2)}`;
  it('K6: names the peak and the latest served day, skipping days with no value', () => {
    expect(trendLine({ days: ['2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24'], values: [0.1, 0.4, null, 0.2], format: fmt }))
      .toBe('Latest 4 UTC days: peak $0.40 on Oct 22 · latest $0.20 on Oct 24');
  });

  it('K6: says nothing from fewer than two served days, never a trend of one point or of zeros', () => {
    expect(trendLine({ days: ['2026-10-24', '2026-10-25'], values: [null, 0.2], format: fmt })).toBeNull();
    expect(trendLine({ days: [], values: [], format: fmt })).toBeNull();
  });
});

describe('UsageKpis', () => {
  it('K1: shows the served all-time figures, each in its own card', () => {
    render(<UsageKpis rows={[ALL]} />);
    const strip = screen.getByRole('region', { name: 'Usage summary' });
    expect(cards(strip).map(card => card.querySelector('.local-dashboard-metric')?.textContent))
      .toEqual(['$0.23', '$3.99', '$3.76', '578,671', '284,006']);
  });

  it('K1: reads a spend the row does not serve as Not measured, never $0.00', () => {
    render(<UsageKpis rows={[{ ...ALL, spend_usd: null }]} />);
    const strip = screen.getByRole('region', { name: 'Usage summary' });
    expect(within(strip).getAllByText('Not measured').length).toBeGreaterThan(0);
    expect(within(strip).queryByText('$0.00')).toBeNull();
  });

  it('K3: the baseline the old caption named is in the Baseline cost tooltip', () => {
    render(<UsageKpis rows={[ALL]} />);
    const baseline = cards(screen.getByRole('region', { name: 'Usage summary' }))[1]!;
    expect(tooltip(baseline)).toContain('Same tokens at claude-sonnet-5-5 list price (modelled)');
  });

  it('K6: the Saved trend skips a day whose saving is not recorded', () => {
    render(<UsageKpis rows={[ALL, day('2026-10-21', '0.10'), day('2026-10-22', '0.20'), day('2026-10-23', null), day('2026-10-24', '0.30'), day('2026-10-25', '0.40')]} />);
    const saved = cards(screen.getByRole('region', { name: 'Usage summary' }))[2]!;
    // The day rows are days with runs, not a calendar span, so the sentence says so.
    expect(tooltip(saved)).toContain('Latest 5 days with usage: peak $0.40 on Oct 25 · latest $0.40 on Oct 25');
  });

  it('draws nothing when no all-time row is served', () => {
    const { container } = render(<UsageKpis rows={[day('2026-10-25', '0.40')]} />);
    expect(container.querySelector('article')).toBeNull();
  });
});

const run = (id: string, over: Record<string, unknown> = {}) => ({
  correlation_id: id, created_at: '2026-10-25T10:00:00Z', written_at: '2026-10-25T10:00:00Z', quality_gate_passed: 1,
  terminal_ok: 1, latency_ms: 1000, model_name: 'm', cost_tier_name: 'local', task_type: 'document', ...over,
});

describe('RunsKpis', () => {
  it('K1, K3: counts the returned runs, their pass rate and failures; the run counts are in the tooltips', () => {
    render(<RunsKpis now={Date.parse('2026-10-25T12:00:00Z')} rows={[run('a'), run('b', { quality_gate_passed: 0, terminal_ok: 0 }), run('c')]} />);
    const strip = screen.getByRole('region', { name: 'Run summary' });
    const figures = cards(strip).map(card => card.querySelector('.local-dashboard-metric')?.textContent);
    expect(figures[0]).toBe('3');
    expect(figures[1]).toBe('66.7%');
    expect(figures[4]).toBe('1');
    expect(tooltip(cards(strip)[1]!)).toContain('3 of 3 runs have a verdict');
  });

  it('K1: reads durations and escalations that no row records as Not recorded, never 0', () => {
    render(<RunsKpis now={Date.parse('2026-10-25T12:00:00Z')} rows={[run('a', { latency_ms: null }), run('b', { latency_ms: null })]} />);
    const strip = screen.getByRole('region', { name: 'Run summary' });
    expect(within(strip).getAllByText('Not recorded').length).toBeGreaterThanOrEqual(3);
    expect(within(strip).queryByText('0 ms')).toBeNull();
  });

  it('K5: the six Runs cards and the five Usage cards each have their own colour', () => {
    render(<><RunsKpis now={Date.parse('2026-10-25T12:00:00Z')} rows={[run('a')]} /><UsageKpis rows={[ALL]} /></>);
    for (const name of ['Run summary', 'Usage summary']) {
      const accents = cards(screen.getByRole('region', { name })).map(card => card.style.getPropertyValue('--panel-accent'));
      expect(accents.every(Boolean), name).toBe(true);
      expect(new Set(accents).size, name).toBe(accents.length);
    }
  });
});
