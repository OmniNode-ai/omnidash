import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DelegationRunTable } from './DelegationRunTable';
import type { DelegationRun } from './delegation-control-plane.types';

const mockSetActivePage = vi.fn();
const mockSetTraceFilter = vi.fn();

vi.mock('@/store/store', () => ({
  useFrameStore: (selector: (s: { setActivePage: typeof mockSetActivePage; setTraceFilter: typeof mockSetTraceFilter }) => unknown) =>
    selector({ setActivePage: mockSetActivePage, setTraceFilter: mockSetTraceFilter }),
}));

const runs: DelegationRun[] = [
  {
    id: 'run-a',
    correlationId: 'corr-aaaa-bbbb-1234',
    taskType: 'code_review',
    modelName: 'qwen3',
    status: 'passed',
    source: 'decision_projection',
    tokenCount: 1200,
    savingsUsd: 0.018,
    createdAt: '2026-05-25T10:00:00Z',
  },
  {
    id: 'run-b',
    correlationId: 'corr-bbbb-cccc-5678',
    taskType: 'summarization',
    modelName: 'glm-4-plus',
    status: 'projected',
    source: 'routing_trace',
  },
];

describe('DelegationRunTable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders run rows with correlation short ids', () => {
    render(
      <DelegationRunTable
        runs={runs}
        selectedRunId={null}
        maxRuns={10}
        onSelectRun={vi.fn()}
      />,
    );
    expect(screen.getByTitle('corr-aaaa-bbbb-1234')).toBeTruthy();
  });

  it('calls onSelectRun when a row body is clicked', () => {
    const onSelectRun = vi.fn();
    render(
      <DelegationRunTable
        runs={runs}
        selectedRunId={null}
        maxRuns={10}
        onSelectRun={onSelectRun}
      />,
    );
    fireEvent.click(screen.getByText('code_review'));
    expect(onSelectRun).toHaveBeenCalledWith('run-a');
  });

  it('renders a trace icon button per row', () => {
    render(
      <DelegationRunTable
        runs={runs}
        selectedRunId={null}
        maxRuns={10}
        onSelectRun={vi.fn()}
      />,
    );
    const traceButtons = screen.getAllByRole('button', { name: /open trace for/i });
    expect(traceButtons).toHaveLength(2);
  });

  it('clicking trace icon sets traceFilter and navigates to the dashboard', () => {
    render(
      <DelegationRunTable
        runs={runs}
        selectedRunId={null}
        maxRuns={10}
        onSelectRun={vi.fn()}
      />,
    );
    const [firstTraceBtn] = screen.getAllByRole('button', { name: /open trace for/i });
    fireEvent.click(firstTraceBtn);

    expect(mockSetTraceFilter).toHaveBeenCalledWith('corr-aaaa-bbbb-1234');
    expect(mockSetActivePage).toHaveBeenCalledWith('dashboard');
  });

  it('clicking trace icon does not also trigger onSelectRun', () => {
    const onSelectRun = vi.fn();
    render(
      <DelegationRunTable
        runs={runs}
        selectedRunId={null}
        maxRuns={10}
        onSelectRun={onSelectRun}
      />,
    );
    const [firstTraceBtn] = screen.getAllByRole('button', { name: /open trace for/i });
    fireEvent.click(firstTraceBtn);

    expect(onSelectRun).not.toHaveBeenCalled();
  });

  it('respects maxRuns limit', () => {
    render(
      <DelegationRunTable
        runs={runs}
        selectedRunId={null}
        maxRuns={1}
        onSelectRun={vi.fn()}
      />,
    );
    const traceButtons = screen.getAllByRole('button', { name: /open trace for/i });
    expect(traceButtons).toHaveLength(1);
    expect(screen.getByText(/showing latest 1/i)).toBeTruthy();
  });

  it('shows empty state when runs is empty', () => {
    render(
      <DelegationRunTable
        runs={[]}
        selectedRunId={null}
        maxRuns={10}
        onSelectRun={vi.fn()}
      />,
    );
    expect(screen.getByText(/no run rows found/i)).toBeTruthy();
  });
});
