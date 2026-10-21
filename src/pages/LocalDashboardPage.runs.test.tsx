// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { LastRunCard, NoRunsYet, RecentRunsTable, RunsTable } from './LocalDashboardPage';
import { causeHref } from './local/run-filter';

// Shapes are the lakshman-lane reads of 2026-10-02 11:34Z: a decisions row and the savings session that shares its id.
const NOW = Date.parse('2026-10-02T10:12:00Z');

function decision(id: string, writtenAt: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    correlation_id: id,
    written_at: writtenAt,
    created_at: writtenAt,
    model_name: 'Qwen3.8-27B',
    quality_gate_passed: true,
    quality_gate_detail: 'completed',
    latency_ms: 813,
    tokens_input: 162,
    tokens_output: 52,
    task_type: 'summarization',
    cost_tier_name: 'local',
    actual_score: '1.000',
    tokens_to_compliance: 214,
    ...extra,
  };
}

function session(id: string, createdAt: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    session_id: id,
    created_at: createdAt,
    model_name: 'Qwen3.8-27B',
    prompt_tokens: 162,
    completion_tokens: 52,
    local_cost_usd: 0,
    cloud_cost_usd: 0.000844,
    counterfactual_baseline_usd: 0.000844,
    baseline_model: 'claude-opus-4-6',
    savings_usd: 0.000844,
    usage_source: 'measured',
    task_type: 'summarization',
    latency_ms: 813,
    tokens_to_compliance: 214,
    ...extra,
  };
}

describe('LastRunCard (OV-4, F16)', () => {
  it('shows the newest run by written_at, not the first row served', () => {
    render(<LastRunCard
      now={NOW}
      decisions={[
        decision('older-run', '2026-10-02T10:01:20Z'),
        decision('newest-run', '2026-10-02T10:07:00Z'),
      ]}
      sessions={[session('newest-run', '2026-10-02T10:07:00Z', { local_cost_usd: 0.0021 })]}
    />);
    const card = screen.getByRole('region', { name: 'Last run' });
    expect(within(card).getByText('newest-run')).toBeInTheDocument();
    expect(within(card).queryByText('older-run')).not.toBeInTheDocument();
    expect(within(card).getByText('passed')).toBeInTheDocument();
    expect(within(card).getByText('Qwen3.8-27B')).toBeInTheDocument();
    expect(within(card).getByText('813 ms')).toBeInTheDocument();
    expect(within(card).getByText('summarization')).toBeInTheDocument();
    expect(within(card).getByText('local')).toBeInTheDocument();
    expect(within(card).getByText('5m ago')).toBeInTheDocument();
    expect(within(card).getByText('$0.0021')).toBeInTheDocument();
  });

  it('shows tokens in and tokens out apart, never one combined figure (SV-3)', () => {
    render(<LastRunCard now={NOW} decisions={[decision('run', '2026-10-02T10:07:00Z')]} sessions={[]} />);
    const card = screen.getByRole('region', { name: 'Last run' });
    expect(within(card).getByText('162')).toBeInTheDocument();
    expect(within(card).getByText('52')).toBeInTheDocument();
    expect(within(card).queryByText('214')).not.toBeInTheDocument();
  });

  it('shows a failed run with its typed cause', () => {
    render(<LastRunCard
      now={NOW}
      decisions={[decision('failed-run', '2026-10-02T10:07:00Z', {
        quality_gate_passed: false,
        quality_gate_detail: 'provider timeout after 30s',
      })]}
      sessions={[]}
    />);
    const card = screen.getByRole('region', { name: 'Last run' });
    expect(within(card).getByText('failed')).toBeInTheDocument();
    expect(within(card).getByText('provider timeout after 30s')).toBeInTheDocument();
  });

  it('types a cost with no matching savings session and a run with no served backend, never a blank or 0', () => {
    render(<LastRunCard now={NOW} decisions={[decision('run', '2026-10-02T10:07:00Z')]} sessions={[]} />);
    const card = screen.getByRole('region', { name: 'Last run' });
    // This 2026-10-02 row predates OMN-20162's backend_id and host columns, so cost, backend and host are not recorded.
    for (const label of ['Cost', 'Backend', 'Host']) {
      expect(within(card).getByText(label, { selector: 'dt' }).nextElementSibling?.textContent, label).toBe('Not recorded');
    }
    expect(within(card).queryByText(/Not served \(OMN-20162\)/)).not.toBeInTheDocument();
    expect(within(card).queryByText(/^\$?0(?:\.0+)?$/)).not.toBeInTheDocument();
    for (const value of within(card).getAllByRole('definition')) {
      expect(value.textContent?.trim()).not.toBe('');
    }
  });

  it('renders the placeholder model as unknown (aac9032d)', () => {
    render(<LastRunCard now={NOW} decisions={[decision('run', '2026-10-02T10:07:00Z', { model_name: 'delegate-skill' })]} sessions={[]} />);
    const card = screen.getByRole('region', { name: 'Last run' });
    expect(within(card).getByText('unknown')).toBeInTheDocument();
    expect(within(card).queryByText('delegate-skill')).not.toBeInTheDocument();
  });
});

