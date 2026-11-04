// @vitest-environment jsdom
/**
 * OMN-22168 (Lakshman 2026-11-04, "all 4"): the Overview additions, each showing only what the backend serves.
 * Failure modes, each a test below:
 *   S1 no runtime row reads "Runtime status not recorded", never running;  S2 a stopped or degraded runtime shows its own
 *   state and reason, not the running tone;  S3 no last-run time never reads "0 min ago";  S4 the run total is the served
 *   totalDelegations, never the sum of the task counts;
 *   W1 every served task type appears, ranked by its served count, under a readable name, linking to Runs by task;
 *   W2 no task types served shows an empty state;
 *   Q1 the served score, bar and escalation rate are shown as served;  Q2 the top three failure reasons are plain words
 *   with their served shares, never internal codes;  Q3 a field the row does not serve reads Not recorded;
 *   C1 Savings' first line is the served percentage;  C2 Agent calls' first line is the served average run time;
 *   C3 neither line is drawn when its field is not served.
 */
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { OverviewStatusStrip, TaskMixPanel, QualityBarPanel, headlineHoverLines } from '@/pages/LocalDashboardPage';

const NOW = Date.UTC(2026, 10, 4, 18, 30, 0);
const ENV = { service: 'local-runtime', observed_state: 'running', verdict: 'running', reason: 'onex dashboard is serving 77 exposures',
  last_seen: '2026-11-04T18:29:00Z' };
const SUMMARY = { totalDelegations: 2484, latestEventAt: NOW / 1000 - 180, avgLatencyMs: 8630.2,
  byTaskType: [{ taskType: 'review', count: 172 }, { taskType: 'document', count: 1781 }, { taskType: 'code_generation', count: 40 }] };
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
    render(<OverviewStatusStrip env={null} summary={SUMMARY} now={NOW} />);
    const strip = screen.getByRole('status', { name: 'Runtime status' });
    expect(strip.textContent).toContain('Runtime status not recorded');
    expect(strip.textContent).not.toMatch(/running/i);
    expect(strip.getAttribute('data-state')).toBe('unknown');
  });

  it('a running runtime says so, with the last run and the served run total', () => {
    render(<OverviewStatusStrip env={ENV} summary={SUMMARY} now={NOW} />);
    const strip = screen.getByRole('status', { name: 'Runtime status' });
    expect(strip.getAttribute('data-state')).toBe('running');
    expect(strip.textContent).toContain('Runtime running');
    expect(strip.textContent).toContain('Last run 3 min ago');
    expect(strip.textContent).toContain('2,484 runs');
  });

  it('S2: a stopped runtime shows its own state and reason, not the running tone', () => {
    render(<OverviewStatusStrip env={{ ...ENV, observed_state: 'stopped', verdict: 'stopped', reason: 'the local runtime exited' }} summary={SUMMARY} now={NOW} />);
    const strip = screen.getByRole('status', { name: 'Runtime status' });
    expect(strip.getAttribute('data-state')).toBe('attention');
    expect(strip.textContent).toContain('Runtime stopped');
    expect(strip.textContent).toContain('the local runtime exited');
  });

  it('S3: no last-run time never reads "0 min ago"', () => {
    render(<OverviewStatusStrip env={ENV} summary={{ ...SUMMARY, latestEventAt: null }} now={NOW} />);
    const strip = screen.getByRole('status', { name: 'Runtime status' });
    expect(strip.textContent).toContain('Last run not recorded');
    expect(strip.textContent).not.toMatch(/0 min ago|just now/);
  });

  it('S4: the run total is the served totalDelegations, not the sum of the task counts', () => {
    render(<OverviewStatusStrip env={ENV} summary={{ ...SUMMARY, totalDelegations: 5000 }} now={NOW} />);
    expect(screen.getByRole('status', { name: 'Runtime status' }).textContent).toContain('5,000 runs');
    render(<OverviewStatusStrip env={ENV} summary={{ ...SUMMARY, totalDelegations: null }} now={NOW} />);
    expect(screen.getAllByRole('status', { name: 'Runtime status' })[1]!.textContent).toContain('Runs not recorded');
  });
});

describe('Work delegated', () => {
  it('W1: every served task type, ranked by served count, readable, linking to Runs by task', () => {
    render(<TaskMixPanel summary={SUMMARY} />);
    const panel = screen.getByRole('region', { name: 'Work delegated' });
    const items = [...panel.querySelectorAll('[data-ranked-item]')];
    expect(items.map(item => item.querySelector('.rb-name')?.textContent?.trim())).toEqual(['document', 'review', 'code generation']);
    expect(items.map(item => item.querySelector('.rb-value')?.textContent?.trim())).toEqual(['1,781', '172', '40']);
    expect(within(panel).getByRole('link', { name: /document/ }).getAttribute('href')).toBe('/runs?task=document');
    expect(panel.textContent).not.toMatch(INTERNAL);
  });

  it('W2: no task types served shows an empty state', () => {
    render(<TaskMixPanel summary={{ ...SUMMARY, byTaskType: [] }} />);
    expect(screen.getByText('No task types served yet')).toBeTruthy();
    render(<TaskMixPanel summary={null} />);
    expect(screen.getAllByText('No task types served yet')).toHaveLength(2);
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
    const reasons = [...screen.getByRole('list', { name: 'Top failure reasons' }).querySelectorAll('li')];
    expect(reasons).toHaveLength(3);
    expect(reasons.map(item => item.querySelector('.local-quality-share')?.textContent)).toEqual(['30.5%', '15.4%', '6.2%']);
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
    expect(headlineHoverLines('overview-savings', METERING, '99% below the claude-sonnet-5-5 baseline (modelled)')[0])
      .toBe('98.7% below claude-sonnet-5-5');
  });

  it('C2: Agent calls leads with the served average run time', () => {
    expect(headlineHoverLines('overview-measured', METERING, null, 'all', SUMMARY)[0]).toBe('Average 8.6 s per run');
  });

  it('C3: neither line is drawn when its field is not served', () => {
    expect(headlineHoverLines('overview-savings', { ...METERING, savings_pct_of_counterfactual: null }, null)[0]).toMatch(/^Modelled vs /);
    expect(headlineHoverLines('overview-measured', METERING, null, 'all', { ...SUMMARY, avgLatencyMs: null })[0]).toBe('2,419 of 2,484 runs measured');
    expect(headlineHoverLines('overview-measured', METERING, null, 'all', null)[0]).toBe('2,419 of 2,484 runs measured');
  });
});
