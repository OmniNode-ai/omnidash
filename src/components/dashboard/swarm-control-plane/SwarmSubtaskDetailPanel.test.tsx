import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { SwarmSubtaskDetailPanel, deriveSubtaskRows } from './SwarmSubtaskDetailPanel';
import type { SwarmRunRow } from './swarm-control-plane.types';

const makeRun = (overrides: Partial<SwarmRunRow> = {}): SwarmRunRow => ({
  run_id: 'run-aaaabbbb-cccc',
  correlation_id: 'corr-aaaa',
  status: 'succeeded',
  task_hash: 'abc123',
  subtask_count: 3,
  succeeded_count: 3,
  failed_count: 0,
  skipped_count: 0,
  models_used: ['qwen3-35b', 'qwen3-27b'],
  machines_used: ['201-5090'],
  total_cost_usd: 0.012,
  cloud_equivalent_cost_usd: 0.18,
  savings_usd: 0.168,
  parallelism_speedup_ratio: 2.4,
  decomposition_latency_ms: 850,
  dispatch_wall_latency_ms: 3200,
  aggregation_latency_ms: 120,
  total_latency_ms: 4170,
  endpoint_registry_hash: 'hash-deadbeef',
  registry_schema_version: '1',
  created_at: '2026-05-25T18:00:00Z',
  ...overrides,
});

describe('deriveSubtaskRows', () => {
  it('returns empty array when subtask_count is 0', () => {
    const rows = deriveSubtaskRows(makeRun({ subtask_count: 0, succeeded_count: 0, failed_count: 0 }));
    expect(rows).toHaveLength(0);
  });

  it('returns correct number of rows for subtask_count', () => {
    const rows = deriveSubtaskRows(makeRun({ subtask_count: 5 }));
    expect(rows).toHaveLength(5);
  });

  it('assigns succeeded status to first succeeded_count rows', () => {
    const rows = deriveSubtaskRows(makeRun({ subtask_count: 4, succeeded_count: 2, failed_count: 1 }));
    expect(rows[0].status).toBe('succeeded');
    expect(rows[1].status).toBe('succeeded');
    expect(rows[2].status).toBe('failed');
    expect(rows[3].status).toBe('skipped');
  });

  it('cycles models_used across subtasks', () => {
    const rows = deriveSubtaskRows(makeRun({
      subtask_count: 4,
      succeeded_count: 4,
      models_used: ['model-a', 'model-b'],
    }));
    expect(rows[0].model).toBe('model-a');
    expect(rows[1].model).toBe('model-b');
    expect(rows[2].model).toBe('model-a');
    expect(rows[3].model).toBe('model-b');
  });

  it('assigns unknown model when models_used is empty', () => {
    const rows = deriveSubtaskRows(makeRun({ subtask_count: 2, models_used: [] }));
    expect(rows[0].model).toBe('unknown');
    expect(rows[1].model).toBe('unknown');
  });

  it('distributes cost evenly when total_cost_usd > 0', () => {
    const rows = deriveSubtaskRows(makeRun({ subtask_count: 4, succeeded_count: 4, total_cost_usd: 0.04 }));
    rows.forEach((r) => {
      expect(r.costUsd).toBeCloseTo(0.01, 5);
    });
  });

  it('sets costUsd to null when total_cost_usd is 0', () => {
    const rows = deriveSubtaskRows(makeRun({ subtask_count: 2, total_cost_usd: 0 }));
    rows.forEach((r) => {
      expect(r.costUsd).toBeNull();
    });
  });

  it('gives unique subtask IDs', () => {
    const rows = deriveSubtaskRows(makeRun({ subtask_count: 3 }));
    const ids = new Set(rows.map((r) => r.subtaskId));
    expect(ids.size).toBe(3);
  });
});

describe('SwarmSubtaskDetailPanel', () => {
  it('shows no-subtask message when subtask_count is 0', () => {
    render(<SwarmSubtaskDetailPanel run={makeRun({ subtask_count: 0, succeeded_count: 0, failed_count: 0 })} />);
    expect(screen.getByText(/No subtask data/i)).toBeTruthy();
    expect(screen.getByText(/subtask_count is 0/i)).toBeTruthy();
  });

  it('renders table headers when subtasks exist', () => {
    render(<SwarmSubtaskDetailPanel run={makeRun()} />);
    expect(screen.getByText('Subtask ID')).toBeTruthy();
    expect(screen.getByText('Model')).toBeTruthy();
    expect(screen.getByText('Status')).toBeTruthy();
    expect(screen.getByText('Tokens in')).toBeTruthy();
    expect(screen.getByText('Latency')).toBeTruthy();
  });

  it('shows fixture notice when subtasks are derived', () => {
    render(<SwarmSubtaskDetailPanel run={makeRun()} />);
    expect(screen.getByText(/derived from aggregate counts/i)).toBeTruthy();
  });

  it('renders one row per subtask', () => {
    render(<SwarmSubtaskDetailPanel run={makeRun({ subtask_count: 3 })} />);
    expect(screen.getAllByText('succeeded').length).toBeGreaterThanOrEqual(3);
  });

  it('shows model names from models_used', () => {
    render(<SwarmSubtaskDetailPanel run={makeRun()} />);
    expect(screen.getAllByText('qwen3-35b').length).toBeGreaterThan(0);
  });

  it('shows subtask summary footer', () => {
    render(<SwarmSubtaskDetailPanel run={makeRun({ subtask_count: 3, succeeded_count: 3 })} />);
    expect(screen.getByText(/3 subtasks/i)).toBeTruthy();
    expect(screen.getByText(/3 succeeded/i)).toBeTruthy();
  });

  it('renders failed status badge when run has failures', () => {
    render(<SwarmSubtaskDetailPanel run={makeRun({ subtask_count: 3, succeeded_count: 2, failed_count: 1 })} />);
    expect(screen.getAllByText('failed').length).toBeGreaterThan(0);
  });
});