describe('RecentRunsTable (OV-5, F17)', () => {
  const twelve = Array.from({ length: 12 }, (_, index) =>
    decision(`run-${String(index).padStart(2, '0')}`, `2026-10-02T09:${String(index * 4).padStart(2, '0')}:00Z`));

  it('shows the ten newest runs, newest first', () => {
    render(<RecentRunsTable now={NOW} decisions={twelve} sessions={[]} />);
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows).toHaveLength(10);
    expect(within(rows[0]!).getByText('run-11')).toBeInTheDocument();
    expect(within(rows[9]!).getByText('run-02')).toBeInTheDocument();
    expect(screen.queryByText('run-01')).not.toBeInTheDocument();
  });

  it('carries status, cause, tokens in and out, and the matched session cost per row', () => {
    render(<RecentRunsTable
      now={NOW}
      decisions={[decision('quota-run', '2026-10-02T10:00:00Z', {
        quality_gate_passed: false,
        quality_gate_detail: 'provider returned 429 (quota exhausted)',
      })]}
      sessions={[session('quota-run', '2026-10-02T10:00:00Z', { local_cost_usd: 0.0004 })]}
    />);
    const row = screen.getByRole('row', { name: /quota-run/ });
    for (const value of ['failed', 'provider returned 429 (quota exhausted)', '162', '52', '$0.0004', 'local']) {
      expect(within(row).getByText(value)).toBeInTheDocument();
    }
  });
});

describe('RecentRunsTable shows no per-run saving (OMN-19980 AC2b)', () => {
  it('shows the run\'s cost and no Savings column, so an unpriced run has no saving to type', () => {
    render(<RecentRunsTable
      now={NOW}
      decisions={[decision('unpriced-run', '2026-10-02T10:01:20Z')]}
      sessions={[session('unpriced-run', '2026-10-02T10:01:20Z', { local_cost_usd: 0.0004, baseline_model: null, savings_usd: 0 })]}
    />);
    expect(screen.getAllByRole('columnheader').map((header) => header.textContent)).not.toContain('Savings');
    const row = screen.getByRole('row', { name: /unpriced-run/ });
    expect(within(row).getByText('$0.0004')).toBeInTheDocument();
    expect(within(row).queryByText('Baseline unresolved')).not.toBeInTheDocument();
  });
});

