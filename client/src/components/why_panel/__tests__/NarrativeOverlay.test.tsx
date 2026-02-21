/**
 * Tests for NarrativeOverlay component (OMN-2471)
 *
 * Covers:
 *   - R1: Layer 1 and Layer 2 are visually distinct
 *   - R2: Layer 2 hidden by default; revealed via explicit action
 *   - R3: Mismatch warning banner appears on conflict
 *   - R4: Disclaimer text always visible when Layer 2 is shown
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { NarrativeOverlay } from '../NarrativeOverlay';
import type { NarrativeOverlayData } from '@shared/decision-record-types';

// ============================================================================
// Fixtures
// ============================================================================

const CLEAN_DATA: NarrativeOverlayData = {
  decision_id: 'dr-001',
  layer1_summary: {
    selected_candidate: 'claude-opus-4-6',
    constraints_count: 2,
    candidates_count: 3,
    top_constraint: 'context_length >= 100k',
    score: 0.94,
  },
  agent_rationale:
    'I chose claude-opus-4-6 because it has the best reasoning capabilities for this task.',
  mismatches: [],
};

const MISMATCH_DATA: NarrativeOverlayData = {
  decision_id: 'dr-002',
  layer1_summary: {
    selected_candidate: 'claude-opus-4-6',
    constraints_count: 1,
    candidates_count: 3,
    top_constraint: 'context_length >= 100k',
    score: 0.94,
  },
  agent_rationale:
    'I chose claude-opus-4-6 because it balances capability and cost effectively for this task.',
  mismatches: [
    {
      conflicting_reference: 'cost',
      explanation: 'no cost constraint appears in Layer 1 provenance.',
    },
  ],
};

const NO_RATIONALE_DATA: NarrativeOverlayData = {
  decision_id: 'dr-003',
  layer1_summary: {
    selected_candidate: 'agent-api-architect',
    constraints_count: 0,
    candidates_count: 2,
    top_constraint: undefined,
    score: null,
  },
  agent_rationale: null,
  mismatches: [],
};

// ============================================================================
// R1: Layer 1 and Layer 2 are visually distinct
// ============================================================================

describe('NarrativeOverlay — R1: Layer 1 and Layer 2 visual distinction', () => {
  it('renders the overlay panel', () => {
    render(<NarrativeOverlay data={CLEAN_DATA} />);
    expect(screen.getByTestId('narrative-overlay-panel')).toBeInTheDocument();
    expect(screen.getByText(/Agent Narrative Overlay/)).toBeInTheDocument();
  });

  it('Layer 1 provenance panel is always visible', () => {
    render(<NarrativeOverlay data={CLEAN_DATA} />);
    expect(screen.getByTestId('layer1-provenance-panel')).toBeInTheDocument();
  });

  it('Layer 1 shows selected candidate', () => {
    render(<NarrativeOverlay data={CLEAN_DATA} />);
    expect(screen.getByTestId('layer1-selected-candidate')).toHaveTextContent('claude-opus-4-6');
  });

  it('Layer 1 shows constraints count', () => {
    render(<NarrativeOverlay data={CLEAN_DATA} />);
    expect(screen.getByTestId('layer1-constraints-count')).toHaveTextContent('2');
  });

  it('Layer 1 shows candidates count', () => {
    render(<NarrativeOverlay data={CLEAN_DATA} />);
    expect(screen.getByTestId('layer1-candidates-count')).toHaveTextContent('3');
  });

  it('Layer 1 shows score when non-null', () => {
    render(<NarrativeOverlay data={CLEAN_DATA} />);
    expect(screen.getByTestId('layer1-score')).toHaveTextContent('0.94');
  });

  it('Layer 1 shows top constraint when provided', () => {
    render(<NarrativeOverlay data={CLEAN_DATA} />);
    expect(screen.getByTestId('layer1-top-constraint')).toHaveTextContent('context_length >= 100k');
  });

  it('Layer 1 does not show score cell when score is null', () => {
    render(<NarrativeOverlay data={NO_RATIONALE_DATA} />);
    expect(screen.queryByTestId('layer1-score')).not.toBeInTheDocument();
  });

  it('Layer 1 is labeled as "Causal Provenance (Layer 1 — Authoritative)"', () => {
    render(<NarrativeOverlay data={CLEAN_DATA} />);
    expect(screen.getByText(/Causal Provenance.*Layer 1.*Authoritative/)).toBeInTheDocument();
  });
});

// ============================================================================
// R2: Layer 2 hidden by default; revealed via explicit action
// ============================================================================

describe('NarrativeOverlay — R2: Layer 2 hidden by default', () => {
  it('Layer 2 narrative panel is not visible initially', () => {
    render(<NarrativeOverlay data={CLEAN_DATA} />);
    expect(screen.queryByTestId('layer2-narrative-panel')).not.toBeInTheDocument();
  });

  it('toggle button is visible in the toggle area', () => {
    render(<NarrativeOverlay data={CLEAN_DATA} />);
    expect(screen.getByTestId('layer2-toggle-btn')).toBeInTheDocument();
    expect(screen.getByTestId('layer2-toggle-btn')).toHaveTextContent('Show Agent Narrative');
  });

  it('reveals Layer 2 when toggle button is clicked', async () => {
    const user = userEvent.setup();
    render(<NarrativeOverlay data={CLEAN_DATA} />);

    await user.click(screen.getByTestId('layer2-toggle-btn'));

    expect(screen.getByTestId('layer2-narrative-panel')).toBeInTheDocument();
  });

  it('changes button label to "Hide Agent Narrative" when shown', async () => {
    const user = userEvent.setup();
    render(<NarrativeOverlay data={CLEAN_DATA} />);

    await user.click(screen.getByTestId('layer2-toggle-btn'));

    expect(screen.getByTestId('layer2-toggle-btn')).toHaveTextContent('Hide Agent Narrative');
  });

  it('collapses Layer 2 when toggle is clicked again', async () => {
    const user = userEvent.setup();
    render(<NarrativeOverlay data={CLEAN_DATA} />);

    await user.click(screen.getByTestId('layer2-toggle-btn'));
    expect(screen.getByTestId('layer2-narrative-panel')).toBeInTheDocument();

    await user.click(screen.getByTestId('layer2-toggle-btn'));
    expect(screen.queryByTestId('layer2-narrative-panel')).not.toBeInTheDocument();
  });

  it('Layer 2 contains the agent rationale text when shown', async () => {
    const user = userEvent.setup();
    render(<NarrativeOverlay data={CLEAN_DATA} />);

    await user.click(screen.getByTestId('layer2-toggle-btn'));

    expect(screen.getByTestId('layer2-rationale-text')).toHaveTextContent(
      'best reasoning capabilities'
    );
  });

  it('Layer 2 is labeled "assistive, not authoritative" when shown', async () => {
    const user = userEvent.setup();
    render(<NarrativeOverlay data={CLEAN_DATA} />);

    await user.click(screen.getByTestId('layer2-toggle-btn'));

    const panel = screen.getByTestId('layer2-narrative-panel');
    expect(panel).toHaveTextContent('Assistive, Not Authoritative');
  });

  it('shows "(none recorded)" hint when no rationale exists', () => {
    render(<NarrativeOverlay data={NO_RATIONALE_DATA} />);
    expect(screen.getByTestId('layer2-toggle-btn')).toHaveTextContent('(none recorded)');
  });

  it('shows "No agent narrative was recorded" when Layer 2 opened with null rationale', async () => {
    const user = userEvent.setup();
    render(<NarrativeOverlay data={NO_RATIONALE_DATA} />);

    await user.click(screen.getByTestId('layer2-toggle-btn'));

    expect(screen.getByTestId('layer2-rationale-text')).toHaveTextContent(
      'No agent narrative was recorded'
    );
  });
});

// ============================================================================
// R3: Mismatch warning banner appears on conflict
// ============================================================================

describe('NarrativeOverlay — R3: mismatch warning banner', () => {
  it('mismatch banner is shown when mismatches exist (even collapsed)', () => {
    render(<NarrativeOverlay data={MISMATCH_DATA} />);
    expect(screen.getByTestId('mismatch-banner')).toBeInTheDocument();
  });

  it('mismatch banner is NOT shown when no mismatches', () => {
    render(<NarrativeOverlay data={CLEAN_DATA} />);
    expect(screen.queryByTestId('mismatch-banner')).not.toBeInTheDocument();
  });

  it('mismatch banner quotes the conflicting reference', () => {
    render(<NarrativeOverlay data={MISMATCH_DATA} />);
    // The mismatch item should reference the conflicting factor
    expect(screen.getByTestId('mismatch-item-0')).toHaveTextContent('cost');
  });

  it('mismatch banner explains why it is a mismatch', () => {
    render(<NarrativeOverlay data={MISMATCH_DATA} />);
    expect(screen.getByTestId('mismatch-item-0')).toHaveTextContent(
      'no cost constraint appears in Layer 1 provenance'
    );
  });

  it('mismatch count badge shown in header when mismatches exist', () => {
    render(<NarrativeOverlay data={MISMATCH_DATA} />);
    expect(screen.getByTestId('mismatch-count-badge')).toHaveTextContent('1 mismatch');
  });

  it('mismatch count badge NOT shown when no mismatches', () => {
    render(<NarrativeOverlay data={CLEAN_DATA} />);
    expect(screen.queryByTestId('mismatch-count-badge')).not.toBeInTheDocument();
  });

  it('mismatch banner remains visible even when Layer 2 is collapsed', async () => {
    const user = userEvent.setup();
    render(<NarrativeOverlay data={MISMATCH_DATA} />);

    // Banner visible before showing Layer 2
    expect(screen.getByTestId('mismatch-banner')).toBeInTheDocument();

    // Show then hide Layer 2
    await user.click(screen.getByTestId('layer2-toggle-btn'));
    await user.click(screen.getByTestId('layer2-toggle-btn'));

    // Banner still visible after collapsing
    expect(screen.getByTestId('mismatch-banner')).toBeInTheDocument();
  });

  it('shows collapsed hint about mismatch when Layer 2 is collapsed', () => {
    render(<NarrativeOverlay data={MISMATCH_DATA} />);
    expect(screen.getByTestId('mismatch-collapsed-hint')).toBeInTheDocument();
    expect(screen.getByTestId('mismatch-collapsed-hint')).toHaveTextContent('Mismatch detected');
  });

  it('handles multiple mismatches', () => {
    const multiMismatch: NarrativeOverlayData = {
      ...MISMATCH_DATA,
      mismatches: [
        { conflicting_reference: 'cost', explanation: 'no cost in Layer 1' },
        { conflicting_reference: 'speed', explanation: 'no speed constraint in Layer 1' },
      ],
    };
    render(<NarrativeOverlay data={multiMismatch} />);
    expect(screen.getByTestId('mismatch-count-badge')).toHaveTextContent('2 mismatches');
    expect(screen.getByTestId('mismatch-item-0')).toBeInTheDocument();
    expect(screen.getByTestId('mismatch-item-1')).toBeInTheDocument();
  });
});

// ============================================================================
// R4: Disclaimer text always visible when Layer 2 is shown
// ============================================================================

describe('NarrativeOverlay — R4: disclaimer always present in Layer 2', () => {
  it('disclaimer is shown when Layer 2 is visible', async () => {
    const user = userEvent.setup();
    render(<NarrativeOverlay data={CLEAN_DATA} />);

    await user.click(screen.getByTestId('layer2-toggle-btn'));

    expect(screen.getByTestId('layer2-disclaimer')).toBeInTheDocument();
    expect(screen.getByTestId('layer2-disclaimer')).toHaveTextContent(
      'This is a model-generated narrative. The structured provenance above is authoritative.'
    );
  });

  it('disclaimer is shown even when agent_rationale is null', async () => {
    const user = userEvent.setup();
    render(<NarrativeOverlay data={NO_RATIONALE_DATA} />);

    await user.click(screen.getByTestId('layer2-toggle-btn'));

    expect(screen.getByTestId('layer2-disclaimer')).toBeInTheDocument();
  });

  it('disclaimer is NOT shown when Layer 2 is collapsed', () => {
    render(<NarrativeOverlay data={CLEAN_DATA} />);
    // Layer 2 not shown, so disclaimer should not be present
    expect(screen.queryByTestId('layer2-disclaimer')).not.toBeInTheDocument();
  });
});
