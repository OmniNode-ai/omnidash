// @vitest-environment jsdom
// OMN-21166 (Lakshman, live review 2026-10-25: "before Tier mix we need to add Model usage"): each model's runs from
// delegation.model-routing.v1's served by_model. Failure modes, each with a test below:
//   M1  a model served without a count is drawn as 0 (or dropped) instead of Not recorded;
//   M2  a real share under 0.1% rounds to 0.0% and reads as no runs;
//   M3  the shares are recomputed in the browser instead of read from pct_of_total;
//   M4  with no by_model served the panel draws empty bars instead of saying so.
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ModelUsagePanel } from '@/pages/LocalDashboardPage';

afterEach(cleanup);
const values = () => [...document.querySelectorAll('[data-ranked-item] .rb-value')].map(node => node.textContent);

describe('ModelUsagePanel', () => {
  it('M3: shows the served count and pct_of_total, not a share computed from the counts', () => {
    // pct_of_total deliberately disagrees with 3/4: the served figure is the one drawn.
    render(<ModelUsagePanel row={{ total_delegations: 4, by_model: [
      { model_name: 'local-a', total_count: 3, pct_of_total: 0.7 }, { model_name: 'cloud-b', total_count: 1, pct_of_total: 0.3 }] }} />);
    expect(values()).toEqual(['3 · 70.0%', '1 · 30.0%']);
    expect(screen.getByText('4 runs · 2 models')).toBeInTheDocument();
  });

  it('M1: a model with no served count reads Not recorded', () => {
    render(<ModelUsagePanel row={{ total_delegations: 3, by_model: [
      { model_name: 'local-a', total_count: 3, pct_of_total: 1 }, { model_name: 'cloud-b', total_count: null, pct_of_total: null }] }} />);
    expect(values()).toContain('Not recorded');
    expect(values()).not.toContain('0');
  });

  it('M2: a share above zero but under 0.1% reads <0.1%', () => {
    render(<ModelUsagePanel row={{ total_delegations: 2001, by_model: [
      { model_name: 'local-a', total_count: 2000, pct_of_total: 0.9995 }, { model_name: 'cloud-b', total_count: 1, pct_of_total: 0.0005 }] }} />);
    expect(values()).toContain('1 · <0.1%');
  });

  it('M4: nothing served says so', () => {
    render(<ModelUsagePanel row={{ total_delegations: 0, by_model: [] }} />);
    expect(screen.getByRole('status')).toHaveTextContent('No model usage served yet');
    render(<ModelUsagePanel row={null} />);
    expect(screen.getAllByRole('status')).toHaveLength(2);
  });
});