describe('RunsTable rows, status, cause and filters (RU-1, F18, F28)', () => {
  const decisions = [
    decision('run-a', '2026-10-02T10:07:00Z'),
    decision('run-b', '2026-10-02T09:00:00Z', {
      quality_gate_passed: false,
      quality_gate_detail: 'answer did not cite the requested source',
      model_name: 'deepseek/deepseek-chat-v3',
    }),
    decision('run-c', '2026-10-01T22:00:00Z'),
    decision('run-d', '2026-10-02T08:00:00Z', { quality_gate_passed: false, quality_gate_detail: 'provider timeout after 30s' }),
  ];
  const sessions = [
    session('run-a', '2026-10-02T10:07:00Z', { local_cost_usd: 0.0011 }),
    session('run-b', '2026-10-02T09:00:00Z', { model_name: 'deepseek/deepseek-chat-v3' }),
    session('run-c', '2026-10-01T22:00:00Z'),
  ];

  it('lists every decision, a failed run with no savings session included (F28)', () => {
    render(<RunsTable now={NOW} decisions={decisions} sessions={sessions} />);
    const row = screen.getByRole('row', { name: /run-d/ });
    expect(within(row).getByText('failed')).toBeInTheDocument();
    expect(within(row).getByText('provider timeout after 30s')).toBeInTheDocument();
    expect(within(row).getAllByText('Not recorded').length).toBeGreaterThan(0);
    expect(screen.getAllByRole('row').slice(1)).toHaveLength(4);
  });

  it('takes cost from the session with the same id', () => {
    render(<RunsTable now={NOW} decisions={decisions} sessions={sessions} />);
    const row = screen.getByRole('row', { name: /run-a/ });
    expect(within(row).getByText('$0.0011')).toBeInTheDocument();
    expect(within(row).getByText('passed')).toBeInTheDocument();
  });

  it('filters by status', () => {
    render(<RunsTable now={NOW} decisions={decisions} sessions={sessions} />);
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'failed' } });
    const rows = screen.getAllByRole('row').slice(1).map((row) => row.textContent ?? '');
    expect(rows).toHaveLength(2);
    expect(rows.every((text) => text.includes('run-b') || text.includes('run-d'))).toBe(true);
  });

  it('filters by cause', () => {
    render(<RunsTable now={NOW} decisions={decisions} sessions={sessions} />);
    fireEvent.change(screen.getByLabelText('Cause'), { target: { value: 'provider timeout after 30s' } });
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows).toHaveLength(1);
    expect(within(rows[0]!).getByText('run-d')).toBeInTheDocument();
  });

  it('filters by model', () => {
    render(<RunsTable now={NOW} decisions={decisions} sessions={sessions} />);
    fireEvent.change(screen.getByLabelText('Model'), { target: { value: 'Qwen3.8-27B' } });
    const ids = screen.getAllByRole('row').slice(1).map((row) => row.textContent ?? '');
    expect(ids).toHaveLength(3);
    expect(ids.some((text) => text.includes('run-b'))).toBe(false);
  });

  it('filters to runs from today (UTC)', () => {
    render(<RunsTable now={NOW} decisions={decisions} sessions={sessions} />);
    fireEvent.change(screen.getByLabelText('Window'), { target: { value: 'today' } });
    const rows = screen.getAllByRole('row').slice(1).map((row) => row.textContent ?? '');
    expect(rows).toHaveLength(3);
    expect(rows.some((text) => text.includes('run-c'))).toBe(false);
  });

  it('says so when a filter leaves no rows, instead of an empty table', () => {
    render(<RunsTable now={NOW} decisions={[decisions[2]!]} sessions={sessions} />);
    fireEvent.change(screen.getByLabelText('Window'), { target: { value: 'today' } });
    expect(screen.getByText('No runs match these filters')).toBeInTheDocument();
  });
});

describe('RunsTable pagination (RU-1, F29)', () => {
  const many = Array.from({ length: 30 }, (_, index) =>
    decision(`run-${String(index).padStart(2, '0')}`, `2026-10-02T09:${String(index).padStart(2, '0')}:00Z`));

  it('shows the declared page size, newest first, and every row exactly once across pages', () => {
    render(<RunsTable now={NOW} decisions={many} sessions={[]} pageSize={25} />);
    const firstPage = (screen.getAllByRole('row').slice(1) as HTMLTableRowElement[]).map((row) => row.cells[0]!.textContent);
    expect(firstPage).toHaveLength(25);
    expect(firstPage[0]).toBe('run-29');
    expect(screen.getByText('Runs 1–25 of 30')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    const secondPage = (screen.getAllByRole('row').slice(1) as HTMLTableRowElement[]).map((row) => row.cells[0]!.textContent);
    expect(secondPage).toHaveLength(5);
    expect(new Set([...firstPage, ...secondPage]).size).toBe(30);
    expect(screen.getByText('Runs 26–30 of 30')).toBeInTheDocument();
  });

  it('goes back to the first page when a filter changes', () => {
    render(<RunsTable now={NOW} decisions={many} sessions={[]} pageSize={25} />);
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'passed' } });
    expect(screen.getByText('Runs 1–25 of 30')).toBeInTheDocument();
  });
});

