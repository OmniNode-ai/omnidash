import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DelegationCorrelationTracePanel } from './DelegationCorrelationTracePanel';
import * as delegationApi from '@/services/delegation-api';
import type { DelegationRunContextValue } from './DelegationRunContext';
import { ExecutionGraphTransportProvider, type ExecutionGraphTransport } from './execution-graph-spike/ExecutionGraphTransport';
import type { ModelExecutionGraph } from './execution-graph-spike/render-model';
import realFiveHopGraphJson from './execution-graph-spike/__fixtures__/realFiveHopGraph.json';

const realFiveHopGraph = realFiveHopGraphJson as unknown as ModelExecutionGraph;

const mockContextValue: DelegationRunContextValue = {
  snapshot: {
    summary: null,
    savings: null,
    modelRouting: null,
    qualityGate: null,
    tokenUsage: null,
    decisions: [],
    runs: [],
    probes: [],
    hasAnyData: false,
    isLoading: false,
    primaryError: null,
  },
  selectedRunId: null,
  selectedRun: null,
  filter: { taskType: null, status: null },
  filteredRuns: [],
  selectRun: vi.fn(),
  setFilter: vi.fn(),
  clearFilter: vi.fn(),
  isFixture: false,
  pendingCorrelationId: null,
  setPendingCorrelationId: vi.fn(),
};

vi.mock('./DelegationRunContext', () => ({
  useDelegationRunContext: vi.fn(),
}));

import { useDelegationRunContext } from './DelegationRunContext';

const mockUseDelegationRunContext = vi.mocked(useDelegationRunContext);

