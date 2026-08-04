import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockUseContextHeatmap = vi.fn();

vi.mock('./useContextHeatmap', () => ({
  useContextHeatmap: () => mockUseContextHeatmap(),
}));

import ContextEffectivenessHeatmap from './ContextEffectivenessHeatmap';

const EMPTY_SNAPSHOT = {
  cells: [],
  segments: [],
  models: [],
  scores: [],
  isLoading: false,
  hasAnyData: false,
  isDegraded: false,
  degradedReason: null,
  error: null,
};

const makeCell = (
  segmentId: string,
  modelId: string,
  passCount: number,
  totalCount: number,
  opts: { tokenDelta?: number } = {},
) => ({
  segmentId,
  modelId,
  passCount,
  totalCount,
  totalTokens: totalCount * 1200,
  passRate: totalCount > 0 ? passCount / totalCount : 0,
  tokenDelta: opts.tokenDelta ?? null,
});

const POPULATED_SNAPSHOT = {
  cells: [
    makeCell('golden_chain', 'qwen3-35b', 8, 8, { tokenDelta: 200 }),
    makeCell('golden_chain', 'qwen3-27b', 8, 8, { tokenDelta: 180 }),
    makeCell('claude_md', 'qwen3-35b', 0, 8, { tokenDelta: -1500 }),
    makeCell('claude_md', 'qwen3-27b', 0, 8, { tokenDelta: -1200 }),
    makeCell('exemplar', 'qwen3-35b', 8, 8, { tokenDelta: 300 }),
    makeCell('local_failures', 'qwen3-35b', 4, 8),
    makeCell('local_failures', 'qwen3-27b', 4, 8),
  ],
  segments: [
    { id: 'golden_chain', label: 'Golden Chain', description: 'Exemplar chain with passing test evidence' },
    { id: 'claude_md', label: 'CLAUDE.md', description: 'Full CLAUDE.md contents injected into context' },
    { id: 'exemplar', label: 'Exemplar', description: 'Single passing example for exact-interface tasks' },
    { id: 'local_failures', label: 'Local Failures', description: 'Recent failure examples from this repo' },
  ],
  models: ['qwen3-35b', 'qwen3-27b'],
  scores: Array.from({ length: 48 }, (_, i) => ({
    id: String(i),
    run_id: 'run-1',
    correlation_id: `corr-${i}`,
    task_id: `task-${i}`,
    run_order: i,
    context_factor_subset: 'golden_chain',
    context_pack_hash: 'hash-1',
    attempt_count: 1,
    first_pass_success: true,
    final_success: true,
    failure_stage: '',
    prompt_tokens: 900,
    completion_tokens: 300,
    tokens_used: 1200,
    estimated_cost: 0.01,
    model_id: 'qwen3-35b',
    provider: 'local',
    endpoint_ref: 'local-endpoint',
    proof_class: 'live-readback',
    created_at: '2026-05-10T10:00:00Z',
    updated_at: '2026-05-10T10:00:00Z',
  })),
  isLoading: false,
  hasAnyData: true,
  isDegraded: false,
  degradedReason: null,
  error: null,
};

// A live-shaped snapshot using the ACTUAL live vocabulary observed on
// stability-test (`golden_exemplar`, `off`) rather than the retired
// OMN-11241 research vocabulary — regression guard for OMN-14895 D1
// (hardcoded KNOWN_SEGMENTS had zero intersection with this vocabulary).
const LIVE_VOCAB_SNAPSHOT = {
  cells: [
    makeCell('golden_exemplar', 'qwen3-35b', 6, 8),
    makeCell('off', 'qwen3-35b', 3, 8),
  ],
  segments: [
    { id: 'golden_exemplar', label: 'Golden Exemplar', description: 'Golden-chain exemplar context injected into the run' },
    { id: 'off', label: 'Off', description: 'No supplemental context injected' },
  ],
  models: ['qwen3-35b'],
  scores: Array.from({ length: 16 }, (_, i) => ({ id: String(i), context_factor_subset: i < 8 ? 'golden_exemplar' : 'off', model_id: 'qwen3-35b' })),
  isLoading: false,
  hasAnyData: true,
  isDegraded: false,
  degradedReason: null,
  error: null,
};

