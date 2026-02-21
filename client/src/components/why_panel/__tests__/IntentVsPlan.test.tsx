/**
 * Tests for IntentVsPlan component (OMN-2468)
 *
 * Covers:
 *   - R1: Panel renders user intent alongside resolved plan
 *   - R2: All inferred/defaulted values are traceable (click → DecisionRecord)
 *   - R3: Trust invariant compliance (source unknown shown, not hidden)
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { IntentVsPlan } from '../IntentVsPlan';
import type { IntentVsPlanData } from '@shared/decision-record-types';

// Wrap with TooltipProvider since IntentVsPlan uses Tooltip components
function renderWithTooltip(ui: React.ReactElement) {
  return render(<TooltipProvider>{ui}</TooltipProvider>);
}

// ============================================================================
// Test fixtures
// ============================================================================

const BASE_DATA: IntentVsPlanData = {
  session_id: 'test-session-001',
  executed_at: '2026-02-21T10:42:00.000Z',
  fields: [
    {
      field_name: 'Model',
      intent_value: null,
      resolved_value: 'claude-opus-4-6',
      origin: 'inferred',
      decision_id: 'dr-001',
    },
    {
      field_name: 'Tools',
      intent_value: 'Read, Write',
      resolved_value: 'Read, Write, Bash',
      origin: 'inferred',
      decision_id: 'dr-002',
    },
    {
      field_name: 'Context',
      intent_value: '/my/project',
      resolved_value: '/my/project',
      origin: 'user_specified',
      decision_id: null,
    },
    {
      field_name: 'Default timeout',
      intent_value: null,
      resolved_value: '30s',
      origin: 'default',
      decision_id: 'dr-003',
    },
  ],
};

// ============================================================================
// Tests — R1: Panel renders user intent alongside resolved plan
// ============================================================================

describe('IntentVsPlan — R1: renders user intent alongside resolved plan', () => {
  it('renders the panel with correct header', () => {
    renderWithTooltip(<IntentVsPlan data={BASE_DATA} />);
    expect(screen.getByTestId('intent-vs-plan-panel')).toBeInTheDocument();
    expect(screen.getByText(/Intent vs Resolved Plan/)).toBeInTheDocument();
  });

  it('renders both column headers', () => {
    renderWithTooltip(<IntentVsPlan data={BASE_DATA} />);
    expect(screen.getByText('Your Intent')).toBeInTheDocument();
    expect(screen.getByText('Resolved Plan')).toBeInTheDocument();
  });

  it('renders all field rows', () => {
    renderWithTooltip(<IntentVsPlan data={BASE_DATA} />);
    const fields = screen.getByTestId('intent-vs-plan-fields');
    expect(fields.querySelectorAll('[role="row"]')).toHaveLength(BASE_DATA.fields.length);
  });

  it('shows "(not specified)" for null intent values', () => {
    renderWithTooltip(<IntentVsPlan data={BASE_DATA} />);
    // Model and Default timeout have null intent_value
    const modelIntentCell = screen.getByTestId('intent-value-model');
    expect(modelIntentCell).toHaveTextContent('(not specified)');
    const timeoutIntentCell = screen.getByTestId('intent-value-default-timeout');
    expect(timeoutIntentCell).toHaveTextContent('(not specified)');
  });

  it('shows user-specified intent values', () => {
    renderWithTooltip(<IntentVsPlan data={BASE_DATA} />);
    const toolsIntentCell = screen.getByTestId('intent-value-tools');
    expect(toolsIntentCell).toHaveTextContent('Read, Write');
    const contextIntentCell = screen.getByTestId('intent-value-context');
    expect(contextIntentCell).toHaveTextContent('/my/project');
  });

  it('shows resolved values in right column', () => {
    renderWithTooltip(<IntentVsPlan data={BASE_DATA} />);
    expect(screen.getByTestId('resolved-value-model')).toHaveTextContent('claude-opus-4-6');
    expect(screen.getByTestId('resolved-value-tools')).toHaveTextContent('Read, Write, Bash');
    expect(screen.getByTestId('resolved-value-context')).toHaveTextContent('/my/project');
    expect(screen.getByTestId('resolved-value-default-timeout')).toHaveTextContent('30s');
  });

  it('shows inferred count badge when there are inferred fields', () => {
    renderWithTooltip(<IntentVsPlan data={BASE_DATA} />);
    // 3 inferred/default fields
    expect(screen.getByTestId('inferred-count-badge')).toBeInTheDocument();
    expect(screen.getByTestId('inferred-count-badge')).toHaveTextContent('3 inferred');
  });

  it('shows user-specified checkmark for user_specified fields', () => {
    renderWithTooltip(<IntentVsPlan data={BASE_DATA} />);
    // Context is user_specified — should have a ✓
    const contextRow = screen.getByTestId('field-row-context');
    expect(contextRow).toHaveTextContent('✓');
  });

  it('shows session ID and timestamp in header', () => {
    renderWithTooltip(<IntentVsPlan data={BASE_DATA} />);
    expect(screen.getByText(/test-session-001/)).toBeInTheDocument();
  });
});

// ============================================================================
// Tests — R2: All inferred/defaulted values are traceable
// ============================================================================

describe('IntentVsPlan — R2: inferred values link to DecisionRecord', () => {
  it('renders clickable badge for inferred fields with decision_id', () => {
    renderWithTooltip(<IntentVsPlan data={BASE_DATA} />);
    const modelBadge = screen.getByTestId('origin-badge-model');
    expect(modelBadge).toBeInTheDocument();
    expect(modelBadge).toHaveTextContent('inferred');
  });

  it('calls onDecisionClick when inferred badge is clicked', async () => {
    const user = userEvent.setup();
    const onDecisionClick = vi.fn();
    renderWithTooltip(<IntentVsPlan data={BASE_DATA} onDecisionClick={onDecisionClick} />);

    const modelBadge = screen.getByTestId('origin-badge-model');
    await user.click(modelBadge);

    expect(onDecisionClick).toHaveBeenCalledWith('dr-001');
  });

  it('calls onDecisionClick with correct decision_id for each field', async () => {
    const user = userEvent.setup();
    const onDecisionClick = vi.fn();
    renderWithTooltip(<IntentVsPlan data={BASE_DATA} onDecisionClick={onDecisionClick} />);

    const toolsBadge = screen.getByTestId('origin-badge-tools');
    await user.click(toolsBadge);
    expect(onDecisionClick).toHaveBeenCalledWith('dr-002');

    const timeoutBadge = screen.getByTestId('origin-badge-default-timeout');
    await user.click(timeoutBadge);
    expect(onDecisionClick).toHaveBeenCalledWith('dr-003');
  });

  it('renders default badge for fields with default origin', () => {
    renderWithTooltip(<IntentVsPlan data={BASE_DATA} />);
    const timeoutBadge = screen.getByTestId('origin-badge-default-timeout');
    expect(timeoutBadge).toHaveTextContent('default');
  });

  it('does not render origin badge for user_specified fields', () => {
    renderWithTooltip(<IntentVsPlan data={BASE_DATA} />);
    expect(screen.queryByTestId('origin-badge-context')).not.toBeInTheDocument();
  });
});

// ============================================================================
// Tests — R3: Trust invariant compliance
// ============================================================================

describe('IntentVsPlan — R3: trust invariant compliance', () => {
  it('shows trust invariant warning when inferred field has no decision_id', () => {
    const dataWithMissing: IntentVsPlanData = {
      ...BASE_DATA,
      fields: [
        {
          field_name: 'Agent',
          intent_value: null,
          resolved_value: 'some-agent',
          origin: 'inferred',
          decision_id: null, // Missing — trust invariant violation
        },
      ],
    };
    renderWithTooltip(<IntentVsPlan data={dataWithMissing} />);
    expect(screen.getByTestId('trust-invariant-warning')).toBeInTheDocument();
  });

  it('shows source unknown warning for the specific field missing a DecisionRecord', () => {
    const dataWithMissing: IntentVsPlanData = {
      ...BASE_DATA,
      fields: [
        {
          field_name: 'Agent',
          intent_value: null,
          resolved_value: 'some-agent',
          origin: 'inferred',
          decision_id: null,
        },
      ],
    };
    renderWithTooltip(<IntentVsPlan data={dataWithMissing} />);
    expect(screen.getByTestId('missing-decision-record-agent')).toBeInTheDocument();
    expect(screen.getByTestId('missing-decision-record-agent')).toHaveTextContent(
      'source unknown'
    );
  });

  it('does not show trust invariant warning when all inferred fields have decision_ids', () => {
    renderWithTooltip(<IntentVsPlan data={BASE_DATA} />);
    expect(screen.queryByTestId('trust-invariant-warning')).not.toBeInTheDocument();
  });

  it('shows legend explaining badge meanings', () => {
    renderWithTooltip(<IntentVsPlan data={BASE_DATA} />);
    expect(screen.getByText(/linked to DecisionRecord/)).toBeInTheDocument();
    expect(screen.getByText(/linked to default policy/)).toBeInTheDocument();
    expect(screen.getByText(/user specified/)).toBeInTheDocument();
  });
});

// ============================================================================
// Edge cases
// ============================================================================

describe('IntentVsPlan — edge cases', () => {
  it('renders correctly when all fields are user_specified (no inferred)', () => {
    const allUserSpecified: IntentVsPlanData = {
      session_id: 'test-session-edge',
      executed_at: '2026-02-21T10:00:00.000Z',
      fields: [
        {
          field_name: 'Model',
          intent_value: 'claude-sonnet-4-6',
          resolved_value: 'claude-sonnet-4-6',
          origin: 'user_specified',
          decision_id: null,
        },
      ],
    };
    renderWithTooltip(<IntentVsPlan data={allUserSpecified} />);
    expect(screen.queryByTestId('inferred-count-badge')).not.toBeInTheDocument();
    expect(screen.queryByTestId('trust-invariant-warning')).not.toBeInTheDocument();
  });

  it('renders correctly with empty fields array', () => {
    const emptyData: IntentVsPlanData = {
      session_id: 'test-session-empty',
      executed_at: '2026-02-21T10:00:00.000Z',
      fields: [],
    };
    renderWithTooltip(<IntentVsPlan data={emptyData} />);
    expect(screen.getByTestId('intent-vs-plan-panel')).toBeInTheDocument();
    const fields = screen.getByTestId('intent-vs-plan-fields');
    expect(fields.querySelectorAll('[role="row"]')).toHaveLength(0);
  });
});
