import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EvalResult } from './instruction-eval.types';

/**
 * OMN-12998: the Instruction Eval view is now projection-backed. It reads the
 * contract-declared projection node_projection_instruction_eval exposes at
 * /projection/{topic} via useProjectionQuery — there is NO committed fixture and
 * NO recorded-data badge anymore.
 *
 * The hook is mocked so the empty / loading / populated / null-pass_rate branches
 * are driven deterministically; the wiring (empty state, em-dash for absent
 * pass_rate, honest live-vs-empty render) is the unit under test.
 */

const mockUseProjectionQuery = vi.fn();

vi.mock('@/hooks/useProjectionQuery', () => ({
  useProjectionQuery: () => mockUseProjectionQuery(),
}));

// ComponentWrapper consumes WidgetChrome context; provide the minimal default so
// the wrapper renders without a provider.
vi.mock('@/components/dashboard/WidgetChromeContext', () => ({
  useWidgetChrome: () => ({
    authorityLabel: undefined,
    onConfigure: undefined,
    onDuplicate: undefined,
    onDelete: undefined,
    draggable: false,
    isDragging: false,
    isDropTarget: false,
  }),
}));

import InstructionEvalHeatmap from './InstructionEvalHeatmap';

const POPULATED_ROWS: EvalResult[] = [
  { model: 'gemini', task: 'task-a', context_mode: 'baseline', pass_rate: 0.9, output_tokens: 1200, runs: 5 },
  { model: 'gemini', task: 'task-a', context_mode: 'chunk', pass_rate: 0.8, output_tokens: 1300, runs: 5 },
  { model: 'gemini', task: 'task-a', context_mode: 'full-claude-md', pass_rate: 0.6, output_tokens: 1500, runs: 5 },
];

afterEach(() => {
  mockUseProjectionQuery.mockReset();
});

describe('InstructionEvalHeatmap — projection-backed (OMN-12998)', () => {
  it('renders an honest empty state (no fake rows) when the projection has no rows', () => {
    mockUseProjectionQuery.mockReturnValue({ data: [], isLoading: false });
    render(<InstructionEvalHeatmap config={{}} />);
    expect(
      screen.getByText(/No instruction-eval data yet/i),
    ).toBeInTheDocument();
  });

  it('renders a loading state while the projection query is in flight', () => {
    mockUseProjectionQuery.mockReturnValue({ data: undefined, isLoading: true });
    render(<InstructionEvalHeatmap config={{}} />);
    expect(screen.getByText(/Loading projection data/i)).toBeInTheDocument();
  });

  it('does NOT render the OMN-12997 recorded-evaluation badge (fixture removed)', () => {
    mockUseProjectionQuery.mockReturnValue({ data: POPULATED_ROWS, isLoading: false });
    render(<InstructionEvalHeatmap config={{}} />);
    expect(screen.queryByText(/Recorded evaluation/i)).toBeNull();
  });

  it('renders projection rows as pass-rate cells when rows are present', () => {
    mockUseProjectionQuery.mockReturnValue({ data: POPULATED_ROWS, isLoading: false });
    render(<InstructionEvalHeatmap config={{}} />);
    expect(screen.getByText('90%')).toBeInTheDocument();
    expect(screen.getByText('80%')).toBeInTheDocument();
    expect(screen.getByText('60%')).toBeInTheDocument();
  });

  it('renders an em-dash (never a fake 0%) for a cell whose pass_rate is null', () => {
    const rowsWithNull: EvalResult[] = [
      { model: 'gemini', task: 'task-a', context_mode: 'baseline', pass_rate: null, output_tokens: 1000, runs: 3 },
    ];
    mockUseProjectionQuery.mockReturnValue({ data: rowsWithNull, isLoading: false });
    render(<InstructionEvalHeatmap config={{}} />);
    // The null pass_rate cell renders an em-dash; no "0%" appears anywhere.
    expect(screen.queryByText('0%')).toBeNull();
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(1);
  });
});
