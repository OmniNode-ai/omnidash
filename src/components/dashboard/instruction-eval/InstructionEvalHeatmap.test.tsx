import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import InstructionEvalHeatmap from './InstructionEvalHeatmap';

/**
 * OMN-12997: the Instruction Eval view renders a committed fixture (run
 * 20260526-170241), not a live projection. It MUST carry a prominent, unmissable
 * recorded-data badge so it cannot be mistaken for live/projection-backed proof in
 * a demo. These tests pin that contract.
 */
describe('InstructionEvalHeatmap recorded-data authority badge', () => {
  it('renders the recorded-evaluation badge with the fixture date', () => {
    render(<InstructionEvalHeatmap config={{}} />);
    // Badge text appears wherever the data appears — header + above the matrix.
    const badges = screen.getAllByText('Recorded evaluation — 2026-05-26 (fixture)');
    expect(badges.length).toBeGreaterThanOrEqual(1);
  });

  it('exposes a status role describing the recorded (non-live) authority', () => {
    render(<InstructionEvalHeatmap config={{}} />);
    const statuses = screen.getAllByRole('status');
    const recorded = statuses.filter((el) =>
      el.getAttribute('aria-label')?.includes('recorded evaluation'),
    );
    expect(recorded.length).toBeGreaterThanOrEqual(1);
    expect(recorded[0].getAttribute('aria-label')).toMatch(/Not a live projection/i);
  });

  it('does NOT render a "Live" badge (the view is recorded, not live)', () => {
    render(<InstructionEvalHeatmap config={{}} />);
    expect(screen.queryByText('Live')).toBeNull();
  });
});
