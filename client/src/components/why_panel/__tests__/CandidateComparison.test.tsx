/**
 * Tests for CandidateComparison component (OMN-2470)
 *
 * Covers:
 *   - R1: All candidates shown (not just winner), eliminated have strikethrough
 *   - R2: Per-metric score columns from scoring_breakdown
 *   - R3: Constraints section lists all applied constraints
 *   - R4: Tie-breaker shown if present
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { CandidateComparison } from '../CandidateComparison';
import type { CandidateComparisonData } from '@shared/decision-record-types';

// ============================================================================
// Fixtures
// ============================================================================

const MOCK_DATA: CandidateComparisonData = {
  decision_id: 'dr-001',
  decision_type: 'model_select',
  decided_at: '2026-02-21T10:42:01.000Z',
  metric_columns: ['latency', 'context', 'tools'],
  rows: [
    {
      id: 'claude-opus-4-6',
      selected: true,
      eliminated: false,
      scores: { latency: 0.91, context: 1.0, tools: 1.0 },
      total_score: 0.94,
    },
    {
      id: 'claude-sonnet-4-6',
      selected: false,
      eliminated: false,
      scores: { latency: 0.95, context: 0.9, tools: 1.0 },
      total_score: 0.87,
    },
    {
      id: 'claude-haiku-4-5',
      selected: false,
      eliminated: true,
      elimination_reason: 'context_length < 100k',
      scores: { latency: 1.0, context: null, tools: null },
      total_score: null,
    },
  ],
  constraints_applied: [
    {
      description: 'context_length >= 100k',
      eliminates: ['claude-haiku-4-5'],
      satisfied_by_selected: true,
    },
    {
      description: 'supports_tools = true',
      eliminates: [],
      satisfied_by_selected: true,
    },
  ],
  tie_breaker: null,
};

// ============================================================================
// R1: All candidates shown, eliminated have strikethrough
// ============================================================================

describe('CandidateComparison — R1: all candidates displayed', () => {
  it('renders the panel', () => {
    render(<CandidateComparison data={MOCK_DATA} />);
    expect(screen.getByTestId('candidate-comparison-panel')).toBeInTheDocument();
    expect(screen.getByText(/Candidate Comparison/)).toBeInTheDocument();
  });

  it('shows all candidate rows including eliminated', () => {
    render(<CandidateComparison data={MOCK_DATA} />);
    expect(screen.getByTestId('candidate-row-claude-opus-4-6')).toBeInTheDocument();
    expect(screen.getByTestId('candidate-row-claude-sonnet-4-6')).toBeInTheDocument();
    expect(screen.getByTestId('candidate-row-claude-haiku-4-5')).toBeInTheDocument();
  });

  it('shows SELECTED badge for winning candidate', () => {
    render(<CandidateComparison data={MOCK_DATA} />);
    expect(screen.getByTestId('status-badge-claude-opus-4-6')).toHaveTextContent('SELECTED');
  });

  it('shows ELIMINATED badge for eliminated candidate', () => {
    render(<CandidateComparison data={MOCK_DATA} />);
    expect(screen.getByTestId('status-badge-claude-haiku-4-5')).toHaveTextContent('ELIMINATED');
  });

  it('shows elimination reason inline for eliminated candidate', () => {
    render(<CandidateComparison data={MOCK_DATA} />);
    expect(screen.getByTestId('elimination-reason-claude-haiku-4-5')).toHaveTextContent(
      'ELIMINATED: context_length < 100k'
    );
  });

  it('shows eliminated candidates as line-through', () => {
    render(<CandidateComparison data={MOCK_DATA} />);
    const eliminatedName = screen.getByTestId('candidate-name-claude-haiku-4-5');
    expect(eliminatedName).toHaveClass('line-through');
  });

  it('shows selected icon for winner', () => {
    render(<CandidateComparison data={MOCK_DATA} />);
    expect(screen.getByTestId('selected-icon-claude-opus-4-6')).toBeInTheDocument();
  });

  it('shows eliminated icon for eliminated candidate', () => {
    render(<CandidateComparison data={MOCK_DATA} />);
    expect(screen.getByTestId('eliminated-icon-claude-haiku-4-5')).toBeInTheDocument();
  });

  it('shows — status for non-selected non-eliminated candidates', () => {
    render(<CandidateComparison data={MOCK_DATA} />);
    expect(screen.getByTestId('status-badge-claude-sonnet-4-6')).toHaveTextContent('—');
  });
});

// ============================================================================
// R2: Per-metric score columns
// ============================================================================

describe('CandidateComparison — R2: per-metric score columns', () => {
  it('renders one column header per metric', () => {
    render(<CandidateComparison data={MOCK_DATA} />);
    expect(screen.getByTestId('metric-header-latency')).toBeInTheDocument();
    expect(screen.getByTestId('metric-header-context')).toBeInTheDocument();
    expect(screen.getByTestId('metric-header-tools')).toBeInTheDocument();
  });

  it('shows correct scores for selected candidate', () => {
    render(<CandidateComparison data={MOCK_DATA} />);
    expect(screen.getByTestId('score-claude-opus-4-6-latency')).toHaveTextContent('0.91');
    expect(screen.getByTestId('score-claude-opus-4-6-context')).toHaveTextContent('1.00');
    expect(screen.getByTestId('score-claude-opus-4-6-tools')).toHaveTextContent('1.00');
  });

  it('shows — for missing scores on eliminated candidate', () => {
    render(<CandidateComparison data={MOCK_DATA} />);
    expect(screen.getByTestId('score-claude-haiku-4-5-context')).toHaveTextContent('—');
    expect(screen.getByTestId('score-claude-haiku-4-5-tools')).toHaveTextContent('—');
  });

  it('shows total scores', () => {
    render(<CandidateComparison data={MOCK_DATA} />);
    expect(screen.getByTestId('total-score-claude-opus-4-6')).toHaveTextContent('0.94');
    expect(screen.getByTestId('total-score-claude-sonnet-4-6')).toHaveTextContent('0.87');
  });

  it('shows — for total score when null (eliminated)', () => {
    render(<CandidateComparison data={MOCK_DATA} />);
    expect(screen.getByTestId('total-score-claude-haiku-4-5')).toHaveTextContent('—');
  });

  it('renders no metric columns when metric_columns is empty', () => {
    const noMetrics: CandidateComparisonData = {
      ...MOCK_DATA,
      metric_columns: [],
      rows: [
        {
          id: 'agent-x',
          selected: true,
          eliminated: false,
          scores: {},
          total_score: null,
        },
      ],
    };
    render(<CandidateComparison data={noMetrics} />);
    expect(screen.getByTestId('candidate-comparison-table')).toBeInTheDocument();
    // Should not crash with no metrics
  });
});

// ============================================================================
// R3: Constraints section lists all applied constraints
// ============================================================================

describe('CandidateComparison — R3: constraints section', () => {
  it('renders constraints section', () => {
    render(<CandidateComparison data={MOCK_DATA} />);
    expect(screen.getByTestId('constraints-section')).toBeInTheDocument();
    expect(screen.getByText(/Constraints applied/i)).toBeInTheDocument();
  });

  it('lists all constraint descriptions', () => {
    render(<CandidateComparison data={MOCK_DATA} />);
    expect(screen.getByTestId('constraint-item-0')).toHaveTextContent('context_length >= 100k');
    expect(screen.getByTestId('constraint-item-1')).toHaveTextContent('supports_tools = true');
  });

  it('shows which candidates are eliminated by each constraint', () => {
    render(<CandidateComparison data={MOCK_DATA} />);
    expect(screen.getByTestId('constraint-item-0')).toHaveTextContent(
      'eliminates claude-haiku-4-5'
    );
  });

  it('shows "No constraints applied" when there are none', () => {
    const noConstraints: CandidateComparisonData = {
      ...MOCK_DATA,
      constraints_applied: [],
    };
    render(<CandidateComparison data={noConstraints} />);
    expect(screen.getByTestId('no-constraints-message')).toHaveTextContent(
      'No constraints applied'
    );
  });
});

// ============================================================================
// R4: Tie-breaker shown if present
// ============================================================================

describe('CandidateComparison — R4: tie-breaker', () => {
  it('shows "No tie-breaker needed" when tie_breaker is null', () => {
    render(<CandidateComparison data={MOCK_DATA} />);
    expect(screen.getByTestId('tie-breaker-value')).toHaveTextContent('No tie-breaker needed');
  });

  it('shows tie-breaker value when non-null', () => {
    const dataWithTieBreaker: CandidateComparisonData = {
      ...MOCK_DATA,
      tie_breaker: 'alphabetical order',
    };
    render(<CandidateComparison data={dataWithTieBreaker} />);
    expect(screen.getByTestId('tie-breaker-value')).toHaveTextContent(
      'Tie-breaker: alphabetical order'
    );
  });

  it('renders tie-breaker section header', () => {
    render(<CandidateComparison data={MOCK_DATA} />);
    expect(screen.getByTestId('tie-breaker-section')).toBeInTheDocument();
  });
});
