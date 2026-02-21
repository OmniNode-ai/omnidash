/**
 * Tests for DecisionTimeline component (OMN-2469)
 *
 * Covers:
 *   - R1: Timeline renders all DecisionRecords for a session (sorted chronologically)
 *   - R2: Expanded view shows Layer 1 provenance (default visible on expand)
 *   - R3: Layer 2 (agent rationale) requires explicit action
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { DecisionTimeline } from '../DecisionTimeline';
import type { DecisionTimelineRow } from '@shared/decision-record-types';

// ============================================================================
// Fixtures
// ============================================================================

const MOCK_RECORD_1 = {
  decision_id: 'dr-001',
  session_id: 'sess-001',
  decided_at: '2026-02-21T10:42:01.000Z',
  decision_type: 'model_select' as const,
  selected_candidate: 'claude-opus-4-6',
  candidates_considered: [
    {
      id: 'claude-opus-4-6',
      eliminated: false,
      selected: true,
      scoring_breakdown: { latency: 0.91, context: 1.0, tools: 1.0 },
      total_score: 0.94,
    },
    {
      id: 'claude-haiku-4-5',
      eliminated: true,
      elimination_reason: 'context_length < 100k',
      selected: false,
      scoring_breakdown: {},
      total_score: null,
    },
  ],
  constraints_applied: [
    {
      description: 'context_length >= 100k',
      eliminates: ['claude-haiku-4-5'],
      satisfied_by_selected: true,
    },
  ],
  tie_breaker: null,
  agent_rationale:
    'I chose claude-opus-4-6 because it balances capability and cost effectively.',
};

const MOCK_RECORD_2 = {
  decision_id: 'dr-002',
  session_id: 'sess-001',
  decided_at: '2026-02-21T10:42:03.000Z', // later than dr-001
  decision_type: 'route_select' as const,
  selected_candidate: 'agent-api-architect',
  candidates_considered: [
    {
      id: 'agent-api-architect',
      eliminated: false,
      selected: true,
      scoring_breakdown: { relevance: 0.95 },
      total_score: 0.95,
    },
  ],
  constraints_applied: [],
  tie_breaker: null,
  agent_rationale: null, // No narrative for this one
};

const MOCK_ROWS: DecisionTimelineRow[] = [
  {
    decision_id: 'dr-001',
    decided_at: MOCK_RECORD_1.decided_at,
    decision_type: 'model_select',
    selected_candidate: 'claude-opus-4-6',
    candidates_count: 2,
    full_record: MOCK_RECORD_1,
  },
  {
    decision_id: 'dr-002',
    decided_at: MOCK_RECORD_2.decided_at,
    decision_type: 'route_select',
    selected_candidate: 'agent-api-architect',
    candidates_count: 1,
    full_record: MOCK_RECORD_2,
  },
];

// ============================================================================
// R1: Timeline renders all DecisionRecords, sorted chronologically
// ============================================================================

describe('DecisionTimeline — R1: timeline rows and sorting', () => {
  it('renders the panel with correct header', () => {
    render(<DecisionTimeline rows={MOCK_ROWS} />);
    expect(screen.getByTestId('decision-timeline-panel')).toBeInTheDocument();
    expect(screen.getByText(/Decision Timeline/)).toBeInTheDocument();
  });

  it('renders all rows', () => {
    render(<DecisionTimeline rows={MOCK_ROWS} />);
    expect(screen.getByTestId('timeline-row-dr-001')).toBeInTheDocument();
    expect(screen.getByTestId('timeline-row-dr-002')).toBeInTheDocument();
  });

  it('shows correct decision types', () => {
    render(<DecisionTimeline rows={MOCK_ROWS} />);
    expect(screen.getByTestId('timeline-type-dr-001')).toHaveTextContent('model_select');
    expect(screen.getByTestId('timeline-type-dr-002')).toHaveTextContent('route_select');
  });

  it('shows correct selected candidates', () => {
    render(<DecisionTimeline rows={MOCK_ROWS} />);
    expect(screen.getByTestId('timeline-selected-dr-001')).toHaveTextContent('claude-opus-4-6');
    expect(screen.getByTestId('timeline-selected-dr-002')).toHaveTextContent(
      'agent-api-architect'
    );
  });

  it('shows candidate count for each row', () => {
    render(<DecisionTimeline rows={MOCK_ROWS} />);
    expect(screen.getByTestId('timeline-candidates-count-dr-001')).toHaveTextContent('2 candidates');
    expect(screen.getByTestId('timeline-candidates-count-dr-002')).toHaveTextContent('1 candidate');
  });

  it('renders rows in chronological order (oldest first)', () => {
    // Pass rows in reverse order — should still be sorted oldest-first
    const reversed = [...MOCK_ROWS].reverse();
    render(<DecisionTimeline rows={reversed} />);
    const rows = screen.getByTestId('decision-timeline-rows');
    const rowElements = rows.querySelectorAll('[data-testid^="timeline-row-dr-"]');
    // First row should be dr-001 (10:42:01), second should be dr-002 (10:42:03)
    expect(rowElements[0]).toHaveAttribute('data-testid', 'timeline-row-dr-001');
    expect(rowElements[1]).toHaveAttribute('data-testid', 'timeline-row-dr-002');
  });

  it('shows count badge in header', () => {
    render(<DecisionTimeline rows={MOCK_ROWS} />);
    expect(screen.getByText('2 decisions')).toBeInTheDocument();
  });

  it('shows empty state when no rows', () => {
    render(<DecisionTimeline rows={[]} />);
    expect(screen.getByTestId('decision-timeline-empty')).toBeInTheDocument();
    expect(screen.getByTestId('decision-timeline-empty')).toHaveTextContent(
      'No decisions recorded'
    );
  });
});

// ============================================================================
// R2: Expanded view shows Layer 1 provenance by default
// ============================================================================

describe('DecisionTimeline — R2: Layer 1 visible immediately on expand', () => {
  it('Layer 1 detail is not visible before expanding', () => {
    render(<DecisionTimeline rows={MOCK_ROWS} />);
    expect(screen.queryByTestId('layer1-detail')).not.toBeInTheDocument();
  });

  it('expands row to show Layer 1 detail on click', async () => {
    const user = userEvent.setup();
    render(<DecisionTimeline rows={MOCK_ROWS} />);

    const toggle = screen.getByTestId('timeline-row-toggle-dr-001');
    await user.click(toggle);

    expect(screen.getByTestId('layer1-detail')).toBeInTheDocument();
  });

  it('shows constraints in Layer 1 detail', async () => {
    const user = userEvent.setup();
    render(<DecisionTimeline rows={MOCK_ROWS} />);

    await user.click(screen.getByTestId('timeline-row-toggle-dr-001'));

    const layer1 = screen.getByTestId('layer1-detail');
    expect(layer1).toHaveTextContent('context_length >= 100k');
  });

  it('shows scoring breakdown in Layer 1 detail', async () => {
    const user = userEvent.setup();
    render(<DecisionTimeline rows={MOCK_ROWS} />);

    await user.click(screen.getByTestId('timeline-row-toggle-dr-001'));

    const layer1 = screen.getByTestId('layer1-detail');
    expect(layer1).toHaveTextContent('latency');
    expect(layer1).toHaveTextContent('0.91');
    expect(layer1).toHaveTextContent('context');
  });

  it('shows tie-breaker as "None (clear winner)" when null', async () => {
    const user = userEvent.setup();
    render(<DecisionTimeline rows={MOCK_ROWS} />);

    await user.click(screen.getByTestId('timeline-row-toggle-dr-001'));

    const layer1 = screen.getByTestId('layer1-detail');
    expect(layer1).toHaveTextContent('None (clear winner)');
  });

  it('collapses row when clicked again', async () => {
    const user = userEvent.setup();
    render(<DecisionTimeline rows={MOCK_ROWS} />);

    const toggle = screen.getByTestId('timeline-row-toggle-dr-001');
    await user.click(toggle);
    expect(screen.getByTestId('layer1-detail')).toBeInTheDocument();

    await user.click(toggle);
    expect(screen.queryByTestId('layer1-detail')).not.toBeInTheDocument();
  });
});

// ============================================================================
// R3: Layer 2 requires explicit action, visually distinct
// ============================================================================

describe('DecisionTimeline — R3: Layer 2 requires explicit click', () => {
  it('Layer 2 is not visible before "Show agent narrative" is clicked', async () => {
    const user = userEvent.setup();
    render(<DecisionTimeline rows={MOCK_ROWS} />);

    // Expand row first
    await user.click(screen.getByTestId('timeline-row-toggle-dr-001'));

    // Layer 2 should NOT be visible yet
    expect(screen.queryByTestId('layer2-detail')).not.toBeInTheDocument();
  });

  it('reveals Layer 2 when "Show agent narrative" button is clicked', async () => {
    const user = userEvent.setup();
    render(<DecisionTimeline rows={MOCK_ROWS} />);

    await user.click(screen.getByTestId('timeline-row-toggle-dr-001'));
    await user.click(screen.getByTestId('show-narrative-btn-dr-001'));

    expect(screen.getByTestId('layer2-detail')).toBeInTheDocument();
  });

  it('Layer 2 shows the agent rationale text', async () => {
    const user = userEvent.setup();
    render(<DecisionTimeline rows={MOCK_ROWS} />);

    await user.click(screen.getByTestId('timeline-row-toggle-dr-001'));
    await user.click(screen.getByTestId('show-narrative-btn-dr-001'));

    const layer2 = screen.getByTestId('layer2-detail');
    expect(layer2).toHaveTextContent('balances capability and cost effectively');
  });

  it('Layer 2 contains "assistive, not authoritative" label', async () => {
    const user = userEvent.setup();
    render(<DecisionTimeline rows={MOCK_ROWS} />);

    await user.click(screen.getByTestId('timeline-row-toggle-dr-001'));
    await user.click(screen.getByTestId('show-narrative-btn-dr-001'));

    const layer2 = screen.getByTestId('layer2-detail');
    expect(layer2).toHaveTextContent('assistive, not authoritative');
  });

  it('hides Layer 2 when toggle is clicked again', async () => {
    const user = userEvent.setup();
    render(<DecisionTimeline rows={MOCK_ROWS} />);

    await user.click(screen.getByTestId('timeline-row-toggle-dr-001'));
    await user.click(screen.getByTestId('show-narrative-btn-dr-001'));
    expect(screen.getByTestId('layer2-detail')).toBeInTheDocument();

    await user.click(screen.getByTestId('show-narrative-btn-dr-001'));
    expect(screen.queryByTestId('layer2-detail')).not.toBeInTheDocument();
  });

  it('shows "no narrative" message when agent_rationale is null', async () => {
    const user = userEvent.setup();
    render(<DecisionTimeline rows={MOCK_ROWS} />);

    // dr-002 has no agent_rationale
    await user.click(screen.getByTestId('timeline-row-toggle-dr-002'));
    await user.click(screen.getByTestId('show-narrative-btn-dr-002'));

    const layer2 = screen.getByTestId('layer2-detail');
    expect(layer2).toHaveTextContent('No agent narrative recorded');
  });

  it('calls onViewCandidates when "View candidate comparison" is clicked', async () => {
    const user = userEvent.setup();
    const onViewCandidates = vi.fn();
    render(<DecisionTimeline rows={MOCK_ROWS} onViewCandidates={onViewCandidates} />);

    await user.click(screen.getByTestId('timeline-row-toggle-dr-001'));
    await user.click(screen.getByTestId('view-candidates-btn-dr-001'));

    expect(onViewCandidates).toHaveBeenCalledWith('dr-001');
  });

  it('shows Layer 1/Layer 2 legend', () => {
    render(<DecisionTimeline rows={MOCK_ROWS} />);
    expect(screen.getByText(/Layer 1.*authoritative/)).toBeInTheDocument();
    expect(screen.getByText(/Layer 2.*requires click/)).toBeInTheDocument();
  });
});
