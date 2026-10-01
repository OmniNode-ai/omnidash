// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RunsTable } from './LocalDashboardPage';

describe('RunsTable', () => {
  it('renders one row per delegation session with every declared value', () => {
    render(<RunsTable rows={[{
      session_id: 'session-42',
      created_at: '2026-10-01T13:40:00Z',
      model_name: 'local-model',
      prompt_tokens: 120,
      completion_tokens: 45,
      local_cost_usd: 0.01,
      cloud_cost_usd: 0.09,
      counterfactual_baseline_usd: 0.1,
      baseline_model: 'cloud-model',
      savings_usd: 0.09,
      usage_source: 'measured',
      savings_method: 'measured',
      task_type: 'delegation',
      latency_ms: 250,
      tokens_to_compliance: 165,
    }]} />);

    const row = screen.getByRole('row', { name: /session-42/ });
    for (const value of [
      'session-42', '2026-10-01T13:40:00Z', 'local-model', '120', '45',
      '0.01', '0.1', 'cloud-model', '0.09', 'measured', 'delegation', '250', '165',
    ]) {
      expect(within(row).getByText(value)).toBeInTheDocument();
    }
  });

  it('renders BASELINE_UNRESOLVED and suppresses zero savings without a baseline', () => {
    render(<RunsTable rows={[{
      session_id: 'session-unresolved',
      baseline_model: null,
      savings_usd: 0,
    }]} />);

    const row = screen.getByRole('row', { name: /session-unresolved/ });
    expect(within(row).getAllByText('Baseline unresolved')).toHaveLength(3);
    expect(within(row).queryByText(/^\$?0(?:\.0+)?$/)).not.toBeInTheDocument();
  });
});