describe('Fixture rows (FR-2, F30)', () => {
  it('badges a row whose served data_source is not real, and not a real one', () => {
    render(<RunsTable
      now={NOW}
      decisions={[decision('seeded', '2026-10-02T10:00:00Z', { data_source: 'fixture' }), decision('measured', '2026-10-02T10:01:00Z', { data_source: 'real' })]}
      sessions={[]}
    />);
    expect(within(screen.getByRole('row', { name: /seeded/ })).getByText('fixture')).toBeInTheDocument();
    // Anchored to the run id: since OMN-21015 AC3 the seeded row's saving cell reads "Not measured" too.
    expect(within(screen.getByRole('row', { name: /^measured/ })).queryByText('fixture')).not.toBeInTheDocument();
  });
});

describe('NO_RUNS_YET (RU-4, F19)', () => {
  it('names the one command that makes the first run', () => {
    render(<NoRunsYet />);
    expect(screen.getByText('No runs yet')).toBeInTheDocument();
    expect(screen.getByText('onex delegate "ping"')).toBeInTheDocument();
  });
});

describe('Baseline model label (F20, OMN-19980 AC2b)', () => {
  it('reads Not recorded for a null baseline model, with no session baseline price or saving beside it', () => {
    render(<RunsTable
      now={NOW}
      decisions={[decision('no-baseline-name', '2026-10-02T10:07:00Z')]}
      sessions={[session('no-baseline-name', '2026-10-02T10:07:00Z', { baseline_model: null })]}
    />);
    const row = screen.getByRole('row', { name: /no-baseline-name/ });
    // The label stays (ruling 2026-10-05: keep labels); the dollars beside it came off.
    const headers = screen.getAllByRole('columnheader').map((cell) => cell.textContent?.trim());
    const cells = within(row).getAllByRole('cell');
    expect(cells[headers.indexOf('Baseline model')]?.textContent).toBe('Not recorded');
    // OMN-21015 AC3: the per-run saving comes only from the decisions row's own served figure; this row serves none, so
    // the cell is typed, and the session's savings_usd (0.000844) is still never shown.
    expect(cells[headers.indexOf('Modelled saving')]?.textContent).toBe('Not measured');
    expect(headers).not.toContain('Baseline cost');
    expect(headers).not.toContain('Savings');
    expect(within(row).queryByText('0.000844')).not.toBeInTheDocument();
  });
});

