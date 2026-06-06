import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockUseSwarmSnapshot = vi.fn();
const mockUseDataSourceMode = vi.fn();

vi.mock('./useSwarmSnapshot', () => ({
  useSwarmSnapshot: () => mockUseSwarmSnapshot(),
}));

vi.mock('@/hooks/useDataSourceMode', () => ({
  useDataSourceMode: () => mockUseDataSourceMode(),
  isLiveDataSource: (mode: string) => mode === 'http' || mode === 'postgres',
}));

import SwarmControlPlane from './SwarmControlPlane';

const EMPTY_SNAPSHOT = {
  runs: [],
  isLoading: false,
  hasAnyData: false,
  error: null,
  capturedAt: null,
};

const makeRun = (overrides: Partial<import('./swarm-control-plane.types').SwarmRunRow> = {}): import('./swarm-control-plane.types').SwarmRunRow => ({
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

describe('SwarmControlPlane', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseDataSourceMode.mockReturnValue('file');
  });

  it('shows empty state when no runs exist', () => {
    mockUseSwarmSnapshot.mockReturnValue(EMPTY_SNAPSHOT);
    render(<SwarmControlPlane config={{}} />);
    expect(screen.getByText(/No swarm runs/i)).toBeTruthy();
  });

  it('renders run table with run data', () => {
    mockUseSwarmSnapshot.mockReturnValue({
      ...EMPTY_SNAPSHOT,
      runs: [makeRun()],
      hasAnyData: true,
    });
    render(<SwarmControlPlane config={{}} />);
    expect(screen.getAllByText(/run-aaaabbbb/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText('succeeded').length).toBeGreaterThan(0);
    expect(screen.getAllByText('2.40×').length).toBeGreaterThan(0);
  });

  it('shows overview tab with live counters by default', () => {
    mockUseSwarmSnapshot.mockReturnValue({
      ...EMPTY_SNAPSHOT,
      runs: [makeRun()],
      hasAnyData: true,
    });
    render(<SwarmControlPlane config={{}} />);
    expect(screen.getByText('Total runs')).toBeTruthy();
    expect(screen.getByText('Avg speedup ratio')).toBeTruthy();
    expect(screen.getByText('Cumulative savings')).toBeTruthy();
  });

  it('switches to decomposition tab and shows decomposition tree', () => {
    mockUseSwarmSnapshot.mockReturnValue({
      ...EMPTY_SNAPSHOT,
      runs: [makeRun()],
      hasAnyData: true,
    });
    render(<SwarmControlPlane config={{}} />);
    fireEvent.click(screen.getByText('Decomposition'));
    expect(screen.getByText('Swarm run')).toBeTruthy();
    expect(screen.getByText('run-aaaabbbb-cccc')).toBeTruthy();
  });

  it('shows subtask cards in run detail tab', () => {
    mockUseSwarmSnapshot.mockReturnValue({
      ...EMPTY_SNAPSHOT,
      runs: [makeRun()],
      hasAnyData: true,
    });
    render(<SwarmControlPlane config={{}} />);
    fireEvent.click(screen.getByText('Run Detail'));
    expect(screen.getAllByText('succeeded').length).toBeGreaterThan(0);
    expect(screen.getAllByText('qwen3-35b').length).toBeGreaterThan(0);
  });

  it('shows wave visualization in wave tab', () => {
    mockUseSwarmSnapshot.mockReturnValue({
      ...EMPTY_SNAPSHOT,
      runs: [makeRun()],
      hasAnyData: true,
    });
    render(<SwarmControlPlane config={{}} />);
    fireEvent.click(screen.getByText('Wave View'));
    expect(screen.getAllByText(/Wave 0/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Wave 1/i).length).toBeGreaterThan(0);
  });

  it('shows savings bar in savings tab', () => {
    mockUseSwarmSnapshot.mockReturnValue({
      ...EMPTY_SNAPSHOT,
      runs: [makeRun()],
      hasAnyData: true,
    });
    render(<SwarmControlPlane config={{}} />);
    fireEvent.click(screen.getByRole('tab', { name: /Savings/i }));
    expect(screen.getAllByText(/Actual vs Opus-equivalent cost/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/saved/i).length).toBeGreaterThan(0);
  });

  it('handles runs with zero subtask_count gracefully', () => {
    mockUseSwarmSnapshot.mockReturnValue({
      ...EMPTY_SNAPSHOT,
      runs: [makeRun({ subtask_count: 0, succeeded_count: 0, failed_count: 0, models_used: [] })],
      hasAnyData: true,
    });
    render(<SwarmControlPlane config={{}} />);
    fireEvent.click(screen.getByText('Decomposition'));
    expect(screen.getByText(/Decomposition tree pending/i)).toBeTruthy();
  });

  it('handles runs with zero cost/savings gracefully', () => {
    mockUseSwarmSnapshot.mockReturnValue({
      ...EMPTY_SNAPSHOT,
      runs: [makeRun({ total_cost_usd: 0, savings_usd: 0, cloud_equivalent_cost_usd: 0 })],
      hasAnyData: true,
    });
    render(<SwarmControlPlane config={{}} />);
    fireEvent.click(screen.getByRole('tab', { name: /Savings/i }));
    expect(screen.getAllByText(/Cost fields are zero/i).length).toBeGreaterThan(0);
  });

  it('selects a run when row is clicked', () => {
    const run1 = makeRun({ run_id: 'run-first-aaaa' });
    const run2 = makeRun({ run_id: 'run-second-bbbb' });
    mockUseSwarmSnapshot.mockReturnValue({
      ...EMPTY_SNAPSHOT,
      runs: [run1, run2],
      hasAnyData: true,
    });
    render(<SwarmControlPlane config={{}} />);
    // Click second run row — table shows first 12 chars: "run-second-b"
    fireEvent.click(screen.getByText(/run-second-b/i).closest('tr')!);
    fireEvent.click(screen.getByText('Decomposition'));
    expect(screen.getAllByText('run-second-bbbb').length).toBeGreaterThan(0);
  });
});