describe('DelegationCorrelationTracePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows empty state when no run is selected', () => {
    mockUseDelegationRunContext.mockReturnValue(mockContextValue);

    render(<DelegationCorrelationTracePanel />);

    expect(screen.getByText(/No run selected/i)).toBeTruthy();
  });

  it('opens a manually entered historical UUID through the existing graph transport without creating a run', async () => {
    const correlationId = realFiveHopGraph.replay.correlation_id;
    const transport: ExecutionGraphTransport = {
      readLatest: vi.fn().mockResolvedValue(realFiveHopGraph),
      step: vi.fn().mockResolvedValue(null),
    };
    mockUseDelegationRunContext.mockReturnValue(mockContextValue);
    render(
      <ExecutionGraphTransportProvider transport={transport}>
        <DelegationCorrelationTracePanel />
      </ExecutionGraphTransportProvider>,
    );
    fireEvent.change(screen.getByLabelText('Historical correlation ID'), { target: { value: correlationId } });
    fireEvent.click(screen.getByRole('button', { name: 'Open historical graph' }));
    expect(await screen.findByText('5 recorded nodes, 4 recorded edges')).toBeTruthy();
    expect(transport.readLatest).toHaveBeenCalledWith(correlationId);
    expect(mockContextValue.selectRun).not.toHaveBeenCalled();
    expect(mockContextValue.setPendingCorrelationId).not.toHaveBeenCalled();
  });

  it('does not invoke graph transport or mutate run context for an invalid historical identifier', () => {
    const transport: ExecutionGraphTransport = { readLatest: vi.fn(), step: vi.fn() };
    mockUseDelegationRunContext.mockReturnValue(mockContextValue);
    render(
      <ExecutionGraphTransportProvider transport={transport}>
        <DelegationCorrelationTracePanel />
      </ExecutionGraphTransportProvider>,
    );
    fireEvent.change(screen.getByLabelText('Historical correlation ID'), { target: { value: 'not-a-uuid' } });
    fireEvent.click(screen.getByRole('button', { name: 'Open historical graph' }));
    expect(screen.getByText('Enter a canonical correlation UUID.')).toBeTruthy();
    expect(transport.readLatest).not.toHaveBeenCalled();
    expect(mockContextValue.selectRun).not.toHaveBeenCalled();
    expect(mockContextValue.setPendingCorrelationId).not.toHaveBeenCalled();
  });

  it('opens graph mode in-place and fails closed until a trusted graph transport is injected', async () => {
    mockUseDelegationRunContext.mockReturnValue({
      ...mockContextValue,
      selectedRun: {
        id: 'test-correlation-id',
        correlationId: 'test-correlation-id',
        taskType: 'code_review',
        modelName: 'qwen3',
        status: 'passed',
        source: 'decision_projection',
        latencyMs: 1200,
        createdAt: '2026-05-25T10:00:00Z',
      },
    });
    vi.spyOn(delegationApi, 'fetchCorrelationTrace').mockResolvedValue({
      correlation_id: 'test-correlation-id',
      rows: [],
    });

    render(<DelegationCorrelationTracePanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Execution graph' }));

    expect(await screen.findByText('Graph read is not connected.')).toBeTruthy();
    expect(screen.getByText(/does not accept tenant overrides/i)).toBeTruthy();
  });

  it('overrides an auto-selected run with a historical graph and returns without mutating selection', async () => {
    const transport: ExecutionGraphTransport = {
      readLatest: vi.fn().mockResolvedValue(realFiveHopGraph),
      step: vi.fn().mockResolvedValue(null),
    };
    mockUseDelegationRunContext.mockReturnValue({
      ...mockContextValue,
      selectedRun: {
        id: 'unrelated-selected-run', correlationId: 'unrelated-selected-run', taskType: 'code_review',
        modelName: 'qwen3', status: 'passed', source: 'decision_projection',
      },
    });
    vi.spyOn(delegationApi, 'fetchCorrelationTrace').mockResolvedValue({
      correlation_id: 'unrelated-selected-run', rows: [],
    });
    render(
      <ExecutionGraphTransportProvider transport={transport}>
        <DelegationCorrelationTracePanel />
      </ExecutionGraphTransportProvider>,
    );

    fireEvent.change(screen.getByLabelText('Historical correlation ID'), { target: { value: realFiveHopGraph.replay.correlation_id } });
    fireEvent.click(screen.getByRole('button', { name: 'Open historical graph' }));
    expect(await screen.findByText('5 recorded nodes, 4 recorded edges')).toBeTruthy();
    expect(screen.getByText(/Recorded causal graph.*authorized workflow read.*Ownership checked at request time/i)).toBeTruthy();
    expect(screen.queryByText(/Ordered by created_at ascending/i)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Events' })).toBeNull();
    expect(mockContextValue.selectRun).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Return to selected run' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Events' })).toBeTruthy());
    expect(screen.getByText('unrelated-selected-run')).toBeTruthy();
    expect(mockContextValue.selectRun).not.toHaveBeenCalled();
  });

  it('switches between Events and the injected five-hop graph without live transport', async () => {
    mockUseDelegationRunContext.mockReturnValue({
      ...mockContextValue,
      isFixture: true,
      selectedRun: {
        id: realFiveHopGraph.replay.correlation_id,
        correlationId: realFiveHopGraph.replay.correlation_id,
        taskType: 'code_review',
        modelName: 'qwen3',
        status: 'passed',
        source: 'decision_projection',
      },
    });
    vi.spyOn(delegationApi, 'fetchCorrelationTrace').mockResolvedValue({
      correlation_id: realFiveHopGraph.replay.correlation_id,
      rows: [],
    });
    const transport: ExecutionGraphTransport = {
      readLatest: vi.fn().mockResolvedValue(realFiveHopGraph),
      step: vi.fn().mockResolvedValue(null),
    };

    render(
      <ExecutionGraphTransportProvider transport={transport}>
        <DelegationCorrelationTracePanel />
      </ExecutionGraphTransportProvider>,
    );

    expect(screen.queryByText('projection-backed')).toBeNull();
    expect(screen.getByText(/Fixture event chain.*No live projection is connected/i)).toBeTruthy();
    expect(screen.queryByText(/Source: delegation_events table/i)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Execution graph' }));
    expect(await screen.findByText('5 recorded nodes, 4 recorded edges')).toBeTruthy();
    expect(screen.getByText('Fixture graph — no live projection.')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /Replay passed/ })).toHaveLength(5);
    fireEvent.click(screen.getByRole('button', { name: /delegation-request\.v1\. Replay passed/ }));
    expect(screen.getByText('Selected evidence')).toBeTruthy();
    expect(screen.getByText('partition 0, offset 2174')).toBeTruthy();
    expect(screen.getByText('onex.cmd.omnibase-infra.delegation-request.v1')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Events' }));
    expect(await screen.findByText(/No events found/i)).toBeTruthy();
    expect(screen.queryByText('projection-backed')).toBeNull();
    expect(screen.queryByText(/Source: delegation_events table/i)).toBeNull();
    expect(transport.readLatest).toHaveBeenCalledWith(realFiveHopGraph.replay.correlation_id);
  });

  it('fetches and renders trace rows when a run is selected', async () => {
    const runWithCorrelation = {
      ...mockContextValue,
      selectedRun: {
        id: 'test-correlation-id',
        correlationId: 'test-correlation-id',
        taskType: 'code_review',
        modelName: 'qwen3',
        status: 'passed' as const,
        source: 'decision_projection' as const,
        latencyMs: 1200,
        createdAt: '2026-05-25T10:00:00Z',
      },
      selectedRunId: 'test-correlation-id',
    };
    mockUseDelegationRunContext.mockReturnValue(runWithCorrelation);

    vi.spyOn(delegationApi, 'fetchCorrelationTrace').mockResolvedValue({
      correlation_id: 'test-correlation-id',
      rows: [
        {
          id: 1,
          correlation_id: 'test-correlation-id',
          session_id: 'sess-abc',
          timestamp: '2026-05-25T10:00:00Z',
          task_type: 'code_review',
          delegated_to: 'qwen3',
          delegated_by: null,
          quality_gate_passed: true,
          quality_gate_detail: 'all checks passed',
          quality_gates_checked: 3,
          quality_gates_failed: 0,
          cost_usd: 0.002,
          cost_savings_usd: 0.018,
          delegation_latency_ms: 1200,
          model_name: 'qwen3',
          tokens_input: 500,
          tokens_output: 300,
          routing_rule: 'local_first',
          routing_confidence: 0.95,
          prompt_text: 'Review this function for correctness.',
          response_text: 'The function looks correct.',
          created_at: '2026-05-25T10:00:00Z',
        },
      ],
    });

    render(<DelegationCorrelationTracePanel />);

    await waitFor(() => {
      expect(screen.getByText(/1 event/i)).toBeTruthy();
    });

    expect(screen.getByText(/code_review/i)).toBeTruthy();
    expect(screen.getAllByText(/passed/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/local_first/i)).toBeTruthy();
  });

  it('shows no-events message when trace returns empty rows', async () => {
    const runWithCorrelation = {
      ...mockContextValue,
      selectedRun: {
        id: 'missing-id',
        correlationId: 'missing-id',
        taskType: 'code_review',
        modelName: 'qwen3',
        status: 'projected' as const,
        source: 'routing_trace' as const,
      },
      selectedRunId: 'missing-id',
    };
    mockUseDelegationRunContext.mockReturnValue(runWithCorrelation);

    vi.spyOn(delegationApi, 'fetchCorrelationTrace').mockResolvedValue({
      correlation_id: 'missing-id',
      rows: [],
    });

    render(<DelegationCorrelationTracePanel />);

    await waitFor(() => {
      expect(screen.getByText(/No events found/i)).toBeTruthy();
    });
  });

  it('shows error message on fetch failure', async () => {
    const runWithCorrelation = {
      ...mockContextValue,
      selectedRun: {
        id: 'err-id',
        correlationId: 'err-id',
        taskType: 'code_review',
        modelName: 'qwen3',
        status: 'projected' as const,
        source: 'routing_trace' as const,
      },
      selectedRunId: 'err-id',
    };
    mockUseDelegationRunContext.mockReturnValue(runWithCorrelation);

    vi.spyOn(delegationApi, 'fetchCorrelationTrace').mockRejectedValue(
      new Error('postgres data source not configured'),
    );

    render(<DelegationCorrelationTracePanel />);

    await waitFor(() => {
      expect(screen.getByText(/Error:.*postgres data source not configured/i)).toBeTruthy();
    });
  });
});
