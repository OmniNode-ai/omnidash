// @vitest-environment jsdom
// OMN-22168 (Lakshman 2026-11-05, "instead of Answer i want prompt or trace after each request"): the run's prompt and
// answer read inside the run timeline. Failure modes, each caught below:
//   W1  the prompt is drawn under some step other than the Request;
//   W2  the answer is drawn under an earlier provider call that succeeded, when the run's last call failed and the
//       recorded answer is that last call's response (seen live 2026-11-05: a 404 message shown under attempt 5);
//   W3  a run with no steps drops its prompt and answer with the timeline.
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RunTimeline } from '@/pages/LocalDashboardPage';

const step = (kind: string, outcome: string, sequence: number) => ({ step_kind: kind, outcome, step_sequence: sequence, correlation_id: 'run-a' });
const texts = { prompt: <section aria-label="Prompt">the prompt</section>, answer: <section aria-label="Answer">the answer</section> };
const stepOf = (name: string) => screen.getByRole('region', { name }).closest('li');

describe('prompt and answer in the run timeline', () => {
  it('W1: the prompt is under the Request step', () => {
    render(<RunTimeline steps={[step('request', 'succeeded', 1), step('routing_decision', 'succeeded', 2), step('provider_call', 'succeeded', 3)]} stepText={texts} />);
    expect(within(stepOf('Prompt')!).getByText('Request')).toBeTruthy();
  });

  it('W2: the answer is under the last provider call, even when that call failed', () => {
    render(<RunTimeline stepText={texts} steps={[step('request', 'succeeded', 1), step('provider_call', 'succeeded', 2),
      step('quality_gate', 'failed', 3), step('provider_call', 'failed', 4), step('terminal', 'failed', 5)]} />);
    const items = [...document.querySelectorAll('ol.local-dashboard-steps > li')];
    expect(items.indexOf(stepOf('Answer')!)).toBe(3);
  });

  it('W3: with no steps the prompt and answer still read', () => {
    render(<RunTimeline steps={[]} stepText={texts} />);
    expect(screen.getByRole('region', { name: 'Prompt' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Answer' })).toBeTruthy();
  });
});
