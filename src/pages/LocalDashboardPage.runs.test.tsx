// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LastRunCard, NoRunsYet, RecentRunsTable, RunsTable } from './LocalDashboardPage';

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
    expect(within(card).getByText('0.0021')).toBeInTheDocument();
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

  it('types a cost with no matching savings session and the unserved backend, never a blank or 0', () => {
    render(<LastRunCard now={NOW} decisions={[decision('run', '2026-10-02T10:07:00Z')]} sessions={[]} />);
    const card = screen.getByRole('region', { name: 'Last run' });
    expect(within(card).getByText('Not recorded')).toBeInTheDocument();
    expect(within(card).getByText('Not served (OMN-20162)')).toBeInTheDocument();
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
    for (const value of ['failed', 'provider returned 429 (quota exhausted)', '162', '52', '0.0004', 'local']) {
      expect(within(row).getByText(value)).toBeInTheDocument();
    }
  });
});

describe('RecentRunsTable savings without a baseline (AC4, found on the lakshman lane 2026-10-02)', () => {
  it('renders Baseline unresolved, not 0, for a run whose session has no baseline and 0 savings', () => {
    render(<RecentRunsTable
      now={NOW}
      decisions={[decision('unpriced-run', '2026-10-02T10:01:20Z')]}
      sessions={[session('unpriced-run', '2026-10-02T10:01:20Z', { baseline_model: null, savings_usd: 0 })]}
    />);
    const row = screen.getByRole('row', { name: /unpriced-run/ });
    const cells = within(row).getAllByRole('cell').map((cell) => cell.textContent);
    const savings = screen.getAllByRole('columnheader').findIndex((header) => header.textContent === 'Savings');
    expect(cells[savings]).toBe('Baseline unresolved');
  });
});

describe('RunsTable status, cause and filters (RU-1, F18)', () => {
  const sessions = [
    session('run-a', '2026-10-02T10:07:00Z'),
    session('run-b', '2026-10-02T09:00:00Z', { model_name: 'deepseek/deepseek-chat-v3' }),
    session('run-c', '2026-10-01T22:00:00Z'),
    session('run-d', '2026-10-02T08:00:00Z'),
  ];
  const decisions = [
    decision('run-a', '2026-10-02T10:07:00Z'),
    decision('run-b', '2026-10-02T09:00:00Z', {
      quality_gate_passed: false,
      quality_gate_detail: 'answer did not cite the requested source',
      model_name: 'deepseek/deepseek-chat-v3',
    }),
    decision('run-c', '2026-10-01T22:00:00Z'),
  ];

  it('shows each row its own decision status and cause, and Not recorded without one', () => {
    render(<RunsTable now={NOW} rows={sessions} decisions={decisions} />);
    expect(within(screen.getByRole('row', { name: /run-a/ })).getByText('passed')).toBeInTheDocument();
    const failed = screen.getByRole('row', { name: /run-b/ });
    expect(within(failed).getByText('failed')).toBeInTheDocument();
    expect(within(failed).getByText('answer did not cite the requested source')).toBeInTheDocument();
    expect(within(screen.getByRole('row', { name: /run-d/ })).getAllByText('Not recorded').length).toBeGreaterThan(0);
  });

  it('keeps every served row when no filter is set', () => {
    render(<RunsTable now={NOW} rows={sessions} decisions={decisions} />);
    expect(screen.getAllByRole('row').slice(1)).toHaveLength(4);
  });

  it('filters by status', () => {
    render(<RunsTable now={NOW} rows={sessions} decisions={decisions} />);
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'failed' } });
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows).toHaveLength(1);
    expect(within(rows[0]!).getByText('run-b')).toBeInTheDocument();
  });

  it('filters by model', () => {
    render(<RunsTable now={NOW} rows={sessions} decisions={decisions} />);
    fireEvent.change(screen.getByLabelText('Model'), { target: { value: 'Qwen3.8-27B' } });
    const ids = screen.getAllByRole('row').slice(1).map((row) => row.textContent ?? '');
    expect(ids).toHaveLength(3);
    expect(ids.some((text) => text.includes('run-b'))).toBe(false);
  });

  it('filters to runs from today (UTC)', () => {
    render(<RunsTable now={NOW} rows={sessions} decisions={decisions} />);
    fireEvent.change(screen.getByLabelText('Window'), { target: { value: 'today' } });
    const rows = screen.getAllByRole('row').slice(1).map((row) => row.textContent ?? '');
    expect(rows).toHaveLength(3);
    expect(rows.some((text) => text.includes('run-c'))).toBe(false);
  });

  it('says so when a filter leaves no rows, instead of an empty table', () => {
    render(<RunsTable now={NOW} rows={[sessions[2]!]} decisions={decisions} />);
    fireEvent.change(screen.getByLabelText('Window'), { target: { value: 'today' } });
    expect(screen.getByText('No runs match these filters')).toBeInTheDocument();
  });
});

describe('NO_RUNS_YET (RU-4, F19)', () => {
  it('names the one command that makes the first run', () => {
    render(<NoRunsYet />);
    expect(screen.getByText('No runs yet')).toBeInTheDocument();
    expect(screen.getByText('onex delegate "ping"')).toBeInTheDocument();
  });
});

describe('Baseline model label (F20)', () => {
  it('reads Not recorded for a measured saving whose baseline model is null', () => {
    render(<RunsTable
      now={NOW}
      rows={[session('no-baseline-name', '2026-10-02T10:07:00Z', { baseline_model: null })]}
      decisions={[decision('no-baseline-name', '2026-10-02T10:07:00Z')]}
    />);
    const row = screen.getByRole('row', { name: /no-baseline-name/ });
    expect(within(row).queryByText('Not measured')).not.toBeInTheDocument();
    // The run has its decision, so the one Not recorded is the baseline model cell.
    expect(within(row).getAllByText('Not recorded')).toHaveLength(1);
    // The saving still shows (the baseline cost cell carries the same figure).
    expect(within(row).getAllByText('0.000844').length).toBeGreaterThan(0);
  });
});
