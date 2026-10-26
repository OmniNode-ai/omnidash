// @vitest-environment jsdom
// OMN-21166 part 18 AC126 (Lakshman 2026-10-26: "each of 7 pages should be same style and great and clena unnseary
// things"): a timeline step shows its backend or model chip only where it differs from the run's, which the run summary
// above already shows. Failure modes declared before code:
//   S1  a chip that differs from the run's value is hidden;
//   S2  a chip equal to the run's value is still repeated on every step;
//   S3  a step's other details (attempt, cause, candidates) are lost with the repeated chips;
//   S4  without a run to compare with, chips vanish instead of showing as served.
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RunTimeline } from '@/pages/LocalDashboardPage';

const step = (sequence: number, kind: string, over: Record<string, unknown> = {}) => ({
  correlation_id: 'run-1', step_sequence: sequence, step_kind: kind, outcome: 'succeeded', started_at: '2026-10-26T04:53:24Z',
  duration_ms: 10, backend_id: 'local-heavy', model_id: 'Qwen3.8-27B', ...over,
});
const STEPS = [
  step(1, 'request'),
  step(2, 'provider_call', { attempt_number: 1 }),
  step(3, 'provider_call', { backend_id: 'cloud-cheap', model_id: 'gemini-3.5-flash-lite', attempt_number: 2 }),
];
const chips = (index: number) => [...document.querySelectorAll(`#run-step-${index} .local-run-chip`)].map(chip => chip.textContent);

describe('RunTimeline chips against the run', () => {
  it('S2, S3: a step on the run\'s backend and model repeats neither, and keeps its other details', () => {
    render(<RunTimeline steps={STEPS} run={{ backend_id: 'local-heavy', model_name: 'Qwen3.8-27B' }} />);
    expect(chips(1)).toEqual([]);
    expect(chips(2)).toEqual(['attempt: 1']);
  });

  it('S1: a step on another backend or model shows both', () => {
    render(<RunTimeline steps={STEPS} run={{ backend_id: 'local-heavy', model_name: 'Qwen3.8-27B' }} />);
    expect(chips(3)).toEqual(['backend: cloud-cheap', 'model: gemini-3.5-flash-lite', 'attempt: 2']);
  });

  it('S4: with no run to compare, every served chip shows', () => {
    render(<RunTimeline steps={STEPS} />);
    expect(chips(1)).toEqual(['backend: local-heavy', 'model: Qwen3.8-27B']);
    expect(screen.getAllByText('backend:').length).toBe(3);
  });
});