// OMN-19919 AC5 and AC6 (spec of agent claude-63c840af, re-homing AC1 and AC2 onto Runs): a failed run is listed under
// status=failed with its correlation id, its typed cause and its time; the cause filter offers that cause. The typed
// terminal_failure_cause wins over the quality_gate_detail text, which stays readable on the row. terminal_ok false
// fails a run even when quality_gate_passed is null. A failed run with no cause reads Not recorded and is never dropped.
// Shapes: decisions.v1 as the lab serves it (terminal_ok 1/0 from SQLite), plus terminal_failure_cause, which omnimarket
// adds to decisions.v1 under OMN-19919 AC4; a row without that key is today's lab row.
//
// Failure modes, each with a test below:
//   U1  a typed cause row shows the detail text as its cause, or is missing from status=failed
//   U2  the detail text of a typed cause row can no longer be read on the row
//   U3  terminal_ok 0 with quality_gate_passed null reads Not recorded and is missing from status=failed
//   U4  a failed row with no typed cause and no detail is dropped, shown passed, or given a cause
//   U5  the cause filter does not offer the typed cause, or choosing it keeps rows of other causes
//   U6  the Overview's Runs link (status=failed and the cause in the URL) shows rows other than that cause's
//   U7  with no typed cause served the cause is the detail's leading label (the Overview's), the full detail readable
describe('OMN-19919 AC5, AC6: Runs lists failed runs with their typed cause', () => {
  const failed = (id: string, at: string, extra: Record<string, unknown>) =>
    decision(id, at, { terminal_ok: 0, quality_gate_passed: 0, ...extra });
  const decisions = [
    failed('run-typed', '2026-10-02T10:05:00Z', { quality_gate_detail: 'provider returned 503: upstream unavailable', terminal_failure_cause: 'provider_error' }),
    failed('run-terminal', '2026-10-02T10:04:00Z', { quality_gate_passed: null, quality_gate_detail: null, terminal_failure_cause: null }),
    failed('run-empty', '2026-10-02T10:03:00Z', { quality_gate_detail: '', terminal_failure_cause: null }),
    decision('run-legacy', '2026-10-02T10:02:00Z', { quality_gate_passed: 0, quality_gate_detail: 'MALFORMED: invalid syntax' }),
    decision('run-pass', '2026-10-02T10:01:00Z', { terminal_ok: 1, quality_gate_passed: 1, terminal_failure_cause: null }),
    decision('run-unjudged', '2026-10-02T10:00:00Z', { terminal_ok: 1, quality_gate_passed: null }),
  ];
  const headers = () => screen.getAllByRole('columnheader').map((cell) => cell.textContent?.trim());
  const cell = (id: string, header: string) => within(screen.getByRole('row', { name: new RegExp(`^${id}`) })).getAllByRole('cell')[headers().indexOf(header)]!;
  const listed = () => (screen.getAllByRole('row').slice(1) as HTMLTableRowElement[]).map((row) => row.cells[0]!.textContent);

  afterEach(() => window.history.replaceState(null, '', '/'));

  it('U1-U4: status=failed lists each failed run with its id, time, typed cause or Not recorded, the detail readable', () => {
    render(<RunsTable now={NOW} decisions={decisions} sessions={[]} />);
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'failed' } });
    expect(listed()).toEqual(['run-typed', 'run-terminal', 'run-empty', 'run-legacy']);
    expect(cell('run-typed', 'Created').textContent).toBe('Oct 2, 10:05:00 UTC');
    expect(cell('run-typed', 'Status').textContent).toBe('failed');
    const typedCause = cell('run-typed', 'Cause');
    expect(within(typedCause).getByText('provider_error')).toHaveAttribute('title', 'provider returned 503: upstream unavailable');
    expect(within(typedCause).getByText('Read failure details')).toBeInTheDocument();
    expect(typedCause).toHaveTextContent('provider returned 503: upstream unavailable');
    for (const id of ['run-terminal', 'run-empty']) {
      expect(cell(id, 'Status').textContent, id).toBe('failed');
      expect(cell(id, 'Cause').textContent, id).toBe('Not recorded');
    }
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'Not recorded' } });
    expect(listed()).toEqual(['run-unjudged']);
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'passed' } });
    expect(listed()).toEqual(['run-pass']);
  });

  it('U5: the cause filter offers the typed cause and keeps only its runs', () => {
    render(<RunsTable now={NOW} decisions={decisions} sessions={[]} />);
    const options = within(screen.getByLabelText('Cause')).getAllByRole('option').map((option) => option.getAttribute('value'));
    expect(options).toEqual(['all', 'MALFORMED', 'Not recorded', 'provider_error']);
    fireEvent.change(screen.getByLabelText('Cause'), { target: { value: 'provider_error' } });
    expect(listed()).toEqual(['run-typed']);
  });

  it('U6: the Overview link for a cause opens Runs on that cause\'s failed runs only', () => {
    window.history.replaceState(null, '', causeHref('provider_error'));
    const { unmount } = render(<RunsTable now={NOW} decisions={decisions} sessions={[]} syncUrl />);
    expect(listed()).toEqual(['run-typed']);
    expect(screen.getByLabelText('Status')).toHaveValue('failed');
    expect(screen.getByLabelText('Cause')).toHaveValue('provider_error');
    unmount();
    window.history.replaceState(null, '', causeHref('Not recorded'));
    render(<RunsTable now={NOW} decisions={decisions} sessions={[]} syncUrl />);
    expect(listed()).toEqual(['run-terminal', 'run-empty']);
  });

  it('U7: with no typed cause served the cause is the detail\'s label, the full detail still readable', () => {
    render(<RunsTable now={NOW} decisions={decisions} sessions={[]} />);
    const legacy = cell('run-legacy', 'Cause');
    expect(within(legacy).getByText('MALFORMED')).toHaveAttribute('title', 'MALFORMED: invalid syntax');
    expect(legacy).toHaveTextContent('MALFORMED: invalid syntax');
    fireEvent.change(screen.getByLabelText('Search runs'), { target: { value: 'invalid syntax' } });
    expect(listed()).toEqual(['run-legacy']);
  });
});