describe('ContextEffectivenessHeatmap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows empty state when no data', () => {
    mockUseContextHeatmap.mockReturnValue(EMPTY_SNAPSHOT);
    render(<ContextEffectivenessHeatmap config={{}} />);
    expect(screen.getByText(/No experiment scores/i)).toBeTruthy();
  });

  it('renders matrix with segment labels and model columns', () => {
    mockUseContextHeatmap.mockReturnValue(POPULATED_SNAPSHOT);
    render(<ContextEffectivenessHeatmap config={{}} />);
    expect(screen.getByText('Golden Chain')).toBeTruthy();
    expect(screen.getByText('CLAUDE.md')).toBeTruthy();
    expect(screen.getAllByText('qwen3-35b').length).toBeGreaterThan(0);
    expect(screen.getAllByText('qwen3-27b').length).toBeGreaterThan(0);
  });

  it('renders a matrix row per live segment, including unrecognized/live-only ids (OMN-14895 D1)', () => {
    mockUseContextHeatmap.mockReturnValue(LIVE_VOCAB_SNAPSHOT);
    render(<ContextEffectivenessHeatmap config={{}} />);
    expect(screen.getByText('Golden Exemplar')).toBeTruthy();
    expect(screen.getByText('Off')).toBeTruthy();
    // The empty state must NOT show — real rows with real (if unrecognized)
    // segment ids must render a populated matrix, not a blank grid gated on
    // a fixed allow-list.
    expect(screen.queryByText(/No experiment scores/i)).toBeNull();
    expect(screen.getByText(/16 experiment scores? across 1 model and 2 segments/i)).toBeTruthy();
  });

  it('renders percentage values in cells', () => {
    mockUseContextHeatmap.mockReturnValue(POPULATED_SNAPSHOT);
    render(<ContextEffectivenessHeatmap config={{}} />);
    // golden_chain 8/8 = 100%
    expect(screen.getAllByText('100%').length).toBeGreaterThan(0);
    // claude_md 0/8 = 0%
    expect(screen.getAllByText('0%').length).toBeGreaterThan(0);
    // local_failures 4/8 = 50%
    expect(screen.getAllByText('50%').length).toBeGreaterThan(0);
  });

  it('shows the legend', () => {
    mockUseContextHeatmap.mockReturnValue(POPULATED_SNAPSHOT);
    render(<ContextEffectivenessHeatmap config={{}} />);
    expect(screen.getByText('Helpful')).toBeTruthy();
    expect(screen.getByText('Harmful')).toBeTruthy();
    expect(screen.getAllByText(/Neutral/i).length).toBeGreaterThan(0);
  });

  it('shows click-prompt when no cell selected', () => {
    mockUseContextHeatmap.mockReturnValue(POPULATED_SNAPSHOT);
    render(<ContextEffectivenessHeatmap config={{}} />);
    expect(screen.getByText(/Click a cell to see specific examples/i)).toBeTruthy();
  });

  it('shows examples panel when a cell is clicked', () => {
    mockUseContextHeatmap.mockReturnValue(POPULATED_SNAPSHOT);
    render(<ContextEffectivenessHeatmap config={{}} />);
    // Click the golden_chain × qwen3-35b cell (100% pass rate)
    const buttons = screen.getAllByRole('button');
    fireEvent.click(buttons[0]);
    // Examples panel should show the cell details
    expect(screen.getAllByText(/Pass rate/i).length).toBeGreaterThan(0);
  });

  it('never renders fabricated data when the live query returns zero rows (OMN-14895)', () => {
    mockUseContextHeatmap.mockReturnValue(EMPTY_SNAPSHOT);
    render(<ContextEffectivenessHeatmap config={{}} />);
    // The widget must show the honest empty state, not a substituted fixture
    // matrix — no segment/model labels or pass-rate cells should render.
    expect(screen.queryByText('Golden Chain')).toBeNull();
    expect(screen.queryByText(/research fixture/i)).toBeNull();
  });

  it('shows the empty state when scores exist but resolve to zero renderable segments (OMN-14895 D2)', () => {
    // Defends the D2 gate: isEmpty keys on `segments.length`, not raw score
    // count, so a hook regression that produces rows with no mapped segment
    // cannot silently bypass the empty state again.
    mockUseContextHeatmap.mockReturnValue({
      ...EMPTY_SNAPSHOT,
      scores: [{ id: '1' }],
      hasAnyData: true,
      segments: [],
    });
    render(<ContextEffectivenessHeatmap config={{}} />);
    expect(screen.getByText(/No experiment scores/i)).toBeTruthy();
  });

  it('surfaces the backend degradedReason in the empty-state hint when degraded', () => {
    mockUseContextHeatmap.mockReturnValue({
      ...EMPTY_SNAPSHOT,
      isDegraded: true,
      degradedReason: "table 'context_roi_scores' not found at startup",
    });
    render(<ContextEffectivenessHeatmap config={{}} />);
    expect(screen.getByText(/table 'context_roi_scores' not found at startup/i)).toBeTruthy();
  });

  it('shows experiment score count footer', () => {
    mockUseContextHeatmap.mockReturnValue(POPULATED_SNAPSHOT);
    render(<ContextEffectivenessHeatmap config={{}} />);
    expect(screen.getByText(/experiment score/i)).toBeTruthy();
    expect(screen.getByText(/2 model/i)).toBeTruthy();
  });

  it('always shows Live, never a File Mode badge (OMN-14895 D3 — this widget has no fixture path)', () => {
    mockUseContextHeatmap.mockReturnValue(POPULATED_SNAPSHOT);
    render(<ContextEffectivenessHeatmap config={{}} />);
    expect(screen.getByText('Live')).toBeTruthy();
    expect(screen.queryByText('File Mode')).toBeNull();
  });

  it('toggles cell selection off when same cell clicked again', () => {
    mockUseContextHeatmap.mockReturnValue(POPULATED_SNAPSHOT);
    render(<ContextEffectivenessHeatmap config={{}} />);
    const buttons = screen.getAllByRole('button');
    fireEvent.click(buttons[0]);
    expect(screen.queryByText(/Click a cell to see specific examples/i)).toBeNull();
    fireEvent.click(buttons[0]);
    expect(screen.getByText(/Click a cell to see specific examples/i)).toBeTruthy();
  });
});
