// @vitest-environment jsdom
/**
 * OMN-22168 (Lakshman 2026-11-04, "all 4"): the Overview additions, each showing only what the backend serves.
 * Failure modes, each a test below:
 *   S1 no runtime row reads "Runtime status not recorded", never running;  S2 a stopped or degraded runtime shows its own
 *   state and reason, not the running tone;  S3 no served run time never reads "0 min ago";  S4 the run total is the
 *   routing view's served total_delegations, never a count of the rows read;  S5 the median names the latest runs when
 *   the read did not walk every page;
 *   W1 every task type appears with its runs added up across the routing view's per-model rows, ranked, readable, linking
 *   to Runs by task;  W2 no rows shows an empty state, and a row without a count is not read as zero;
 * Overview may not bind delegation.summary.v1 (the reader answers it by hand-written SQL) and a headline card reads one
 * source (OMN-19980), so the run time lives on the status line, not on Agent calls.
 *   Q1 the served score, bar and escalation rate are shown as served;  Q2 the top three failure reasons are plain words
 *   with their served shares, never internal codes;  Q3 a field the row does not serve reads Not recorded;
 *   C1 Savings' first line is the served percentage;  C3 it is not drawn when the ratio is not served, and Agent calls
 *   keeps its one-source first line.
 */
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { OverviewStatusStrip, TaskMixPanel, QualityBarPanel, headlineHoverLines } from '@/pages/LocalDashboardPage';

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
const QUALITY = { avg_actual_score: 0.9229, avg_required_bar: 0.8027, escalation_rate: 0.0435, escalation_count: 108,
  failure_categories: [
    { category: 'Delegation refused: credential_rejected for cred_localinstall_openrouter_5596a06f on backend x', count: 40, pct_of_failures: 0.154 },
    { category: 'SHAPE_REFUSED: response is a bare single-word fragment, fails semantic_adequacy', count: 79, pct_of_failures: 0.305 },
    { category: 'TASK_MISMATCH: failed structured output', count: 16, pct_of_failures: 0.062 },
    { category: 'TASK_MISMATCH: failed covers dependencies', count: 10, pct_of_failures: 0.039 },
  ] };
const METERING = { window_kind: 'all', baseline_model: 'claude-sonnet-5-5', baseline_state: 'resolved', pricing_manifest_version: 'v1.0.0',
  runs_total: 2484, runs_measured: 2419, runs_unknown_tokens: 65, runs_unknown_spend: 0, savings_usd: 18.11, savings_pct_of_counterfactual: '0.987354' };
const INTERNAL = /\b[A-Z]{2,}(?:_[A-Z0-9]+)+\b|\b[a-z]+(?:_[a-z0-9]+)+\b|cred_[a-z0-9_]+/;

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

describe('Work delegated', () => {
  it('W1: each task type, its runs added across models, ranked, readable, linking to Runs by task', () => {
    render(<TaskMixPanel routing={ROUTING} />);
    const panel = screen.getByRole('region', { name: 'Work delegated' });
    const items = [...panel.querySelectorAll('[data-ranked-item]')];
    expect(items.map(item => item.querySelector('.rb-name')?.textContent?.trim())).toEqual(['document', 'review', 'code generation']);
    expect(items.map(item => item.querySelector('.rb-value')?.textContent?.trim())).toEqual(['1,781', '172', '40']);
    expect(within(panel).getByRole('link', { name: /document/ }).getAttribute('href')).toBe('/runs?task=document');
    expect(panel.textContent).not.toMatch(INTERNAL);
  });

  it('W2: no rows shows an empty state, and a row without a count is not read as zero', () => {
    render(<TaskMixPanel routing={{ ...ROUTING, rows: [] }} />);
    expect(screen.getByText('No task types served yet')).toBeTruthy();
    render(<TaskMixPanel routing={null} />);
    expect(screen.getAllByText('No task types served yet')).toHaveLength(2);
    render(<TaskMixPanel routing={{ rows: [{ model_name: 'a', task_type: 'review', count: 5 }, { model_name: 'b', task_type: 'review', count: null }] }} />);
    expect(screen.getByRole('region', { name: 'Work delegated' }).querySelector('.rb-value')?.textContent).toBe('5 (some runs not counted)');
  });
});

describe('Quality vs bar', () => {
  it('Q1: the served score, bar and escalation rate', () => {
    render(<QualityBarPanel row={QUALITY} />);
    const panel = screen.getByRole('region', { name: 'Quality vs bar' });
    expect(panel.querySelector('[data-quality-figure="score"]')?.textContent).toContain('0.92');
    expect(panel.querySelector('[data-quality-figure="bar"]')?.textContent).toContain('0.80');
    expect(panel.querySelector('[data-quality-figure="escalation"]')?.textContent).toContain('4.3%');
    expect(panel.querySelector('[data-quality-figure="escalation"]')?.textContent).toContain('108 runs');
  });

  it('Q2: the top three failure reasons, plain words, served shares, most first', () => {
    render(<QualityBarPanel row={QUALITY} />);
    const reasons = [...screen.getByRole('figure', { name: 'Top failure reasons' }).querySelectorAll('[data-ranked-item]')];
    expect(reasons).toHaveLength(3);
    expect(reasons.map(item => item.querySelector('.rb-value')?.textContent)).toEqual(['30.5%', '15.4%', '6.2%']);
    for (const item of reasons) expect(item.textContent).not.toMatch(INTERNAL);
    expect(screen.getByRole('link', { name: /delegation evidence/i }).getAttribute('href')).toBe('/delegation-evidence');
  });

  it('Q3: a field the row does not serve reads Not recorded', () => {
    render(<QualityBarPanel row={{ ...QUALITY, avg_actual_score: null, escalation_rate: undefined, failure_categories: null }} />);
    const panel = screen.getByRole('region', { name: 'Quality vs bar' });
    expect(panel.querySelector('[data-quality-figure="score"]')?.textContent).toContain('Not recorded');
    expect(panel.querySelector('[data-quality-figure="escalation"]')?.textContent).toContain('Not recorded');
    expect(panel.textContent).toContain('Failure reasons not recorded');
  });
});

describe('card lines', () => {
  it('C1: Savings leads with the served percentage below the baseline', () => {
    // The baseline model's hyphens are non-breaking (unbroken), so the name never wraps inside the caption.
    expect(headlineHoverLines('overview-savings', METERING, '99% below the claude-sonnet-5-5 baseline (modelled)', 'all', 0.987354)[0]
      ?.replace(/\u2011/g, '-')).toBe('98.7% below claude-sonnet-5-5');
  });

  it('C3: neither line is drawn when its field is not served', () => {
    expect(headlineHoverLines('overview-savings', METERING, null, 'all', 0.987354)[0]).toMatch(/^Modelled vs /);
    expect(headlineHoverLines('overview-savings', METERING, '99% below the claude-sonnet-5-5 baseline (modelled)', 'all', null)[0]).toMatch(/^Modelled vs /);
    expect(headlineHoverLines('overview-measured', METERING, null)[0]).toBe('2,419 of 2,484 runs measured');
  });
});
