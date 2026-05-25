import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockUseContextHeatmap = vi.fn();
const mockUseDataSourceMode = vi.fn();

vi.mock('./useContextHeatmap', () => ({
  useContextHeatmap: () => mockUseContextHeatmap(),
  KNOWN_SEGMENTS: [
    { id: 'golden_chain', label: 'Golden Chain', description: 'Exemplar chain with passing test evidence' },
    { id: 'claude_md', label: 'CLAUDE.md', description: 'Full CLAUDE.md contents injected into context' },
    { id: 'exemplar', label: 'Exemplar', description: 'Single passing example for exact-interface tasks' },
    { id: 'local_failures', label: 'Local Failures', description: 'Recent failure examples from this repo' },
  ],
}));

vi.mock('@/hooks/useDataSourceMode', () => ({
  useDataSourceMode: () => mockUseDataSourceMode(),
  isLiveDataSource: (mode: string) => mode === 'http' || mode === 'postgres',
}));

import ContextEffectivenessHeatmap from './ContextEffectivenessHeatmap';

const EMPTY_SNAPSHOT = {
  cells: [],
  segments: [],
  models: [],
  scores: [],
  isLoading: false,
  hasAnyData: false,
  isFixture: false,
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
  segments: [],
  models: ['qwen3-35b', 'qwen3-27b'],
  scores: Array.from({ length: 48 }, (_, i) => ({
    id: i,
    modelId: 'qwen3-35b',
    packId: 'golden_chain',
    factorsPresent: ['golden_chain'],
    qualityGatePassed: true,
    tokensUsed: 1200,
    taskType: 'code-generation',
    experimentRunId: 'run-1',
    notes: null,
    createdAt: '2026-05-10T10:00:00Z',
  })),
  isLoading: false,
  hasAnyData: true,
  isFixture: false,
  error: null,
};

describe('ContextEffectivenessHeatmap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseDataSourceMode.mockReturnValue('file');
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

  it('shows fixture badge when isFixture is true', () => {
    mockUseContextHeatmap.mockReturnValue({ ...POPULATED_SNAPSHOT, isFixture: true });
    render(<ContextEffectivenessHeatmap config={{}} />);
    expect(screen.getByText(/OMN-11241 research fixture/i)).toBeTruthy();
  });

  it('does not show fixture badge when isFixture is false', () => {
    mockUseContextHeatmap.mockReturnValue({ ...POPULATED_SNAPSHOT, isFixture: false });
    render(<ContextEffectivenessHeatmap config={{}} />);
    expect(screen.queryByText(/OMN-11241 research fixture/i)).toBeNull();
  });

  it('shows experiment score count footer', () => {
    mockUseContextHeatmap.mockReturnValue(POPULATED_SNAPSHOT);
    render(<ContextEffectivenessHeatmap config={{}} />);
    expect(screen.getByText(/experiment score/i)).toBeTruthy();
    expect(screen.getByText(/2 model/i)).toBeTruthy();
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
