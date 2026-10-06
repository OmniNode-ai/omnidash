// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RunsTable } from './LocalDashboardPage';

// Amendment 6: Runs rows are delegation decisions; the savings session with the same id supplies the cost and the
// baseline labels. OMN-19980 AC2b: no per-run baseline price or saving.
describe('RunsTable', () => {
  it('renders one row per delegation run with every declared value', () => {
    render(<RunsTable
      decisions={[{
        correlation_id: 'session-42',
        created_at: '2026-10-01T13:40:00Z',
        written_at: '2026-10-01T13:40:00Z',
        model_name: 'local-model',
        quality_gate_passed: true,
        tokens_input: 120,
        tokens_output: 45,
        task_type: 'delegation',
        latency_ms: 250,
        tokens_to_compliance: 165,
      }]}
      sessions={[{
        session_id: 'session-42',
        local_cost_usd: 0.01,
        cloud_cost_usd: 0.09,
        counterfactual_baseline_usd: 0.1,
        baseline_model: 'cloud-model',
        savings_usd: 0.09,
        usage_source: 'measured',
        savings_method: 'measured',
      }]}
    />);

    const row = screen.getByRole('row', { name: /session-42/ });
    for (const value of [
      'session-42', '2026-10-01T13:40:00Z', 'local-model', '120', '45',
      '0.01', 'cloud-model', 'measured', 'delegation', '250', '165',
    ]) {
      expect(within(row).getByText(value)).toBeInTheDocument();
    }
    // The counterfactual (0.1) and the cloud cost and saving (0.09) are served but not shown.
    for (const value of ['0.1', '0.09']) expect(within(row).queryByText(value), value).not.toBeInTheDocument();
  });

  it('shows no zero saving for a session without a baseline, and types its missing baseline model', () => {
    render(<RunsTable
      decisions={[{ correlation_id: 'session-unresolved', created_at: '2026-10-02T10:00:00Z', quality_gate_passed: true }]}
      sessions={[{ session_id: 'session-unresolved', baseline_model: null, savings_usd: 0 }]}
    />);

    const row = screen.getByRole('row', { name: /session-unresolved/ });
    const headers = screen.getAllByRole('columnheader').map((cell) => cell.textContent?.trim());
    expect(within(row).getAllByRole('cell')[headers.indexOf('Baseline model')]?.textContent).toBe('Not recorded');
    expect(within(row).queryByText(/^\$?0(?:\.0+)?$/)).not.toBeInTheDocument();
  });

  it('renders the delegate-skill placeholder and an empty model as unknown, not a model name', () => {
    render(<RunsTable
      decisions={[
        { correlation_id: 'session-placeholder', created_at: '2026-10-02T10:00:00Z', model_name: 'delegate-skill' },
        { correlation_id: 'session-empty', created_at: '2026-10-02T10:01:00Z', model_name: '' },
      ]}
      sessions={[]}
    />);
    for (const name of [/session-placeholder/, /session-empty/]) {
      const row = screen.getByRole('row', { name });
      expect(within(row).getByText('unknown')).toBeInTheDocument();
      expect(within(row).queryByText('delegate-skill')).not.toBeInTheDocument();
    }
  });
});
