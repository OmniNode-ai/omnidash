// @vitest-environment jsdom
// OMN-20006: the Usage table renders usage-by-model-day.v1 rows as served and computes nothing.
//
// Failure modes each test is written against:
//   * the table shows cost_usd (every call, estimates included) instead of the served measured cost (D1, AC3);
//   * a null measured cost renders 0 or $0 instead of "Not measured" (D2, AC4);
//   * the unmeasured count is missing, or reads "0 unmeasured" instead of "none" (D3, AC3);
//   * the browser drops rows by tenant: the server scopes the read, so every served row renders (D4, AC-T);
//   * no rows renders an empty table instead of the typed "No usage rows yet" state (D5, AC4);
//   * a figure is summed in the browser: no total row exists (TI1).
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { UsageByModelDayTable } from './UsageByModelDayWidget';

const row = (overrides: Record<string, unknown>) => ({
  tenant_id: 'tenant-a',
  usage_day: '2026-10-02',
  model_id: 'Qwen3.8-27B',
  input_tokens: 1620,
  output_tokens: 520,
  cost_usd: 0.25,
  measured_cost_usd: 0.25,
  unmeasured_call_count: 0,
  call_count: 10,
  ...overrides,
});

describe('UsageByModelDayTable', () => {
  it('renders tokens in and out per UTC day, split by model, as served (AC1)', () => {
    render(<UsageByModelDayTable rows={[
      row({}),
      row({ model_id: 'glm-4.6', input_tokens: 300, output_tokens: 30, call_count: 3 }),
      row({ usage_day: '2026-10-01', input_tokens: 700, output_tokens: 70, call_count: 2 }),
      row({ usage_day: '2026-10-01', model_id: 'glm-4.6', input_tokens: 90, output_tokens: 9, call_count: 1 }),
    ]} />);
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows).toHaveLength(4);
    const glm = within(rows[1]!);
    for (const value of ['2026-10-02', 'glm-4.6', '300', '30', '3']) expect(glm.getByText(value)).toBeInTheDocument();
    expect(screen.queryByText(/total/i)).not.toBeInTheDocument();
  });

  it('shows the served measured cost, never cost_usd, and counts the unmeasured runs beside it (AC3)', () => {
    render(<UsageByModelDayTable rows={[row({ cost_usd: 9.25, measured_cost_usd: 0.25, unmeasured_call_count: 1, call_count: 2 })]} />);
    const cells = within(screen.getAllByRole('row')[1]!);
    expect(cells.getByText('$0.25')).toBeInTheDocument();
    expect(cells.getByText('1 unmeasured')).toBeInTheDocument();
    expect(screen.queryByText(/9\.25/)).not.toBeInTheDocument();
  });

  it('renders Not measured for a day and model with no measured run, never 0 (AC4)', () => {
    render(<UsageByModelDayTable rows={[row({ cost_usd: 4, measured_cost_usd: null, unmeasured_call_count: 1, call_count: 1 })]} />);
    const cells = within(screen.getAllByRole('row')[1]!);
    expect(cells.getByText('Not measured')).toBeInTheDocument();
    expect(cells.getByText('1 unmeasured')).toBeInTheDocument();
    expect(screen.queryByText(/^\$?0(?:\.0+)?$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/\$4/)).not.toBeInTheDocument();
  });

  it('renders a measured zero as $0.00 and no unmeasured run as none', () => {
    render(<UsageByModelDayTable rows={[row({ cost_usd: 0, measured_cost_usd: 0, unmeasured_call_count: 0 })]} />);
    const cells = within(screen.getAllByRole('row')[1]!);
    expect(cells.getByText('$0.00')).toBeInTheDocument();
    expect(cells.getByText('none')).toBeInTheDocument();
    expect(screen.queryByText('Not measured')).not.toBeInTheDocument();
  });

  it('formats a Postgres NUMERIC as served money, without summing or rounding past 8 places', () => {
    render(<UsageByModelDayTable rows={[row({ measured_cost_usd: '0.25000000' }), row({ model_id: 'm2', measured_cost_usd: 0.00012345 })]} />);
    expect(screen.getByText('$0.25')).toBeInTheDocument();
    expect(screen.getByText('$0.00012345')).toBeInTheDocument();
    expect(screen.queryByText(/0\.25000000/)).not.toBeInTheDocument();
  });

  it('renders Not recorded when the server serves no unmeasured count, never 0', () => {
    const { unmeasured_call_count: _omitted, ...served } = row({});
    render(<UsageByModelDayTable rows={[served]} />);
    expect(within(screen.getAllByRole('row')[1]!).getByText('Not recorded')).toBeInTheDocument();
  });

  it('renders every served row: the server scopes the read, the browser filters nothing (AC-T)', () => {
    render(<UsageByModelDayTable rows={[row({}), row({ tenant_id: 'tenant-b', model_id: 'served-model' })]} />);
    expect(screen.getByText('served-model')).toBeInTheDocument();
    expect(screen.getAllByRole('row').slice(1)).toHaveLength(2);
  });

  it('renders the typed No usage rows yet state on a fresh store, never an empty table (AC4)', () => {
    render(<UsageByModelDayTable rows={[]} />);
    expect(screen.getByRole('status')).toHaveTextContent('No usage rows yet');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});
