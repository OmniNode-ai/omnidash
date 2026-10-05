// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LastRunCard, MetricCard, RecentRunsTable, RunsTable } from './LocalDashboardPage';
import type { LocalPageDocument } from '@/layout/local-page-loader';

const now = Date.parse('2026-10-03T12:00:00Z');
const run = {
  correlation_id: 'displayed-run', written_at: '2026-10-03T11:59:00Z',
  created_at: '2026-10-03T11:59:00Z', quality_gate_passed: true,
  model_name: 'local-model', tokens_input: 0, tokens_output: 0,
};
const cases = [
  ['measured', 'measured'], ['estimated', 'estimated'], ['unknown', 'unknown'],
  [undefined, 'Not recorded'], [null, 'Not recorded'], ['', 'Not recorded'],
] as const;

function sessions(basis: unknown) {
  return [
    { session_id: 'different-run', usage_source: 'wrong-session-basis' },
    { session_id: run.correlation_id, usage_source: basis, savings_method: 'must-not-substitute', local_cost_usd: 0 },
  ];
}

describe('stored run basis', () => {
  it.each(cases)('Last Run displays %s as %s without token/cost inference', (basis, expected) => {
    render(<LastRunCard decisions={[run]} sessions={sessions(basis)} now={now} />);
    const label = screen.getByText('Basis', { selector: 'dt' });
    expect(label.nextElementSibling).toHaveTextContent(new RegExp(`^${expected}$`));
    expect(screen.queryByText('must-not-substitute')).not.toBeInTheDocument();
    expect(screen.queryByText('wrong-session-basis')).not.toBeInTheDocument();
  });

  for (const [name, Table] of [['Runs', RunsTable], ['Recent Runs', RecentRunsTable]] as const) {
    it.each(cases)(`${name} displays %s as %s from the matched session`, (basis, expected) => {
      render(<Table decisions={[run]} sessions={sessions(basis)} now={now} />);
      const headers = screen.getAllByRole('columnheader');
      const basisColumn = headers.findIndex(header => header.textContent === 'Basis');
      expect(basisColumn).toBeGreaterThanOrEqual(0);
      const row = screen.getByRole('row', { name: /displayed-run/ });
      expect(within(row).getAllByRole('cell')[basisColumn]).toHaveTextContent(new RegExp(`^${expected}$`));
      expect(within(row).queryByText('must-not-substitute')).not.toBeInTheDocument();
      expect(within(row).queryByText('wrong-session-basis')).not.toBeInTheDocument();
    });
  }
});

describe('excluded counts beside measured figures', () => {
  const document = JSON.parse(readFileSync('src/pages/local/overview.contracts.yaml', 'utf8')) as Pick<LocalPageDocument, 'components'>;
  const measured = document.components.find(component => component.component_id === 'overview-measured')!;

  it('renders the served counts, not the size or token content of any run list', () => {
    render(<MetricCard component={measured} config={{ metric_key: 'measured_run_count', label: 'Measured runs' }}
      row={{ measured_run_count: 7 }} caption={{ estimated_run_count: 23, unknown_run_count: 9, zero_token_run_count: 0 }} />);
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getByText(/Estimated runs excluded: 23/)).toBeInTheDocument();
    expect(screen.getByText(/Unknown runs excluded: 9/)).toBeInTheDocument();
  });

  it('makes unavailable excluded counts explicit, never inventing zero', () => {
    render(<MetricCard component={measured} config={{ metric_key: 'measured_run_count', label: 'Measured runs' }}
      row={{ measured_run_count: 7 }} caption={{ zero_token_run_count: 0 }} />);
    expect(screen.getByText(/Estimated runs excluded: Not recorded/)).toBeInTheDocument();
    expect(screen.getByText(/Unknown runs excluded: Not recorded/)).toBeInTheDocument();
  });

  it('declares excluded counts and basis in every consuming binding', () => {
    expect(measured.data_bindings?.[1]?.required_fields).toEqual(expect.arrayContaining(['estimated_run_count', 'unknown_run_count']));
    for (const id of ['overview-last-run', 'overview-recent-runs']) {
      const component = document.components.find(candidate => candidate.component_id === id)!;
      expect(component.data_bindings?.[1]?.required_fields, id).toContain('usage_source');
    }
  });

  it('retains baseline identity and the never-ran explanation without a verified claim', () => {
    const savings = document.components.find(component => component.component_id === 'overview-savings')!;
    const { container } = render(<MetricCard component={savings}
      config={{ metric_key: 'total_savings_usd', label: 'Savings', format: 'currency', precision: 4 }}
      row={{ total_savings_usd: 1, total_baseline_cost_usd: 2 }} caption={{ baseline_model: 'baseline-from-projection' }} />);
    expect(screen.getByText('Baseline baseline-from-projection')).toBeInTheDocument();
    expect(screen.getByText(/The baseline never ran\./)).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/verified/i);
    for (const file of ['src/pages/LocalDashboardPage.tsx', 'src/pages/local/overview.page.yaml', 'src/pages/local/runs.page.yaml']) {
      expect(readFileSync(file, 'utf8'), file).not.toMatch(/verified/i);
    }
  });
});
