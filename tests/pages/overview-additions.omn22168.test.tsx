// @vitest-environment jsdom
/**
 * OMN-22168 (Lakshman 2026-11-04, "all 4"): the Overview additions, each showing only what the backend serves.
 * (Work delegated and Quality vs bar were removed again by Lakshman later the same day.) Failure modes, each a test below:
 *   S1 no runtime row reads "Runtime status not recorded", never running;  S2 a stopped or degraded runtime shows its own
 *   state and reason, not the running tone;  S3 no served run time never reads "0 min ago";  S4 the run total is the
 *   routing view's served total_delegations, never a count of the rows read;  S5 the median names the latest runs when
 *   the read did not walk every page;
 * Overview may not bind delegation.summary.v1 (the reader answers it by hand-written SQL) and a headline card reads one
 * source (OMN-19980), so the run time lives on the status line, not on Agent calls.
 *   C1 Savings keeps its short caption with the percentage in its hover;  C3 Agent calls keeps its one-source line.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { OverviewStatusStrip, headlineHoverLines } from '@/pages/LocalDashboardPage';

const NOW = Date.UTC(2026, 10, 4, 18, 30, 0);
const ENV = { service: 'local-runtime', observed_state: 'running', verdict: 'running', reason: 'onex dashboard is serving 77 exposures',
  last_seen: '2026-11-04T18:29:00Z' };
const run = (minutesAgo: number, latency: number) => ({ correlation_id: `r${minutesAgo}`, created_at: new Date(NOW - minutesAgo * 60_000).toISOString(),
  written_at: new Date(NOW - minutesAgo * 60_000).toISOString(), latency_ms: latency, quality_gate_passed: true });
const DECISIONS = [run(3, 9000), run(10, 4000), run(30, 20000)];
const ROUTING = { total_delegations: 2484, rows: [
  { model_name: 'qwen', task_type: 'document', count: 1700 }, { model_name: 'qwen', task_type: 'review', count: 172 },
  { model_name: 'gemini', task_type: 'document', count: 81 }, { model_name: 'gemini', task_type: 'code_generation', count: 40 },
] };
const METERING = { window_kind: 'all', baseline_model: 'claude-sonnet-5-5', baseline_state: 'resolved', pricing_manifest_version: 'v1.0.0',
  runs_total: 2484, runs_measured: 2419, runs_unknown_tokens: 65, runs_unknown_spend: 0, savings_usd: 18.11, savings_pct_of_counterfactual: '0.987354' };

describe('status strip', () => {
  it('S1: no runtime row reads not recorded, never running', () => {
    render(<OverviewStatusStrip env={null} decisions={DECISIONS} routing={ROUTING} now={NOW} complete />);
    const strip = screen.getByRole('status', { name: 'Runtime status' });
    expect(strip.textContent).toContain('Runtime status not recorded');
    expect(strip.textContent).not.toMatch(/running/i);
    expect(strip.getAttribute('data-state')).toBe('unknown');
  });

  it('a running runtime says so, with the last run and the served run total', () => {
    render(<OverviewStatusStrip env={ENV} decisions={DECISIONS} routing={ROUTING} now={NOW} complete />);
    const strip = screen.getByRole('status', { name: 'Runtime status' });
    expect(strip.getAttribute('data-state')).toBe('running');
    expect(strip.textContent).toContain('Runtime running');
    expect(strip.textContent).toContain('Last run 3 min ago');
    expect(strip.textContent).toContain('2,484 runs');
    expect(strip.textContent).toContain('Median run 9.0 s');
    expect(strip.textContent).not.toContain('latest');
  });

  it('S2: a stopped runtime shows its own state and reason, not the running tone', () => {
    render(<OverviewStatusStrip env={{ ...ENV, observed_state: 'stopped', verdict: 'stopped', reason: 'the local runtime exited' }} decisions={DECISIONS} routing={ROUTING} now={NOW} />);
    const strip = screen.getByRole('status', { name: 'Runtime status' });
    expect(strip.getAttribute('data-state')).toBe('attention');
    expect(strip.textContent).toContain('Runtime stopped');
    expect(strip.textContent).toContain('the local runtime exited');
  });

  it('S3: no served run time never reads "0 min ago"', () => {
    render(<OverviewStatusStrip env={ENV} decisions={[]} routing={ROUTING} now={NOW} />);
    const strip = screen.getByRole('status', { name: 'Runtime status' });
    expect(strip.textContent).toContain('Last run not recorded');
    expect(strip.textContent).not.toMatch(/0 min ago|just now/);
  });

  it('S4: the run total is the served total_delegations, not a count of the rows read', () => {
    render(<OverviewStatusStrip env={ENV} decisions={DECISIONS} routing={{ ...ROUTING, total_delegations: 5000 }} now={NOW} />);
    expect(screen.getByRole('status', { name: 'Runtime status' }).textContent).toContain('5,000 runs');
    render(<OverviewStatusStrip env={ENV} decisions={DECISIONS} routing={{ ...ROUTING, total_delegations: null }} now={NOW} />);
    expect(screen.getAllByRole('status', { name: 'Runtime status' })[1]!.textContent).toContain('Runs not recorded');
  });

  it('S5: a read that did not walk every page names the latest runs beside the median', () => {
    render(<OverviewStatusStrip env={ENV} decisions={DECISIONS} routing={ROUTING} now={NOW} complete={false} />);
    expect(screen.getByRole('status', { name: 'Runtime status' }).textContent).toContain('Median run 9.0 s (latest 3 runs)');
  });
});

describe('card lines', () => {
  // The Savings caption stays "Modelled vs <baseline>" (OMN-21166 AC191: short, name whole; OMN-20008 AC5 pins the
  // percentage line and the card's other lines), and Agent calls keeps its one-source line (OMN-19980).
  it('C1: Savings keeps its short caption and carries the percentage line in its hover', () => {
    const shown = headlineHoverLines('overview-savings', METERING, '99% below the claude-sonnet-5-5 baseline (modelled)');
    expect(shown[0]).toMatch(/^Modelled vs /);
    expect(shown).toContain('99% below the claude-sonnet-5-5 baseline (modelled)');
  });

  it('C3: Agent calls keeps its one-source first line', () => {
    expect(headlineHoverLines('overview-measured', METERING, null)[0]).toBe('2,419 of 2,484 runs measured');
  });
});
